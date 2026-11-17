import { Link } from 'react-router-dom';
import type { FlagResult, Status } from '../../engine/types';
import { StatusGlyph } from './icons';

export const statusClass = (s: string) => (s === 'CANNOT DETERMINE' ? 'CD' : s);

export function StatusBadge({ status, large }: { status: Status | string; large?: boolean }) {
  return (
    <span className={`status ${statusClass(status)}${large ? ' lg' : ''}`} data-status={status}>
      <StatusGlyph status={status} />
      {status}
    </span>
  );
}

export function FlagChip({ flag, to }: { flag: FlagResult; to?: string }) {
  const cls = flag.raised === true ? 'flag' : flag.raised === 'UNDETERMINED' ? 'flag und' : 'flag off';
  const label = flag.raised === true ? flag.flag : flag.raised === 'UNDETERMINED' ? `${flag.flag}: CANNOT DETERMINE` : `no ${flag.flag}`;
  if (to && flag.raised !== false) return <Link className={cls} to={to} title="Open the evidence">{label}</Link>;
  return <span className={cls}>{label}</span>;
}

export function Indemnity({ position }: { position: string }) {
  const cls = position === 'GAP' ? 'tag ink' : position === 'NO GAP' ? 'tag' : 'tag';
  return <span className={cls} data-indemnity={position}>{position === 'GAP' ? 'INDEMNITY GAP' : position === 'NO GAP' ? 'NO GAP' : 'CANNOT DETERMINE'}</span>;
}
