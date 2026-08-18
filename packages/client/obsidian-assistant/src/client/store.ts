/**
 * Shared panel store of the obsidian assistant: whether the overlay panel is
 * open and which section is active. One handle, shared by the sidebar trigger
 * and the overlay registrations.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

/** Panel sections. */
export type AssistantSection = 'dashboard' | 'search' | 'qa' | 'tasks' | 'writing'

/** Panel state. */
export interface AssistantState {
  panelOpen: boolean
  section: AssistantSection
}

type AssistantActions = {
  openPanel: (draft: AssistantState) => void
  closePanel: (draft: AssistantState) => void
  setSection: (draft: AssistantState, section: AssistantSection) => void
}

/** Create the shared panel store handle (one per plugin fiber). */
export function createAssistantStore(): EngineStoreHandle<AssistantState, AssistantActions> {
  return defineStore({
    init: (): AssistantState => ({ panelOpen: false, section: 'dashboard' }),
    actions: {
      openPanel: (draft) => { draft.panelOpen = true },
      closePanel: (draft) => { draft.panelOpen = false },
      setSection: (draft, section) => { draft.section = section },
    },
  })
}
