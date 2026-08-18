/**
 * Vault scanning and note parsing: recursive *.md discovery, frontmatter
 * parsing, and per-file read/parse failure collection for the index-health
 * surface. Pure filesystem code with no service dependencies.
 */
import { readdirSync, readFileSync, statSync, type Dirent } from 'node:fs'
import { join, relative } from 'node:path'
import { load as parseYaml } from 'js-yaml'

/** Directories skipped during the walk. */
const SKIPPED_DIRS = new Set(['.obsidian', '.trash', '.git', '.hg', '.svn'])

/** Frontmatter block at the head of a markdown file. */
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

/** Daily-note date embedded in a path (YYYY-MM-DD or YYYY/MM/DD). */
export const DAILY_PATTERN = /(\d{4})[/-](\d{2})[/-](\d{2})/

/** One parsed note. */
export interface ParsedNote {
  /** Vault-relative path with forward slashes. */
  readonly path: string
  readonly title: string
  readonly tags: readonly string[]
  readonly aliases: readonly string[]
  readonly frontmatter: Readonly<Record<string, unknown>>
  /** Body text without the frontmatter block. */
  readonly content: string
  readonly mtime: number
}

/** One unreadable or unparseable file. */
export interface ScanIssue {
  readonly path: string
  readonly reason: string
}

/** Recursively list markdown files under a vault root. */
export function listMarkdownFiles(vaultPath: string, out: string[] = []): string[] {
  let entries: Dirent<string>[]
  try {
    entries = readdirSync(vaultPath, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) listMarkdownFiles(join(vaultPath, entry.name), out)
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      out.push(join(vaultPath, entry.name))
    }
  }
  return out
}

/** Normalize an absolute path to a vault-relative forward-slash path. */
export function relativePath(vaultPath: string, absPath: string): string {
  return relative(vaultPath, absPath).split('\\').join('/')
}

/** Extract frontmatter tags (array, comma/space string, or #tag list). */
export function collectTags(frontmatter: Readonly<Record<string, unknown>>): readonly string[] {
  return collectList(frontmatter.tags)
}

/** Extract frontmatter aliases (array or comma/space string). */
export function collectAliases(frontmatter: Readonly<Record<string, unknown>>): readonly string[] {
  return collectList(frontmatter.aliases)
}

function collectList(value: unknown): readonly string[] {
  if (Array.isArray(value)) return value.map(String).map(trimTag).filter(s => s !== '')
  if (typeof value === 'string') {
    return value.split(/[\s,]+/).map(trimTag).filter(s => s !== '')
  }
  return []
}

function trimTag(value: string): string {
  return value.trim().replace(/^#/, '')
}

/** Title: frontmatter title, else the file basename. */
export function titleOf(path: string, frontmatter: Readonly<Record<string, unknown>>): string {
  const fm = frontmatter.title
  if (typeof fm === 'string' && fm.trim() !== '') return fm.trim()
  const base = path.split('/').pop() ?? path
  return base.replace(/\.md$/i, '')
}

/**
 * Parse one markdown file into a note. Read or YAML failures are returned as
 * an issue instead of thrown, so one bad file never fails the whole scan.
 */
export function parseNoteFile(vaultPath: string, absPath: string): { note?: ParsedNote; issue?: ScanIssue } {
  const path = relativePath(vaultPath, absPath)
  let raw: string
  try {
    raw = readFileSync(absPath, 'utf8')
  } catch (error) {
    return { issue: { path, reason: error instanceof Error ? error.message : String(error) } }
  }
  let mtime: number
  try {
    mtime = statSync(absPath).mtimeMs
  } catch {
    mtime = 0
  }
  const match = FRONTMATTER_RE.exec(raw)
  let frontmatter: Readonly<Record<string, unknown>> = {}
  let content = raw
  if (match !== null) {
    content = raw.slice(match[0].length)
    try {
      const parsed = parseYaml(match[1] ?? '')
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        frontmatter = parsed as Record<string, unknown>
      }
    } catch (error) {
      return {
        note: {
          path, title: titleOf(path, {}), tags: [], aliases: [],
          frontmatter: {}, content, mtime,
        },
        issue: { path, reason: 'frontmatter: ' + (error instanceof Error ? error.message : String(error)) },
      }
    }
  }
  return {
    note: {
      path, title: titleOf(path, frontmatter), tags: collectTags(frontmatter),
      aliases: collectAliases(frontmatter), frontmatter, content, mtime,
    },
  }
}

/** Perform a full scan of a vault root. */
export function scanVault(vaultPath: string): { notes: ParsedNote[]; issues: ScanIssue[] } {
  const notes: ParsedNote[] = []
  const issues: ScanIssue[] = []
  for (const abs of listMarkdownFiles(vaultPath)) {
    const { note, issue } = parseNoteFile(vaultPath, abs)
    if (note !== undefined) notes.push(note)
    if (issue !== undefined) issues.push(issue)
  }
  return { notes, issues }
}
