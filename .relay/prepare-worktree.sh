#!/usr/bin/env bash
#
# Relay prepare-worktree hook — tomato
#
# Warms a freshly created or re-baselined per-card worktree so the Code flow's
# verify gate (`npm run verify`) does not pay a cold start. Relay calls this with
# cwd set to the worktree, and inputs as BOTH argv and env:
#
#   $1/$RELAY_WORKTREE  absolute path to the worktree
#   $2/$RELAY_REF       card ref (e.g. TO-12)
#   $3/$RELAY_BRANCH    branch name
#   $4/$RELAY_BASE      base ref (e.g. origin/main)
#   $5/$RELAY_CACHE_DIR shared cache dir ("" when runner.json sets no cache_dir)
#
# A NONZERO EXIT FAILS THE RUN. So only hard-fail on a worktree that genuinely
# cannot build; degrade to a warning for anything the gate could still survive.
# Must be idempotent — it runs again on every re-baseline.
#
# What this repo needs that git does not carry:
#   node_modules/   gitignored -> npm ci (skipped when the lockfile is unchanged)
#   bin/            ENTIRELY gitignored (see .gitignore) -> the patched screenpipe
#                   binary is ~37MB and the app cannot record without it. Resolved
#                   to ONE shared copy symlinked from the main checkout; see §2.
#   .envrc          gitignored -> symlink so direnv works if a human cds in
#
# Deliberately NOT done here:
#   `npm run build`   — the smoke node rebuilds before it drives, so prebuilding
#                       only risks serving a stale bundle.
#   `electron-rebuild` — `npm run verify` is tsc + vitest, and the suite injects a
#                       mock SqliteDatabase, so it never loads better-sqlite3's
#                       native binding. Only the smoke node needs the Electron ABI,
#                       and smoke-tester.md runs `npx electron-rebuild` itself.
#                       Doing it here would rebuild for Electron (ABI 145) and
#                       leave vitest (ABI 137) broken if anything ever did load it.

set -euo pipefail

WORKTREE="${RELAY_WORKTREE:-${1:-$PWD}}"
REF="${RELAY_REF:-${2:-?}}"
CACHE_DIR="${RELAY_CACHE_DIR:-${5:-}}"
[ -n "$CACHE_DIR" ] || CACHE_DIR="$HOME/.cache/tomato-relay"

# The main checkout — this script lives at <main>/.relay/prepare-worktree.sh and is
# invoked by absolute path, so its own location is the only reliable handle on it.
MAIN_REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() { printf '[prepare %s] %s\n' "$REF" "$*" >&2; }
die() { log "FATAL: $*"; exit 1; }

cd "$WORKTREE" || die "worktree $WORKTREE is not a directory"

# ---------------------------------------------------------------------------
# 1. Dependencies — npm ci, skipped when the lockfile matches what is installed.
# ---------------------------------------------------------------------------

lock_hash() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 package-lock.json | cut -d' ' -f1
  else sha256sum package-lock.json | cut -d' ' -f1; fi
}

STAMP="node_modules/.relay-deps-stamp"
if [ ! -f package-lock.json ]; then
  die "no package-lock.json in the worktree — npm ci cannot run"
fi

WANT="$(lock_hash)"
HAVE="$(cat "$STAMP" 2>/dev/null || true)"

if [ "$WANT" = "$HAVE" ]; then
  log "deps up to date (lockfile unchanged)"
else
  # Share npm's content-addressed cache across worktrees so this is a link-and-unpack,
  # not a re-download. npm's cache is safe under concurrent readers/writers.
  export npm_config_cache="$CACHE_DIR/npm"
  mkdir -p "$npm_config_cache"
  log "npm ci (shared cache: $npm_config_cache)"
  # postinstall runs scripts/patch-electron-name.sh, which is part of a correct install.
  npm ci --no-audit --no-fund >&2 || die "npm ci failed — worktree cannot build"
  printf '%s\n' "$WANT" > "$STAMP"
fi

# ---------------------------------------------------------------------------
# 2. Bundled binaries — the expensive bit (screenpipe alone is ~37MB), shared,
#    never per-card.
#
# `bin/` is gitignored in its entirety, so a fresh worktree has NO binaries at
# all. Per CLAUDE.md the app resolves screenpipe as:
#   SCREENPIPE_BIN env -> Contents/Resources/screenpipe -> bin/screenpipe -> npm pkg
# The npm fallback is the UNPATCHED binary, which silently drops app_name and
# window_title from text events — the exact data the timeline is built from. So a
# worktree missing bin/screenpipe does not fail loudly, it degrades quietly. Link
# it rather than letting the fallback happen.
#
# Symlink each file individually rather than the directory: a future tracked file
# under bin/ would collide with a directory symlink.
# ---------------------------------------------------------------------------

if [ -d "$MAIN_REPO/bin" ]; then
  mkdir -p bin
  linked=0
  for src in "$MAIN_REPO"/bin/*; do
    [ -e "$src" ] || continue          # no matches -> the glob itself
    name="$(basename "$src")"
    if [ -L "bin/$name" ]; then
      ln -sfn "$src" "bin/$name"       # re-point if the main checkout moved
      linked=$((linked+1))
    elif [ -e "bin/$name" ]; then
      log "WARNING: bin/$name exists and is not a symlink — leaving it alone"
    else
      ln -s "$src" "bin/$name"
      linked=$((linked+1))
    fi
  done
  if [ "$linked" -gt 0 ]; then
    log "linked $linked binaries from $MAIN_REPO/bin"
  fi
  if [ ! -e bin/screenpipe ]; then
    # Not fatal: a card touching only renderer code needs no recorder, and the
    # smoke node reports its own honest `blocked` if it actually needs one.
    log "WARNING: no bin/screenpipe — capture will fall back to the UNPATCHED npm binary"
  fi
else
  log "WARNING: $MAIN_REPO/bin does not exist — no binaries to share"
fi

# ---------------------------------------------------------------------------
# 3. Local env — gitignored, so the worktree has no copy. Convenience only.
# ---------------------------------------------------------------------------

if [ -f "$MAIN_REPO/.envrc" ] && [ ! -e .envrc ]; then
  ln -s "$MAIN_REPO/.envrc" .envrc
  log "linked .envrc"
fi

log "worktree ready"
