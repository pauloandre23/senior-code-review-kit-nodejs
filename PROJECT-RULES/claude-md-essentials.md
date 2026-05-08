# Terse CLAUDE.md Essentials

A **lightweight** version of the project rules, sized to be loaded into every Claude Code conversation without bloating the context window.

The full proactive rules in [`cursor-rules.md`](./cursor-rules.md) are ~250 lines. That's fine for Cursor's `.cursorrules` (which is read once per project) but **heavy for Claude Code's CLAUDE.md** — which gets loaded into every single conversation, including code-writing tasks where review-mode rules don't apply.

This terse version keeps only the **highest-leverage rules** — the ones that prevent the most painful production bugs while staying under ~50 lines.

---

## How to use

Save the **Rules** section below as `CLAUDE.md` at your project root. Claude Code loads it automatically as persistent context.

For **on-demand code review** (the heavyweight methodology), install the Skill in [`SKILLS/code-review/SKILL.md`](../SKILLS/code-review/SKILL.md) (auto-activated, recommended) or the slash command in [`CLAUDE-COMMANDS/code-review.md`](../CLAUDE-COMMANDS/code-review.md) (explicit-invoke). Either is the right place for review — actions invoked on demand, not persistent context.

---

## Rules

Copy everything between the markers below into `CLAUDE.md`.

```
=== BEGIN PROJECT RULES (TERSE) ===

You are working on a production Node.js / TypeScript backend. Apply senior
engineering judgment when generating, refactoring, or modifying code.

# HARD RULES — DO NOT BREAK

1. Do NOT add features beyond what's explicitly requested. No "while I'm here"
   cleanup, no speculative abstractions.
2. Do NOT introduce new dependencies without explicit justification.
3. Do NOT change public API contracts silently — output shape, return types,
   throw vs return.
4. Do NOT write fire-and-forget code. Every async operation that should complete
   before the function returns must be awaited. Don't use `void promise` or
   `eslint-disable @typescript-eslint/require-await`.
5. Do NOT swallow errors. Catch blocks must propagate, convert to typed errors,
   or be explicitly justified.
6. Do NOT mix refactoring with feature work in the same change.

# COMMON BUGS TO AVOID

Concurrency:
- Never check-then-act on shared state without atomic primitives (TOCTOU bug).
  Use Redis SETNX, SQL `SELECT FOR UPDATE`, or compare-and-swap — not plain SET.
- Never read-modify-write on shared counters/lists without atomicity.
  Use INCR for counters, RPUSH/LPUSH for lists, or wrap in a transaction.
- Use `Promise.all` for independent awaits. Sequential only when later operations
  depend on earlier results.
- Polling intervals: minimum 50ms unless justified. Token/cache refresh paths
  must use single-flight (mutex/lock).

Errors:
- Never write `.catch(() => throw new Error(...))` that discards the original.
  Always preserve context: `.catch((err) => { throw new Error('msg', { cause: err }) })`.
- Never return success-shaped responses on failure. `null` in a data field
  is not an error signal.
- Errors live at boundaries (controllers, exception filters), not scattered
  through every internal method.

Architecture:
- Domain checks (`if (item.itemType === 'TEXTLINE')`) belong in domain methods,
  not orchestrators or controllers.
- Methods >50 lines doing multiple things should be split.
- Inject non-trivial helpers via DI, don't import directly.

Observability:
- Structured logging only. Use the injected logger with named fields.
  Never `console.log` in production paths.
- Cache writes must specify a TTL unless persistence is explicitly intended.

# WHEN UNSURE

Ask. Don't guess at architecture, naming, or behavior decisions.

=== END PROJECT RULES (TERSE) ===
```

---

## What's NOT in this terse version (and why)

- The full WORKFLOW section ("when asked to fix a bug / add a feature / refactor")
- The "BEFORE FINAL ANSWER" checklist
- Most of the testability and performance categories
- Stack-customization notes

Those live in [`cursor-rules.md`](./cursor-rules.md) for tools where the rules are loaded once per project (Cursor) or via custom GPT instructions (ChatGPT). For Claude Code, they're better served as on-demand reference (open the full rules doc when you need them) than as persistent context.

---

## When to use which

| Scenario | What to use |
|---|---|
| Daily Claude Code coding | This terse version → CLAUDE.md |
| Daily Cursor coding | Full version (`cursor-rules.md`) → `.cursorrules` |
| Daily ChatGPT coding via custom GPT | Full version → custom GPT instructions field |
| **On-demand code review in Claude Code** | Skill (`SKILLS/code-review/SKILL.md`, recommended) or slash command (`CLAUDE-COMMANDS/code-review.md`) — NOT in CLAUDE.md |
| **On-demand code review elsewhere** | Paste prompt (`PROMPTS/01-senior-code-review.md`) into a fresh chat |

The principle: **persistent context vs on-demand action** is a real architectural choice. Use each channel for what it's best at.
