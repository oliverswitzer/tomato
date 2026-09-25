# Relay — missing setup steps

Running log of things we had to do **by hand** after `/relay-setup` + `/relay-onboard`, that
Relay itself never set up. For the maintainer.

Context: fresh board (`Tomato`), `relayboard.fly.dev`, scaffold `5db10acff0b0`, runner v69.
Line refs are into the served `./relay`.

---

## 1. `.gitignore` entries — Relay never writes them, but depends on them

Relay writes `.gitignore` nowhere (grep of the whole runner: every hit is a comment *about*
gitignore semantics, never a write). Two entries had to be added by hand:

| Entry | Why |
|---|---|
| `.claude/worktrees` | `WORKTREES_DIR = <root>/.claude/worktrees` (`relay:1544`) puts linked worktrees inside the main working tree, where git shows them untracked |
| `/tmp/` | **Correctness, not hygiene** — see below |

`/tmp/` is the serious one. Relay's own docstrings assume it:

> "Safe inside the checkout: `.gitignore`'s `/tmp/` hides it from `git status --porcelain` (so
> `reset_worktree`'s salvage never stashes it) and from `git clean -fd` (so it survives a
> reset…)" — `relay:1667`, repeated at `relay:1686`

`plan_path` = `<slot>/tmp/<REF>/plan.md` (`relay:1676`) **is `$RELAY_PLAN`** — the branch
contract `plan-implementer` reads. Without `/tmp/` ignored, `reset_worktree` (`relay:1629`):

1. `git status --porcelain` → sees `tmp/<REF>/plan.md`, calls the tree dirty
2. `git stash push -u` → `-u` includes untracked, so **the plan is stashed away**
3. `git clean -fdq` → `-fd` spares ignored files, deletes unignored untracked ones

Net: the plan file is swept on every worktree reset — the opposite of the docstring's
guarantee. Surfaces as a resumed/retried card failing on a missing `$RELAY_PLAN`, far from the
cause.

Hit on **two** projects independently (browser-stickies carries `.claude/worktrees` at line 8;
neither repo had `/tmp/`).

**Suggested fix:** scaffold-managed ignore block, or a `/relay-doctor` check for both entries.

## 2. `.relay/runner.json` — nothing creates it

`load_runner_config()` returns defaults on `FileNotFoundError` (`relay:1505`); no code path
writes the file. `/relay-onboard` Phase 3 says to author it, but that's a skill instruction,
not an installer — and it's explicitly *not* part of the scaffold floor.

Worth noting the only non-default field is `limits` (defaults to `{}` = no cap). Every other
field in the browser-stickies copy we compared against was byte-identical to the built-in
defaults, i.e. a no-op file.

**Suggested fix:** `./relay update` could write a minimal one when absent, or `relay start`
could on first run.

## 3. `.relay/prepare-worktree.sh` — no template

Written from scratch (adapted from another project's). Needed because a fresh worktree has none
of the gitignored assets the gate depends on — here `node_modules/` and a 37MB `bin/screenpipe`.
Nothing in the scaffold hints at the hook's existence, argv/env contract, or the
"nonzero exit fails the run" rule; all of it is only in `relay.md` prose and the default path
constant (`PREPARE_HOOK_DEFAULT`, `relay:1732`).

**Suggested fix:** ship a commented no-op template at the default path.

## 4. A fresh board's default flows are 100% unresolvable

The three flows shipped on a new board name artifacts the scaffold doesn't install:

| Flow | Names | Ships? |
|---|---|---|
| `code` (21 nodes) | 9 agents (`plan-implementer`, `spec-reviewer`, `quality-reviewer`, `final-reviewer`, `final-fixer`, `rebaser`, `smoke-tester`, `acceptance-tester`, `ci-fixer`) | ✗ none |
| `spec` (1 node) | `/brainstorm` skill | ✗ |
| `plan` (1 node) | `/write-plan` command | ✗ |

Baseline doctor on an untouched new board + repo: **14 errors**. Even the single-node `spec` and
`plan` flows are broken out of the box.

ADR 0010 making every agent the repo's own is understandable, but the result is that the
shipped defaults can never resolve as shipped, and `/relay-onboard`'s "seed" path means
"author 9 agents yourself" with no starting point.

**Suggested fix:** ship a minimal reference set (even stubs) alongside the default flows, or
have the default flows reference nothing that isn't installed.

## 5. The default `code` flow is Elixir-specific

A brand-new board's `code` flow gates on `mix precommit` and `mix test.browser`, and has a
`deploy` node running `bin/await_deploy.sh`. On any non-Elixir project these are immediate
errors. It reads as the Relay project's own flow shipped as the generic default.

**Suggested fix:** language-neutral default gates, or ask for the verify command at board
creation the way `/relay-onboard` Phase 3 already does.

## 6. Minor

- **Deprecated `prepare` key is silently accepted.** `relay.md` documents
  `"worktrees": {"prepare": …}`; the flat top-level `"prepare"` still works with no warning.
  Nothing tells you which form you're on.
- **`/relay-setup` says a restart is required** before the four new skills resolve. In practice
  they registered mid-session without one.

---

## Not Relay's fault (project-side, logged for completeness)

- `playwright` added as a devDependency — needed by our Electron `smoke-tester`, purely our
  choice of smoke strategy.
