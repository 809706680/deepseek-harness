/**
 * Knowledge-base Q&A: mention-scoped input with suggested chips, retrieval,
 * source chips under the question, and a send-to-conversation flow that
 * reuses the DSH model (the answer streams in the chat).
 */
import { useEffect, useState } from 'react'
import type { NoteSearchHit } from '@deepseek-ai/dsh-obsidian-vault/types'
import type { SectionProps } from './common.tsx'
import { errorMessage } from './common.tsx'
import css from './sections.module.css'

/** Build the enriched prompt sent to the session agent. */
export function buildPrompt(question: string, hits: readonly NoteSearchHit[], scope: readonly NoteSearchHit[]): string {
  const merged = [...scope, ...hits.filter(hit => !scope.some(item => item.path === hit.path))].slice(0, 8)
  const lines = merged.map((hit, index) => {
    return '[' + (index + 1) + '] ' + hit.title + '（' + hit.path + '）\n' + hit.snippet
  })
  return '【工作助手·知识库问答】\n问题：' + question
    + '\n\n以下是从 Obsidian 知识库检索到的参考内容：\n' + lines.join('\n\n')
    + '\n\n请基于以上知识库内容回答。引用参考内容时标注其编号或笔记路径。如果参考内容不足以回答，请明确说明。'
}

/** Q&A section. */
export function QaSection({ inject, t, sessionId, activity }: SectionProps) {
  const [question, setQuestion] = useState('')
  const [scope, setScope] = useState<NoteSearchHit[]>([])
  const [sources, setSources] = useState<NoteSearchHit[]>([])
  const [status, setStatus] = useState<'idle' | 'searching' | 'sent' | 'failed'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionHits, setMentionHits] = useState<NoteSearchHit[]>([])
  const [latest, setLatest] = useState('')

  useEffect(() => {
    if (sessionId === undefined) { setLatest(''); return }
    setLatest(inject.latestAssistantText(sessionId))
  }, [inject, sessionId, activity])

  const onQuestionChange = (value: string): void => {
    setQuestion(value)
    const at = value.lastIndexOf('@')
    if (at !== -1 && /^[\p{L}\p{N}_-]*$/u.test(value.slice(at + 1))) {
      setMentionOpen(true)
      void inject.search(value.slice(at + 1), 6)
        .then(setMentionHits)
        .catch(() => setMentionHits([]))
    } else {
      setMentionOpen(false)
    }
  }

  const pickMention = (hit: NoteSearchHit): void => {
    const at = question.lastIndexOf('@')
    const base = at === -1 ? question : question.slice(0, at)
    setQuestion(base + '@' + hit.title + ' ')
    setScope(prev => prev.some(item => item.path === hit.path) ? prev : [...prev, hit])
    setMentionOpen(false)
  }

  const ask = async (): Promise<void> => {
    const q = question.trim()
    if (q === '') return
    if (sessionId === undefined) {
      setStatus('failed')
      setError(t('qa.noSession'))
      return
    }
    setStatus('searching')
    setError(null)
    try {
      const hits = await inject.search(q, 8)
      setSources(hits)
      const prompt = buildPrompt(q, hits, scope)
      const outcome = await inject.sendToSession(sessionId, prompt)
      if (!outcome.ok) {
        setStatus('failed')
        setError(t('qa.failed', { message: outcome.reason }))
      } else {
        setStatus('sent')
        setQuestion('')
        setScope([])
      }
    } catch (err) {
      setStatus('failed')
      setError(t('error.generic', { message: errorMessage(err) }))
    }
  }

  const clearSources = (): void => { setSources([]); setScope([]) }

  const suggested = ['qa.suggest.todos', 'qa.suggest.project', 'qa.suggest.weekly'] as const

  return (
    <div className={css.stack}>
      {status === 'idle' && sessionId !== undefined && (
        <div className={css.card}>
          <h3 className={css.cardTitle}>{t('qa.suggested')}</h3>
          <div className={css.chipRow}>
            {suggested.map(key => (
              <button key={key} type="button" className={css.chipButton} onClick={() => { onQuestionChange(t(key)) }}>
                {t(key)}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className={css.qaRow}>
        <input
          className={css.input}
          placeholder={t('qa.placeholder')}
          value={question}
          onChange={(event) => { onQuestionChange(event.target.value) }}
          onKeyDown={(event) => { if (event.key === 'Enter') void ask() }}
        />
        <button type="button" className={css.primary} onClick={() => { void ask() }} disabled={status === 'searching'}>
          {status === 'searching' ? t('qa.sending') : t('qa.ask')}
        </button>
      </div>
      {mentionOpen && mentionHits.length > 0 && (
        <ul className={css.mentionList}>
          {mentionHits.map(hit => (
            <li key={hit.path}>
              <button type="button" className={css.mentionItem} onClick={() => { pickMention(hit) }}>
                {hit.title} · {hit.path}
              </button>
            </li>
          ))}
        </ul>
      )}
      {sessionId === undefined && (
        <div className={css.card}>
          <p className={css.emptyTitle}>{t('qa.noSession')}</p>
          <p className={css.hint}>{t('qa.noSessionDesc')}</p>
        </div>
      )}
      {(sources.length > 0 || scope.length > 0) && (
        <div className={css.card}>
          <h3 className={css.cardTitle}>{t('qa.sources')}</h3>
          <div className={css.chipRow}>
            {[...scope, ...sources.filter(hit => !scope.some(item => item.path === hit.path))].slice(0, 8).map(hit => (
              <span key={hit.path} className={css.chip}>{hit.title}</span>
            ))}
          </div>
          <button type="button" className={css.ghost} onClick={clearSources}>{t('qa.clearSources')}</button>
        </div>
      )}
      {error !== null && <p className={css.error}>{error}</p>}
      {status === 'sent' && <p className={css.ok}>{t('qa.sent')}</p>}
      {sessionId !== undefined && (
        <div className={css.card}>
          <h3 className={css.cardTitle}>{t('qa.latest')}</h3>
          {latest === '' ? <p className={css.hint}>{t('qa.noAnswer')}</p> : <pre className={css.previewBody}>{latest.slice(0, 2000)}</pre>}
        </div>
      )}
    </div>
  )
}
