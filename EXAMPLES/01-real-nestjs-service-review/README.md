# Example 01 — Senior Code Review on a NestJS Service

This folder contains a realistic example of running the Senior Code Review prompt against a NestJS backend service, plus our validation evidence.

---

## What's in this folder

| File | What it is |
|---|---|
| `synthetic-input-code.ts` | A realistic NestJS service (~370 lines) with **production patterns deliberately embedded across all 7 review categories**. Sanitized; not real production code. |
| `what-to-expect.md` | An annotated answer key. For each embedded pattern: where it is, what category it belongs to, what confidence a senior reviewer should assign. |
| `validation-evidence.md` | Our 7-axis scoring of the prompt against **real production NestJS code** (kept private). Honest about wins, misses, and where the model has variance. |

---

## How to use this example

There are two ways to learn from it:

### Path 1 — Read the answer key, then run the prompt yourself

1. Open `synthetic-input-code.ts` and read it. Don't peek at the answer key yet.
2. Try to spot the issues yourself. Write down what you'd flag and at what confidence.
3. Open `what-to-expect.md` and compare. This is your senior-thinking calibration check.
4. Then run the Senior Code Review prompt (from `PROMPTS/01-senior-code-review.md`) against the synthetic file in ChatGPT, Claude, or Cursor. Compare the model's output to the answer key.

You should see most patterns caught at the right confidence. Some may be missed — that's variance, and `validation-evidence.md` explains the ceiling.

### Path 2 — Skip ahead and just see the prompt working

1. Read `validation-evidence.md` first. It's our scoring of the prompt against real production code.
2. Then run the prompt yourself against your own codebase to see it in action.

---

## Why "synthetic" instead of real code

The prompt was developed and validated against a real production NestJS service we cannot publish (proprietary). The `synthetic-input-code.ts` here is a public-shareable equivalent — a different domain (notification dispatch, not the original), but with **the same production patterns embedded at the same architectural shape**.

This means:

- The synthetic code is **safe to share and run against** in any LLM
- The patterns it teaches you to recognize are **transferable** to your own production code
- The validation evidence applies because the patterns are the same — only the domain names change

If you ran the prompt against the original production code, you'd see the same kinds of findings as the synthetic file produces — TOCTOU on processing status, RMW on a counter, lost-update on cached lists, silent success on failure, etc.

---

## What this example does NOT show

- Running the prompt against multi-file scenarios (the prompt encourages reading dependencies, but this folder ships one file at a time)
- Using the prompt inside Cursor or Claude Code (see `PROJECT-RULES/` for that)
- Comparison with generic "review this code" prompts (see methodology doc, when published)

---

## What you'll learn from this example

By the time you've read all three files, you'll know:

- **What patterns this prompt catches** — concrete, named, locatable in code
- **What "good calibration" looks like** — when HIGH is right vs when MEDIUM is more honest
- **The realistic ceiling of LLM review** — what gets caught reliably, what slips, why
- **How to use the output** — MEDIUM findings as investigation pointers, not dismissals

That last point is the unlock. Most people read AI review output as a list of bugs. With this prompt, you read it as a research plan.
