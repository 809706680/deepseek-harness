/**
 * Writing assistance: topic + style/length options, retrieval-scoped prompt
 * sent to the current session, and a guarded save-to-vault draft action.
 */
import { useEffect, useState } from 'react'
import type { SectionProps } from './common.tsx'
import { errorMessage } from './common.tsx'
import css from './sections.module.css'

type StyleId = 'formal' | 'casual' | 'list'
type LengthId = 'short' | 'medium' | 'long'

const STYLES: readonly { id: StyleId; label: string; text: string }[] = [
  { id: 'formal', label: 'writing.style.formal', text: '正式' },
  { id: 'casual', label: 'writing.style.casual', text: '随笔' },
  { id: 'list', label: 'writing.style.list', text: '清单' },
]

const LENGTHS: readonly { id: LengthId; label: string; text: string }[] = [
  { id: 'short', label: 'writing.length.short', text: '短' },
  { id: 'medium', label: 'writing.length.medium', text: '中' },
  { id: 'long', label: 'writing.length.long', text: '长' },
]

/** Build the writing prompt with retrieval context. */
export function buildWritingPrompt(
  topic: string, styleText: string, lengthText: string,
  hits: readonly { title: string; path: string; snippet: string }[],
): string {
  const context = hits.map(hit => '[' + hit.title + ']（' + hit.path + '）\n' + hit.snippet).join('\n\n')
  return '【工作助手·写作辅助】\n请写一篇' + styleText + '风格、' + lengthText + '篇幅的草稿，主题：' + topic
    + (context === '' ? '' : '\n\n可参考的知识库内容：\n' + context)
    + '\n\n请直接输出草稿正文，不要输出解释。'
}

/** Writing section. */
export function WritingSection({ inject, t, sessionId, activity }: SectionProps) {
  const [topic, setTopic] = useState('')
  const [style, setStyle] = useState<StyleId>('formal')
  const [length, setLength] = useState<LengthId>('medium')
  const [status, setStatus] = useState<'idle' | 'sent' | 'failed'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [title, setTitle] = useState('')
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(() => {
    if (sessionId === undefined) { setDraft(''); return }
    setDraft(inject.latestAssistantText(sessionId))
  }, [inject, sessionId, activity])

  const generate = async (): Promise<void> => {
    const topicValue = topic.trim()
    if (topicValue === '') return
    if (sessionId === undefined) {
      setStatus('failed')
      setError(t('qa.noSession'))
      return
    }
    setStatus('sent')
    setError(null)
    setSaved(null)
    try {
      const hits = await inject.search(topicValue, 6).catch(() => [])
      const styleEntry = STYLES.find(entry => entry.id === style)
      const lengthEntry = LENGTHS.find(entry => entry.id === length)
      const prompt = buildWritingPrompt(topicValue, styleEntry?.text ?? '正式', lengthEntry?.text ?? '中', hits)
      const outcome = await inject.sendToSession(sessionId, prompt)
      if (!outcome.ok) {
        setStatus('failed')
        setError(t('qa.failed', { message: outcome.reason }))
      } else {
        setTitle(topicValue)
      }
    } catch (err) {
      setStatus('failed')
      setError(t('error.generic', { message: errorMessage(err) }))
    }
  }

  const save = async (): Promise<void> => {
    const titleValue = title.trim() === '' ? '草稿' : title.trim()
    try {
      const result = await inject.saveDraft(titleValue, draft)
      setSaved(result.path)
    } catch (err) {
      setError(t('error.generic', { message: errorMessage(err) }))
    }
  }

  return (
    <div className={css.stack}>
      <div className={css.searchRow}>
        <input
          className={css.input}
          placeholder={t('writing.placeholder')}
          value={topic}
          onChange={(event) => { setTopic(event.target.value) }}
        />
        <button type="button" className={css.primary} onClick={() => { void generate() }} disabled={status === 'sent'}>
          {t('writing.generate')}
        </button>
      </div>
      <div className={css.optionRow}>
        <span className={css.hint}>{t('writing.style')}</span>
        {STYLES.map(entry => (
          <button
            key={entry.id}
            type="button"
            className={css.ghost}
            data-active={style === entry.id || undefined}
            onClick={() => { setStyle(entry.id) }}
          >
            {t(entry.label as never)}
          </button>
        ))}
        <span className={css.hint}>{t('writing.length')}</span>
        {LENGTHS.map(entry => (
          <button
            key={entry.id}
            type="button"
            className={css.ghost}
            data-active={length === entry.id || undefined}
            onClick={() => { setLength(entry.id) }}
          >
            {t(entry.label as never)}
          </button>
        ))}
      </div>
      {sessionId === undefined && (
        <div className={css.card}>
          <p className={css.emptyTitle}>{t('qa.noSession')}</p>
          <p className={css.hint}>{t('qa.noSessionDesc')}</p>
        </div>
      )}
      {error !== null && <p className={css.error}>{error}</p>}
      {status === 'sent' && <p className={css.ok}>{t('writing.sent')}</p>}
      <div className={css.card}>
        <h3 className={css.cardTitle}>{t('writing.draft')}</h3>
        {draft === '' ? <p className={css.hint}>{t('writing.noDraft')}</p> : <pre className={css.previewBody}>{draft}</pre>}
        {draft !== '' && (
          <div className={css.qaRow}>
            <input
              className={css.input}
              placeholder={t('writing.draftTitle')}
              value={title}
              onChange={(event) => { setTitle(event.target.value) }}
            />
            <button type="button" className={css.primary} onClick={() => { void save() }}>{t('writing.save')}</button>
          </div>
        )}
        {saved !== null && <p className={css.ok}>{t('writing.saved', { path: saved })}</p>}
      </div>
    </div>
  )
}
