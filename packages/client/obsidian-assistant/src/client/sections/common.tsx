/** Shared section props and helpers for the assistant panel sections. */
import type { ObsidianAssistantInjected } from '../contract.ts'
import type { ObsidianKey } from '../locales.ts'

/** Props shared by every section. */
export interface SectionProps {
  readonly inject: ObsidianAssistantInjected
  readonly t: (key: ObsidianKey, params?: Record<string, unknown>) => string
  /** Current session id (undefined when none is open). */
  readonly sessionId: string | undefined
  /** Activity tick of the current session (drives answer refreshes). */
  readonly activity: number
}

/** Human-readable error message. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Today's YYYY-MM-DD date (local). */
export function todayString(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return now.getFullYear() + '-' + month + '-' + day
}
