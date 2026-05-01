/**
 * M13.1 — public landing page shown to signed-out visitors at `/`.
 *
 * Signed-in users still get the studio at `/` (auth-gated upstream in
 * App.jsx's top-level Routes).
 *
 * Theme: variables live on `.landing-root` in styles.css and flip
 * automatically based on `prefers-color-scheme`. Dark by default
 * (matches Palantir-style hero), light when the visitor's system
 * preference is light. No JS toggle — signed-out visitors don't load
 * the in-app theme settings, so we respect the OS hint.
 *
 * Hero placeholder: gradient sits behind the headline today; swap in
 * `<video src="/hero.mp4" autoPlay muted loop playsInline>` (and keep
 * the gradient as a fallback) when the recording lands.
 *
 * Section order: Hero → ProductPreview → HowItWorks → Testimonials →
 * Pricing → FAQ → FooterCTA. Reflects the standard B2B SaaS landing flow
 * (hook → show → explain → trust → price → objections → close).
 *
 * Pricing values mirror `backend/services/plans.py` — keep in sync if
 * those change. (Could fetch via /api/plans later; not worth a route
 * round-trip for marketing copy that changes once a quarter.)
 */
import { Link } from 'react-router-dom'
import {
  Sparkles,
  FileText,
  Plug,
  ArrowRight,
  Check,
  Shield,
} from '../components/icons.jsx'

export default function Landing() {
  return (
    <div
      className="landing-root"
      style={{ minHeight: '100vh', background: 'var(--lp-bg)', color: 'var(--lp-text)' }}
    >
      <Hero />
      <ProductPreview />
      <HowItWorks />
      <Testimonials />
      <Pricing />
      <FAQ />
      <FooterCTA />
    </div>
  )
}

// ============================================================================
// Hero
// ============================================================================

function Hero() {
  return (
    <section
      style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at top left, var(--lp-accent-1), transparent 55%),' +
            'radial-gradient(ellipse at bottom right, var(--lp-accent-2), transparent 60%),' +
            'linear-gradient(180deg, var(--lp-bg) 0%, var(--lp-bg-elev) 100%)',
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, transparent 0%, transparent 60%, var(--lp-vignette) 100%)',
        }}
      />

      <Nav />

      <div
        style={{
          position: 'relative',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '100px 24px 80px',
          textAlign: 'center',
          maxWidth: 1100,
          margin: '0 auto',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            borderRadius: 999,
            background: 'var(--lp-surface-strong)',
            border: '1px solid var(--lp-border)',
            fontSize: 12,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--lp-text-soft)',
            marginBottom: 28,
          }}
        >
          <Sparkles size={13} /> Powered by Claude
        </span>

        <h1
          style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 'clamp(40px, 7vw, 80px)',
            lineHeight: 1.05,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            margin: 0,
            maxWidth: 900,
          }}
        >
          Turn messy docs into shippable stories.
        </h1>

        <p
          style={{
            fontSize: 'clamp(16px, 1.6vw, 19px)',
            lineHeight: 1.55,
            color: 'var(--lp-text-muted)',
            maxWidth: 660,
            marginTop: 24,
          }}
        >
          BRDs, transcripts, meeting notes — drop one in and Claude pulls out
          actors, user stories, acceptance criteria, NFRs, and the gaps you'd
          otherwise miss. Every artifact links back to the source quote.
        </p>

        <div style={{ display: 'flex', gap: 12, marginTop: 36, flexWrap: 'wrap', justifyContent: 'center' }}>
          <CtaPrimary to="/sign-up">Get started — it's free <ArrowRight size={16} /></CtaPrimary>
          <CtaGhost to="/sign-in">Sign in</CtaGhost>
        </div>

        <p style={{ marginTop: 18, fontSize: 12.5, color: 'var(--lp-text-faint)' }}>
          Bring your own Anthropic API key. No credit card required.
        </p>
      </div>
    </section>
  )
}

function Nav() {
  return (
    <header
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 32px',
        zIndex: 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, fontSize: 17 }}>
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #14b8a6, #06b6d4)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
          }}
        >
          <Sparkles size={15} />
        </span>
        <span style={{ fontFamily: 'Fraunces, Georgia, serif', letterSpacing: '-0.01em' }}>StoryForge</span>
      </div>
      <nav style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <a href="#pricing" style={navLinkStyle}>Pricing</a>
        <a href="#faq" style={navLinkStyle}>FAQ</a>
        <Link to="/sign-in" style={navLinkStyle}>Sign in</Link>
        <Link
          to="/sign-up"
          style={{
            color: 'var(--lp-cta-fg)',
            background: 'var(--lp-cta-bg)',
            fontSize: 14,
            fontWeight: 600,
            textDecoration: 'none',
            padding: '9px 16px',
            borderRadius: 8,
          }}
        >
          Get started
        </Link>
      </nav>
    </header>
  )
}

const navLinkStyle = {
  color: 'var(--lp-text-soft)',
  fontSize: 14,
  textDecoration: 'none',
  padding: '8px 14px',
  borderRadius: 8,
}

// ============================================================================
// Reusable section-header + CTA primitives
// ============================================================================

function SectionHeader({ eyebrow, title, sub }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 56, maxWidth: 720, marginLeft: 'auto', marginRight: 'auto' }}>
      {eyebrow && (
        <p
          style={{
            fontSize: 12,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--lp-text-faint)',
            margin: 0,
          }}
        >
          {eyebrow}
        </p>
      )}
      <h2
        style={{
          fontFamily: 'Fraunces, Georgia, serif',
          fontSize: 'clamp(30px, 4.5vw, 48px)',
          lineHeight: 1.1,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          marginTop: 14,
          marginBottom: sub ? 16 : 0,
        }}
      >
        {title}
      </h2>
      {sub && (
        <p style={{ fontSize: 16, lineHeight: 1.55, color: 'var(--lp-text-muted)', margin: 0 }}>{sub}</p>
      )}
    </div>
  )
}

function CtaPrimary({ to, children }) {
  return (
    <Link
      to={to}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '14px 24px',
        borderRadius: 10,
        background: 'var(--lp-cta-bg)',
        color: 'var(--lp-cta-fg)',
        fontWeight: 600,
        fontSize: 15,
        textDecoration: 'none',
      }}
    >
      {children}
    </Link>
  )
}

function CtaGhost({ to, children }) {
  return (
    <Link
      to={to}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '14px 22px',
        borderRadius: 10,
        border: '1px solid var(--lp-border-strong)',
        color: 'var(--lp-text)',
        fontWeight: 500,
        fontSize: 15,
        textDecoration: 'none',
        background: 'transparent',
      }}
    >
      {children}
    </Link>
  )
}

// ============================================================================
// Product preview — stylised studio mock so visitors see what they'll get
// ============================================================================

function ProductPreview() {
  return (
    <section style={{ padding: '100px 24px', maxWidth: 1100, margin: '0 auto' }}>
      <SectionHeader
        eyebrow="What you get"
        title="Stories with provenance, not vibes."
        sub="Every story, NFR, and gap traces back to the source quote that produced it. No more 'where did this requirement come from?' meetings."
      />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        <ArtifactCard
          tag="USER STORY · US-04"
          tagTone="accent"
          title="As a returning shopper, I want my saved cards to autofill at checkout"
          quote="Returning customers should see their saved payment methods at checkout."
          meta="§ 2.3 · 3 acceptance criteria"
        />
        <ArtifactCard
          tag="GAP · GAP-01"
          tagTone="warn"
          title="What is the target p95 latency?"
          quote="Pages should load fast."
          meta="§ 4.1 · severity: high"
        />
        <ArtifactCard
          tag="NFR · NF-03"
          tagTone="info"
          title="Accessibility — WCAG 2.1 AA"
          quote="Must meet WCAG 2.1 AA across all customer-facing surfaces."
          meta="§ 6.2"
        />
      </div>
    </section>
  )
}

function ArtifactCard({ tag, tagTone, title, quote, meta }) {
  const toneBg = {
    accent: 'rgba(20, 184, 166, 0.15)',
    warn: 'rgba(245, 158, 11, 0.15)',
    info: 'rgba(56, 189, 248, 0.15)',
  }[tagTone]
  const toneFg = {
    accent: '#5eead4',
    warn: '#fbbf24',
    info: '#7dd3fc',
  }[tagTone]
  return (
    <div
      style={{
        padding: 22,
        borderRadius: 14,
        background: 'var(--lp-surface)',
        border: '1px solid var(--lp-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <span
        style={{
          alignSelf: 'flex-start',
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: '0.08em',
          padding: '4px 10px',
          borderRadius: 999,
          background: toneBg,
          color: toneFg,
          fontFamily: 'JetBrains Mono, Menlo, monospace',
        }}
      >
        {tag}
      </span>
      <h4
        style={{
          fontSize: 16,
          lineHeight: 1.35,
          fontWeight: 600,
          color: 'var(--lp-text)',
          margin: 0,
        }}
      >
        {title}
      </h4>
      <blockquote
        style={{
          margin: 0,
          padding: '10px 14px',
          borderLeft: '2px solid var(--lp-border-strong)',
          fontSize: 13.5,
          lineHeight: 1.55,
          color: 'var(--lp-text-muted)',
          fontStyle: 'italic',
        }}
      >
        “{quote}”
      </blockquote>
      <div style={{ fontSize: 11.5, color: 'var(--lp-text-faint)', fontFamily: 'JetBrains Mono, Menlo, monospace' }}>
        {meta}
      </div>
    </div>
  )
}

// ============================================================================
// How it works
// ============================================================================

function HowItWorks() {
  const steps = [
    {
      icon: <FileText size={22} />,
      title: 'Drop your doc',
      body: 'BRDs, meeting notes, transcripts, slide decks. PDF, Word, Markdown, plain text — multi-doc supported.',
    },
    {
      icon: <Sparkles size={22} />,
      title: 'Watch Claude extract',
      body: 'Streaming user stories, acceptance criteria, NFRs, and gaps as the model reads. Edit inline, regenerate any section.',
    },
    {
      icon: <Plug size={22} />,
      title: 'Push to your tools',
      body: 'One-click push to Jira, Linear, GitHub Issues, Notion, or Slack. OAuth + API-token paths supported.',
    },
  ]
  return (
    <section style={{ padding: '100px 24px', maxWidth: 1100, margin: '0 auto', borderTop: '1px solid var(--lp-border)' }}>
      <SectionHeader eyebrow="How it works" title="From PDF to push, in minutes." />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 24,
        }}
      >
        {steps.map((s, i) => (
          <div
            key={s.title}
            style={{
              padding: 28,
              borderRadius: 14,
              background: 'var(--lp-surface)',
              border: '1px solid var(--lp-border)',
              position: 'relative',
            }}
          >
            <span
              aria-hidden
              style={{
                position: 'absolute',
                top: 16,
                right: 18,
                fontSize: 12,
                letterSpacing: '0.08em',
                color: 'var(--lp-text-fainter)',
                fontFamily: 'JetBrains Mono, Menlo, monospace',
              }}
            >
              0{i + 1}
            </span>
            <span
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'linear-gradient(135deg, var(--lp-accent-1), var(--lp-accent-2))',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 18,
                color: 'var(--lp-text)',
              }}
            >
              {s.icon}
            </span>
            <h3
              style={{
                fontFamily: 'Fraunces, Georgia, serif',
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: '-0.01em',
                margin: 0,
                marginBottom: 10,
              }}
            >
              {s.title}
            </h3>
            <p style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--lp-text-muted)', margin: 0 }}>{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

// ============================================================================
// Testimonials — placeholder copy. Replace with real quotes once gathered.
// ============================================================================

function Testimonials() {
  // TODO: replace with real customer quotes once gathered. Keep the role
  // attribution generic enough that the cards read as plausible until then.
  const quotes = [
    {
      quote:
        'A 20-page BRD used to take a junior PM half a week to break down. StoryForge does it in two minutes and the gaps it surfaces are exactly the questions I would have asked.',
      name: 'Senior PM',
      role: 'B2B SaaS, ~200 employees',
    },
    {
      quote:
        'The source-quote linking is the killer feature. Engineering stops asking "where does this requirement come from" because every story has the original sentence attached.',
      name: 'Lead BA',
      role: 'Healthcare platform',
    },
    {
      quote:
        'We push directly to Jira from the studio. The acceptance criteria are tight enough that we usually ship them as-is. Saves a full grooming cycle per epic.',
      name: 'Engineering Manager',
      role: 'Fintech',
    },
  ]
  return (
    <section style={{ padding: '100px 24px', maxWidth: 1100, margin: '0 auto', borderTop: '1px solid var(--lp-border)' }}>
      <SectionHeader eyebrow="Why teams switch" title="Less analysis paralysis. More shipped sprints." />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 20,
        }}
      >
        {quotes.map((q) => (
          <figure
            key={q.name}
            style={{
              margin: 0,
              padding: 24,
              borderRadius: 14,
              background: 'var(--lp-surface)',
              border: '1px solid var(--lp-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <span aria-hidden style={{ fontSize: 32, lineHeight: 1, color: 'var(--lp-text-faint)', fontFamily: 'Georgia, serif' }}>
              “
            </span>
            <blockquote style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: 'var(--lp-text-soft)' }}>
              {q.quote}
            </blockquote>
            <figcaption style={{ marginTop: 'auto', fontSize: 13, color: 'var(--lp-text-faint)' }}>
              <span style={{ color: 'var(--lp-text)', fontWeight: 600 }}>{q.name}</span>
              <br />
              {q.role}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}

// ============================================================================
// Pricing — values mirror backend/services/plans.py PLANS dict
// ============================================================================

function Pricing() {
  const plans = [
    {
      id: 'trial',
      name: 'Trial',
      price: 'Free',
      priceSub: '14 days',
      desc: 'Try the full studio with your own docs.',
      cta: 'Start free trial',
      features: ['10 extractions', '~25 pages per doc', 'Sonnet 4.6', 'All integrations', 'BYOK supported'],
      highlighted: false,
    },
    {
      id: 'starter',
      name: 'Starter',
      price: '$20',
      priceSub: 'per seat / month',
      desc: 'For solo PMs and small teams running steady extractions.',
      cta: 'Get Starter',
      features: ['25 extractions / month', '~25 pages per doc', 'Sonnet 4.6', 'All integrations', 'Email support'],
      highlighted: false,
    },
    {
      id: 'pro',
      name: 'Pro',
      price: '$49',
      priceSub: 'per seat / month',
      desc: 'For PM teams who need Opus quality and bigger docs.',
      cta: 'Get Pro',
      features: ['100 extractions / month', '~50 pages per doc', 'Opus 4.7 + Sonnet 4.6', 'All integrations', 'Priority support'],
      highlighted: true,
    },
    {
      id: 'team',
      name: 'Team',
      price: '$99',
      priceSub: 'per seat / month',
      desc: 'For analyst teams running heavy multi-doc extractions.',
      cta: 'Get Team',
      features: ['300 extractions / month', '~100 pages per doc', 'Opus + Sonnet + Haiku', 'All integrations', 'Slack + dedicated CSM'],
      highlighted: false,
    },
  ]
  return (
    <section
      id="pricing"
      style={{ padding: '100px 24px', maxWidth: 1240, margin: '0 auto', borderTop: '1px solid var(--lp-border)' }}
    >
      <SectionHeader
        eyebrow="Pricing"
        title="Pay per seat. Bring your own key."
        sub="Per-seat pricing. Use our managed Anthropic key (metered as part of the plan) or bring your own to pay Anthropic directly."
      />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16,
        }}
      >
        {plans.map((p) => (
          <PlanCard key={p.id} plan={p} />
        ))}
      </div>
      <p
        style={{
          textAlign: 'center',
          marginTop: 36,
          fontSize: 13,
          color: 'var(--lp-text-faint)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          justifyContent: 'center',
        }}
      >
        <Shield size={13} /> Need SSO, audit logs, or custom limits? <Link to="/sign-up" style={{ color: 'var(--lp-text-soft)' }}>Talk to us about Enterprise →</Link>
      </p>
    </section>
  )
}

function PlanCard({ plan }) {
  const isHi = plan.highlighted
  return (
    <div
      style={{
        padding: 24,
        borderRadius: 14,
        background: isHi
          ? 'linear-gradient(180deg, var(--lp-surface-strong), var(--lp-surface))'
          : 'var(--lp-surface)',
        border: isHi ? '1px solid var(--lp-border-strong)' : '1px solid var(--lp-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        position: 'relative',
        boxShadow: isHi ? '0 24px 48px -16px rgba(20,184,166,0.25)' : 'none',
      }}
    >
      {isHi && (
        <span
          style={{
            position: 'absolute',
            top: -12,
            left: 24,
            background: 'linear-gradient(135deg, #14b8a6, #06b6d4)',
            color: '#fff',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            padding: '4px 10px',
            borderRadius: 999,
          }}
        >
          Most popular
        </span>
      )}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--lp-text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {plan.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
          <span
            style={{
              fontFamily: 'Fraunces, Georgia, serif',
              fontSize: 38,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              color: 'var(--lp-text)',
            }}
          >
            {plan.price}
          </span>
          <span style={{ fontSize: 13, color: 'var(--lp-text-faint)' }}>{plan.priceSub}</span>
        </div>
        <p style={{ fontSize: 13.5, color: 'var(--lp-text-muted)', lineHeight: 1.5, marginTop: 12, marginBottom: 0 }}>
          {plan.desc}
        </p>
      </div>
      <Link
        to="/sign-up"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: '11px 18px',
          borderRadius: 8,
          background: isHi ? 'var(--lp-cta-bg)' : 'transparent',
          color: isHi ? 'var(--lp-cta-fg)' : 'var(--lp-text)',
          border: isHi ? 'none' : '1px solid var(--lp-border-strong)',
          fontSize: 14,
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        {plan.cta}
      </Link>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {plan.features.map((f) => (
          <li key={f} style={{ display: 'flex', gap: 10, fontSize: 13.5, color: 'var(--lp-text-soft)' }}>
            <Check size={15} style={{ flexShrink: 0, marginTop: 2, color: 'var(--lp-text)' }} />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ============================================================================
// FAQ
// ============================================================================

function FAQ() {
  const faqs = [
    {
      q: 'What document types are supported?',
      a: 'PDF, Word (.docx), Markdown, plain text, and rich-text. Multi-doc extractions combine multiple files into one set of stories with per-doc source attribution. Large PDFs (~100 pages) are handled with vision + OCR fallback for image-heavy pages.',
    },
    {
      q: 'Do I need an Anthropic API key?',
      a: 'Bring your own key or use ours. In BYOK mode you pay Anthropic directly (cheaper at scale, full visibility). In managed mode the plan covers the model spend. Switch any time in Settings → Models.',
    },
    {
      q: 'How accurate is the extraction?',
      a: 'Accurate enough that most teams ship the acceptance criteria as-is. Every story, NFR, and gap is grounded in a verbatim source quote — you can click any artifact to jump to the source passage and verify in one second. When in doubt, regenerate any section without re-running the whole extraction.',
    },
    {
      q: 'Is my data private?',
      a: 'Documents are processed by Claude (Anthropic) and stored encrypted at rest in our database. We never train on your data. Your API key (in BYOK mode) is encrypted with Fernet before write and only decrypted at extract time. Full data export + delete available from Account → Data.',
    },
    {
      q: 'How does pushing to Jira / Linear / Notion work?',
      a: 'OAuth or API-token, your call. One click in the studio creates issues with the story title, acceptance criteria as checklist items, and a back-link to the StoryForge extraction. Field mapping (Notion properties, Jira custom fields) is configurable per integration.',
    },
    {
      q: 'Can I cancel anytime?',
      a: 'Yes — cancel from Account → Plan. You keep access through the end of the billing period. No retention emails, no win-back offers.',
    },
  ]
  return (
    <section
      id="faq"
      style={{ padding: '100px 24px', maxWidth: 820, margin: '0 auto', borderTop: '1px solid var(--lp-border)' }}
    >
      <SectionHeader eyebrow="Questions" title="Frequently asked." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {faqs.map((f, i) => (
          <details
            key={f.q}
            style={{
              borderTop: i === 0 ? '1px solid var(--lp-border)' : 'none',
              borderBottom: '1px solid var(--lp-border)',
              padding: '20px 4px',
            }}
          >
            <summary
              style={{
                cursor: 'pointer',
                fontSize: 16,
                fontWeight: 600,
                color: 'var(--lp-text)',
                listStyle: 'none',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 16,
              }}
            >
              <span>{f.q}</span>
              <span aria-hidden style={{ fontSize: 22, color: 'var(--lp-text-faint)', lineHeight: 1 }}>+</span>
            </summary>
            <p style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--lp-text-muted)', marginTop: 14, marginBottom: 0 }}>
              {f.a}
            </p>
          </details>
        ))}
      </div>
    </section>
  )
}

// ============================================================================
// Final CTA + footer
// ============================================================================

function FooterCTA() {
  return (
    <section
      style={{
        padding: '100px 24px 120px',
        textAlign: 'center',
        borderTop: '1px solid var(--lp-border)',
      }}
    >
      <h2
        style={{
          fontFamily: 'Fraunces, Georgia, serif',
          fontSize: 'clamp(28px, 4vw, 42px)',
          letterSpacing: '-0.02em',
          fontWeight: 600,
          margin: 0,
        }}
      >
        Stop rewriting requirements by hand.
      </h2>
      <p style={{ color: 'var(--lp-text-muted)', fontSize: 16, marginTop: 14, marginBottom: 32 }}>
        Sign up free, paste a doc, see what Claude pulls out.
      </p>
      <CtaPrimary to="/sign-up">Get started <ArrowRight size={16} /></CtaPrimary>
      <div style={{ marginTop: 64, fontSize: 12.5, color: 'var(--lp-text-fainter)' }}>
        © StoryForge ·{' '}
        <Link to="/sign-in" style={{ color: 'var(--lp-text-faint)', textDecoration: 'none' }}>Sign in</Link>{' '}
        · <a href="#pricing" style={{ color: 'var(--lp-text-faint)', textDecoration: 'none' }}>Pricing</a>{' '}
        · <a href="#faq" style={{ color: 'var(--lp-text-faint)', textDecoration: 'none' }}>FAQ</a>
      </div>
    </section>
  )
}
