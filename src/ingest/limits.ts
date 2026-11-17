/** Upload safety limits (client-side only; nothing is uploaded to any server). */
export const LIMITS = {
  maxFileBytes: 10 * 1024 * 1024,
  maxZipEntries: 2000,
  maxTotalUncompressedBytes: 60 * 1024 * 1024,
  maxZipDepth: 3,
  maxMemoChars: 200_000,
} as const;

export const ACCEPTED_EXTENSIONS = ['.zip', '.csv', '.md', '.txt', '.pdf', '.docx'] as const;
