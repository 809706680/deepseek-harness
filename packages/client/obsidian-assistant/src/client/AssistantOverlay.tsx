/**
 * Full-frame work-assistant overlay (shell.overlay, root scope). Renders the
 * five-section panel over the app frame; all data arrives through the
 * injected callbacks (merged into props) and the shared panel store.
 */
import { useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { VaultStatus } from '@deepseek-ai/dsh-obsidian-vault/types'
import type { ObsidianAssistantInjected } from './contract.ts'
import type { createAssistantStore, AssistantSection } from './store.ts'
import { DashboardSection } from './sections/DashboardSection.tsx'
import { SearchSection } from './sections/SearchSection.tsx'
import { QaSection } from './sections/QaSection.tsx'
import { TasksSection } from './sections/TasksSection.tsx'
import { WritingSection } from './sections/WritingSection.tsx'
import css from './AssistantOverlay.module.css'

/** Composed props of the overlay entry (injected callbacks merged in). */
export type AssistantOverlayProps =
  PropsRuntime<'shell.overlay'>
  & PropsStore<ReturnType<typeof createAssistantStore>>
  & InjectFace<ObsidianAssistantInjected>
  & PropsLocale<'obsidianAssistant'>

/** Nav order and labels. */
const SECTIONS: readonly { id: AssistantSection; labelKey: string }[] = [
  { id: 'dashboard', labelKey: 'nav.dashboard' },
  { id: 'search', labelKey: 'nav.search' },
  { id: 'qa', labelKey: 'nav.qa' },
  { id: 'tasks', labelKey: 'nav.tasks' },
  { id: 'writing', labelKey: 'nav.writing' },
]

type OverlayTranslate = AssistantOverlayProps['t']

/** The overlay panel body. */
export function AssistantOverlay({
  useStore, actions, useSessions, t, ...face
}: AssistantOverlayProps) {
  const panelOpen = useStore(state => state.panelOpen)
  const section = useStore(state => state.section)
  // Current session identity and its activity tick: sections re-render when
  // the current session's summary moves (streaming answers, new turns).
  const current = useSessions(state => state.current)
  const activity = useSessions(state => (state.current !== undefined ? (state.byId[state.current]?.updatedAt ?? 0) : 0))

  const [status, setStatus] = useState<VaultStatus | null>(null)

  useEffect(() => {
    let alive = true
    void face.status().then((value) => { if (alive) setStatus(value) }).catch(() => {})
    return () => { alive = false }
    // face is the registration-stable injected share; status is fetched once
    // on mount and refreshed explicitly through the header refresh button.
  }, [])

  if (!panelOpen) return null

  const refresh = async (): Promise<void> => {
    try { setStatus(await face.refresh()) } catch { /* status stays stale */ }
  }

  return (
    <div className={css.backdrop} onMouseDown={(event) => {
      if (event.target === event.currentTarget) actions.closePanel()
    }}>
      <div className={css.panel} role="dialog" aria-modal="true" aria-label={t('panel.title')}>
        <header className={css.header}>
          <h2 className={css.title}>{t('panel.title')}</h2>
          <StatusLine status={status} t={t} onRefresh={() => { void refresh() }} />
          <button type="button" className={css.close} onClick={() => { actions.closePanel() }} aria-label={t('panel.close')}>
            ✕
          </button>
        </header>
        <div className={css.body}>
          <nav className={css.nav} aria-label={t('panel.title')}>
            {SECTIONS.map(entry => (
              <button
                key={entry.id}
                type="button"
                className={css.navItem}
                aria-current={section === entry.id ? 'page' : undefined}
                onClick={() => { actions.setSection(entry.id) }}
              >
                {t(entry.labelKey as never)}
              </button>
            ))}
          </nav>
          <main className={css.content}>
            {status !== null && !status.configured && (
              <div className={css.emptyState}>
                <p className={css.emptyTitle}>{t('empty.configure')}</p>
                <p className={css.emptyDesc}>{t('empty.configureDesc')}</p>
              </div>
            )}
            {status !== null && status.configured && (
              <SectionHost section={section} inject={face} t={t} sessionId={current} activity={activity} />
            )}
          </main>
        </div>
      </div>
    </div>
  )
}

/** Status pill in the panel header. */
function StatusLine({ status, t, onRefresh }: { status: VaultStatus | null; t: OverlayTranslate; onRefresh: () => void }) {
  if (status === null) return <span className={css.status}>{t('status.connected')}</span>
  if (!status.configured) return <span className={css.status}>{t('status.unconfigured')}</span>
  if (status.error !== undefined) return <span className={css.statusError}>{t('status.error', { message: status.error })}</span>
  return (
    <span className={css.status}>
      {t('status.connected')} · {status.vaultPath ?? ''} · {status.noteCount} 篇
      <button type="button" className={css.refresh} onClick={onRefresh}>{t('panel.refresh')}</button>
    </span>
  )
}

/** Dispatch to the active section with shared context props. */
function SectionHost(props: {
  section: AssistantSection
  inject: ObsidianAssistantInjected
  t: OverlayTranslate
  sessionId: string | undefined
  activity: number
}) {
  switch (props.section) {
    case 'dashboard': return <DashboardSection inject={props.inject} t={props.t} sessionId={props.sessionId} activity={props.activity} />
    case 'search': return <SearchSection inject={props.inject} t={props.t} sessionId={props.sessionId} activity={props.activity} />
    case 'qa': return <QaSection inject={props.inject} t={props.t} sessionId={props.sessionId} activity={props.activity} />
    case 'tasks': return <TasksSection inject={props.inject} t={props.t} sessionId={props.sessionId} activity={props.activity} />
    case 'writing': return <WritingSection inject={props.inject} t={props.t} sessionId={props.sessionId} activity={props.activity} />
  }
}
