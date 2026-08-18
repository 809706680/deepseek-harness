/**
 * Task aggregation: checkbox tasks across the vault grouped by date, with a
 * filter and a prefill-to-composer action per task.
 */
import { useEffect, useState } from 'react'
import type { TaskItem } from '@deepseek-ai/dsh-obsidian-vault/types'
import type { SectionProps } from './common.tsx'
import { errorMessage } from './common.tsx'
import css from './sections.module.css'

type TaskFilter = 'all' | 'open' | 'done'

/** Tasks section. */
export function TasksSection({ inject, t, sessionId }: SectionProps) {
  const [items, setItems] = useState<TaskItem[] | null>(null)
  const [filter, setFilter] = useState<TaskFilter>('open')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void inject.listTasks(true)
      .then((value) => { if (alive) setItems(value) })
      .catch((err) => { if (alive) setError(errorMessage(err)) })
    return () => { alive = false }
  }, [inject])

  if (error !== null) return <p className={css.error}>{t('error.generic', { message: error })}</p>
  if (items === null) return <p className={css.hint}>{t('tasks.loading')}</p>

  const openCount = items.filter(item => !item.done).length
  const doneCount = items.length - openCount
  const visible = items.filter(item => (
    filter === 'all' ? true : filter === 'open' ? !item.done : item.done
  ))
  const groups = new Map<string, TaskItem[]>()
  for (const item of visible) {
    const list = groups.get(item.dateGroup) ?? []
    list.push(item)
    groups.set(item.dateGroup, list)
  }

  const filters: { id: TaskFilter; label: string }[] = [
    { id: 'open', label: t('tasks.filter.open') },
    { id: 'all', label: t('tasks.filter.all') },
    { id: 'done', label: t('tasks.filter.done') },
  ]

  const prefill = (item: TaskItem): void => {
    if (sessionId === undefined) return
    inject.prefillComposer(sessionId, '帮我处理这个任务：' + item.text + '（来源笔记：' + item.notePath + '）')
  }

  return (
    <div className={css.stack}>
      <div className={css.cardRow}>
        <span className={css.hint}>{t('tasks.open', { n: openCount })}</span>
        <span className={css.hint}>{t('tasks.done', { m: doneCount })}</span>
        <div className={css.filterRow}>
          {filters.map(entry => (
            <button
              key={entry.id}
              type="button"
              className={css.ghost}
              data-active={filter === entry.id || undefined}
              onClick={() => { setFilter(entry.id) }}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>
      {visible.length === 0 && <p className={css.hint}>{t('tasks.empty')}</p>}
      {[...groups.entries()].map(([group, groupItems]) => (
        <section key={group} className={css.card}>
          <h3 className={css.cardTitle}>{group}</h3>
          <ul className={css.list}>
            {groupItems.map(item => (
              <li key={item.notePath + ':' + item.line} className={css.taskRow}>
                <span className={css.taskCheck} data-done={item.done || undefined}>{item.done ? '✓' : '○'}</span>
                <span className={css.taskText}>{item.text}</span>
                <span className={css.rowMeta}>{item.notePath}</span>
                <button type="button" className={css.ghost} onClick={() => { prefill(item) }}>{t('tasks.send')}</button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
