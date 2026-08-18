/**
 * Dashboard statistics over a note snapshot: counts, tag frequencies, recent
 * edits, daily notes, untagged notes, and index-health passthrough.
 */
import type { ParsedNote } from './scanner.ts'
import { DAILY_PATTERN } from './scanner.ts'
import type { IndexIssue, VaultStats } from '../types.ts'

/** Max recent notes surfaced to the dashboard. */
export const MAX_RECENT = 10

/** Compute dashboard statistics over a note snapshot. */
export function computeStats(
  notes: readonly ParsedNote[],
  issues: readonly IndexIssue[],
  lastScanAt: number | undefined,
): VaultStats {
  const tagCounts = new Map<string, number>()
  let dailyNoteCount = 0
  let untaggedCount = 0
  for (const note of notes) {
    if (DAILY_PATTERN.test(note.path)) dailyNoteCount++
    if (note.tags.length === 0) untaggedCount++
    for (const tag of note.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
  }
  const recent = [...notes]
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, MAX_RECENT)
    .map(note => ({ path: note.path, title: note.title, mtime: note.mtime }))
  const sortedTags = Object.fromEntries([...tagCounts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)))
  return {
    noteCount: notes.length,
    tagCounts: sortedTags,
    recentNotes: recent,
    dailyNoteCount,
    untaggedCount,
    issueCount: issues.length,
    ...lastScanAt === undefined ? {} : { lastScanAt },
  }
}
