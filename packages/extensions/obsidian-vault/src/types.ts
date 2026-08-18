/**
 * Wire vocabulary of the obsidian vault service. Plain JSON-compatible
 * interfaces only: every field crosses the Remote boundary and is
 * zod-schema-able by the Typert generator.
 */

/** Service status: configuration and index readiness. */
export interface VaultStatus {
  /** True when a vault path is configured. */
  readonly configured: boolean
  /** True when the index has completed at least one scan. */
  readonly ready: boolean
  /** Absolute vault path, when configured. */
  readonly vaultPath?: string
  /** Number of indexed notes (0 before the first scan). */
  readonly noteCount: number
  /** Unix ms of the last completed scan. */
  readonly lastScanAt?: number
  /** Human-readable error when the vault is configured but unusable. */
  readonly error?: string
}

/** One retrieval hit with a display snippet. */
export interface NoteSearchHit {
  /** Vault-relative path with forward slashes. */
  readonly path: string
  readonly title: string
  readonly tags: readonly string[]
  /** A short window around the best match. */
  readonly snippet: string
  /** Retrieval score (higher is better). */
  readonly score: number
  readonly mtime: number
}

/** Retrieval request. */
export interface SearchRequest {
  readonly query: string
  /** Upper bound on returned hits; the service caps to maxResults. */
  readonly limit?: number
}

/** Retrieval response. */
export interface SearchResponse {
  readonly hits: readonly NoteSearchHit[]
  /** True when hits were truncated to the request limit. */
  readonly truncated: boolean
}

/** One scalar/array value permitted on the wire (bounded JSON, no unknown). */
export type FrontmatterValue = string | number | boolean | readonly (string | number | boolean)[] | null

/** One note read in full. */
export interface NoteDocument {
  readonly path: string
  readonly title: string
  readonly tags: readonly string[]
  readonly aliases: readonly string[]
  readonly frontmatter: Readonly<Record<string, FrontmatterValue>>
  /** Body text without the frontmatter block. */
  readonly content: string
  readonly mtime: number
}

/** Read-one-note request. */
export interface ReadNoteRequest {
  readonly path: string
}

/** One checkbox task found in a note. */
export interface TaskItem {
  readonly notePath: string
  /** 1-based line number of the checkbox in the note. */
  readonly line: number
  /** Task text after the checkbox marker. */
  readonly text: string
  readonly done: boolean
  /** Trailing (YYYY-MM-DD) due date, when present. */
  readonly dueDate?: string
  /** Inline #tags on the task line. */
  readonly tags: readonly string[]
  /** Grouping key: due date, the daily-note date, or '未指定日期'. */
  readonly dateGroup: string
}

/** Task listing request. */
export interface ListTasksRequest {
  readonly includeDone?: boolean
}

/** Task listing response. */
export interface TaskListResponse {
  readonly items: readonly TaskItem[]
}

/** One file the index could not read or parse. */
export interface IndexIssue {
  readonly path: string
  readonly reason: string
}

/** One recently modified note. */
export interface RecentNote {
  readonly path: string
  readonly title: string
  readonly mtime: number
}

/** Dashboard statistics over the indexed vault. */
export interface VaultStats {
  readonly noteCount: number
  /** Frontmatter tag frequency across notes. */
  readonly tagCounts: Readonly<Record<string, number>>
  /** Most recently modified notes, newest first (max 10). */
  readonly recentNotes: readonly RecentNote[]
  /** Notes whose path embeds a YYYY-MM-DD daily-note pattern. */
  readonly dailyNoteCount: number
  /** Notes with no frontmatter tags. */
  readonly untaggedCount: number
  readonly issueCount: number
  readonly lastScanAt?: number
}

/** Draft write request. */
export interface SaveDraftRequest {
  readonly title: string
  readonly content: string
}

/** Draft write result. */
export interface DraftSaveResult {
  /** Absolute path of the written file. */
  readonly path: string
}
