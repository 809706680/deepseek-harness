/**
 * Obsidian work-assistant plugin, node half. The host behavior lives in
 * @deepseek-ai/dsh-obsidian-vault; this half exists so the package mounts as
 * a loader row whose dsh.client declaration feeds the browser bundle.
 */
export const inject = [] as const

/** Node half is a no-op placeholder. */
export function apply(): void {}
