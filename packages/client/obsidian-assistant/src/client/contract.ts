/**
 * Injected service face of the obsidian assistant panel: plain callbacks over
 * JSON data, resolved against the vault Remote namespace and the sessions /
 * conversation services. Components receive these through the inject share.
 */
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  DraftSaveResult, NoteDocument, NoteSearchHit, TaskItem, VaultStats, VaultStatus,
} from '@deepseek-ai/dsh-obsidian-vault/types'

/** One vault-side call outcome or a structured local reason. */
export type SendOutcome = { readonly ok: true } | { readonly ok: false; readonly reason: string }

/** Callbacks the panel components may use. */
export interface ObsidianAssistantInjected {
  /** Current vault service status. */
  status(): Promise<VaultStatus>
  /** Force a rescan and return fresh status. */
  refresh(): Promise<VaultStatus>
  /** Retrieve notes matching a query. */
  search(query: string, limit?: number): Promise<NoteSearchHit[]>
  /** Read one note in full. */
  readNote(path: string): Promise<NoteDocument>
  /** List checkbox tasks (optionally including done). */
  listTasks(includeDone: boolean): Promise<TaskItem[]>
  /** Dashboard statistics. */
  stats(): Promise<VaultStats>
  /** Write a draft under the guarded drafts folder. */
  saveDraft(title: string, content: string): Promise<DraftSaveResult>
  /** Send a prompt into a session's queue. */
  sendToSession(sessionId: string, text: string): Promise<SendOutcome>
  /** Prefill the composer draft of a session without sending. */
  prefillComposer(sessionId: string, text: string): SendOutcome
  /** Latest assistant text of a session (best effort; '' when unavailable). */
  latestAssistantText(sessionId: string): string
}

/** Unwrap a Remote result, throwing the structured error on failure. */
export function unwrap<T>(result: RemoteResult<T>): T {
  if (!result.ok) throw new Error(result.error.code + ': ' + result.error.message)
  return result.value
}
