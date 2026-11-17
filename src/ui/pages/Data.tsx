import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../state/store';
import { buildImport, type ImportReport } from '../../ingest/importer';
import { extractDocxText, extractPdfText } from '../../ingest/extractText';
import { fmtDate, Notice, PageHead } from '../components/common';
import { FileDrop, readFiles } from '../components/FileDrop';
import { Dialog } from '../components/Dialog';
import { toast } from '../components/Toast';

const extractor = async (f: { name: string; bytes: Uint8Array }) => (f.name.toLowerCase().endsWith('.pdf') ? extractPdfText(f.bytes) : extractDocxText(f.bytes));

function useFontStatus() {
  const [s, setS] = useState<'checking' | 'loaded' | 'missing'>('checking');
  useEffect(() => {
    const present = getComputedStyle(document.documentElement).getPropertyValue('--brand-font-present').trim() === '1';
    if (!present) { setS('missing'); return; }
    document.fonts.load('16px Brand').then((f) => setS(f.length > 0 ? 'loaded' : 'missing')).catch(() => setS('missing'));
  }, []);
  return s;
}

export default function Data() {
  const st = useStore();
  const [report, setReport] = useState<ImportReport | null>(null);
  const [label, setLabel] = useState('C5 pack V1.2');
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [name, setName] = useState(st.actor);
  const font = useFontStatus();

  async function onFiles(files: File[]) {
    try {
      const rep = await buildImport(await readFiles(files), extractor);
      // Keep previously staged files when the user adds more.
      if (report) {
        rep.master ??= report.master;
        rep.log ??= report.log;
        const names = new Set(rep.memos.map((m) => m.name));
        rep.memos = [...report.memos.filter((m) => !names.has(m.name)), ...rep.memos];
      }
      setReport(rep);
    } catch (e) { toast((e as Error).message, 'err'); }
  }
  async function confirmImport() {
    if (!report?.master || !report.log) return;
    try {
      await st.importDataset({ master: report.master, log: report.log, memos: report.memos }, label.trim() || 'Imported dataset');
      toast('Sources imported and assessed. Earlier runs are kept in the history.');
      setReport(null);
    } catch (e) { toast((e as Error).message, 'err'); }
  }
  const ready = !!report?.master && !!report?.log;
  const memoCount = report ? new Set(report.memos.flatMap((m) => (m.text.match(/^#{0,3}\s*(MEMO-\d+)/gm) ?? []).map((x) => x.replace(/^#+\s*/, '')))).size : 0;

  return (
    <div className="stack">
      <PageHead eyebrow="Sources" title="Data & privacy" intro="Import the official sources, see what is stored, and control it. Everything is processed in this browser; nothing is uploaded to any server." />
      <div className="grid g-2">
        <div className="card">
          <h2>Import source files</h2>
          <p className="muted">Drop the pack zip (nested zips are opened), or SUPPLIER_MASTER.csv, ASSESSMENT_LOG.csv and memo files (.md, .txt, .pdf, .docx). Batch files and single memo files may both be present: identical copies are recorded once.</p>
          <FileDrop label="Drop files or select them" hint="zip · csv · md · txt · pdf · docx — max 10 MB each" accept=".zip,.csv,.md,.txt,.pdf,.docx" onFiles={onFiles} testId="import-files" />
          {report && (
            <div className="stack" style={{ marginTop: 16 }} data-testid="import-report">
              <dl className="kv">
                <dt>Supplier master</dt><dd>{report.master ? report.master.name : <span style={{ color: 'var(--st-red)' }}>missing</span>}</dd>
                <dt>Assessment log</dt><dd>{report.log ? report.log.name : <span style={{ color: 'var(--st-red)' }}>missing</span>}</dd>
                <dt>Memo files</dt><dd>{report.memos.length} file(s), {memoCount} distinct memo ID(s)</dd>
                <dt>Ignored</dt><dd>{report.ignored.length} file(s)</dd>
              </dl>
              {report.errors.length > 0 && <Notice kind="err"><strong>Problems:</strong><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{report.errors.map((e, i) => <li key={i}>{e.name}: {e.message}</li>)}</ul></Notice>}
              {report.warnings.length > 0 && <Notice kind="warn"><details><summary>{report.warnings.length} warning(s)</summary><ul style={{ paddingLeft: 18 }}>{report.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details></Notice>}
              {report.ignored.length > 0 && <details><summary className="muted">Ignored files</summary><ul style={{ fontSize: '.86rem' }}>{report.ignored.map((x, i) => <li key={i}>{x.name} — {x.reason}</li>)}</ul></details>}
              <div className="field"><label htmlFor="ds-label">Dataset label</label><input id="ds-label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
              <div className="btn-row">
                <button className="btn" disabled={!ready} onClick={confirmImport}>Import & run RR-C5</button>
                <button className="btn ghost" onClick={() => setReport(null)}>Cancel</button>
              </div>
              {!ready && <p className="muted">Both the supplier master and the assessment log are needed before an assessment can run.</p>}
            </div>
          )}
        </div>
        <div className="stack">
          <div className="card">
            <h2>Current data in this browser</h2>
            {st.dataset ? (
              <dl className="kv">
                <dt>Dataset</dt><dd>{st.dataset.label}</dd>
                <dt>Imported</dt><dd>{fmtDate(st.dataset.createdAt)}</dd>
                <dt>Master</dt><dd>{st.dataset.master.name} · <span className="mono">{st.dataset.master.sha256.slice(0, 12)}</span></dd>
                <dt>Log</dt><dd>{st.dataset.log.name} · <span className="mono">{st.dataset.log.sha256.slice(0, 12)}</span></dd>
                <dt>Memo files</dt><dd>{st.dataset.memos.length}</dd>
                <dt>Versions kept</dt><dd>{st.datasets.length} dataset(s), {st.runs.length} run(s), {st.audit.count} audit entries</dd>
              </dl>
            ) : <p className="muted" data-testid="no-data">No source data yet. Assessments are awaiting the original source files.</p>}
            {st.dataset && <div className="btn-row" style={{ marginTop: 12 }}><button className="btn ghost sm" onClick={async () => { await st.runAssessment('Manual re-run'); toast('Re-run recorded.'); }}>Re-run assessment</button><Link className="btn ghost sm" to="/runs">History</Link></div>}
          </div>
          <div className="card">
            <h2>Your display name</h2>
            <p className="muted">Recorded as the actor in the audit trail. It is self-declared: this public site has no accounts.</p>
            <form className="row" onSubmit={async (e) => { e.preventDefault(); await st.setActor(name); toast('Display name saved.'); }}>
              <input aria-label="Display name" className="input" style={{ flex: 1, minWidth: 180 }} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
              <button className="btn sm" type="submit">Save</button>
            </form>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Privacy and security</h2>
        <ul>
          <li><strong>This site is public and needs no sign-in.</strong> It ships with no supplier data. Anything you import stays in <em>this</em> browser's IndexedDB on <em>this</em> device. It is not synchronised to other devices or people, and clearing site data deletes it.</li>
          <li>Files are read locally; no file content, name or result is sent to a server. There are no API keys, analytics or third-party scripts.</li>
          <li>Do not import confidential documents on a shared or public computer. Anyone using this browser profile can open what is stored here.</li>
          <li>Memo text is always shown as plain text (never interpreted as HTML), uploads are size-limited, and zip archives are guarded against oversized and deeply nested content.</li>
          <li>No AI service is called. Statement extraction is deterministic pattern matching; anything uncertain goes to the review queue for a person.</li>
        </ul>
        <p>Brand font: <strong data-testid="font-status">{font === 'checking' ? 'checking…' : font === 'loaded' ? 'loaded' : 'not loaded — font file missing from public/fonts'}</strong></p>
        <div className="btn-row"><button className="btn danger sm" onClick={() => setConfirmWipe(true)}>Delete all local data</button></div>
      </div>
      {confirmWipe && (
        <Dialog title="Delete all local data?" onClose={() => setConfirmWipe(false)}>
          <p>This permanently deletes every dataset, run, review decision, rule draft and the audit trail stored in this browser. Export anything you need first.</p>
          <div className="btn-row"><button className="btn danger" onClick={async () => { await st.wipe(); setConfirmWipe(false); toast('All local data deleted.'); }}>Delete everything</button><button className="btn ghost" onClick={() => setConfirmWipe(false)}>Cancel</button></div>
        </Dialog>
      )}
    </div>
  );
}
