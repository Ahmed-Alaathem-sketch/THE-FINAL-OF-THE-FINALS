import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useOutput, useStore } from '../../state/store';
import { assess, makeSourceFile } from '../../engine/assess';
import { diffRuns } from '../../engine/diff';
import { parseMemo } from '../../engine/parse/memo';
import { buildImport, composeMemo } from '../../ingest/importer';
import { extractDocxText, extractPdfText } from '../../ingest/extractText';
import type { AssessmentOutput, SourceFile } from '../../engine/types';
import { findRuleSet } from '../../state/store';
import { AwaitingData, Notice, PageHead } from '../components/common';
import { FileDrop, readFiles } from '../components/FileDrop';
import { toast } from '../components/Toast';

const extractor = async (f: { name: string; bytes: Uint8Array }) => (f.name.toLowerCase().endsWith('.pdf') ? extractPdfText(f.bytes) : extractDocxText(f.bytes));

export default function Intake() {
  const out = useOutput();
  const st = useStore();
  const nav = useNavigate();
  const [mode, setMode] = useState<'form' | 'file'>('form');
  const nextId = out ? `MEMO-${String(Math.max(0, ...out.memos.map((m) => Number(m.memoId.replace(/\D/g, '')) || 0)) + 1).padStart(2, '0')}` : 'MEMO-25';
  const [form, setForm] = useState({ memoId: '', title: '', date: '', author: '', supplierAsWritten: '', body: '' });
  const [pending, setPending] = useState<{ file: SourceFile; preview: AssessmentOutput; problems: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!out || !st.dataset) return (<><PageHead eyebrow="Sources" title="New memo intake" /><AwaitingData what="memo intake" /></>);
  const dataset = st.dataset;
  const rs = findRuleSet(st, st.current?.ruleSetKey ?? st.activeRuleKey)!;

  function preview(file: SourceFile) {
    setError(null);
    try {
      const memo = parseMemo({ text: file.text, fileName: file.name });
      if (out!.memos.some((m) => m.memoId === memo.memoId)) throw new Error(`${memo.memoId} already exists — memos are never overwritten. Use a new ID (next free: ${nextId}).`);
      const p = assess({ master: dataset.master, log: dataset.log, memos: [...dataset.memos, file], ruleSet: rs, decisions: st.decisions });
      setPending({ file, preview: p, problems: memo.warnings });
    } catch (e) { setError((e as Error).message); setPending(null); }
  }

  function fromForm(e: React.FormEvent) {
    e.preventDefault();
    const memoId = (form.memoId || nextId).trim().toUpperCase();
    if (!/^MEMO-\d{1,4}$/.test(memoId)) { setError('Memo ID must look like MEMO-25.'); return; }
    if (!form.body.trim()) { setError('The memo text is required.'); return; }
    const text = composeMemo({ ...form, memoId });
    preview(makeSourceFile(`${memoId}.md`, 'memo', text));
  }

  async function fromFiles(files: File[]) {
    setError(null);
    const rep = await buildImport(await readFiles(files), extractor);
    if (rep.errors.length) { setError(rep.errors.map((x) => `${x.name}: ${x.message}`).join(' ')); return; }
    if (rep.memos.length !== 1) { setError(rep.memos.length ? 'Take one memo through intake at a time.' : `No memo found. ${rep.ignored.map((i) => `${i.name}: ${i.reason}`).join(' ')}`); return; }
    preview(rep.memos[0]!);
  }

  async function commit() {
    if (!pending) return;
    try {
      await st.intakeMemo(pending.file);
      toast(`${pending.file.name} added; a new assessment run was recorded.`);
      const id = parseMemo({ text: pending.file.text, fileName: pending.file.name }).memoId;
      setPending(null);
      nav(`/memos/${id}`);
    } catch (e) { setError((e as Error).message); toast((e as Error).message, 'err'); }
  }

  const diff = pending ? diffRuns(out, pending.preview) : null;
  const pm = pending ? pending.preview.matches.find((m) => !out.matches.some((x) => x.memoId === m.memoId)) : null;

  return (
    <div className="stack">
      <PageHead eyebrow="Sources · intake" title="New memo intake" intro="A new memo becomes a source with its own evidence. Fields the memo does not give are recorded as NOT STATED. You see the effect on the scorecard before anything is saved." actions={<Link className="btn ghost" to="/memos">All memos</Link>} />
      <div className="segmented" role="group" aria-label="Intake method">
        <button aria-pressed={mode === 'form'} onClick={() => setMode('form')}>Write or paste a memo</button>
        <button aria-pressed={mode === 'file'} onClick={() => setMode('file')}>Upload a memo file</button>
      </div>
      {error && <Notice kind="err">{error}</Notice>}
      {mode === 'form' ? (
        <form className="card stack" onSubmit={fromForm} aria-label="Memo intake form">
          <div className="grid g-3">
            <div className="field"><label htmlFor="i-id">Memo ID</label><input id="i-id" className="input" placeholder={nextId} value={form.memoId} onChange={(e) => setForm({ ...form, memoId: e.target.value })} /></div>
            <div className="field"><label htmlFor="i-date">Date (yyyy-mm-dd)</label><input id="i-date" className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div className="field"><label htmlFor="i-author">Author</label><input id="i-author" className="input" value={form.author} placeholder="NOT STATED" onChange={(e) => setForm({ ...form, author: e.target.value })} /></div>
          </div>
          <div className="grid g-2">
            <div className="field"><label htmlFor="i-sup">Supplier (as written in the memo)</label><input id="i-sup" className="input" value={form.supplierAsWritten} onChange={(e) => setForm({ ...form, supplierAsWritten: e.target.value })} /></div>
            <div className="field"><label htmlFor="i-title">Title</label><input id="i-title" className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          </div>
          <div className="field"><label htmlFor="i-body">Memo text</label><textarea id="i-body" className="input" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Paste the memo body exactly as written." /></div>
          <div className="btn-row"><button className="btn" type="submit">Preview the effect</button><span className="muted">The supplier name is matched exactly under §2 — it is never corrected for you.</span></div>
        </form>
      ) : (
        <div className="card">
          <FileDrop label="Drop one memo file, or select it" hint=".md, .txt, .pdf or .docx — read in this browser only" accept=".md,.txt,.pdf,.docx" multiple={false} onFiles={fromFiles} testId="intake-file" />
        </div>
      )}

      {pending && diff && (
        <div className="card" aria-live="polite" data-testid="intake-preview">
          <div className="card-head"><h2>Preview — {pending.file.name}</h2><span className="tag experimental">not saved yet</span></div>
          {pending.problems.length > 0 && <Notice kind="warn">{pending.problems.join(' ')}</Notice>}
          <p>
            Match: {pm?.outcome.kind === 'MATCHED' ? <strong>{pm.outcome.supplierId}</strong> : <strong>CANNOT DETERMINE (MATCH)</strong>}
            {pm?.outcome.kind !== 'MATCHED' && ' — the memo will be stored but attached to no supplier until a person decides in the review queue.'}
          </p>
          {diff.suppliers.length === 0 ? <p>No scorecard change: the rules give the same result for every supplier.</p> : (
            <div className="table-wrap"><table className="data cards">
              <thead><tr><th>Supplier</th><th>Field</th><th>Before</th><th>After</th></tr></thead>
              <tbody>{diff.suppliers.flatMap((s) => s.changes.map((c, i) => (
                <tr key={s.supplierId + i}><td data-label="Supplier">{s.supplierId}</td><td data-label="Field">{c.field}</td><td data-label="Before" className="diff-before">{c.before}</td><td data-label="After" className="diff-after">{c.after}</td></tr>
              )))}</tbody>
            </table></div>
          )}
          <div className="btn-row" style={{ marginTop: 14 }}>
            <button className="btn" onClick={commit}>Add memo and record a new run</button>
            <button className="btn ghost" onClick={() => setPending(null)}>Discard</button>
          </div>
        </div>
      )}
    </div>
  );
}
