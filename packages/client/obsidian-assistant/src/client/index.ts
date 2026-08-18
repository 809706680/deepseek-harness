/**
 * Obsidian work-assistant plugin, browser half: self-mounts the vault Remote
 * contribution (no api-remotes assembly edit), registers the sidebar trigger
 * and the full-frame assistant overlay, and provides the panel's injected
 * callbacks.
 */
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { PromptContentPart } from '@deepseek-ai/dsh-client-connection/client'
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import obsidianRemote from '@deepseek-ai/dsh-obsidian-vault/remote'
import type {} from '@deepseek-ai/dsh-obsidian-vault/remote'
import { AssistantOverlay } from './AssistantOverlay.tsx'
import { SidebarTrigger } from './SidebarTrigger.tsx'
import { createAssistantStore } from './store.ts'
import type { ObsidianAssistantInjected } from './contract.ts'
import { unwrap } from './contract.ts'
import { en, NS, zh, type ObsidianKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Obsidian work-assistant copy. */
    obsidianAssistant: ObsidianKey
  }
}

/** The mounted vault Remote namespace face (wire-wrapped methods). */
type VaultRemote = TypertRemoteNamespaceMap['obsidian']

export type { ObsidianAssistantInjected } from './contract.ts'
export type { AssistantState, AssistantSection } from './store.ts'

/** Services required by the trigger, overlay, and Remote mount. */
export const inject = ['slots', 'sessions', 'locale', 'remote']

/**
 * Client plugin body. The vault Remote namespace is self-mounted; consumers
 * read it through ctx.get after the mount settles (the inject-declared
 * property path would deadlock against our own mount).
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  // Self-mounted Remote contribution, captured once mounted.
  let vault: VaultRemote | undefined
  ctx.effect(() => {
    let mounted: (() => Promise<void>) | undefined
    let active = true
    void ctx.remote.$mount(obsidianRemote).then((dispose) => {
      if (active) {
        mounted = dispose
        vault = ctx.get('remote.obsidian') as VaultRemote | undefined
      } else {
        void dispose()
      }
    }).catch(() => { /* namespace unavailable; sections surface it */ })
    return () => {
      active = false
      void mounted?.()
    }
  }, 'obsidian-assistant: remote mount')

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'obsidian-assistant: dictionaries')

  const store = createAssistantStore()

  const requireVault = (): VaultRemote => {
    if (vault === undefined) {
      throw new Error('obsidian-vault 服务尚未就绪')
    }
    return vault
  }

  const injected = (): ObsidianAssistantInjected => {
    return {
      status: async () => unwrap(await requireVault().status()),
      refresh: async () => unwrap(await requireVault().refresh()),
      search: async (query, limit) => [...unwrap(await requireVault().search({ query, ...(limit === undefined ? {} : { limit }) })).hits],
      readNote: async path => unwrap(await requireVault().readNote({ path })),
      listTasks: async includeDone => [...unwrap(await requireVault().listTasks({ includeDone })).items],
      stats: async () => unwrap(await requireVault().stats()),
      saveDraft: async (title, content) => unwrap(await requireVault().saveDraft({ title, content })),
      sendToSession: async (sessionId, text) => {
        const binding = ctx.sessions.binding(sessionId as SessionId)
        if (binding === undefined) return { ok: false, reason: 'no-session' }
        try {
          const content: PromptContentPart[] = [{ type: 'text', text }]
          const result = await binding.session.prompt(content, 'queue')
          return result.ok ? { ok: true } : { ok: false, reason: result.error?.code ?? 'prompt-rejected' }
        } catch {
          return { ok: false, reason: 'prompt-failed' }
        }
      },
      prefillComposer: (sessionId, text) => {
        const conversation = ctx.conversation
        if (conversation === undefined) return { ok: false, reason: 'no-input' }
        try {
          const input = conversation.input as unknown as { shell(id: string): { setDraft(text: string): void } }
          input.shell(sessionId).setDraft(text)
          return { ok: true }
        } catch {
          return { ok: false, reason: 'no-input' }
        }
      },
      latestAssistantText: (sessionId) => {
        const binding = ctx.sessions.binding(sessionId as SessionId)
        if (binding === undefined) return ''
        try {
          const snapshot = binding.session.getSnapshot()
          const nodes = snapshot.chat.nodes.values().filter(node => node.kind === 'assistant-step')
          const last = nodes[nodes.length - 1]
          if (last === undefined) return ''
          const blocks = (last.data as { blocks?: readonly ({ kind?: string; text?: string } | undefined)[] }).blocks ?? []
          return blocks
            .filter((block): block is { text: string } => block?.kind === 'text'
              && typeof block.text === 'string' && block.text.trim() !== '')
            .map(block => block.text)
            .join('\n')
        } catch {
          return ''
        }
      },
    }
  }

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'obsidian-assistant',
    order: 100,
    locale: NS,
    store,
    inject: injected,
  }, SidebarTrigger))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'obsidian-assistant',
    order: 100,
    locale: NS,
    store,
    inject: injected,
  }, AssistantOverlay))
}
