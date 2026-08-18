# @deepseek-ai/dsh-client-obsidian-assistant

Browser half of the Obsidian work assistant: the sidebar trigger button and
the full-frame assistant panel (dashboard / search / Q&A / tasks / writing)
in the DeepSeek Harness Web GUI. Mounts its own `obsidian` Remote namespace
from @deepseek-ai/dsh-obsidian-vault, so no api-remotes assembly edit is
needed — the package works on any DSH install that carries the web surface.

## Surfaces

- `sidebar.footer.action` — the trigger button (opens the overlay panel).
- `shell.overlay` — the full-frame assistant panel.

## Data flow

All vault data arrives through `ctx.remote.obsidian.*` (self-mounted via
`ctx.remote.$mount`). Q&A and writing send prompts into the current session
via `SessionFace.prompt`, so answers stream in the conversation using the
session's own model configuration.

## Known Limitations and Deferred Work

- The panel is root-scoped: Q&A/writing require an open session.
- The latest-answer summary is a best-effort read of the last assistant step.
- Chinese retrieval quality depends on the host retrieval index (bigram idf).
