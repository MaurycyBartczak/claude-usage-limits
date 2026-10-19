# usage-limits

**English** · [Polski](README.pl.md)

A Claude Code mod: a band above the prompt showing how much of your 5-hour session limit and weekly limit is used, with a token burn chart.

```
5h limit ━━━━━━━━━━━╸──────────────   43% resets in 2h 13m   Weekly   ━━━━━─────────────────────   18% resets in 3d 4h
Burn     ▁▂▅▃█▂▁▄▆⠹  last 8.1k tok · avg 5.3k · at this pace 100% in ~1h 40m · cost $1.23
```

- Bars colored by threshold: green below 50%, yellow below 75%, orange below 90%, red above.
- Animations: smooth fill, a shimmer sweep, a pulse above 90%.
- A chart of tokens spent per turn (subagents included), animated while the model works.
- A forecast of when the 5-hour limit reaches 100% at the current pace.
- Live updates: the reading is taken after every request of a turn and shared between sessions; while Claude works, a faint `╍` segment and `~72%` show the estimated use until the next reading (learned from your own readings, so only an estimate).
- The session cost in $ (API-price equivalent).
- Notifications when a limit crosses 50%, 75% and 90%, and when it resets.
- A sound at 90% (Windows: PowerShell, macOS: afplay).
- A `usage_limits` tool for the agent: Claude can check your limits itself when you ask about them or before heavy work.

## History across sessions and /limity

The mod keeps usage in its own store, summed over every session:

- The burn chart and the 5-hour forecast carry on in a new session instead of starting empty, and the band shows today's tokens.
- `/limity` opens (and a second `/limity` hides) a pane with the last 14 days:

```
Last 14 days
Sun 18.10 ━━━━━━━━━━━━━━━━━━━━──────────  120k 5h  80% 7d  30% $3.50
Mon 19.10 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  412k 5h  87% 7d  34% $7.11
7 days: 532k tok · avg 266k/active day · $10.61
```

Each day shows the tokens spent, the highest 5-hour and weekly readings, and the cost. Days follow the machine's local time. Switch it off with **History across sessions** in `/config`.

## The /zadania task pane

`/zadania` opens (and a second `/zadania` hides) a pane with the plan's tasks:

```
Compact mode — implementation plan
━━━━━━━──────────────────── 1/4 tasks
steps: 4/13
✔ Task 1: Config option              3/3
▶ Task 2: One-row layout             1/4
○ Task 3: Translations               0/2
```

- Tracks the tasks Claude writes as it works (`TodoWrite`, `TaskCreate`, `TaskUpdate`).
- Loads a plan file by itself when Claude writes, edits or opens one: a `.md` with at least two headings holding `- [ ]` / `- [x]` steps. A task is done when all its steps are ticked.
- Follows plans run by `subagent-driven-development`: their progress ledger (`.superpowers/sdd/<plan>/progress.md`) marks tasks done or in progress even though the plan's checkboxes stay unticked.
- Shows an approved plan from plan mode.
- `/zadania path/to/plan.md` loads a plan by hand, `/zadania clear` forgets it. The pane follows the file as steps get ticked.
- The pane docks beside the transcript in the fullscreen terminal layout (110+ columns), and opens above the prompt otherwise.

The limit figures come with API responses, so they appear after the first response of a session (Pro/Max subscriptions only).

## Settings

In `/config`:

- **Język / Language**: `pl` (default) or `en`.
- Every feature can be switched on or off (all on by default): the 5-hour and weekly bars, the burn chart, the forecast, the cost, the live estimate, history, animations, threshold notifications, the sound at 90%, the reset notification.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install usage-limits --marketplace MaurycyBartczak/claude-usage-limits
```

Answer `y` to add the marketplace, then pick a scope (Enter = user).

From a shell:

```
claude plugin install usage-limits --marketplace MaurycyBartczak/claude-usage-limits
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `MaurycyBartczak/claude-usage-limits`, then Add plugin.
