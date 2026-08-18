/**
 * Search & browse: query box, hit list with snippets, and a note preview with
 * quote-to-chat and copy-path actions.
 */
import { useState } from 'react'
import type { NoteDocument, NoteSearchHit } from '@deepseek-ai/dsh-obsidian-vault/types'
import type { SectionProps } from './common.tsx'
import { errorMessage } from './common.tsx'
import css from './sections.module.css'

/** Search section. */
export function SearchSection({ inject, t, sessionId }: SectionProps) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<NoteSearchHit[] | null>(null)
  const [selected, setSelected] = useState<NoteDocument | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const runSearch = async (value: string): Promise<void> => {
    const trimmed = value.trim()
    if (trimmed === '') { setHits(null); setSelected(null); return }
    setLoading(true)
    setError(null)
    setSelected(null)
    try {
      setHits(await inject.search(trimmed))
    } catch (err) {
      setError(errorMessage(err))
      setHits(null)
    } finally {
      setLoading(false)
    }
  }

  const openNote = async (path: string): Promise<void> => {
    try {
      setSelected(await inject.readNote(path))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const cite = (hit: NoteSearchHit): void => {
    if (sessionId === undefined) return
    inject.prefillComposer(sessionId, '来自笔记「' + hit.title + '」（' + hit.path + '）：\n' + hit.snippet + '\n')
  }

  const copyPath = async (path: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(path)
      setCopied(true)
      setTimeout(() => { setCopied(false) }, 1200)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className={css.stack}>
      <div className={css.searchRow}>
        <input
          className={css.input}
          placeholder={t('search.placeholder')}
          value={query}
          onChange={(event) => { setQuery(event.target.value) }}
          onKeyDown={(event) => { if (event.key === 'Enter') void runSearch(event.currentTarget.value) }}
        />
        <button type="button" className={css.primary} onClick={() => { void runSearch(query) }}>{t('qa.ask')}</button>
      </div>
      {error !== null && <p className={css.error}>{t('error.generic', { message: error })}</p>}
      {loading && <p className={css.hint}>{t('search.loading')}</p>}
      {!loading && hits !== null && hits.length === 0 && <p className={css.hint}>{t('search.empty')}</p>}
      {!loading && hits !== null && hits.length > 0 && (
        <div className={css.twoCol}>
          <ul className={css.list}>
            {hits.map(hit => (
              <li key={hit.path} className={css.hitCard}>
                <button type="button" className={css.hitTitle} onClick={() => { void openNote(hit.path) }}>
                  {hit.title}
                </button>
                {hit.tags.length > 0 && (
                  <div className={css.chipRow}>
                    {hit.tags.map(tag => <span key={tag} className={css.chip}>{tag}</span>)}
                  </div>
                )}
                <p className={css.snippet}>{hit.snippet}</p>
                <div className={css.actionRow}>
                  <button type="button" className={css.ghost} onClick={() => { cite(hit) }}>{t('search.cite')}</button>
                  <button type="button" className={css.ghost} onClick={() => { void copyPath(hit.path) }}>{copied ? t('search.copied') : t('search.copyPath')}</button>
                </div>
              </li>
            ))}
          </ul>
          {selected !== null && (
            <section className={css.preview}>
              <h3 className={css.cardTitle}>{selected.title}</h3>
              <p className={css.rowMeta}>{selected.path}</p>
              <pre className={css.previewBody}>{selected.content.slice(0, 4000)}</pre>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
