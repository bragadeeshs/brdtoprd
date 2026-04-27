import React, { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { OrganizationSwitcher, UserButton, useUser } from '@clerk/clerk-react'
import { createProjectApi } from '../api.js'
import { useApp } from '../lib/AppContext.jsx'
import { useToast } from './Toast.jsx'
import { Badge, IconButton } from './primitives.jsx'
import SidebarExtractionSection from './SidebarExtractionSection.jsx'
import {
  Edit,
  FileText,
  FolderClosed,
  Logo,
  Plus,
  Search,
  Settings,
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

      {/* List */}
      {!projectsLoading && projects.length === 0 && !creating && (
        <div
          style={{
            padding: '6px 14px 4px',
            fontSize: 11.5,
            color: 'var(--text-soft)',
            fontStyle: 'italic',
          }}
        >
          No projects yet.
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
  return (
    <aside
      style={{
        width: 248,
        background: 'var(--bg-subtle)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      {/* Brand row */}
      <div
        style={{
          padding: '14px 14px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Logo size={28} />
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 17,
            fontWeight: 600,
            color: 'var(--text-strong)',
            flex: 1,
          }}
        >
          StoryForge
        </span>
        <IconButton label="Search · coming soon" size={28} disabled aria-disabled="true" style={{ cursor: 'not-allowed', opacity: 0.45 }}>
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

      {/* Scrollable nav */}
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 6, paddingBottom: 12 }}>
        <NavItem icon={<FileText size={16} />} label="Documents" to="/documents" />
        <ProjectsSection />
        <div style={{ marginTop: 12 }}>
          <NavItem icon={<User size={16} />} label="Account" to="/account" />
          <NavItem icon={<Settings size={16} />} label="Settings" to="/settings" />
        </div>
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

/** Footer pill backed by Clerk's useUser + UserButton (avatar + dropdown). */
function UserPill() {
  const { user, isLoaded } = useUser()
  const displayName = user?.fullName || user?.username || user?.primaryEmailAddress?.emailAddress || 'Account'
  const subline = user?.primaryEmailAddress?.emailAddress &&
    user.primaryEmailAddress.emailAddress !== displayName
    ? user.primaryEmailAddress.emailAddress
    : 'Free trial'

  return (
    <div
      style={{
        padding: '10px 14px',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-subtle)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      {/* Clerk's UserButton renders a 28px avatar that opens a manage-account
          + sign-out dropdown. afterSignOutUrl bounces back to /sign-in. */}
      <UserButton
        afterSignOutUrl="/sign-in"
        appearance={{ elements: { avatarBox: { width: 28, height: 28 } } }}
      />
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
    </div>
  )
}
