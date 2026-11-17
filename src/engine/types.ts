/**
 * Core domain types for the RR-C5 engine.
 * The engine is pure: no DOM, no IO, no clocks, no randomness.
 */

export type Status = 'RED' | 'AMBER' | 'GREEN' | 'CANNOT DETERMINE';
export const STATUSES: readonly Status[] = ['RED', 'AMBER', 'CANNOT DETERMINE', 'GREEN'] as const;

/** The three official RR-C5 risk flags. No others may exist. */
export type FlagName = 'NEVER ASSESSED' | 'SINGLE SOURCE' | 'INDEMNITY GAP';
export const FLAG_NAMES: readonly FlagName[] = ['NEVER ASSESSED', 'SINGLE SOURCE', 'INDEMNITY GAP'] as const;

export type IndemnityPosition = 'GAP' | 'NO GAP' | 'CANNOT DETERMINE';

/** Fixed vocabulary for what cannot be answered (pack §4). */
export const TERMS = {
  NOT_STATED: 'NOT STATED',
  CANNOT_DETERMINE: 'CANNOT DETERMINE',
  CANNOT_DETERMINE_MATCH: 'CANNOT DETERMINE (MATCH)',
  UNKNOWN: 'UNKNOWN',
  NO_FEASIBLE_OPTION: 'NO FEASIBLE OPTION',
  NOT_APPLICABLE: 'NOT APPLICABLE',
  NO_MEMO: 'NO MEMO',
} as const;

export type SourceKind = 'master' | 'log' | 'memo';

/** A source file as read. `text` is the decoded content; sha256 is over the UTF-8 text. */
export interface SourceFile {
  name: string;
  kind: SourceKind;
  text: string;
  sha256: string;
  bytes: number;
}

export interface MasterRow {
  /** 1-based data row number (header excluded). */
  rowNumber: number;
  /** 1-based physical line number in the CSV file (header is line 1). */
  lineNumber: number;
  supplierId: string;
  supplierName: string;
  partFamiliesRaw: string;
  partFamilies: string[];
  approvalStatus: string;
  spendBand: string;
  fields: Record<string, string>;
}

export interface LogRow {
  rowNumber: number;
  lineNumber: number;
  supplierId: string;
  lastAssessmentDate: string;
  result: string;
  fields: Record<string, string>;
}

export interface Sentence {
  index: number;
  text: string;
  /** Offsets into Memo.body. */
  start: number;
  end: number;
}

export interface Memo {
  memoId: string;
  title: string;
  /** ISO yyyy-mm-dd or '' when NOT STATED. */
  date: string;
  author: string;
  supplierAsWritten: string;
  company: string;
  /** Narrative body (header and synthetic footer excluded). */
  body: string;
  sentences: Sentence[];
  fileName: string;
  sha256: string;
  /** Other files that carried an identical copy (e.g. batch files). */
  duplicateFiles: string[];
  warnings: string[];
}

// ---------------------------------------------------------------- evidence

export interface MemoEvidence {
  kind: 'memo';
  memoId: string;
  memoDate: string;
  fileName: string;
  quote: string;
  sentenceIndex: number;
  start: number;
  end: number;
  /** Set when a human reviewer decision introduced/classified this evidence. */
  reviewId?: string;
}

export interface RecordEvidence {
  kind: 'record';
  file: string;
  rowNumber: number;
  lineNumber: number;
  fields: Record<string, string>;
  /** The specific field(s) relied on. */
  relied: string[];
}

export interface AbsenceEvidence {
  kind: 'absence';
  files: string[];
  supplierId: string;
  missing: string;
  rowsSearched?: number;
  memosSearched?: number;
  asOf: string;
  scope: string;
}

export interface ReviewEvidence {
  kind: 'review';
  reviewId: string;
  decision: string;
  reason: string;
  actor: string;
}

export type Evidence = MemoEvidence | RecordEvidence | AbsenceEvidence | ReviewEvidence;

// ---------------------------------------------------------------- statements

export type StatementKind =
  | 'INDEMNITY_CAP'
  | 'INDEMNITY_NONE'
  | 'INDEMNITY_NOT_STATED'
  | 'QUALIFICATION_REMOVED'
  | 'QUALIFICATION_AFFIRMED'
  | 'ASSESSMENT_PLANNED'
  | 'OTHER_SUPPLIER_MENTION'
  | 'QUALITY_NOTE'
  | 'UNCLASSIFIED';

export interface Statement {
  memoId: string;
  memoDate: string;
  sentenceIndex: number;
  quote: string;
  kind: StatementKind;
  /** Indemnity cap in BHD (INDEMNITY_CAP only). */
  amountBhd?: number;
  /** Part families the sentence states qualification for (QUALIFICATION_*). */
  families?: string[];
  /** Supplier IDs of other master suppliers named in the sentence. */
  mentions?: string[];
  /** Why the extractor needs a person (UNCLASSIFIED). */
  reviewReason?: string;
  /** Set when a reviewer decision produced/overrode this classification. */
  reviewId?: string;
}

// ---------------------------------------------------------------- matching

export interface NormalizationTrace {
  input: string;
  step1RemoveFullStops: string;
  step2PunctuationToSpace: string;
  step3IgnoreCase: string;
  step4RemoveSuffixes: string;
  step5IgnorePluralS: string;
  normalized: string;
}

export type MatchOutcome =
  | { kind: 'MATCHED'; supplierId: string; via: 'RULE' | 'REVIEW'; reviewId?: string }
  | { kind: 'CANNOT DETERMINE (MATCH)'; reason: string; candidates: string[] };

export interface MemoMatch {
  memoId: string;
  supplierAsWritten: string;
  memoTrace: NormalizationTrace;
  outcome: MatchOutcome;
}

// ---------------------------------------------------------------- outputs

export interface FlagResult {
  flag: FlagName;
  /** true = raised, false = not raised, 'UNDETERMINED' = rule input contradictory/missing. */
  raised: boolean | 'UNDETERMINED';
  explanation: string;
  evidence: Evidence[];
  /** For SINGLE SOURCE: the families on which it is raised. */
  families?: string[];
}

export interface IndemnityResult {
  position: IndemnityPosition;
  explanation: string;
  governing?: MemoEvidence;
  amountBhd?: number;
  evidence: Evidence[];
}

export interface Contradiction {
  supplierId: string;
  subject: string;
  governing: MemoEvidence;
  superseded: MemoEvidence[];
  resolution: 'NEWER GOVERNS' | 'CANNOT DETERMINE (SAME DATE)' | 'CANNOT DETERMINE (UNDATED)';
  explanation: string;
}

export interface QualificationResult {
  family: string;
  qualified: boolean | 'UNDETERMINED';
  basis: 'APPROVED (DEFAULT)' | 'MEMO REMOVED' | 'MEMO AFFIRMED' | 'NOT APPROVED' | 'CONTRADICTORY';
  evidence: Evidence[];
}

export interface Note {
  text: string;
  evidence: Evidence[];
}

export interface ScorecardRow {
  supplierId: string;
  supplierName: string;
  partFamilies: string[];
  approvalStatus: string;
  spendBand: string;
  flags: Record<FlagName, FlagResult>;
  indemnity: IndemnityResult;
  qualifications: QualificationResult[];
  status: Status;
  statusRule: string;
  statusExplanation: string;
  notes: Note[];
  contradictions: Contradiction[];
}

export interface CoverageRow {
  supplierId: string;
  supplierName: string;
  memoIds: string[];
  memosLabel: string;
  logRows: number[];
  hasLogRow: boolean;
  scope: string;
  notes: string[];
}

export interface FamilyResult {
  family: string;
  suppliers: { supplierId: string; supplierName: string; approved: boolean; qualified: boolean | 'UNDETERMINED'; basis: QualificationResult['basis']; evidence: Evidence[] }[];
  qualifiedCount: number | 'UNDETERMINED';
  singleSource: boolean | 'UNDETERMINED';
  singleSourceSupplierId?: string;
  noQualifiedSupplier: boolean;
  finding: string;
}

export interface ReviewItem {
  key: string;
  type: 'MEMO_MATCH' | 'STATEMENT' | 'CONTRADICTION_SAME_DATE' | 'DATA_QUALITY';
  memoId?: string;
  sentenceIndex?: number;
  supplierId?: string;
  title: string;
  detail: string;
  quote?: string;
  resolved: boolean;
  reviewId?: string;
}

export interface CoverageRecord {
  asOf: string;
  files: { name: string; kind: SourceKind; sha256: string; bytes: number; rowsRead?: number }[];
  masterRowsRead: number;
  logRowsRead: number;
  memosExpected: number | null;
  memosRead: string[];
  memosMissing: string[];
  memoSentenceCounts: Record<string, number>;
  duplicateCopies: { memoId: string; files: string[] }[];
}

export interface RunSummary {
  totalSuppliers: number;
  approvedSuppliers: number;
  byStatus: Record<Status, number>;
  neverAssessed: number;
  singleSource: number;
  indemnityGap: number;
  indemnityCannotDetermine: number;
  totalFamilies: number;
  familiesWithoutQualified: number;
  singleSourceFamilies: number;
  unmatchedMemos: number;
  pendingReviews: number;
  contradictions: number;
  suppliersWithoutMemo: number;
}

export interface MemoMeta {
  memoId: string;
  title: string;
  date: string;
  author: string;
  supplierAsWritten: string;
  fileName: string;
  sha256: string;
  duplicateFiles: string[];
  sentenceCount: number;
  warnings: string[];
  conflicting: boolean;
}

export interface AssessmentOutput {
  engineVersion: string;
  ruleSetId: string;
  ruleSetVersion: string;
  ruleSetHash: string;
  asOf: string;
  inputFingerprint: string;
  outputFingerprint: string;
  scorecard: ScorecardRow[];
  coverage: CoverageRow[];
  coverageRecord: CoverageRecord;
  families: FamilyResult[];
  memos: MemoMeta[];
  matches: MemoMatch[];
  statements: Statement[];
  contradictions: Contradiction[];
  reviewQueue: ReviewItem[];
  summary: RunSummary;
  warnings: string[];
}
