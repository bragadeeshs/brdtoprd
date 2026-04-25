"""Cloudflare R2 object storage (M3.9).

R2 speaks the S3 API, so boto3 is the SDK — no Cloudflare-specific package.
Configuration is env-driven; if `R2_BUCKET` is unset every helper here
returns False from `is_enabled()` and `services.extractions.save_upload`
falls back to local-disk storage. That keeps `pytest`/`uvicorn` runs
without R2 credentials working.

Persisted-path scheme: an `Extraction.source_file_path` is either
  * a local absolute path (legacy + dev fallback), or
  * `r2://<bucket>/<key>`              (M3.9 onwards)

Routes use `is_r2_path()` to branch — `/source` redirects to a presigned
URL when it's R2, returns a local FileResponse otherwise. No frontend
change needed; the browser follows the 302 transparently.

Why presigned URLs instead of streaming through FastAPI?
  * Zero egress cost on R2 vs the bandwidth bill we'd eat proxying.
  * Files go browser↔R2 over Cloudflare's CDN, not via our backend.
  * The presigned URL has a short TTL (15 min) and is bound to the
    bucket+key+method — leakage is bounded in time and scope.
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache
from typing import Optional

import boto3
from botocore.client import BaseClient
from botocore.config import Config

log = logging.getLogger("storyforge.storage")


def is_enabled() -> bool:
    """True iff R2_BUCKET is set — any one missing var disables the path."""
    return bool(os.environ.get("R2_BUCKET"))


def bucket() -> str:
    """The configured R2 bucket name. Raises if not enabled."""
    name = os.environ.get("R2_BUCKET")
    if not name:
        raise RuntimeError("R2_BUCKET not set")
    return name


@lru_cache(maxsize=1)
def _client() -> BaseClient:
    """Singleton R2 client. SigV4 + region='auto' are R2 requirements."""
    account_id = os.environ.get("R2_ACCOUNT_ID")
    if not account_id:
        raise RuntimeError("R2_ACCOUNT_ID not set")
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ.get("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=os.environ.get("R2_SECRET_ACCESS_KEY"),
        config=Config(signature_version="s3v4", region_name="auto"),
    )


# ---------- path helpers ----------

R2_PREFIX = "r2://"


def is_r2_path(path: str | None) -> bool:
    return bool(path) and path.startswith(R2_PREFIX)


def parse_r2_path(path: str) -> tuple[str, str]:
    """`r2://<bucket>/<key>` -> `(bucket, key)`. Raises on malformed input."""
    if not is_r2_path(path):
        raise ValueError(f"not an R2 path: {path!r}")
    rest = path[len(R2_PREFIX):]
    bucket_, _, key = rest.partition("/")
    if not bucket_ or not key:
        raise ValueError(f"malformed R2 path (need bucket+key): {path!r}")
    return bucket_, key


def make_r2_path(bucket_: str, key: str) -> str:
    return f"{R2_PREFIX}{bucket_}/{key}"


# ---------- operations ----------


def upload_bytes(key: str, data: bytes, content_type: Optional[str] = None) -> str:
    """Upload `data` to R2 under `key`, return the persisted-path string."""
    extra: dict = {}
    if content_type:
        extra["ContentType"] = content_type
    _client().put_object(Bucket=bucket(), Key=key, Body=data, **extra)
    return make_r2_path(bucket(), key)


def presigned_get_url(path: str, expires_seconds: int = 900) -> str:
    """Mint a temporary GET URL for an `r2://` path. 15-minute default TTL."""
    bucket_, key = parse_r2_path(path)
    return _client().generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket_, "Key": key},
        ExpiresIn=expires_seconds,
    )


def delete_path(path: str) -> None:
    """Delete an object given its persisted-path string. Best-effort — logs
    but doesn't raise on miss, matching the local-disk cleanup semantics."""
    try:
        bucket_, key = parse_r2_path(path)
        _client().delete_object(Bucket=bucket_, Key=key)
    except Exception as e:  # noqa: BLE001
        log.warning("R2 delete failed for %s: %s", path, e)
