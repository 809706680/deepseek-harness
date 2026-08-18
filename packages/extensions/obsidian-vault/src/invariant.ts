/**
 * Invariant companions for the obsidian vault package.
 * @module @deepseek-ai/dsh-obsidian-vault/invariant
 */
import { join, sep } from 'node:path'

/**
 * A draft title must survive path sanitization without becoming empty and
 * must not escape the drafts folder once composed into a relative path.
 * @param title - raw user-supplied draft title.
 */
export function assertDraftTitle(title: string): void {
  if (title.trim() === '') throw new TypeError('draft title must not be empty')
  if (title.includes('/') || title.includes('\\')) {
    throw new TypeError('draft title must not contain path separators')
  }
  if (/[\u0000-\u001f\u007f]/.test(title)) {
    throw new TypeError('draft title must not contain control characters')
  }
}

/**
 * A resolved draft path must stay inside the vault drafts directory.
 * @param vaultPath - absolute vault root.
 * @param draftsFolder - configured drafts folder name (relative).
 * @param resolved - the composed absolute target path.
 */
export function assertDraftInsideVault(vaultPath: string, draftsFolder: string, resolved: string): void {
  const root = join(vaultPath, draftsFolder)
  if (!resolved.startsWith(root + sep) && resolved !== root) {
    throw new TypeError('draft path escapes the vault drafts directory')
  }
}
