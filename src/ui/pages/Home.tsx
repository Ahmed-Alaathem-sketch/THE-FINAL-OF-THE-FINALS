import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useOutput } from '../../state/store';
import { PageHead, Reveal } from '../components/common';
import { I } from '../components/icons';
import { StatusBadge } from '../components/Status';

function Radar({ blips }: { blips: { x: number; y: number; c: string; label: string }[] }) {
  return (
    <svg className="radar" viewBox="0 0 400 400" role="img" aria-label="Animated control-tower radar showing supplier risk signals">
      <defs>
        <radialGradient id="sw" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(200 200) scale(190)">
          <stop offset="0" stopColor="#B8A85D" stopOpacity="0.55" />
          <stop offset="1" stopColor="#B8A85D" stopOpacity="0" />
        </radialGradient>
      </defs>
      {[60, 110, 160, 190].map((r) => <circle key={r} cx="200" cy="200" r={r} fill="none" stroke="#B8A85D" strokeOpacity="0.45" strokeDasharray={r === 190 ? '0' : '3 6'} />)}
      <path d="M200 10v380M10 200h380" stroke="#B8A85D" strokeOpacity="0.3" />
      <g className="sweep"><path d="M200 200 L200 10 A190 190 0 0 1 334 66 Z" fill="url(#sw)" /></g>
      {blips.map((b, i) => (
        <g key={i}>
          <circle className="blip" cx={b.x} cy={b.y} r="7" fill={b.c} style={{ animationDelay: `${(i * 0.7) % 6}s` }} />
          <title>{b.label}</title>
        </g>
      ))}
      <circle cx="200" cy="200" r="6" fill="#F8E6C2" />
    </svg>
  );
}

const STEPS = [
  { t: 'Read the sources', s: 'Master, log, memos', body: 'Only SUPPLIER_MASTER.csv, ASSESSMENT_LOG.csv and the memos count. Every file is fingerprinted (SHA-256) and the coverage record proves which memos and rows each run read.' },
  { t: 'Match memos', s: '§2, exact only', body: 'Supplier names are compared after five steps in a fixed order: remove full stops, other punctuation to spaces, ignore case, drop WLL/Co/Company/Ltd/LLC/FZE, ignore a final plural “s”. Anything else is CANNOT DETERMINE (MATCH) — never a guess.' },
  { t: 'Raise flags', s: '§4, three flags', body: 'NEVER ASSESSED (no log row), SINGLE SOURCE (exactly one qualified approved supplier per part family) and INDEMNITY GAP (newest memo stating a position: no clause, or a cap below BHD 50,000).' },
  { t: 'Classify', s: '§6, one status', body: 'A fixed decision table gives each supplier exactly one of RED, AMBER, CANNOT DETERMINE or GREEN. Contradictions follow §5: the newer statement governs and both quotations are kept.' },
  { t: 'People decide', s: 'Human control', body: 'The tool shows risk; the category director and buyers decide what to do about it. Unclear sentences, unmatched memos and same-date contradictions wait in the review queue for a person.' },
];

const RULE_CARDS = [
  { front: 'NEVER ASSESSED', sub: '§4.1 · record-based', back: 'An APPROVED supplier with no row in ASSESSMENT_LOG.csv. The evidence states the scope searched — e.g. “no row for SUP-xx in ASSESSMENT_LOG.csv (23 rows, as of 2026-10-31)”. A memo saying an assessment is planned is not an assessment.' },
  { front: 'SINGLE SOURCE', sub: '§4.2 · part-family level', back: 'Approved means qualified by default. Only the newest memo stating qualification for that family can take it away. A family with exactly one qualified supplier puts SINGLE SOURCE on that supplier; zero is a family finding.' },
  { front: 'INDEMNITY', sub: '§4.3 · BHD 50,000', back: 'Read from the newest memo stating an indemnity position. GAP = no clause or a cap below BHD 50,000. NO GAP = BHD 50,000 or more. “Standard terms apply”, silence or no memo = CANNOT DETERMINE.' },
  { front: 'STATUS', sub: '§6 · decision table', back: 'RED: SINGLE SOURCE and (GAP or NEVER ASSESSED). AMBER: any one flag otherwise. CANNOT DETERMINE: no flag, indemnity undeterminable. GREEN: no flag and NO GAP.' },
];

export default function Home() {
  const out = useOutput();
  const [step, setStep] = useState(0);
  const [flipped, setFlipped] = useState<number | null>(null);
  const blips = out
    ? out.scorecard.filter((r) => r.status !== 'GREEN').slice(0, 10).map((r, i) => {
        const a = (i / 10) * Math.PI * 2 + 0.4;
        const rad = r.status === 'RED' ? 60 : r.status === 'AMBER' ? 115 : 165;
        return { x: 200 + Math.cos(a) * rad, y: 200 + Math.sin(a) * rad, c: r.status === 'RED' ? '#E0533F' : r.status === 'AMBER' ? '#E8A33D' : '#C9CDD2', label: `${r.supplierId} ${r.status}` };
      })
    : [0, 1, 2, 3, 4].map((i) => ({ x: 200 + Math.cos(i * 1.3) * (60 + i * 25), y: 200 + Math.sin(i * 1.3) * (60 + i * 25), c: '#B8A85D', label: 'Awaiting data' }));
  const s = STEPS[step]!;

  return (
    <div className="stack">
      <PageHead title="Overview" />
      <section className="hero" aria-labelledby="hero-title">
        <div>
          <span className="eyebrow" style={{ color: 'var(--brass)' }}>Rule-based supplier risk control tower</span>
          <h1 id="hero-title">My rules decide. <span className="accent">The software executes.</span> Evidence justifies.</h1>
          <p>
            One page the category director can trust: who is a single point of failure, whose contract leaves Brightkeel exposed,
            and who has never been assessed — every statement traceable to a memo quotation or a record row, under RR-C5 V1.2.
          </p>
          <div className="btn-row" style={{ marginTop: 18 }}>
            {out ? (
              <Link className="btn" to="/dashboard"><I.dash /> Open the executive dashboard</Link>
            ) : (
              <Link className="btn" to="/data"><I.upload /> Import the source pack</Link>
            )}
            <Link className="btn ghost" style={{ color: 'var(--sand)', borderColor: 'rgba(248,230,194,.5)' }} to="/rules">Read the rules</Link>
          </div>
          {out && (
            <div className="row" style={{ marginTop: 20 }}>
              {(['RED', 'AMBER', 'CANNOT DETERMINE', 'GREEN'] as const).map((k) => (
                <Link key={k} to={`/suppliers?status=${encodeURIComponent(k)}`} style={{ textDecoration: 'none' }} aria-label={`${out.summary.byStatus[k]} suppliers ${k}`}>
                  <StatusBadge status={k} /> <strong style={{ color: 'var(--sand)', marginLeft: 4 }}>{out.summary.byStatus[k]}</strong>
                </Link>
              ))}
            </div>
          )}
        </div>
        <Radar blips={blips} />
      </section>

      <Reveal as="section">
        <div className="card">
          <div className="card-head"><h2>How a decision is made</h2><span className="muted">Select a step</span></div>
          <div className="journey" role="group" aria-label="Assessment steps">
            {STEPS.map((x, i) => (
              <button key={x.t} aria-pressed={step === i} onClick={() => setStep(i)}>
                <span className="t">{x.t}</span>
                <span className="s">{x.s}</span>
              </button>
            ))}
          </div>
          <div className="notice" style={{ marginTop: 14 }} aria-live="polite">
            <I.info />
            <div>
              <strong>{s.t}.</strong> {s.body}
              {out && step === 0 && <> This browser's current run read <strong>{out.coverageRecord.memosRead.length} memos</strong>, <strong>{out.coverageRecord.masterRowsRead}</strong> master rows and <strong>{out.coverageRecord.logRowsRead}</strong> log rows. <Link to="/reports?r=coverage-record">See the coverage record</Link>.</>}
              {out && step === 1 && <> {out.matches.length - out.summary.unmatchedMemos} of {out.matches.length} memos matched exactly; {out.summary.unmatchedMemos} need a person. <Link to="/memos">See matching</Link>.</>}
              {out && step === 2 && <> NEVER ASSESSED {out.summary.neverAssessed} · SINGLE SOURCE {out.summary.singleSource} · INDEMNITY GAP {out.summary.indemnityGap}. <Link to="/evidence">Trace each flag</Link>.</>}
              {out && step === 3 && <> {out.summary.contradictions} contradiction(s) resolved by date. <Link to="/suppliers">See the scorecard</Link>.</>}
              {out && step === 4 && <> {out.summary.pendingReviews} item(s) waiting. <Link to="/reviews">Open the review queue</Link>.</>}
            </div>
          </div>
        </div>
      </Reveal>

      <Reveal as="section">
        <h2>The rule card at a glance</h2>
        <p className="muted">Select a card to turn it over. These are the official RR-C5 V1.2 rules — they cannot be edited in this tool.</p>
        <div className="grid g-4">
          {RULE_CARDS.map((c, i) => (
            <div key={c.front} className={`flip${flipped === i ? ' on' : ''}`}>
              <button aria-pressed={flipped === i} aria-label={`${c.front}: ${flipped === i ? c.back : 'show rule'}`} onClick={() => setFlipped(flipped === i ? null : i)}>
                <div className="inner">
                  <div className="face front">
                    <span className="eyebrow">{c.sub}</span>
                    <h3 style={{ fontSize: '1.4rem' }}>{c.front}</h3>
                    <span className="muted" style={{ marginTop: 'auto' }}>Turn over →</span>
                  </div>
                  <div className="face back" aria-hidden={flipped !== i}>
                    <h3>{c.front}</h3>
                    <p style={{ margin: 0 }}>{c.back}</p>
                  </div>
                </div>
              </button>
            </div>
          ))}
        </div>
      </Reveal>

      <Reveal as="section">
        <div className="grid g-3">
          <Link to="/suppliers" className="card hover" style={{ textDecoration: 'none' }}>
            <I.suppliers width={28} height={28} />
            <h3 style={{ marginTop: 10 }}>Scorecard & profiles</h3>
            <p className="muted">One row per master supplier, with flags, evidence and status, and a click from any flag to its quotation or row.</p>
          </Link>
          <Link to="/memos/intake" className="card hover" style={{ textDecoration: 'none' }}>
            <I.memo width={28} height={28} />
            <h3 style={{ marginTop: 10 }}>New memo intake</h3>
            <p className="muted">A new memo becomes evidence. The scorecard changes only where the rules say it should, and the change is recorded.</p>
          </Link>
          <Link to="/audit" className="card hover" style={{ textDecoration: 'none' }}>
            <I.audit width={28} height={28} />
            <h3 style={{ marginTop: 10 }}>Tamper-evident audit</h3>
            <p className="muted">Every import, run, review and rule change is chained with SHA-256, so a second person can check what happened.</p>
          </Link>
        </div>
      </Reveal>
    </div>
  );
}
