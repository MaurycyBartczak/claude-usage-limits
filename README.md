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
- The session cost in $ (API-price equivalent).
- Notifications when a limit crosses 50%, 75% and 90%, and when it resets.
- A sound at 90% (Windows: PowerShell, macOS: afplay).
- A `usage_limits` tool for the agent: Claude can check your limits itself when you ask about them or before heavy work.

The limit figures come with API responses, so they appear after the first response of a session (Pro/Max subscriptions only).

## Settings

In `/config`:

- **Język / Language**: `pl` (default) or `en`.
- Every feature can be switched on or off (all on by default): the 5-hour and weekly bars, the burn chart, the forecast, the cost, animations, threshold notifications, the sound at 90%, the reset notification.

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

The repository is private: the install works only for people who can read it on GitHub and whose machine already holds a git credential for github.com (an SSH key, or `gh auth login` then `gh auth setup-git`). The install never prompts for one.
