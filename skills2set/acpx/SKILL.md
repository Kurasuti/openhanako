---
name: acpx
description: Run ACP agents with acpx in reliable headless mode, with stable session/cwd handling and prompt-first workflow for custom slash commands.
---

# acpx

## When to use this skill

Use this skill when you need to run coding agents through `acpx` from scripts or app backends, especially when you need:

- persistent sessions by repo/cwd
- named parallel sessions (`-s/--session`)
- predictable non-interactive behavior
- machine-readable or quiet output

## Core rules (best practice)

1. Prefer `prompt` mode + named session for multi-turn work.
2. For project custom commands (for example `/start`), always ensure cwd is the project root where `.claude` (or other agent config) exists.
3. In headless environments, prefer `--approve-reads` by default; escalate to `--approve-all` only when needed.
4. Use `exec` only for one-shot tasks that do not depend on session memory or project custom commands.

## Install

```bash
npm i -g acpx
```

For normal session reuse, prefer a global install over `npx`.


## Recommended command patterns

### Persistent session (recommended)

```bash
acpx --cwd <project-root> claude -s <session-name> "<prompt>"
```

Explicit prompt form:

```bash
acpx --cwd <project-root> claude -s <session-name> prompt "<prompt>"
```

### Ensure session exists before prompt

```bash
acpx --cwd <project-root> claude sessions ensure --name <session-name>
acpx --cwd <project-root> claude -s <session-name> "<prompt>"
```

### One-shot execution

```bash
acpx --cwd <project-root> codex exec "<prompt>"
```

## Non-interactive reliability

Use one permission mode (mutually exclusive):

- `--approve-reads` (recommended default): auto-approve read/search, prompt or fail on writes
- `--approve-all`: auto-approve all operations
- `--deny-all`: deny all operations

For automated pipelines:

```bash
acpx --format json --approve-reads --cwd <project-root> codex exec "<prompt>"
```

## Session and cwd behavior

- Session scope is tied to agent + absolute cwd + optional session name.
- Changing `--cwd` changes the session scope.
- If custom project commands are not recognized, first verify cwd.

## Troubleshooting checklist

1. `NO_SESSION` / session not found:
   - run `acpx <agent> sessions ensure --name <name>` in the same cwd.
2. Custom slash command not recognized:
   - verify `--cwd` points to the repo containing command definitions.
3. Headless runtime/internal tool errors:
   - retry with `--approve-reads` or `--approve-all`.
   - switch from `exec` to sessioned `prompt`.
4. Need deterministic parsing:
   - use `--format json` and parse NDJSON events.

## Minimal workflow template

```bash
# 1) ensure scoped session
acpx --cwd <repo> --approve-reads claude sessions ensure --name work

# 2) run persistent prompt
acpx --cwd <repo> --approve-reads claude -s work "<task>"
```

