import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AuditEntry } from '../audit/audit';
import { makeEntry } from '../audit/audit';
import type { ReviewDecision } from '../engine/decisions';
import type { RuleSet } from '../engine/rules/ruleset';
import type { AssessmentOutput, SourceFile } from '../engine/types';

/**
 * Browser-local persistence (IndexedDB). Data stays in THIS browser on THIS device; it is not synchronised
 * anywhere and nothing is sent to a server.
 */

export interface Dataset {
  id: string;
  createdAt: string;
  label: string;
  master: SourceFile;
  log: SourceFile;
  memos: SourceFile[];
  /** id of the dataset this one was derived from (e.g. by memo intake). */
  parentId: string | null;
}

export interface StoredRun {
  id: string;
  createdAt: string;
  actor: string;
  reason: string;
  datasetId: string;
  ruleSetKey: string;
  decisionIds: string[];
  output: AssessmentOutput;
}

export interface RunIndex {
  id: string;
  createdAt: string;
  actor: string;
  reason: string;
  datasetId: string;
  ruleSetKey: string;
  inputFingerprint: string;
  outputFingerprint: string;
  summary: AssessmentOutput['summary'];
}

interface Schema extends DBSchema {
  datasets: { key: string; value: Dataset };
  runs: { key: string; value: StoredRun; indexes: { byCreated: string } };
  decisions: { key: string; value: ReviewDecision };
  ruleSets: { key: string; value: RuleSet };
  audit: { key: number; value: AuditEntry };
  meta: { key: string; value: unknown };
}

const DB_NAME = 'c5-risk-control-tower';
let dbp: Promise<IDBPDatabase<Schema>> | null = null;

export function db(): Promise<IDBPDatabase<Schema>> {
  dbp ??= openDB<Schema>(DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore('datasets', { keyPath: 'id' });
      const runs = d.createObjectStore('runs', { keyPath: 'id' });
      runs.createIndex('byCreated', 'createdAt');
      d.createObjectStore('decisions', { keyPath: 'id' });
      d.createObjectStore('ruleSets', { keyPath: 'key' as never });
      d.createObjectStore('audit', { keyPath: 'seq' });
      d.createObjectStore('meta');
    },
  });
  return dbp;
}

export const ruleKey = (r: Pick<RuleSet, 'id' | 'version'>) => `${r.id}@${r.version}`;

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get('meta', key)) as T | undefined;
}
export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await db()).put('meta', value, key);
}

/** Append an audit entry atomically with the previous-hash link. */
export async function appendAudit(data: Parameters<typeof makeEntry>[1]): Promise<AuditEntry> {
  const d = await db();
  const tx = d.transaction('audit', 'readwrite');
  const cursor = await tx.store.openCursor(null, 'prev');
  const entry = makeEntry(cursor?.value, data);
  await tx.store.add(entry);
  await tx.done;
  return entry;
}

export async function listAudit(): Promise<AuditEntry[]> {
  return (await db()).getAll('audit');
}

export async function putDataset(ds: Dataset): Promise<void> {
  const d = await db();
  if (await d.get('datasets', ds.id)) throw new Error(`Dataset ${ds.id} already exists — datasets are immutable.`);
  await d.add('datasets', ds);
}
export async function getDataset(id: string): Promise<Dataset | undefined> {
  return (await db()).get('datasets', id);
}
export async function listDatasets(): Promise<Dataset[]> {
  return (await db()).getAll('datasets');
}

/** Runs are immutable: add-only. */
export async function addRun(run: StoredRun): Promise<void> {
  await (await db()).add('runs', run);
}
export async function getRun(id: string): Promise<StoredRun | undefined> {
  return (await db()).get('runs', id);
}
export async function listRunIndex(): Promise<RunIndex[]> {
  const all = await (await db()).getAllFromIndex('runs', 'byCreated');
  return all.map((r) => ({
    id: r.id, createdAt: r.createdAt, actor: r.actor, reason: r.reason, datasetId: r.datasetId, ruleSetKey: r.ruleSetKey,
    inputFingerprint: r.output.inputFingerprint, outputFingerprint: r.output.outputFingerprint, summary: r.output.summary,
  }));
}

export async function addDecision(d: ReviewDecision): Promise<void> {
  await (await db()).add('decisions', d);
}
export async function listDecisions(): Promise<ReviewDecision[]> {
  return (await db()).getAll('decisions');
}

export async function putRuleSet(rs: RuleSet): Promise<void> {
  await (await db()).put('ruleSets', { ...rs, key: ruleKey(rs) } as RuleSet);
}
export async function listRuleSets(): Promise<RuleSet[]> {
  return (await (await db()).getAll('ruleSets')).map((r) => {
    const rest = { ...(r as RuleSet & { key?: string }) };
    delete rest.key;
    return rest as RuleSet;
  });
}

export async function clearAll(): Promise<void> {
  const d = await db();
  const tx = d.transaction(['datasets', 'runs', 'decisions', 'ruleSets', 'audit', 'meta'], 'readwrite');
  await Promise.all([tx.objectStore('datasets').clear(), tx.objectStore('runs').clear(), tx.objectStore('decisions').clear(), tx.objectStore('ruleSets').clear(), tx.objectStore('audit').clear(), tx.objectStore('meta').clear()]);
  await tx.done;
}

/**
 * Remove everything an import produced: datasets, assessment runs, review decisions (they refer to
 * imported memos) and the "current" pointers. Rule versions, the display name and the audit trail are kept.
 */
export async function clearImportedData(): Promise<void> {
  const d = await db();
  const tx = d.transaction(['datasets', 'runs', 'decisions', 'meta'], 'readwrite');
  await Promise.all([
    tx.objectStore('datasets').clear(),
    tx.objectStore('runs').clear(),
    tx.objectStore('decisions').clear(),
    tx.objectStore('meta').delete('activeDatasetId'),
    tx.objectStore('meta').delete('currentRunId'),
  ]);
  await tx.done;
}

export function newId(prefix: string): string {
  const rnd = crypto.getRandomValues(new Uint8Array(6));
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Array.from(rnd, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}
