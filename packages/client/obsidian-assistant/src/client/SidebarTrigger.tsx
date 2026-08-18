/**
 * Sidebar footer trigger of the work assistant: opens the overlay panel.
 */
import type { PropsLocale, PropsRuntime, PropsStore, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { ObsidianAssistantInjected } from './contract.ts'
import type { createAssistantStore } from './store.ts'
import css from './SidebarTrigger.module.css'

/** Composed props: footer-action owner share + the shared panel store + inject. */
export type SidebarTriggerProps =
  PropsRuntime<'sidebar.footer.action'>
  & PropsStore<ReturnType<typeof createAssistantStore>>
  & InjectFace<ObsidianAssistantInjected>
  & PropsLocale<'obsidianAssistant'>

/** The footer button; opening the panel is its only job. */
export function SidebarTrigger({ useStore, actions, t }: SidebarTriggerProps) {
  const panelOpen = useStore(state => state.panelOpen)
  return (
    <button
      type="button"
      className={css.trigger}
      aria-label={t('trigger.open')}
      data-open={panelOpen || undefined}
      onClick={() => { actions.openPanel() }}
    >
      <span className={css.mark} aria-hidden="true">✦</span>
      {t('panel.title')}
    </button>
  )
}
