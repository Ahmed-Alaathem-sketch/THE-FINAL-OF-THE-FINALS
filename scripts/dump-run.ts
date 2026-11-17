// Developer aid: print a compact scorecard for the pack. Run with: npx vite-node scripts/dump-run.ts
import { assess } from '../src/engine/assess';
import { RR_C5_V1_2 } from '../src/engine/rules/rr-c5-v1.2';
import { packSources } from '../tests/helpers/pack';

const out = assess({ ...packSources(), ruleSet: RR_C5_V1_2 });
for (const r of out.scorecard) {
  const fl = Object.values(r.flags).filter((f) => f.raised === true).map((f) => f.flag).join('+') || '-';
  console.log(r.supplierId, r.status.padEnd(16), r.indemnity.position.padEnd(16), fl);
}
console.log(JSON.stringify(out.summary));
for (const q of out.reviewQueue) console.log('REVIEW', q.key, q.detail, q.quote ?? '');
for (const c of out.contradictions) console.log('CONTRA', c.supplierId, c.subject, c.resolution);
for (const s of out.statements) console.log('ST', s.memoId, s.sentenceIndex, s.kind, s.amountBhd ?? '', (s.families ?? []).join('|'), (s.mentions ?? []).join('|'));
console.log(out.warnings);
