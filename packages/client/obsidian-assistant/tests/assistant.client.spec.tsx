// @vitest-environment jsdom
/**
 * Client tests for the obsidian assistant: store semantics, prompt builders,
 * and the two registered surfaces (trigger + overlay) driven through stubs.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createAssistantStore } from '../src/client/store.ts'
import type { AssistantOverlayProps } from '../src/client/AssistantOverlay.tsx'
import type { SidebarTriggerProps } from '../src/client/SidebarTrigger.tsx'
import { AssistantOverlay } from '../src/client/AssistantOverlay.tsx'
import { SidebarTrigger } from '../src/client/SidebarTrigger.tsx'
import type { VaultStatus } from '@deepseek-ai/dsh-obsidian-vault/types'
import { buildPrompt } from '../src/client/sections/QaSection.tsx'
import { buildWritingPrompt } from '../src/client/sections/WritingSection.tsx'

/** Minimal injected callback set. */
function stubInject() {
  return {
    status: vi.fn(async (): Promise<VaultStatus> => ({ configured: true, ready: true, vaultPath: 'V', noteCount: 1 })),
    refresh: vi.fn(async (): Promise<VaultStatus> => ({ configured: true, ready: true, vaultPath: 'V', noteCount: 1 })),
    search: vi.fn(async () => []),
    readNote: vi.fn(async () => { throw new Error('n/a') }),
    listTasks: vi.fn(async () => []),
    stats: vi.fn(async () => ({ noteCount: 0, tagCounts: {}, recentNotes: [], dailyNoteCount: 0, untaggedCount: 0, issueCount: 0 })),
    saveDraft: vi.fn(async () => { throw new Error('n/a') }),
    sendToSession: vi.fn(async () => ({ ok: true as const })),
    prefillComposer: vi.fn(() => ({ ok: true as const })),
    latestAssistantText: vi.fn(() => ''),
  }
}

const t = (key: string, _params?: Record<string, unknown>): string => key

const sessionsStub = {
  current: undefined,
  ids: [],
  byId: {},
  phase: 'ready',
  subagentsByParent: {},
  jobsBySession: {},
  currentAddress: undefined,
}

describe('assistant store', () => {
  it('toggles the panel and switches sections', () => {
    const store = createAssistantStore()
    const instance = store.create()
    expect(instance.getSnapshot().panelOpen).toBe(false)
    instance.actions.openPanel()
    expect(instance.getSnapshot().panelOpen).toBe(true)
    instance.actions.setSection('tasks')
    expect(instance.getSnapshot().section).toBe('tasks')
    instance.actions.closePanel()
    expect(instance.getSnapshot().panelOpen).toBe(false)
  })
})

describe('prompt builders', () => {
  it('embeds retrieval hits and scope into the QA prompt', () => {
    const prompt = buildPrompt('问题', [
      { path: 'a.md', title: 'A', tags: [], snippet: '片段1', score: 1, mtime: 0 },
    ], [{ path: 'b.md', title: 'B', tags: [], snippet: '片段2', score: 2, mtime: 0 }])
    expect(prompt).toContain('问题')
    expect(prompt).toContain('a.md')
    expect(prompt).toContain('b.md')
    expect(prompt).toContain('片段1')
  })

  it('builds a writing prompt with style and length', () => {
    const prompt = buildWritingPrompt('周报', '正式', '中', [{ title: 'M', path: 'm.md', snippet: 's' }])
    expect(prompt).toContain('周报')
    expect(prompt).toContain('m.md')
  })
})

describe('SidebarTrigger', () => {
  it('opens the shared panel store on click', () => {
    const store = createAssistantStore()
    const instance = store.create()
    const props = {
      useStore: (sel: (s: ReturnType<typeof instance.getSnapshot>) => unknown) => sel(instance.getSnapshot()),
      actions: instance.actions,
      t,
    } as unknown as SidebarTriggerProps
    render(<SidebarTrigger {...props} />)
    fireEvent.click(screen.getByRole('button'))
    expect(instance.getSnapshot().panelOpen).toBe(true)
  })
})

describe('AssistantOverlay', () => {
  it('renders nothing while closed', () => {
    const store = createAssistantStore()
    const instance = store.create()
    const props = {
      useStore: (sel: (s: ReturnType<typeof instance.getSnapshot>) => unknown) => sel(instance.getSnapshot()),
      actions: instance.actions,
      useSessions: (sel: (s: unknown) => unknown) => sel(sessionsStub),
      ...stubInject(),
      t,
    } as unknown as AssistantOverlayProps
    const { container } = render(<AssistantOverlay {...props} />)
    expect(container.textContent).toBe('')
  })

  it('shows the panel with the dashboard nav when opened', async () => {
    const store = createAssistantStore()
    const instance = store.create()
    instance.actions.openPanel()
    const props = {
      useStore: (sel: (s: ReturnType<typeof instance.getSnapshot>) => unknown) => sel(instance.getSnapshot()),
      actions: instance.actions,
      useSessions: (sel: (s: unknown) => unknown) => sel(sessionsStub),
      ...stubInject(),
      t,
    } as unknown as AssistantOverlayProps
    render(<AssistantOverlay {...props} />)
    expect((await screen.findAllByText('nav.dashboard')).length).toBeGreaterThan(0)
    expect(screen.getByLabelText('panel.close')).toBeTruthy()
  })

  it('shows the configure CTA when the vault is unconfigured', async () => {
    const store = createAssistantStore()
    const instance = store.create()
    instance.actions.openPanel()
    const inject = stubInject()
    inject.status.mockResolvedValueOnce({ configured: false, ready: false, noteCount: 0 })
    const props = {
      useStore: (sel: (s: ReturnType<typeof instance.getSnapshot>) => unknown) => sel(instance.getSnapshot()),
      actions: instance.actions,
      useSessions: (sel: (s: unknown) => unknown) => sel(sessionsStub),
      ...inject,
      t,
    } as unknown as AssistantOverlayProps
    render(<AssistantOverlay {...props} />)
    expect(await screen.findByText('empty.configure')).toBeTruthy()
  })
})
