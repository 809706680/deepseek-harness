/**
 * Task extraction: checkbox lines (- [ ] / - [x] / * [ ]) with inline tags and
 * trailing due dates, grouped by due date or the note's own daily-note date.
 */
import type { ParsedNote } from './scanner.ts'
import { DAILY_PATTERN } from './scanner.ts'
import type { TaskItem } from '../types.ts'

const CHECKBOX_RE = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/

const DUE_RE = /\(\s*(\d{4}-\d{2}-\d{2})\s*\)/

const TAG_RE = /#([\p{L}\p{N}_-]+)/gu

/** Grouping key for tasks without a due date or daily-note date. */
export const UNDATED_GROUP = '未指定日期'

function dailyDateOf(path: string): string | undefined {
  const match = DAILY_PATTERN.exec(path)
  if (match === null) return undefined
  return match.slice(1, 4).join('-')
}

/** Extract tasks from one note. */
export function extractTasks(note: ParsedNote): TaskItem[] {
  const items: TaskItem[] = []
  const lines = note.content.split(/\r?\n/)
  const noteDaily = dailyDateOf(note.path)
  for (let index = 0; index < lines.length; index++) {
    const match = CHECKBOX_RE.exec(lines[index] ?? '')
    if (match === null) continue
    const raw = match[2] ?? ''
    const dueMatch = DUE_RE.exec(raw)
    const dueDate = dueMatch === null ? undefined : dueMatch[1]
    const text = dueMatch === null ? raw.replace(TAG_RE, ' ').trim() : raw.replace(DUE_RE, ' ').replace(TAG_RE, ' ').trim()
    const tags: string[] = []
    for (const tagMatch of raw.matchAll(TAG_RE)) tags.push(tagMatch[1] ?? '')
    items.push({
      notePath: note.path,
      line: index + 1,
      text,
      done: (match[1] ?? ' ').toLowerCase() === 'x',
      ...dueDate === undefined ? {} : { dueDate },
      tags,
      dateGroup: dueDate ?? noteDaily ?? UNDATED_GROUP,
    })
  }
  return items
}

/** Extract tasks across many notes, optionally including done items. */
export function collectTasks(notes: readonly ParsedNote[], includeDone: boolean): TaskItem[] {
  const items: TaskItem[] = []
  for (const note of notes) {
    for (const task of extractTasks(note)) {
      if (!task.done || includeDone) items.push(task)
    }
  }
  items.sort((a, b) => a.dateGroup < b.dateGroup ? -1 : a.dateGroup > b.dateGroup ? 1 : 0)
  return items
}
