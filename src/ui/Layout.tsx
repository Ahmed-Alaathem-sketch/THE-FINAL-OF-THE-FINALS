import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useStore } from '../state/store';
import { BrandMark, I } from './components/icons';
import { short } from './components/common';
import { ToastZone } from './components/Toast';

const NAV: { group?: string; to: string; label: string; icon: keyof typeof I; count?: 'reviews' | 'unmatched' }[] = [
  { to: '/', label: 'Overview', icon: 'home' },
  { to: '/dashboard', label: 'Executive dashboard', icon: 'dash' },
  { group: 'Risk', to: '/suppliers', label: 'Supplier directory', icon: 'suppliers' },
  { to: '/families', label: 'Part families', icon: 'family' },
  { to: '/evidence', label: 'Evidence register', icon: 'evidence' },
  { group: 'Sources', to: '/memos', label: 'Memos & intake', icon: 'memo', count: 'unmatched' },
  { to: '/reviews', label: 'Review queue', icon: 'review', count: 'reviews' },
  { to: '/data', label: 'Data & privacy', icon: 'data' },
  { group: 'Governance', to: '/reports', label: 'Reports & exports', icon: 'report' },
  { to: '/runs', label: 'Assessment history', icon: 'runs' },
  { to: '/rules', label: 'Rules & versions', icon: 'rules' },
  { to: '/audit', label: 'Audit trail', icon: 'audit' },
];

export function Layout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const out = useStore((s) => s.current?.output ?? null);
  const activeRuleKey = useStore((s) => s.activeRuleKey);
  const audit = useStore((s) => s.audit);
  const busy = useStore((s) => s.busy);
  useEffect(() => { setOpen(false); window.scrollTo({ top: 0 }); }, [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open]);

  const counts = { reviews: out?.summary.pendingReviews ?? 0, unmatched: out?.summary.unmatchedMemos ?? 0 };
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <div className="shell">
        {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden />}
        <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Main navigation" id="sidebar">
          <Link to="/" className="brand" aria-label="C5 Risk Control Tower — overview">
            <BrandMark />
            <span>
              <span className="brand-name">Risk Control Tower</span>
              <br />
              <span className="brand-sub">RR-C5 · Brightkeel</span>
            </span>
          </Link>
          <nav className="nav">
            {NAV.map((n) => {
              const Icon = I[n.icon];
              const c = n.count ? counts[n.count] : 0;
              return (
                <div key={n.to} style={{ display: 'contents' }}>
                  {n.group && <div className="nav-group">{n.group}</div>}
                  <NavLink to={n.to} end={n.to === '/'} className={({ isActive }) => (isActive ? 'active' : undefined)}>
                    <Icon />
                    {n.label}
                    {c > 0 && <span className="count" aria-label={`${c} pending`}>{c}</span>}
                  </NavLink>
                </div>
              );
            })}
          </nav>
          <div className="sidebar-foot">
            <div>Rule set: <strong>{activeRuleKey}</strong></div>
            <div>Audit chain: <strong>{audit.check.ok ? `intact (${audit.count})` : 'BROKEN'}</strong></div>
            <div style={{ marginTop: 6 }}>Data stays in this browser. <Link to="/data" style={{ color: 'var(--brass)' }}>Privacy</Link></div>
          </div>
        </aside>
        <div className="main">
          <header className="topbar">
            <button className="btn ghost icon-btn menu-btn" aria-label="Open navigation" aria-expanded={open} aria-controls="sidebar" onClick={() => setOpen(true)}><I.menu /></button>
            <span className="crumbs">C5 Supplier Risk Control Tower</span>
            <span className="spacer" />
            {busy && <span className="chip-run"><span className="dot warn" /> {busy}</span>}
            {out ? (
              <Link to="/runs" className="chip-run" title={`Output fingerprint ${out.outputFingerprint}`} style={{ textDecoration: 'none' }}>
                <span className="dot" /> Run {short(out.outputFingerprint, 8)} · {out.ruleSetId} V{out.ruleSetVersion}
              </Link>
            ) : (
              <Link to="/data" className="chip-run" style={{ textDecoration: 'none' }}><span className="dot off" /> Awaiting source data</Link>
            )}
          </header>
          <main id="main" className="content" tabIndex={-1}>{children}</main>
        </div>
      </div>
      <ToastZone />
    </>
  );
}
