# Running the Relay runner on a Mac mini

Setting up a dedicated always-on runner, so a closing laptop lid can't strand a run.

Companion doc: [`relay-missing-setup.md`](./relay-missing-setup.md) — the gap log for the
maintainer.

---

## Why bother

An `exclusive` run is pinned to the runner that claimed it, **by name**
(`runs.pinned_runner_name`), and keeps that pin through a `:runner_gone` park — the resume has
to come back to the machine holding that run's worktree (`relay:1385`).

So a sleeping laptop doesn't just pause work, it can strand it. Once a run parks
`:runner_gone` (`relay:1435`):

- the scheduler's resume targets `{:pinned, pinned_runner_id}` and finds no capacity
- `./relay retry` refuses with `{:runner_unavailable, name}`
- **the pin cannot be cleared in place** — cancel + move the card is the only way out, and that
  run's worktree state is lost

We hit the milder version of this on TO1: a 70-minute code-flow run failed with
`resume_refused_reason=pinned_runner_absent` after the laptop went absent for 30 minutes. The
retry worked only because the runner came back under the same name before it fully parked.

**Escape hatch worth memorizing:** while a run is still `:running`, `./relay own <ref>` then
`./relay release <ref>` clears the pin (`Runs.park_claimed/1` is the only writer that nils it),
so the run re-dispatches. Useless once parked.

## Prerequisites on the mini

Everything below is actually invoked by our three flows or by the runner itself — this list is
derived, not guessed:

| Need | Why |
|---|---|
| **`claude` CLI, authenticated** | Agent nodes run headless `claude -p --output-format stream-json` (`relay:2942`). Must be logged in — run `claude` once interactively to confirm. |
| **Node 22+ / npm** | `npm run verify` gate, `npm ci` in the prepare hook |
| **`python3`** | `./relay` is stdlib-only Python 3 |
| **`git`** | worktrees, rebases |
| **`gh`, authenticated** | the `merge` node runs `gh pr view` / `gh pr create` / `gh pr merge --squash --auto` |
| **`jq`** | the `branch` node pipes the card's plan through it |
| **Xcode Command Line Tools** | `better-sqlite3` is a native module; `electron-rebuild` needs a compiler |

Verify in one shot:

```bash
for b in claude node npm python3 git gh jq; do
  printf '%-8s %s\n' "$b" "$(command -v $b || echo MISSING)"
done
node --version            # want v22+
gh auth status
claude -p 'say ok'        # proves auth works headlessly
```

## 1. Clone and set the environment

```bash
mkdir -p ~/workspace && cd ~/workspace
git clone git@github.com:oliverswitzer/tomato.git
cd tomato
npm ci
```

Relay needs two variables in the shell the runner starts from. Put them in `~/.zprofile` (a
login shell reads it, which matters for the launchd setup below):

```bash
export RELAY_URL="https://relayboard.fly.dev"
export RELAY_API_KEY="relay_…"     # mint a NEW key; don't reuse the laptop's
```

Confirm: `./relay board` should print the Tomato board.

## 2. ⚠️ Give this machine a distinct runner name

**This is the one step that will silently break things if skipped.**

`.relay/runner.json` is tracked in git and currently pins `"name": "Oliver's 15 Inch MBP"`. Clone
it here and both machines answer to that same name. The runner source warns about exactly this:

> *"…`.relay/runner.json` is tracked in git, so a bare hostname written there hands every
> checkout on every machine the one shared identity RE305 exists to split apart."* — `relay:1429`

Two failures follow. The server upserts runners on `[board_id, name]`, so the machines clobber
each other's roster row; and a pin resolves to a *name*, not a machine, so a resume can be handed
to the host that doesn't have the worktree.

Until the `name` key is removed from the tracked config, **always pass `--name` on this machine**:

```bash
./relay start --name mac-mini
```

`--name` is per-invocation and deliberately not shareable — it's the sanctioned escape hatch.
The proper fix is to drop `name` from `.relay/runner.json` entirely, letting it default to
`<checkout-dir>@<short-host>` (`relay:1364`), which differs per machine on its own.

## 3. Copy the gitignored binaries

`bin/` is ignored in full, so the clone has none of it — and `bin/screenpipe` (~37MB) is the
**patched** build (PR #3073) that populates `app_name` / `window_title`. The npm fallback is
unpatched and degrades silently rather than failing, so a missing binary is easy to miss.

From the laptop:

```bash
scp bin/screenpipe mac-mini.local:~/workspace/tomato/bin/screenpipe
```

`.relay/prepare-worktree.sh` symlinks whatever is in `bin/` into each new worktree, so this only
has to be done once per machine.

## 4. Stop it sleeping

The entire point of the mini. Display can sleep; the machine cannot:

```bash
sudo pmset -a sleep 0 disksleep 0 displaysleep 10
sudo pmset -a womp 1          # wake on network
pmset -g | grep -E 'sleep|womp'
```

Also turn off **System Settings → Lock Screen → Require password** after a delay, or a locked
screen will block the GUI-dependent parts of §7.

## 5. Start on boot (launchd)

A **LaunchAgent**, not a LaunchDaemon — agents run inside your GUI login session, which the smoke
node needs (see §7). Enable automatic login in System Settings → Users & Groups so a reboot
lands in a session.

`~/Library/LaunchAgents/dev.relay.tomato.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>              <string>dev.relay.tomato</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>cd ~/workspace/tomato &amp;&amp; exec ./relay start --name mac-mini</string>
  </array>
  <key>RunAtLoad</key>          <true/>
  <key>KeepAlive</key>          <true/>
  <key>StandardOutPath</key>    <string>/tmp/relay-runner.log</string>
  <key>StandardErrorPath</key>  <string>/tmp/relay-runner.err</string>
</dict>
</plist>
```

`zsh -lc` is deliberate: a login shell picks up `RELAY_URL` / `RELAY_API_KEY` from `~/.zprofile`,
so the key never goes in the plist. Load it:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/dev.relay.tomato.plist
launchctl print gui/$(id -u)/dev.relay.tomato | head -20
tail -f /tmp/relay-runner.log
```

`KeepAlive` restarts it if it dies. Note `relay start` also self-updates
(`auto_update: true`, min interval 300s), re-execing at a job boundary.

To stop or reload:

```bash
launchctl bootout gui/$(id -u)/dev.relay.tomato
```

## 6. Verify

```bash
./relay start --dry-run --name mac-mini    # says what it would claim, claims nothing
./relay runners                            # both machines, capacity, jobs held
```

You want `freshness: fresh`, `outdated: False`, `rate_limit: None`, and **two distinct names**.
Same name twice means §2 was skipped.

## 7. Caveats specific to a headless-ish mini

**The smoke node needs a real GUI session.** Our `smoke-tester` drives the built Electron app
through Playwright's `_electron.launch()`, and the app needs Screen Recording + Accessibility
(TCC) to run `screenpipe`. TCC prompts cannot be answered over SSH. So:

- grant both permissions once, sitting at the mini (or over Screen Sharing), by launching the app
  manually — `tccutil reset ScreenCapture com.tomato.pomodoro` resets if needed
- keep the machine logged in (auto-login, no screen lock)
- the agent is written to return `blocked` rather than a false pass when permissions are absent,
  so a misconfigured mini reports honestly instead of laundering a green

**Capacity can't differ per machine.** `relay start` has a `--name` flag and no capacity flag, so
both hosts read the same tracked `capacity` (`exclusive: 2, shared_clean: 3`). You can't say "mini
takes the exclusive work, laptop takes none" without untracking `.relay/runner.json`. Practical
answer for now: just don't run `relay start` on the laptop.

**Claude usage is one shared quota.** `limits` (0.95 of the five-hour and seven-day windows) is
evaluated per runner, but both machines draw down the same account. Two runners at full tilt will
hit the ceiling roughly twice as fast, and each will independently show **RATE LIMITED** and
resume on its own at the window reset.

## Running both machines at once

Legitimate once §2 is done — it's a fleet by design. Both long-poll and claim; capacity is a
fleet union; first to claim wins. `shared_clean` work lands on either. An `exclusive` run pins to
whichever claimed it and stays there, which is what you want.

The judgment call is just the laptop: anything exclusive it claims is pinned to it, and you will
close the lid mid-run. Either leave `relay start` off there, or start it only while parked at a
desk and stop it before you leave.
