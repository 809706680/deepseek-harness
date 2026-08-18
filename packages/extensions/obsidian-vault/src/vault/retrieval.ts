/**
 * In-memory retrieval over indexed notes: character unigram/bigram presence
 * index with idf weighting plus title/tag/exact-match boosts. No tokenizer
 * dependency (CJK-friendly). Content is capped per note to bound memory.
 */
import type { ParsedNote } from './scanner.ts'
import type { NoteSearchHit } from '../types.ts'

/** Maximum characters of note body indexed for grams. */
export const MAX_INDEXED_CHARS = 6000

/** Maximum distinct grams taken from one query. */
const MAX_QUERY_GRAMS = 120

/** Normalize text for gramming: lowercase, collapse whitespace. */
export function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Character grams of a normalized string (unigrams and bigrams). */
export function gramsOf(normalized: string): Set<string> {
  const grams = new Set<string>()
  if (normalized === '') return grams
  for (const char of normalized) grams.add(char)
  for (let i = 0; i < normalized.length - 1; i++) {
    grams.add(normalized.slice(i, i + 2))
  }
  return grams
}

interface IndexedNote {
  readonly note: ParsedNote
  readonly grams: Set<string>
  /** Normalized full content (bounded by MAX_INDEXED_CHARS for gramming). */
  readonly searchText: string
}

/** Deterministic retrieval index over a snapshot of parsed notes. */
export class RetrievalIndex {
  private readonly notes: IndexedNote[] = []
  private readonly docFreq = new Map<string, number>()
  private readonly titleText = new Map<string, string>()

  /** Rebuild the index from a full note set. */
  rebuild(notes: readonly ParsedNote[]): void {
    this.notes.length = 0
    this.docFreq.clear()
    this.titleText.clear()
    for (const note of notes) {
      const searchText = normalize(note.content.slice(0, MAX_INDEXED_CHARS))
      const grams = gramsOf(searchText)
      const indexed: IndexedNote = { note, grams, searchText }
      this.notes.push(indexed)
      this.titleText.set(note.path, normalize(note.title))
      for (const gram of grams) {
        this.docFreq.set(gram, (this.docFreq.get(gram) ?? 0) + 1)
      }
    }
  }

  /** Number of indexed notes. */
  get size(): number {
    return this.notes.length
  }

  private idf(gram: string): number {
    const df = this.docFreq.get(gram) ?? 0
    if (df === 0) return 0
    return Math.log((this.notes.length + 1) / (df + 1)) + 1
  }

  /**
   * Retrieve top hits for a query. Deterministic ordering: score desc, then
   * mtime desc, then path asc.
   * @param query - raw user query.
   * @param limit - max hits returned.
   * @param contextChars - snippet window size.
   * @param offsetPath - when given, only notes with this exact path are scored.
   */
  search(query: string, limit: number, contextChars: number, offsetPath?: string): NoteSearchHit[] {
    const normalized = normalize(query)
    if (normalized === '') return []
    const grams = gramsOf(normalized)
    let gramsArray = [...grams]
    if (gramsArray.length > MAX_QUERY_GRAMS) {
      gramsArray = gramsArray.slice(0, MAX_QUERY_GRAMS)
    }
    const scored: { hit: NoteSearchHit; score: number }[] = []
    for (const indexed of this.notes) {
      if (offsetPath !== undefined && indexed.note.path !== offsetPath) continue
      let score = 0
      for (const gram of gramsArray) {
        if (indexed.grams.has(gram)) score += this.idf(gram)
      }
      if (score === 0) continue
      const title = this.titleText.get(indexed.note.path) ?? ''
      if (title.includes(normalized)) score += 40
      else if (title !== '') {
        for (const gram of gramsArray) {
          if (title.includes(gram)) { score += 20; break }
        }
      }
      if (indexed.note.tags.some(tag => normalized.includes(normalize(tag)) || tag.includes(normalized))) {
        score += 25
      }
      if (indexed.searchText.includes(normalized)) score += 15
      scored.push({
        hit: {
          path: indexed.note.path,
          title: indexed.note.title,
          tags: indexed.note.tags,
          snippet: makeSnippet(indexed.searchText, normalized, gramsArray, contextChars),
          score: round3(score),
          mtime: indexed.note.mtime,
        },
        score,
      })
    }
    scored.sort((a, b) => b.score - a.score
      || b.hit.mtime - a.hit.mtime
      || (a.hit.path < b.hit.path ? -1 : a.hit.path > b.hit.path ? 1 : 0))
    return scored.slice(0, limit).map(s => s.hit)
  }
}

/** Build a snippet window around the best match. */
export function makeSnippet(searchText: string, normalizedQuery: string, grams: readonly string[], contextChars: number): string {
  const half = Math.max(20, Math.floor(contextChars / 2))
  let index = searchText.indexOf(normalizedQuery)
  if (index === -1) {
    // Longest query gram as the fallback anchor.
    let best = -1
    let bestLen = 0
    for (const gram of grams) {
      const found = searchText.indexOf(gram)
      if (found !== -1 && gram.length > bestLen) { best = found; bestLen = gram.length }
    }
    index = best
  }
  if (index === -1) return searchText.slice(0, contextChars)
  const start = Math.max(0, index - half)
  const end = Math.min(searchText.length, index + normalizedQuery.length + half)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < searchText.length ? '…' : ''
  return prefix + searchText.slice(start, end).replace(/\s+/g, ' ') + suffix
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}
