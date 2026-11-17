import { create } from 'zustand';
import { appendAudit, addDecision, addRun, clearAll, getDataset, getMeta, getRun, listAudit, listDatasets, listDecisions, listRuleSets, listRunIndex, newId, putDataset, putRuleSet, ruleKey, setMeta, type Dataset, type RunIndex, type StoredRun } from '../storage/db';
import { verifyChain, type ChainCheck } from '../audit/audit';
import { assess, loadMemos } from '../engine/assess';
import type { ReviewDecision } from '../engine/decisions';
import { RR_C5_V1_2 } from '../engine/rules/rr-c5-v1.2';
import { approvalPhrase, conflictsWith, validateRuleSet } from '../engine/rules/manage';
import type { RuleSet } from '../engine/rules/ruleset';
import type { AssessmentOutput, Memo, SourceFile } from '../engine/types';

export const BASELINE_KEY = ruleKey(RR_C5_V1_2);

interface State {
  ready: boolean;
  busy: string | null;
  error: string | null;
  actor: string;
  dataset: Dataset | null;
  datasets: Dataset[];
  memos: Memo[];
  decisions: ReviewDecision[];
  ruleSets: RuleSet[];
  activeRuleKey: string;
  runs: RunIndex[];
  current: StoredRun | null;
  audit: { count: number; check: ChainCheck };
}

interface Actions {
  init(): Promise<void>;
  setActor(name: string): Promise<void>;
  importDataset(files: { master: SourceFile; log: SourceFile; memos: SourceFile[] }, label: string): Promise<void>;
  intakeMemo(memo: SourceFile): Promise<void>;
  decide(d: Omit<ReviewDecision, 'id' | 'actor' | 'at'>): Promise<void>;
  runAssessment(reason: string, ruleSetKey?: string): Promise<StoredRun | null>;
  sandbox(rs: RuleSet): AssessmentOutput | null;
  saveDraft(rs: RuleSet, reason: string): Promise<void>;
  approveRule(key: string, approver: string, typed: string, reason: string, acknowledgedConflicts: boolean): Promise<void>;
  deactivateRule(key: string, reason: string): Promise<void>;
  loadRun(id: string): Promise<StoredRun | undefined>;
  refreshAudit(): Promise<void>;
  wipe(): Promise<void>;
}

export const allRuleSets = (s: Pick<State, 'ruleSets'>): RuleSet[] => [RR_C5_V1_2 as RuleSet, ...s.ruleSets];
export const findRuleSet = (s: Pick<State, 'ruleSets'>, key: string): RuleSet | undefined => allRuleSets(s).find((r) => ruleKey(r) === key);

const now = () => new Date().toISOString();

export const useStore = create<State & Actions>((set, get) => {
  async function audit(action: string, ref: string, before: unknown, after: unknown, reason: string) {
    await appendAudit({ at: now(), actor: get().actor, action, ref, before, after, reason });
  }

  return {
    ready: false,
    busy: null,
    error: null,
    actor: 'Anonymous reviewer',
    dataset: null,
    datasets: [],
    memos: [],
    decisions: [],
    ruleSets: [],
    activeRuleKey: BASELINE_KEY,
    runs: [],
    current: null,
    audit: { count: 0, check: { ok: true, checked: 0 } },

    async init() {
      try {
        const [actor, activeDatasetId, activeRuleKey, currentRunId, datasets, decisions, ruleSets, runs, entries] = await Promise.all([
          getMeta<string>('actor'), getMeta<string>('activeDatasetId'), getMeta<string>('activeRuleKey'), getMeta<string>('currentRunId'),
          listDatasets(), listDecisions(), listRuleSets(), listRunIndex(), listAudit(),
        ]);
        const dataset = activeDatasetId ? (await getDataset(activeDatasetId)) ?? null : null;
        const current = currentRunId ? (await getRun(currentRunId)) ?? null : null;
        set({
          ready: true, actor: actor ?? 'Anonymous reviewer', dataset, datasets, decisions, ruleSets,
          activeRuleKey: activeRuleKey ?? BASELINE_KEY, runs, current,
          memos: dataset ? loadMemos(dataset.memos).memos : [],
          audit: { count: entries.length, check: verifyChain(entries) },
        });
      } catch (e) {
        set({ ready: true, error: `Browser storage is unavailable (${(e as Error).message}). Private windows or blocked site data prevent saving.` });
      }
    },

    async setActor(name) {
      const clean = name.replace(/[\r\n]/g, ' ').trim().slice(0, 80) || 'Anonymous reviewer';
      const before = get().actor;
      if (before === clean) return;
      await setMeta('actor', clean);
      set({ actor: clean });
      await audit('ACTOR_CHANGED', 'session', before, clean, 'Self-declared display name (no login on this public site).');
    },

    async importDataset(files, label) {
      const ds: Dataset = { id: newId('DS'), createdAt: now(), label, master: files.master, log: files.log, memos: files.memos, parentId: get().dataset?.id ?? null };
      // Validate by running the engine before storing anything.
      assess({ ...files, ruleSet: findRuleSet(get(), get().activeRuleKey) ?? (RR_C5_V1_2 as RuleSet), decisions: get().decisions });
      await putDataset(ds);
      await setMeta('activeDatasetId', ds.id);
      set({ dataset: ds, datasets: [...get().datasets, ds], memos: loadMemos(ds.memos).memos });
      await audit('DATASET_IMPORTED', ds.id, null, { label, master: files.master.sha256, log: files.log.sha256, memoFiles: files.memos.map((m) => `${m.name}:${m.sha256.slice(0, 12)}`) }, `Imported ${files.memos.length} memo file(s), ${files.master.name}, ${files.log.name}.`);
      await get().runAssessment(`Assessment after import of "${label}"`);
    },

    async intakeMemo(memo) {
      const cur = get().dataset;
      if (!cur) throw new Error('Import the supplier master and assessment log first.');
      if (cur.memos.some((m) => m.name === memo.name)) throw new Error(`A memo file named ${memo.name} already exists. Memos are never overwritten; use a new memo ID.`);
      const existing = loadMemos(cur.memos).memos;
      const incoming = loadMemos([memo]).memos[0];
      if (incoming && existing.some((m) => m.memoId === incoming.memoId)) throw new Error(`${incoming.memoId} already exists. Use a new memo ID.`);
      const ds: Dataset = { ...cur, id: newId('DS'), createdAt: now(), label: `${cur.label} + ${memo.name}`, memos: [...cur.memos, memo], parentId: cur.id };
      assess({ master: ds.master, log: ds.log, memos: ds.memos, ruleSet: RR_C5_V1_2 as RuleSet });
      await putDataset(ds);
      await setMeta('activeDatasetId', ds.id);
      set({ dataset: ds, datasets: [...get().datasets, ds], memos: loadMemos(ds.memos).memos });
      await audit('MEMO_INTAKE', memo.name, { datasetId: cur.id }, { datasetId: ds.id, file: memo.name, sha256: memo.sha256 }, 'New memo taken through the intake step.');
      await get().runAssessment(`Assessment after intake of ${memo.name}`);
    },

    async decide(partial) {
      const d = { ...partial, id: newId('RV'), actor: get().actor, at: now() } as ReviewDecision;
      if (!d.reason.trim()) throw new Error('A reason is required for every review decision.');
      await addDecision(d);
      set({ decisions: [...get().decisions, d] });
      await audit('REVIEW_DECISION', d.type === 'ACKNOWLEDGE' ? d.key : d.memoId, null, d, d.reason);
      await get().runAssessment(`Assessment after review decision ${d.id}`);
    },

    async runAssessment(reason, ruleSetKey) {
      const { dataset, decisions } = get();
      if (!dataset) return null;
      const key = ruleSetKey ?? get().activeRuleKey;
      const rs = findRuleSet(get(), key);
      if (!rs) throw new Error(`Rule set ${key} not found.`);
      if (rs.lifecycle === 'EXPERIMENTAL') throw new Error('Experimental (unapproved) rule versions can only be run in the sandbox.');
      set({ busy: 'Running assessment…' });
      try {
        const output = assess({ master: dataset.master, log: dataset.log, memos: dataset.memos, ruleSet: rs, decisions });
        const run: StoredRun = { id: newId('RUN'), createdAt: now(), actor: get().actor, reason, datasetId: dataset.id, ruleSetKey: key, decisionIds: decisions.map((d) => d.id), output };
        await addRun(run);
        await setMeta('currentRunId', run.id);
        await audit('RUN_CREATED', run.id, null, { ruleSet: key, inputFingerprint: output.inputFingerprint, outputFingerprint: output.outputFingerprint, summary: output.summary }, reason);
        set({ current: run, runs: await listRunIndex() });
        await get().refreshAudit();
        return run;
      } catch (e) {
        set({ error: (e as Error).message });
        throw e;
      } finally {
        set({ busy: null });
      }
    },

    sandbox(rs) {
      const { dataset, decisions } = get();
      if (!dataset) return null;
      return assess({ master: dataset.master, log: dataset.log, memos: dataset.memos, ruleSet: rs, decisions });
    },

    async saveDraft(rs, reason) {
      if (ruleKey(rs) === BASELINE_KEY) throw new Error('RR-C5 V1.2 is the immutable baseline and cannot be edited.');
      const prev = get().ruleSets.find((r) => ruleKey(r) === ruleKey(rs));
      if (prev && prev.lifecycle !== 'EXPERIMENTAL') throw new Error('Approved rule versions are immutable. Create a new draft version instead.');
      const draft: RuleSet = { ...rs, lifecycle: 'EXPERIMENTAL', state: 'DRAFT', approvedBy: null, approvedAt: null, approvalReason: null };
      await putRuleSet(draft);
      set({ ruleSets: [...get().ruleSets.filter((r) => ruleKey(r) !== ruleKey(rs)), draft] });
      await audit(prev ? 'RULE_DRAFT_UPDATED' : 'RULE_DRAFT_CREATED', ruleKey(rs), prev ?? null, draft, reason || 'Draft saved.');
    },

    async approveRule(key, approver, typed, reason, acknowledged) {
      const rs = get().ruleSets.find((r) => ruleKey(r) === key);
      if (!rs) throw new Error('Only user drafts can be approved; the official baseline is already active by default.');
      const errors = validateRuleSet(rs);
      if (errors.length) throw new Error(`Cannot approve: ${errors[0]}`);
      if (typed.trim() !== approvalPhrase(rs)) throw new Error(`Type exactly "${approvalPhrase(rs)}" to approve.`);
      if (!approver.trim() || !reason.trim()) throw new Error('Approver name and reason are required.');
      const c = conflictsWith(rs, RR_C5_V1_2 as RuleSet);
      if ((c.decisions.length || c.parameters.length) && !acknowledged) throw new Error('Acknowledge the conflicts with the official baseline before approving.');
      const approved: RuleSet = { ...rs, lifecycle: 'USER', state: 'ACTIVE', approvedBy: approver.trim(), approvedAt: now(), approvalReason: reason.trim() };
      const others = get().ruleSets.map((r) => (ruleKey(r) !== key && r.state === 'ACTIVE' ? { ...r, state: 'INACTIVE' as const } : r));
      for (const o of others) if (ruleKey(o) !== key) await putRuleSet(o);
      await putRuleSet(approved);
      const before = get().activeRuleKey;
      await setMeta('activeRuleKey', key);
      set({ ruleSets: [...others.filter((r) => ruleKey(r) !== key), approved], activeRuleKey: key });
      await audit('RULE_APPROVED_ACTIVATED', key, { activeRuleKey: before, conflicts: c }, { activeRuleKey: key, approvedBy: approved.approvedBy }, reason);
      await get().runAssessment(`Assessment under newly approved ${key}`);
    },

    async deactivateRule(key, reason) {
      if (key === BASELINE_KEY) throw new Error('The official baseline cannot be deactivated; activate another approved version instead.');
      const rs = get().ruleSets.find((r) => ruleKey(r) === key);
      if (!rs) return;
      const updated: RuleSet = { ...rs, state: 'INACTIVE' };
      await putRuleSet(updated);
      const wasActive = get().activeRuleKey === key;
      if (wasActive) await setMeta('activeRuleKey', BASELINE_KEY);
      set({ ruleSets: get().ruleSets.map((r) => (ruleKey(r) === key ? updated : r)), activeRuleKey: wasActive ? BASELINE_KEY : get().activeRuleKey });
      await audit('RULE_DEACTIVATED', key, { state: rs.state }, { state: 'INACTIVE', activeRuleKey: get().activeRuleKey }, reason || 'Deactivated.');
      if (wasActive) await get().runAssessment(`Assessment after deactivating ${key} (back to ${BASELINE_KEY})`);
    },

    loadRun: (id) => getRun(id),

    async refreshAudit() {
      const entries = await listAudit();
      set({ audit: { count: entries.length, check: verifyChain(entries) } });
    },

    async wipe() {
      await clearAll();
      set({ dataset: null, datasets: [], memos: [], decisions: [], ruleSets: [], activeRuleKey: BASELINE_KEY, runs: [], current: null, audit: { count: 0, check: { ok: true, checked: 0 } } });
    },
  };
});

export const useOutput = () => useStore((s) => s.current?.output ?? null);
