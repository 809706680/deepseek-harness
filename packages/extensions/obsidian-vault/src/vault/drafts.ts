/**
 * Draft writing: the only write surface of the vault service. Paths are
 * sanitized and guarded so a draft can never escape the drafts folder.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { assertDraftInsideVault, assertDraftTitle } from '../invariant.ts'
import type { DraftSaveResult } from '../types.ts'

/** Characters that are illegal in Windows file names (plus path separators). */
const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f\u007f]/g

/** Characters trimmed from the ends of a sanitized title. */
const TRIM = /^[\s.]+|[\s.]+$/g

/** Sanitize a draft title into a safe file basename (without extension). */
export function sanitizeTitle(title: string): string {
  return title.replace(ILLEGAL, ' ').replace(/\s+/g, ' ').trim().replace(TRIM, '').slice(0, 120)
}

/**
 * Write a draft note under vaultPath/draftsFolder. Refuses empty or
 * path-escaped titles and refuses overwrites (existing names get a
 * -<unix-seconds> suffix). Creates the drafts folder when missing.
 */
export function saveDraft(vaultPath: string, draftsFolder: string, title: string, content: string): DraftSaveResult {
  assertDraftTitle(title)
  const sanitized = sanitizeTitle(title)
  if (sanitized === '') throw new TypeError('draft title is empty after sanitization')
  const folder = resolve(vaultPath, draftsFolder)
  if (!folder.startsWith(resolve(vaultPath) + '\\') && folder !== resolve(vaultPath)) {
    throw new TypeError('drafts folder escapes the vault')
  }
  mkdirSync(folder, { recursive: true })
  let candidate = join(folder, sanitized + '.md')
  if (existsSync(candidate)) {
    candidate = join(folder, sanitized + '-' + Math.floor(Date.now() / 1000) + '.md')
  }
  assertDraftInsideVault(vaultPath, draftsFolder, candidate)
  writeFileSync(candidate, content, 'utf8')
  return { path: candidate }
}
