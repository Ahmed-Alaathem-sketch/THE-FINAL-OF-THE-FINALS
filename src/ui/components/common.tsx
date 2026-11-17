import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { I } from './icons';

export function PageHead({ eyebrow, title, intro, actions }: { eyebrow?: string; title: string; intro?: ReactNode; actions?: ReactNode }) {
  useEffect(() => { document.title = `${title} · C5 Risk Control Tower`; }, [title]);
  return (
    <div className="page-head">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {intro && <p>{intro}</p>}
      </div>
      {actions && <div className="btn-row">{actions}</div>}
    </div>
  );
}

export function AwaitingData({ what = 'this view' }: { what?: string }) {
  return (
    <div className="empty" data-testid="awaiting-data">
      <I.data />
      <h2>Awaiting source data</h2>
      <p className="muted" style={{ maxWidth: '60ch', margin: '0 auto 16px' }}>
        No supplier records have been imported in this browser, so {what} has nothing to show. The tool never invents suppliers, evidence or results.
        Import <strong>SUPPLIER_MASTER.csv</strong>, <strong>ASSESSMENT_LOG.csv</strong> and the memos (or the whole pack zip) to run RR-C5.
      </p>
      <Link className="btn" to="/data"><I.upload /> Import source files</Link>
    </div>
  );
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'err' | 'ok'; children: ReactNode }) {
  const Icon = kind === 'warn' || kind === 'err' ? I.warn : kind === 'ok' ? I.check : I.info;
  return <div className={`notice ${kind === 'info' ? '' : kind}`} role={kind === 'err' ? 'alert' : undefined}><Icon />{<div>{children}</div>}</div>;
}

/** Adds the "in" class when the element scrolls into view (entrance transition). */
export function Reveal({ children, delay = 0, as: Tag = 'div', className = '' }: { children: ReactNode; delay?: number; as?: 'div' | 'section'; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setIn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setIn(true); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && (setIn(true), io.disconnect())), { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <Tag ref={ref} className={`reveal ${inView ? 'in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</Tag>;
}

export type SortDir = 'asc' | 'desc';
export function useSort<T>(rows: T[], initial: { key: string; dir: SortDir }, get: (r: T, key: string) => string | number) {
  const [sort, setSort] = useState(initial);
  const sorted = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => {
      const x = get(a, sort.key), y = get(b, sort.key);
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true });
      return sort.dir === 'asc' ? c : -c;
    });
    return out;
  }, [rows, sort, get]);
  const header = (key: string, label: string, cls?: string) => (
    <th className={cls} aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => setSort({ key, dir: sort.key === key && sort.dir === 'asc' ? 'desc' : 'asc' })}>
        {label}<I.sort width={12} height={12} />
      </button>
    </th>
  );
  return { sorted, header, sort };
}

export const STATUS_ORDER: Record<string, number> = { RED: 0, AMBER: 1, 'CANNOT DETERMINE': 2, GREEN: 3 };

export function fmtDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

export function short(hash: string, n = 10) { return hash.slice(0, n); }
