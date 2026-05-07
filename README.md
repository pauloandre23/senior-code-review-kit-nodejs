# Senior Code Review Kit for Node.js Backends

**Use AI as a senior code reviewer, not a code generator.** Calibrated prompts for Node.js / NestJS backends, built and validated against real production code.

---

## Who this is for

- Backend developers using ChatGPT, Claude, Cursor, or any LLM coding tool
- Engineers working with Node.js / TypeScript / NestJS / external APIs / cache layers
- Devs who don't fully trust AI-generated code and want structured guardrails
- Anyone tired of generic "looks good, here's a slightly improved version" reviews

## The problem with generic AI review

Most AI code review prompts produce confident-sounding noise:

- "Consider better naming"
- "This could be cleaner"
- "Here's an improved version" (rewrite that hides what was actually wrong)

That's not review — it's filler with a "found a bug!" sticker on it.

Real senior code review is **calibrated, structured, and refuses to refactor before risks are agreed on**. This kit's prompts force that workflow on the model, structurally.

## What this kit gives you

1. **The Senior Code Review Prompt (v2.2.1)** — structured prompt that hunts named patterns across 7 categories with explicit confidence calibration (HIGH / MEDIUM / LOW) and a "what would falsify this" line on every finding
2. **A real annotated example** — a synthetic NestJS service with 13 production patterns embedded, plus an answer key, plus the workflow for testing the prompt yourself
3. **Honest validation evidence** — 7-axis scoring across 4 prompt iterations and multiple cross-run validations. Includes the systematic misses (no fake "100% catch" claims)
4. **Cursor / Claude Code / ChatGPT project rules** — the same methodology repackaged as proactive project rules so the AI follows it while writing code, not just reviewing it
5. **Methodology doc** — design rationale, why each rule exists, lessons from real-code validation across 4 prompt iterations

## What makes this different from other prompt packs

| Most prompt packs | This kit |
|---|---|
| Generic "review this code" prompts | Named patterns hunted in 7 specific categories |
| Confident-sounding output, no calibration | HIGH/MEDIUM/LOW with explicit falsifiers per finding |
| Per-method analysis only | Composite cross-cutting tracing (e.g., end-to-end error path through layers) |
| "Here's how I'd improve it" rewrite | Refuses to rewrite until risks are agreed on |
| No validation evidence | Validated against real production code, scored on 7 axes, ceiling honestly named |
| One run is "the answer" | Documented variance; "run twice" workflow recommended |

## Quick start

**1.** Open a fresh chat in ChatGPT, Claude, or Cursor. Use a strong-tier model — see [Model compatibility](./PROMPTS/01-senior-code-review.md#model-compatibility) for guidance.

**2.** Paste the prompt from [`PROMPTS/01-senior-code-review.md`](./PROMPTS/01-senior-code-review.md) (the block inside `## The prompt`).

**3.** Paste your code:

````
File: path/to/your/file.ts

```typescript
[paste full file contents]
```
````

**4.** Read the structured output. Pay close attention to **MEDIUM** findings — they tell you what to investigate next.

**5.** For high-stakes reviews, **run the prompt twice** (separate fresh sessions). The union catches ~30% more patterns than either single run.

For full usage instructions, see [PROMPTS/01-senior-code-review.md](./PROMPTS/01-senior-code-review.md).

## Repository structure

```
ai-code-review-kit-nodejs/
├── README.md                           (you are here)
├── LICENSE                             MIT
├── PROMPTS/
│   └── 01-senior-code-review.md        v2.2.1 prompt + how-to-use wrapper
├── EXAMPLES/
│   └── 01-real-nestjs-service-review/
│       ├── README.md                   orientation for the example
│       ├── synthetic-input-code.ts     realistic NestJS service with 13 patterns
│       ├── what-to-expect.md           annotated answer key
│       └── validation-evidence.md      7-axis scoring + cross-run validation
├── PROJECT-RULES/
│   └── cursor-rules.md                 proactive rules for Cursor / Claude Code / ChatGPT
└── METHODOLOGY/
    └── why-this-works.md               design rationale + iteration history + LLM ceiling argument
```

## Validation evidence — the honest accounting

This kit was developed through 4 prompt iterations (v1 → v2 → v2.1 → v2.2 → v2.2.1) and validated by:

- 3 runs of v1 / v2 / v2.2 against real production NestJS code (private)
- 2 cross-runs of v2.2.1 against a public synthetic equivalent
- Scored on a 7-axis rubric: coverage, pattern hits, calibration, cross-file discipline, composite tracing, discipline, accuracy

**The realistic ceiling:**

- **Single run** catches ~10-13 of 22 expected patterns
- **Two runs combined** catch ~14-17 patterns (~30% improvement from a second run)
- **6 patterns systematically miss** across all runs — named explicitly in the validation evidence

That's the honest ceiling. The kit is not magic. It's a strong, calibrated tool that needs a competent operator.

For the full data, see [EXAMPLES/01-real-nestjs-service-review/validation-evidence.md](./EXAMPLES/01-real-nestjs-service-review/validation-evidence.md).

### Scope of validation

**Validated against**: NestJS **orchestration service code** (cache + external APIs + async batch processing). One file type, one architectural archetype.

**Expected to also work** on other NestJS / Node.js backend code (controllers, middleware, pipes, guards, interceptors, exception filters, modules, DTOs) because the prompt's hunt patterns are general — they target TOCTOU, RMW, error context loss, silent failure, sequential awaits, etc., which are language- and pattern-level concerns, not file-type-specific.

**Not yet validated**: per-construct testing of those other file types. The prompt should catch general patterns in them, but we haven't run cross-run validation on a controller, a middleware, a module, etc. **Per-construct validation is roadmapped — see below.**

This is the honest scope. v1.0 is "validated for orchestration services + general methodology." Per-construct validation is real work that will happen across v1.1-v1.3.

## What this kit catches reliably

From the validation, these patterns surface in nearly every strong-tier run:

- TOCTOU (time-of-check / time-of-use) on shared state
- Read-modify-write race conditions on counters
- Aggressive polling intervals
- `.catch(() => throw)` patterns that discard original errors
- Outer catches wrapping errors without `cause` chains
- Silent success on failure (catch returns success-shape)
- Hidden time dependencies in test code
- Sequential awaits over independent operations (the more visible cases)

## What this kit does NOT catch reliably

Be aware — these patterns are persistent misses, even with two runs:

- Class name mismatches (requires architectural judgment the model rarely commits to)
- Dead code (requires actual grep, which the model can't run)
- Lost-update on cached lists (gets misclassified as a perf concern)
- Deeply-nested sequential awaits inside long methods
- Direct imports bypassing DI (variance trending miss)
- Mixed failure signaling (exception vs null)

**For these, review the file yourself.** They're real bugs the prompt won't reliably surface.

## What this kit deliberately does NOT do

- **Doesn't rewrite code** — by design. Prevents the "looks good, here's a rewrite" failure mode that hides what was wrong.
- **Doesn't check security** — use a dedicated security review prompt
- **Doesn't check style or formatting** — use a linter
- **Doesn't replace human review on high-stakes code** — it's a tool that makes you faster, not a substitute for judgment

## Roadmap

This kit is **v1.0** — validated for one NestJS file type (orchestration services). Planned expansions:

- **v1.1** — Per-construct validation: **controllers** (with DTOs, validation pipes, guards). New synthetic file + answer key + cross-run evidence in `EXAMPLES/02-controller-review/`.
- **v1.2** — Per-construct validation: **middleware / interceptors / exception filters**. New example folder.
- **v1.3** — Per-construct validation: **modules / providers / DI configuration**. New example folder.
- **v1.4** — **Frontend variant**: React-specific prompt with categories tuned for component code, hooks, state management, render-cycle bugs.
- **v1.5** — **Specialized prompts**: Safe Refactor prompt, PR Review prompt — same methodology, different focus.
- **v1.6** — **Cross-model validation evidence**: Claude Sonnet / Opus runs added to comparison data. Tells buyers what to expect on different models.
- **v2.0** — **Agent version**: a Claude Code subagent or Cursor command that runs the methodology autonomously with **file-reading and grep tools**. This is the upgrade path that closes the systematic-miss gap (the model can't grep in v1; an agent can).

The agent version is the most-anticipated jump — it converts the documented "persistent misses" (dead code, lost-update detection, deeply-nested perf issues) from "review the file yourself" gaps into reliable autonomous catches.

## License

MIT (see `LICENSE` file)

## Contributing / feedback

If you find a pattern this kit catches that isn't documented, or a pattern it misses that should be added — open an issue. Real-code findings strengthen the validation evidence.

---

## Honest senior framing

Most AI code review tools produce confident noise. This kit gives you a structured methodology with explicit calibration, validated against real production code with honest reporting of what it catches and what it misses.

It's a tool, not magic. The systematic misses are real. The variance is real. But within those limits, it's the strongest tool available for using AI as a senior reviewer rather than a code generator.

Buy in for the methodology, the validation discipline, and the workflow — not for "100% bug catching."
