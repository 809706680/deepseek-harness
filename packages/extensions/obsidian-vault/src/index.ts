/**
 * Obsidian work-assistant host service: indexes an Obsidian vault folder and
 * answers retrieval / tasks / stats / draft-write requests over the Typert
 * Remote boundary. Read-only except the guarded drafts directory.
 * @module @deepseek-ai/dsh-obsidian-vault
 */
import { watch } from 'node:fs'
import { isAbsolute } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type {
  DraftSaveResult, IndexIssue, ListTasksRequest, NoteDocument, ReadNoteRequest,
  SaveDraftRequest, SearchRequest, SearchResponse, TaskListResponse, VaultStats, VaultStatus,
} from './types.ts'
import type { ParsedNote } from './vault/scanner.ts'
import { scanVault } from './vault/scanner.ts'
import { RetrievalIndex } from './vault/retrieval.ts'
import { collectTasks } from './vault/tasks.ts'
import { computeStats } from './vault/stats.ts'
import { saveDraft } from './vault/drafts.ts'

export type * from './types.ts'
export { sanitizeTitle, saveDraft } from './vault/drafts.ts'
export { RetrievalIndex, gramsOf, normalize } from './vault/retrieval.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Obsidian vault service (Remote namespace `obsidian`). */
    obsidian: ObsidianService
  }
}

/** User-editable configuration of the vault service. */
export interface ObsidianConfig {
  /** Absolute vault folder path; empty means unconfigured. */
  readonly vaultPath: string
  /** Drafts directory name inside the vault. */
  readonly draftsFolder: string
  /** Retrieval hit cap. */
  readonly maxResults: number
  /** Snippet window size in characters. */
  readonly contextChars: number
}

/** Settings schema and defaults. */
export const obsidianSettingsSchema = z.object({
  vaultPath: z.string().default(''),
  draftsFolder: z.string().default('Drafts'),
  maxResults: z.number().default(8),
  contextChars: z.number().default(600),
}) as unknown as z<ObsidianConfig>

/** Debounce window for filesystem-triggered rescans. */
const RESCAN_DEBOUNCE_MS = 500

/** In-memory vault snapshot shared by the service methods. */
class VaultIndex {
  notes: ParsedNote[] = []
  issues: IndexIssue[] = []
  lastScanAt: number | undefined
  readonly retrieval = new RetrievalIndex()

  rescan(vaultPath: string): { ok: boolean; error?: string } {
    const { notes, issues } = scanVault(vaultPath)
    this.notes = notes
    this.issues = issues
    this.retrieval.rebuild(notes)
    this.lastScanAt = Date.now()
    return { ok: true }
  }
}

/**
 * The vault service plugin. Mounted as a host-plane row; the loader resolves
 * `settings` before construction, and user configuration arrives through the
 * `obsidian` settings namespace (live-applied).
 */
export class ObsidianService extends TypertRemoteService {
  static inject = ['settings']

  static Config = z.object({})

  private readonly index = new VaultIndex()
  private config: ObsidianConfig
  private scanTimer: ReturnType<typeof setTimeout> | undefined
  private watcher: ReturnType<typeof watch> | undefined

  constructor(ctx: Context, _config: Record<string, never> = {}) {
    super(ctx, 'obsidian')
    this.config = {
      vaultPath: '',
      draftsFolder: 'Drafts',
      maxResults: 8,
      contextChars: 600,
    }
    const scope = ctx.settings.register(settingsNamespace('obsidian'), obsidianSettingsSchema, {
      applies: 'live',
      validate: (value) => {
        if (value.vaultPath !== '' && !isAbsolute(value.vaultPath)) {
          throw new TypeError('obsidian vaultPath must be an absolute path')
        }
      },
    })
    this.applyConfig(scope.get())
    scope.watch(next => this.applyConfig(next))
    this.rescanSoon()
    ctx.get('commands')?.register({
      name: 'assistant',
      description: '打开 Obsidian 工作助手',
      handler: () => ({
        kind: 'success' as const,
        text: '工作助手已打开：请在侧栏点击「工作助手」按钮，或打开助手面板后选择「问答」分区。',
      }),
    })
  }

  private applyConfig(next: ObsidianConfig): void {
    const changedVault = next.vaultPath !== this.config.vaultPath
    this.config = { ...next }
    if (changedVault) {
      this.watcher?.close()
      this.watcher = undefined
      if (next.vaultPath !== '') {
        try {
          this.watcher = watch(next.vaultPath, { recursive: true }, () => this.rescanSoon())
        } catch {
          this.watcher = undefined
        }
      }
      this.index.notes = []
      this.index.issues = []
      this.index.lastScanAt = undefined
    }
  }

  private rescanSoon(): void {
    if (this.scanTimer !== undefined) clearTimeout(this.scanTimer)
    this.scanTimer = setTimeout(() => {
      this.scanTimer = undefined
      void this.scan()
    }, RESCAN_DEBOUNCE_MS)
  }

  private async scan(): Promise<void> {
    if (this.config.vaultPath === '') return
    try {
      this.index.rescan(this.config.vaultPath)
    } catch (error) {
      this.index.issues = [{
        path: this.config.vaultPath,
        reason: error instanceof Error ? error.message : String(error),
      }]
    }
  }

  private status(): VaultStatus {
    const configured = this.config.vaultPath !== ''
    const ready = configured && this.index.lastScanAt !== undefined
    return {
      configured,
      ready,
      ...configured ? { vaultPath: this.config.vaultPath } : {},
      noteCount: ready ? this.index.notes.length : 0,
      ...this.index.lastScanAt === undefined ? {} : { lastScanAt: this.index.lastScanAt },
      ...!configured ? { error: '未配置知识库路径：请在 设置 → 插件 → Obsidian 中填写 vaultPath' } : {},
    }
  }

  /** Current service status. */
  @Remote('status')
  statusForClient(): VaultStatus {
    return this.status()
  }

  /** Force a rescan and return the fresh status. */
  @Remote('refresh')
  refreshForClient(): VaultStatus {
    void this.scan()
    return this.status()
  }

  /** Retrieve notes matching a query. */
  @Remote('search')
  searchForClient(request: SearchRequest, signal: AbortSignal): SearchResponse {
    signal.throwIfAborted()
    this.requireReady()
    const limit = Math.min(Math.max(1, request.limit ?? this.config.maxResults), 50)
    const hits = this.index.retrieval.search(request.query, limit, this.config.contextChars)
    return { hits, truncated: hits.length > limit }
  }

  /** Read one note in full. */
  @Remote('readNote')
  readNoteForClient(request: ReadNoteRequest, signal: AbortSignal): NoteDocument {
    signal.throwIfAborted()
    this.requireReady()
    const note = this.index.notes.find(candidate => candidate.path === request.path)
    if (note === undefined) throw new Error('note-not-found: ' + request.path)
    return {
      path: note.path,
      title: note.title,
      tags: note.tags,
      aliases: note.aliases,
      frontmatter: note.frontmatter as Readonly<Record<string, import('./types.ts').FrontmatterValue>>,
      content: note.content,
      mtime: note.mtime,
    }
  }

  /** List checkbox tasks across the vault. */
  @Remote('listTasks')
  listTasksForClient(request: ListTasksRequest, signal: AbortSignal): TaskListResponse {
    signal.throwIfAborted()
    this.requireReady()
    return { items: collectTasks(this.index.notes, request.includeDone ?? false) }
  }

  /** Dashboard statistics. */
  @Remote('stats')
  statsForClient(): VaultStats {
    this.requireReady()
    return computeStats(this.index.notes, this.index.issues, this.index.lastScanAt)
  }

  /** Write a draft note under the drafts folder (guarded). */
  @Remote('saveDraft')
  saveDraftForClient(request: SaveDraftRequest, signal: AbortSignal): DraftSaveResult {
    signal.throwIfAborted()
    this.requireReady()
    return saveDraft(this.config.vaultPath, this.config.draftsFolder, request.title, request.content)
  }

  private requireReady(): void {
    if (!this.status().ready) {
      const error = this.status().error ?? '知识库尚未就绪'
      throw new Error('obsidian-not-ready: ' + error)
    }
  }
}

export default ObsidianService
