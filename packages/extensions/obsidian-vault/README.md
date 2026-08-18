# @deepseek-ai/dsh-obsidian-vault

Host-side service for the Obsidian work assistant: indexes an Obsidian vault
folder (read-only except an explicitly guarded drafts directory), answers
retrieval, task, stats, and draft-write requests over the Typert Remote
boundary, and registers the `obsidian` settings namespace.

## Install

This package is a profile bundle: `dsh plugin --profile web add <this package>`
auto-joins `dsh.profile.bundles` and inserts both rows (the `obsidian-vault`
host service and the `obsidian-assistant` browser client) via
`cordis.patch.yml`.

## Settings (`obsidian` namespace)

- `vaultPath` — absolute path to the Obsidian vault folder (empty = unconfigured).
- `draftsFolder` — drafts directory name inside the vault (default `Drafts`).
- `maxResults` — retrieval hit cap (default 8).
- `contextChars` — snippet window size (default 600).

## Remote API

`ctx.obsidian` (`remote.obsidian`): `status`, `refresh`, `search`,
`readNote`, `listTasks`, `stats`, `saveDraft`.

## Known Limitations and Deferred Work

- Retrieval uses character unigram/bigram presence with idf weighting — no
  tokenizer, no vector embeddings; quality is acceptable for personal vaults
  but not semantic search. Note bodies beyond 6000 chars are not gram-indexed.
- The index lives in host-process memory; a vault change triggers a debounced
  rescan, and `refresh()` forces one.
- Drafts are the only write surface; vault files are otherwise read-only.
