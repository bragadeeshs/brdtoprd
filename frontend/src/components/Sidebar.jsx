import React, { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { OrganizationSwitcher, useClerk, useUser } from '@clerk/clerk-react'
import { useApp } from '../lib/AppContext.jsx'
import { createProjectApi } from '../api.js'
import { useToast } from './Toast.jsx'
import { Badge, IconButton } from './primitives.jsx'
import SidebarExtractionSection from './SidebarExtractionSection.jsx'
import {
  Edit,
  FileText,
  FolderClosed,
  HelpCircle,
  LayoutTemplate,
  Logo,
  Monitor,
  Moon,
  Plug,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  User,
  X,
  Zap,
} from './icons.jsx'

function NavItem({ icon, label, to, count }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
    >
      <span style={{ display: 'inline-flex', flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      {count != null && (
        <span style={{ fontSize: 11, color: 'var(--text-soft)', fontFamily: 'var(--font-mono)' }}>
          {count}
        </span>
      )}
    </NavLink>
  )
}

/* M12.1 — Sidebar section label. Uppercase mini-heading that visually
 * groups related nav items. Pattern lifted from the screenshot reference
 * (OVERVIEW / MANAGE / MONITOR / SETTINGS) and adapted to our 3-group
 * structure (WORKSPACE / SETUP / ACCOUNT). The first group skips the
 * top margin so the brand row + workspace switcher don't crowd the
 * label. */
function NavGroupLabel({ children, first }) {
  return (
    <div
      style={{
        padding: '0 14px 4px',
        marginTop: first ? 4 : 18,
        marginBottom: 2,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        color: 'var(--text-soft)',
      }}
    >
      {children}
    </div>
  )
}

function ProjectsSection() {
  const { projects, projectsLoading, refreshProjects } = useApp()
  const { toast } = useToast()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (creating) inputRef.current?.focus()
  }, [creating])

  const submit = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setCreating(false)
      return
    }
    setSubmitting(true)
    try {
      await createProjectApi(trimmed)
      await refreshProjects()
      toast.success(`Project "${trimmed}" created`)
      setName('')
      setCreating(false)
    } catch (e) {
      toast.error(e.message || 'Could not create project')
    } finally {
      setSubmitting(false)
    }
  }

  const cancel = () => {
    setName('')
    setCreating(false)
  }

  return (
    <div style={{ marginTop: 14, paddingBottom: 4 }}>
      {/* Section header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 14px',
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            color: 'var(--text-soft)',
          }}
        >
          Projects
        </span>
        <IconButton
          label={creating ? 'Cancel' : 'New project'}
          size={20}
          onClick={() => (creating ? cancel() : setCreating(true))}
        >
          {creating ? <X size={12} /> : <Plus size={12} />}
        </IconButton>
      </div>

      {/* Inline create form */}
      {creating && (
        <div style={{ padding: '0 10px 6px' }}>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              else if (e.key === 'Escape') cancel()
            }}
            placeholder="New project name"
            disabled={submitting}
            style={{
              width: '100%',
              height: 30,
              padding: '0 10px',
              fontSize: 12.5,
              border: '1px solid var(--accent)',
              borderRadius: 'var(--radius-sm)',
              outline: 'none',
              background: 'var(--bg-elevated)',
              color: 'var(--text-strong)',
              fontFamily: 'inherit',
              boxShadow: 'var(--shadow-focus)',
            }}
          />
        </div>
      )}

      {/* List — M14.5.i: empty state is now a dashed-border card with a
          folder icon + "Create your first project" affordance, matching
          the design replica. The plain italic line was easy to miss. */}
      {!projectsLoading && projects.length === 0 && !creating && (
        <div
          style={{
            margin: '6px 12px 8px',
            padding: '14px 14px 12px',
            border: '1px dashed var(--border-strong)',
            borderRadius: 'var(--radius)',
            background: 'var(--bg-subtle)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
          }}
        >
          <FolderClosed size={16} style={{ color: 'var(--text-soft)', flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>
              No projects yet.
            </div>
            <button
              type="button"
              onClick={() => setCreating(true)}
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
                color: 'var(--accent-strong)',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Create your first project
            </button>
          </div>
        </div>
      )}

      {projects.map((p) => (
        <NavItem
          key={p.id}
          to={`/projects/${p.id}`}
          icon={<FolderClosed size={16} />}
          label={p.name}
          count={p.extraction_count || null}
        />
      ))}
    </div>
  )
}

export default function Sidebar({ onNew, extractionContext }) {
  const navigate = useNavigate()
  return (
    <aside
      className="app-sidebar"
      style={{
        width: 248,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      {/* Brand row — Logo + name link to / (Home), so clicking the brand
          returns to the studio from anywhere. Search icon navigates to
          /documents with a query param that focuses the search input. */}
      <div
        style={{
          padding: '14px 14px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Link
          to="/"
          aria-label="Home"
          title="Home"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flex: 1,
            textDecoration: 'none',
            color: 'inherit',
            borderRadius: 6,
            padding: '2px 4px',
            margin: '-2px -4px',
          }}
        >
          <Logo size={28} />
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 17,
              fontWeight: 600,
              color: 'var(--text-strong)',
            }}
          >
            Lucid
          </span>
        </Link>
        <IconButton
          label="Search documents"
          size={28}
          onClick={() => navigate('/documents?focus=search')}
        >
          <Search size={15} />
        </IconButton>
        <IconButton label="New extraction" size={28} onClick={onNew}>
          <Edit size={15} />
        </IconButton>
      </div>

      {/* Workspace switcher (Clerk Organizations).
          hidePersonal=false so users keep "Personal account" as a switchable
          context — matches our backend scope rule (personal vs org). */}
      <div style={{ padding: '4px 12px 8px' }}>
        <OrganizationSwitcher
          hidePersonal={false}
          afterSelectOrganizationUrl="/"
          afterCreateOrganizationUrl="/"
          afterLeaveOrganizationUrl="/"
          appearance={{
            elements: {
              organizationSwitcherTrigger: {
                width: '100%',
                justifyContent: 'space-between',
                padding: '6px 8px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--bg-elevated)',
                fontSize: '12.5px',
              },
            },
          }}
        />
      </div>

      {/* M12.1 — Scrollable nav, organized into 3 labelled groups so the
          flat list reads as intentional clusters rather than a stack of
          equally-weighted items. */}
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 4, paddingBottom: 12 }}>
        <NavGroupLabel first>Workspace</NavGroupLabel>
        {/* M14.5.b — "New Extraction" surfaces the / route as a clear active
            target. Without this, users on the upload page had no sidebar item
            highlighted. The Edit icon matches the brand row's "+ new" button. */}
        <NavItem icon={<Edit size={16} />} label="New Extraction" to="/" />
        <NavItem icon={<FileText size={16} />} label="Documents" to="/documents" />
        <ProjectsSection />

        <NavGroupLabel>Setup</NavGroupLabel>
        <NavItem icon={<Sparkles size={16} />} label="Models" to="/models" />
        <NavItem icon={<LayoutTemplate size={16} />} label="Tools" to="/tools" />
        <NavItem icon={<Plug size={16} />} label="Integrations" to="/integrations" />

        <NavGroupLabel>Account</NavGroupLabel>
        <NavItem icon={<User size={16} />} label="Account" to="/account" />
        <NavItem icon={<Settings size={16} />} label="Settings" to="/settings" />
        <NavItem icon={<HelpCircle size={16} />} label="Support" to="/support" />

        {/* M8.1 — Studio context. Renders only when an extraction is open
            (App.jsx passes null otherwise). */}
        {extractionContext && <SidebarExtractionSection {...extractionContext} />}
      </div>

      {/* M3.5 — usage bar above the user pill */}
      <UsageBar />

      {/* Footer: user pill (Clerk) */}
      <UserPill />
    </aside>
  )
}

/**
 * M3.5 usage bar. Reads `plan` from AppContext (App.jsx fetches /api/me/plan
 * on mount + after each extraction). Hidden until the first response lands —
 * we'd rather show nothing than a flicker.
 *
 * Click → /account where the upgrade flow will live (Stripe checkout in M3.6).
 */
function UsageBar() {
  const { plan } = useApp()
  if (!plan) return null

  const { plan_name, usage_in_period, extractions_per_period, period_label, upgrade_to } = plan
  const pct = extractions_per_period > 0
    ? Math.min(100, Math.round((usage_in_period / extractions_per_period) * 100))
    : 0
  const overFlag = usage_in_period >= extractions_per_period
  const nearFlag = pct >= 80 && !overFlag

  // Tier badge tone — visual reinforcement of where the user sits in the funnel
  const tierTone = {
    Trial: 'info',
    Starter: 'success',
    Pro: 'purple',
    Team: 'accent',
    'Trial expired': 'danger',
  }[plan_name] || 'neutral'

  return (
    <NavLink
      to="/account"
      style={{ textDecoration: 'none', color: 'inherit' }}
      title={overFlag ? 'Limit reached — click to upgrade' : 'Usage this period · click for details'}
    >
      <div
        style={{
          padding: '10px 14px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          cursor: 'pointer',
          transition: 'background .12s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-subtle)')}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Badge tone={tierTone} size="sm">{plan_name}</Badge>
          <span
            style={{
              fontSize: 11,
              color: overFlag ? 'var(--danger-ink)' : (nearFlag ? 'var(--warn-ink)' : 'var(--text-muted)'),
              fontFamily: 'var(--font-mono)',
              marginLeft: 'auto',
            }}
          >
            {usage_in_period}/{extractions_per_period}
          </span>
        </div>
        {/* Progress bar */}
        <div
          style={{
            height: 4,
            borderRadius: 999,
            background: 'var(--bg-hover)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              background: overFlag
                ? 'var(--danger)'
                : nearFlag
                  ? 'var(--warn)'
                  : 'var(--accent)',
              transition: 'width .25s, background .25s',
            }}
          />
        </div>
        {/* M14.5.i — period label clarifies what the count counts. The
            screenshot shows "Extractions this month" / "this trial period". */}
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-soft)',
            marginTop: 2,
          }}
        >
          Extractions {period_label || 'this period'}
        </div>
        {(overFlag || nearFlag) && upgrade_to && (
          <div
            style={{
              fontSize: 11,
              color: overFlag ? 'var(--danger-ink)' : 'var(--warn-ink)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Zap size={11} />
            Upgrade to {upgrade_to.replace(/^./, c => c.toUpperCase())}
          </div>
        )}
      </div>
    </NavLink>
  )
}

/* M1.1.4 — User pill with custom popover.
 *
 * Replaces Clerk's <UserButton> dropdown with our own menu so app-specific
 * shortcuts (Account, Settings, Theme cycle) sit alongside Clerk's
 * "Manage account" + "Sign out". One menu = one mental model.
 *
 * Click anywhere on the pill (avatar or text) to open. Click-outside or
 * Esc dismiss. The menu opens *upward* since the pill lives at the bottom
 * of a tall sidebar.
 */
function UserPill() {
  const { user, isLoaded } = useUser()
  const { signOut, openUserProfile } = useClerk()
  const { theme, setTheme } = useApp()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const popRef = useRef(null)
  const btnRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (popRef.current?.contains(e.target)) return
      if (btnRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const displayName = user?.fullName || user?.username || user?.primaryEmailAddress?.emailAddress || 'Account'
  const subline = user?.primaryEmailAddress?.emailAddress &&
    user.primaryEmailAddress.emailAddress !== displayName
    ? user.primaryEmailAddress.emailAddress
    : 'Free trial'

  const themeLabel = theme === 'light' ? 'Switch to dark'
                  : theme === 'dark'  ? 'Switch to system'
                  :                     'Switch to light'
  const ThemeIcon = theme === 'light' ? Moon : theme === 'dark' ? Monitor : Sun
  const cycleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light')
  }

  const navTo = (path) => {
    setOpen(false)
    navigate(path)
  }
  const onSignOut = async () => {
    setOpen(false)
    try { await signOut({ redirectUrl: '/sign-in' }) } catch { /* fire-and-forget */ }
  }
  const onManage = () => {
    setOpen(false)
    openUserProfile?.()
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((s) => !s)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          width: '100%',
          padding: '10px 14px',
          borderTop: '1px solid var(--border)',
          background: open ? 'var(--bg-hover)' : 'var(--bg-subtle)',
          border: 'none',
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'inherit',
          color: 'inherit',
          transition: 'background var(--dur-fast) var(--ease-out)',
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = 'var(--bg-hover)' }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = 'var(--bg-subtle)' }}
      >
        {user?.imageUrl ? (
          <img
            src={user.imageUrl}
            alt=""
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              flexShrink: 0,
              objectFit: 'cover',
            }}
          />
        ) : (
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: 'var(--accent-soft)',
              color: 'var(--accent-strong)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {displayName?.slice(0, 1).toUpperCase() || '?'}
          </span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 500,
              color: 'var(--text-strong)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {isLoaded ? displayName : '…'}
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-soft)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {isLoaded ? subline : ''}
          </div>
        </div>
      </button>

      {open && (
        <div
          ref={popRef}
          role="menu"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: 8,
            right: 8,
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-lg)',
            padding: 4,
            zIndex: 50,
          }}
        >
          <PillMenuItem icon={<User size={13} />} label="Account" onClick={() => navTo('/account')} />
          <PillMenuItem icon={<Settings size={13} />} label="Settings" onClick={() => navTo('/settings')} />
          <PillMenuItem icon={<ThemeIcon size={13} />} label={themeLabel} onClick={cycleTheme} />
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <PillMenuItem label="Manage account…" onClick={onManage} />
          <PillMenuItem label="Sign out" onClick={onSignOut} danger />
        </div>
      )}
    </div>
  )
}

function PillMenuItem({ icon, label, onClick, danger }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '7px 10px',
        background: 'transparent',
        border: 'none',
        borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
        fontSize: 12.5,
        color: danger ? 'var(--danger-ink)' : 'var(--text-strong)',
        textAlign: 'left',
        fontFamily: 'inherit',
        transition: 'background var(--dur-fast) var(--ease-out)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? 'var(--danger-soft)' : 'var(--bg-hover)'
      }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      {icon && (
        <span style={{ width: 14, color: 'var(--text-muted)', display: 'inline-flex' }}>
          {icon}
        </span>
      )}
      {label}
    </button>
  )
}
