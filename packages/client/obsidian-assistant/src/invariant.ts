/**
 * Invariant companions for the obsidian assistant client package.
 * @module @deepseek-ai/dsh-client-obsidian-assistant/invariant
 */

/**
 * A prompt sent into a session must not be empty after trimming.
 * @param text - the composed prompt text.
 */
export function assertPromptNonEmpty(text: string): void {
  if (text.trim() === '') throw new TypeError('assistant prompt must not be empty')
}
