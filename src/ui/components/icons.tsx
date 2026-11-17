import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...p });

export const I = {
  home: (p: P) => <svg {...base(p)}><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v10h14V10" /></svg>,
  dash: (p: P) => <svg {...base(p)}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>,
  suppliers: (p: P) => <svg {...base(p)}><path d="M3 21V8l6-4 6 4v13" /><path d="M15 21V11l6 3v7" /><path d="M7 12h4M7 16h4" /></svg>,
  family: (p: P) => <svg {...base(p)}><circle cx="12" cy="5" r="2.5" /><circle cx="5" cy="18" r="2.5" /><circle cx="19" cy="18" r="2.5" /><path d="M12 7.5v4M12 11.5 6.5 16M12 11.5l5.5 4.5" /></svg>,
  memo: (p: P) => <svg {...base(p)}><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 12h7M9 16h7M9 8h3" /></svg>,
  evidence: (p: P) => <svg {...base(p)}><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 6 6M8 10.5h5M10.5 8v5" /></svg>,
  review: (p: P) => <svg {...base(p)}><path d="M12 3 3 7v6c0 4.5 3.8 7.4 9 8 5.2-.6 9-3.5 9-8V7z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></svg>,
  audit: (p: P) => <svg {...base(p)}><path d="M4 4h12l4 4v12H4z" /><path d="M8 12h8M8 16h5M8 8h4" /><circle cx="18" cy="18" r="0.5" /></svg>,
  report: (p: P) => <svg {...base(p)}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>,
  rules: (p: P) => <svg {...base(p)}><path d="M4 6h16M4 12h10M4 18h7" /><circle cx="18" cy="15" r="3" /><path d="m20.2 17.2 1.8 1.8" /></svg>,
  runs: (p: P) => <svg {...base(p)}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5M12 7v5l3 2" /></svg>,
  data: (p: P) => <svg {...base(p)}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></svg>,
  upload: (p: P) => <svg {...base(p)}><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v4h16v-4" /></svg>,
  download: (p: P) => <svg {...base(p)}><path d="M12 4v12M7 11l5 5 5-5" /><path d="M4 20h16" /></svg>,
  menu: (p: P) => <svg {...base(p)}><path d="M4 7h16M4 12h16M4 17h16" /></svg>,
  close: (p: P) => <svg {...base(p)}><path d="M6 6l12 12M18 6 6 18" /></svg>,
  info: (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></svg>,
  warn: (p: P) => <svg {...base(p)}><path d="M12 3 2 21h20z" /><path d="M12 10v5M12 18v.5" /></svg>,
  check: (p: P) => <svg {...base(p)}><path d="m5 12 4.5 4.5L19 7" /></svg>,
  arrow: (p: P) => <svg {...base(p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>,
  play: (p: P) => <svg {...base(p)}><path d="M7 4v16l13-8z" /></svg>,
  lock: (p: P) => <svg {...base(p)}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>,
  sort: (p: P) => <svg {...base(p)}><path d="m8 9 4-4 4 4M8 15l4 4 4-4" /></svg>,
};

/** Status glyphs: distinct shapes so status never relies on colour alone. */
export function StatusGlyph({ status }: { status: string }) {
  if (status === 'RED') return <svg viewBox="0 0 12 12" aria-hidden><path d="M6 1 11 10H1z" fill="currentColor" /></svg>;
  if (status === 'AMBER') return <svg viewBox="0 0 12 12" aria-hidden><path d="M6 1 11 6 6 11 1 6z" fill="currentColor" /></svg>;
  if (status === 'GREEN') return <svg viewBox="0 0 12 12" aria-hidden><circle cx="6" cy="6" r="5" fill="currentColor" /></svg>;
  return <svg viewBox="0 0 12 12" aria-hidden><circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M6 3.6v3M6 8.2v.4" stroke="currentColor" strokeWidth="1.6" /></svg>;
}

export function BrandMark(p: P) {
  return (
    <svg viewBox="0 0 40 40" className="brand-mark" aria-hidden {...p}>
      <rect x="1" y="1" width="38" height="38" rx="10" fill="#B8A85D" />
      <path d="M20 7v26M12 33h16M15 33l5-18 5 18" stroke="#1C393F" strokeWidth="2.2" fill="none" strokeLinejoin="round" />
      <circle cx="20" cy="11" r="3" fill="#1C393F" />
      <path d="M11 11a12 12 0 0 1 4-6M29 11a12 12 0 0 0-4-6" stroke="#1C393F" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  );
}
