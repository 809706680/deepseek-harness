/**
 * Dashboard: statistics cards, tag cloud, recent edits, index health, and a
 * todo overview derived from the vault task list.
 */
import { useEffect, useState } from 'react'
import type { TaskItem, VaultStats } from '@deepseek-ai/dsh-obsidian-vault/types'
import type { SectionProps } from './common.tsx'
import { errorMessage, todayString } from './common.tsx'
import css from './sections.module.css'

/** One statistic card. */
function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={css.statCard}>
      <span className={css.statValue}>{value}</span>
      <span className={css.statLabel}>{label}</span>
    </div>
  )
}

/** Dashboard section. */
export function DashboardSection({ inject, t }: SectionProps) {
  const [stats, setStats] = useState<VaultStats | null>(null)
  const [tasks, setTasks] = useState<TaskItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void Promise.all([inject.stats(), inject.listTasks(true)])
      .then(([statsValue, tasksValue]) => {
        if (alive) { setStats(statsValue); setTasks(tasksValue) }
      })
      .catch((err) => { if (alive) setError(errorMessage(err)) })
    return () => { alive = false }
  }, [inject])

  if (error !== null) return <p className={css.error}>{t('error.generic', { message: error })}</p>
  if (stats === null) return <p className={css.hint}>{t('tasks.loading')}</p>

  const openCount = tasks === null ? 0 : tasks.filter(item => !item.done).length
  const today = todayString()
  const doneToday = tasks === null ? 0 : tasks.filter(item => item.done && item.dateGroup === today).length
  const tagEntries = Object.entries(stats.tagCounts).slice(0, 28)

  return (
    <div className={css.stack}>
      <div className={css.cardRow}>
        <StatCard label={t('dashboard.notes')} value={stats.noteCount} />
        <StatCard label={t('dashboard.tags')} value={tagEntries.length} />
        <StatCard label={t('dashboard.untagged')} value={stats.untaggedCount} />
        <StatCard label={t('dashboard.todoOpen', { n: openCount })} value={openCount} />
      </div>
      <div className={css.twoCol}>
        <section className={css.card}>
          <h3 className={css.cardTitle}>{t('dashboard.recentEdits')}</h3>
          {stats.recentNotes.length === 0 && <p className={css.hint}>{t('search.empty')}</p>}
          <ul className={css.list}>
            {stats.recentNotes.map(note => (
              <li key={note.path} className={css.row}>
                <span className={css.rowTitle}>{note.title}</span>
                <span className={css.rowMeta}>{note.path}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className={css.card}>
          <h3 className={css.cardTitle}>{t('dashboard.indexHealth')}</h3>
          <p className={css.hint}>{stats.issueCount === 0 ? t('dashboard.noIssues') : t('status.issues', { count: stats.issueCount })}</p>
          {stats.lastScanAt !== undefined && (
            <p className={css.hint}>{t('dashboard.lastScan')}：{new Date(stats.lastScanAt).toLocaleString()}</p>
          )}
          <h3 className={css.cardTitle}>{t('dashboard.todoOverview')}</h3>
          <p className={css.hint}>{t('dashboard.todoOpen', { n: openCount })} · {t('dashboard.todoDone', { m: doneToday })}</p>
        </section>
      </div>
      {tagEntries.length > 0 && (
        <section className={css.card}>
          <h3 className={css.cardTitle}>{t('dashboard.tags')}</h3>
          <div className={css.chipRow}>
            {tagEntries.map(([tag, count]) => (
              <span key={tag} className={css.chip}>{tag} · {count}</span>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
