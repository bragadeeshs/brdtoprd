# Note: no `# syntax=docker/dockerfile:1.x` line on purpose — Render's BuildKit
# fails to pull the frontend image with "grpc server closed unexpectedly". We
# don't use any 1.7-only features (no --mount=type=cache, no secrets), so
# falling back to the default Dockerfile frontend is harmless.

# ---- Stage 1: build the Vite frontend ----
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend

# Install deps first so the layer caches on unchanged package files
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Then build
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: FastAPI runtime serving API + built SPA ----
FROM python:3.13-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY backend/requirements.txt ./requirements.txt
RUN pip install -r requirements.txt

COPY backend/ ./

# Built SPA lands next to main.py; StaticFiles(html=True) serves index.html at /
COPY --from=frontend-build /app/frontend/dist ./static

# Drop privileges for runtime
RUN useradd --system --uid 1001 --shell /usr/sbin/nologin storyforge \
 && chown -R storyforge:storyforge /app
USER storyforge

# Render injects PORT at runtime (free tier: 10000); fall back to 8000 locally.
# Shell-form CMD so ${PORT:-8000} actually expands — exec form would treat the
# literal string as a port number and crash with "invalid port: '${PORT:-8000}'".
EXPOSE 8000
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
