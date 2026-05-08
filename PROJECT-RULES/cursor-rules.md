# Project Rules for AI Coding Assistants

The Senior Code Review methodology, repackaged as **proactive project rules**.

The Senior Code Review prompt catches bugs in code that's already written. These rules **prevent the AI from writing those bugs in the first place** — so when the AI generates or modifies code in your project, it follows the same methodology already.

---

## How to use — different tools, different deployment

Different AI coding tools handle persistent context differently. **For Claude Code specifically, the deployment is split between two channels.** Use the table below to pick the right setup for your tool.

| Tool | Proactive rules (always-on) | Code review (on-demand) |
|---|---|---|
| **Cursor** | Full **Rules** below → `.cursorrules` | Paste `PROMPTS/01-senior-code-review.md` into chat |
| **Claude Code** | **Terse essentials** → `CLAUDE.md` (see [`claude-md-essentials.md`](./claude-md-essentials.md)) | **Skill (recommended)** → `~/.claude/skills/code-review/SKILL.md` (see [`SKILLS/`](../SKILLS/)) — or slash command → `~/.claude/commands/code-review.md` (see [`CLAUDE-COMMANDS/`](../CLAUDE-COMMANDS/)) |
| **ChatGPT** (custom GPT) | Full **Rules** below → custom GPT instructions field | Paste `PROMPTS/01-senior-code-review.md` into chat |
| **Generic LLM** | Full **Rules** below as system prompt | Paste `PROMPTS/01-senior-code-review.md` into chat |

### ⚠️ Important: don't put the review prompt in CLAUDE.md

A common mistake is pasting the full Senior Code Review prompt into CLAUDE.md so it's "always available." This is wrong. Two reasons:

1. **Wasted token budget every conversation.** The review prompt is ~5KB of structured rules. Loading it on every "write me a function" is wasteful.
2. **Subtle bias toward review-mode thinking.** When the model has review categories in context, it can't help reading them. That can warp how it writes code (over-explaining, defensively over-caveating, treating every coding task like an audit).

**Code review is an action, not persistent context.** Use a Skill or slash command for it. The Skill at [`SKILLS/code-review/SKILL.md`](../SKILLS/code-review/SKILL.md) (auto-activated, recommended) and the slash command at [`CLAUDE-COMMANDS/code-review.md`](../CLAUDE-COMMANDS/code-review.md) (explicit invocation) are purpose-built for this — both go further than paste-into-chat by using Claude Code's Read and Grep tools to do real cross-file investigation.

### Cursor (single-context tool)

Save the **Rules** section below as `.cursorrules` at your project root. Cursor automatically loads it as context for every conversation in that project. Cursor doesn't natively distinguish "rules" from "review actions" the way Claude Code does, so the full rules block is the right deployment.

```bash
cp /path/to/this/file ./.cursorrules-source
# Then copy just the "Rules" section content into ./.cursorrules
```

For code review in Cursor, paste `PROMPTS/01-senior-code-review.md` into the chat panel.

### Claude Code (split deployment — recommended)

Two files, two purposes:

1. **For persistent rules** (loaded every conversation): use the **terse essentials** at [`claude-md-essentials.md`](./claude-md-essentials.md). Save its Rules section as `CLAUDE.md` at your project root. ~50 lines, focused on the highest-value coding guardrails.

2. **For on-demand review** (invoked when you want it): use the **Skill** at [`SKILLS/code-review/SKILL.md`](../SKILLS/code-review/SKILL.md). Save it as `.claude/skills/code-review/SKILL.md` in your project (or `~/.claude/skills/code-review/SKILL.md` for user-scoped). Then ask naturally: `review src/foo.ts`. The Skill auto-activates from your description and uses Claude Code's Read + Grep tools to do cross-file investigation that a single-pass review can't.

   Prefer explicit invocation? A slash command version (`/code-review src/foo.ts`) is also available — see [`CLAUDE-COMMANDS/`](../CLAUDE-COMMANDS/). Same content, same tool scoping, different invocation ergonomics.

### ChatGPT (custom GPT or project)

Paste the **Rules** section below into:
- The custom GPT's "instructions" field, or
- The "instructions" field of a ChatGPT Project

For review, open a fresh chat and paste `PROMPTS/01-senior-code-review.md`. ChatGPT doesn't have Skills or slash commands for tool-using actions, so review stays in paste-into-chat mode.

### Generic LLM tools

Use the **Rules** section as the system prompt or the first message in any session where you want the AI to write Node.js / NestJS backend code following this methodology. For review, paste `PROMPTS/01-senior-code-review.md` separately.

---

## Rules

Copy everything between the markers below into your tool of choice.

```
=== BEGIN PROJECT RULES ===

You are working on a production Node.js / TypeScript backend (NestJS, REST APIs,
external service integrations, cache layers). Apply senior code review methodology
proactively when generating, refactoring, or modifying code.

# HARD RULES — DO NOT BREAK

1. Do NOT add features beyond what's explicitly requested. No "while I'm here"
   cleanup, no speculative abstractions, no "just in case" code.
2. Do NOT rewrite existing patterns without explicit permission. Match the
   surrounding codebase style — naming, structure, and architectural choices.
3. Do NOT introduce new dependencies (libraries, frameworks, helpers) without
   explicit justification. State why the existing tools are insufficient.
4. Do NOT change public API contracts silently. Output shape, return types,
   throw vs return — preserve unless explicitly asked.
5. Do NOT write fire-and-forget code. Every async operation that should complete
   before the function returns must be awaited. Don't use `void promise` or
   `eslint-disable @typescript-eslint/require-await` to silence the linter.
6. Do NOT swallow errors. Every catch block must either propagate, convert to
   typed error, or be explicitly justified.
7. Do NOT mix refactoring with feature work in the same change. Separate them.

# ARCHITECTURE / RESPONSIBILITY

- Keep orchestration code free of domain logic. Domain checks (`if (item.itemType === 'TEXTLINE')`,
  `if (order.status === 'CANCELLED')`) belong in domain methods, not in dispatchers,
  controllers, or middleware. Extract to a domain method like `cart.containsOnlyInformationalItems()`.

- Prefer dependency injection over module-level imports for non-trivial helpers.
  Anything you'd want to mock, decorate, swap, or test in isolation should be DI'd.
  Pure stable utilities (date formatters, math) can be imported directly.

- Methods should do one thing. If you find yourself writing >50 lines in one method,
  stop and ask whether the work should be split.

- Don't write thin wrapper methods that just forward to another service unless the
  wrapper adds real value (validation, transformation, observability boundary).

- Controllers stay thin. Business logic belongs in services. Validation belongs in
  pipes / DTOs. Don't mix layers.

# ASYNC / CONCURRENCY

- NEVER write check-then-act on shared state without atomic primitives. If you read
  state and decide to act based on what you read, use compare-and-swap, Redis SETNX,
  PostgreSQL `SELECT FOR UPDATE`, or a distributed lock — not plain SET. This is
  the TOCTOU bug class.

- NEVER write read-modify-write on shared counters or lists without atomicity. Use
  Redis INCR for counters, RPUSH/LPUSH for lists, or wrap in a database transaction
  with row-level locking.

- Use `Promise.all` for independent awaits. Sequential awaits are only correct when
  later operations depend on earlier results. Trace each value's usage to verify.

- Be aware of `Promise.all`'s fail-fast behavior. If you need partial-success
  semantics, use `Promise.allSettled` instead.

- Polling intervals: minimum 50-100ms unless you have a specific reason. Never
  under 50ms. For state-change waits, prefer pub/sub or blocking primitives over
  polling.

- Token refresh, cache refresh, and initialization paths must use single-flight
  (mutex / once-lock) — don't let concurrent callers all trigger the work.

- Retries require idempotency. Don't add retry logic without verifying the
  operation can be safely repeated.

# ERROR HANDLING

- NEVER write `.catch(() => throw new Error(...))` that discards the original error.
  Always preserve context: `.catch((err) => { throw new Error('descriptive msg', { cause: err }) })`.

- NEVER return success-shaped responses on failure. If processing failed, throw
  an exception or return an explicit error type. A `null` in a data field is not
  an error signal — it's a silent failure trap.

- Use `Error` instances, not strings. `throw new Error('msg')`, not `throw 'msg'`.

- Preserve error context across layers. If you wrap an error, use `cause`. If you
  log it, use structured logging with named fields.

- Catch only what you can handle. Generic `catch (e)` at boundaries is fine for
  framework-level handling. Inside business logic, catch specific error types.

- Error handling lives at boundaries (controllers, exception filters, top-level
  orchestrators), not scattered throughout every internal method. Internal methods
  should throw and let exceptions bubble to the appropriate boundary.

# TESTABILITY

- Inject time dependencies (`Date.now`, `setTimeout`, `setInterval`) via a clock
  service. Don't use globals directly inside business logic.

- Methods that touch >5 collaborators are integration-test territory. Split them.

- Avoid implicit cache state that can't be reset between tests.

- For each new method, ask: "How would I test this without a full integration
  setup?" If you can't answer, restructure.

# PERFORMANCE

- No N+1 queries. Batch database/cache reads when looping over items.

- No sequential awaits over independent operations. Use `Promise.all`.

- No unbounded list reads. Always paginate. If a result set could exceed 1000
  items, design for streaming or pagination from the start.

- No cache reads inside hot loops. Hoist them out.

- Don't fetch data that may not be used in every branch. Lazy-load.

# OBSERVABILITY

- Structured logging only. Use the injected logger (`@Injectable()` Logger or
  equivalent). Never `console.log` in production code paths.

- Include contextual fields at every log line: requestId, userId, tenantId, the
  primary entity ID. Use the logger's structured-fields API, not template-string
  interpolation.

- Wrap errors with context: `logger.error('action failed', { userId, action, cause: err })`,
  not `` logger.error(`failed for ${userId}: ${err}`) ``.

- Cache writes must specify a TTL unless persistence is explicitly intended.

- Log critical state transitions: status changes, completion, failure, retries.

- Don't add tracing/metrics half-heartedly. If you instrument one operation,
  instrument the related ones consistently.

# API CONTRACT / BEHAVIOR PRESERVATION

- Don't change response shapes silently. Adding a field is fine if backward-compatible.
  Renaming or removing is a breaking change — flag it.

- Don't change error vs success contracts. If a method previously threw on bad
  input, don't switch it to return null without explicit discussion.

- Match input parameters across call sites. If a method is called as `f(a, b, c)`
  from one branch and `f(a, '', '')` from a recovery branch, you have a contract
  issue — either propagate the missing values or refactor the recovery to not
  need the method.

- Public methods should have one shape per code path. Don't return `{ data: T }`
  on success and `{ data: null, error: string }` on failure — pick one consistent
  shape (or use a Result type).

# WORKFLOW

When asked to **fix a bug**:
- Identify the root cause first. State your hypothesis before changing code.
- Propose the smallest safe change.
- List tests to add that would have caught this bug.
- Don't refactor unrelated code in the same commit.

When asked to **add a feature**:
- Confirm scope before writing. Ask "are there constraints I should know about?"
  if anything is ambiguous.
- Identify which existing patterns the new code should follow.
- Identify the boundaries (where does the new code interact with existing code?).
- Plan the test strategy before writing the implementation.

When asked to **refactor**:
- List the current behavior — what must be preserved.
- Identify the risks (concurrency? API contract? observable behavior?).
- Propose the smallest reviewable change.
- Add tests before risky changes, not after.

When **unsure**:
- Ask. Don't guess at architecture, naming, or behavior decisions.
- Don't invent constraints that weren't given.

# THINGS YOU WILL NOT DO

- Add features beyond what's explicitly asked
- Rewrite working code without explicit permission
- Introduce new libraries / frameworks casually
- Change tests when fixing implementation (tests should still pass)
- Bypass DTOs, validators, repositories, gateways if the project uses them
- Write code without considering the test strategy
- Use `console.log` for anything other than temporary debugging
- Suppress linter rules (`eslint-disable`) without justification

# BEFORE FINAL ANSWER

When you're about to deliver code, double-check:

1. Did I add anything beyond what was asked?
2. Did I preserve all existing patterns and contracts?
3. Did I handle the failure paths, not just the happy path?
4. Did I use `Promise.all` where awaits are independent?
5. Did I write structured logs with contextual fields?
6. Did I avoid `void promise` and theatrical-await patterns?
7. Did I check for race conditions on shared state?
8. Did I match the existing testing strategy?

If any answer is uncertain, flag it explicitly in your response.

=== END PROJECT RULES ===
```

---

## Why this works

These rules apply the same methodology as the Senior Code Review prompt, but **proactively** — before code is written rather than after.

The patterns that the review prompt hunts (TOCTOU, RMW, fire-and-forget, silent success on failure, sequential awaits, domain leakage, etc.) are the same patterns these rules tell the AI to *avoid writing*. By baking the methodology into project context, the AI generates code that already passes senior review.

For the full reasoning behind each rule, see [`METHODOLOGY/why-this-works.md`](../METHODOLOGY/why-this-works.md).

For the review counterpart that catches bugs in existing code, see [`PROMPTS/01-senior-code-review.md`](../PROMPTS/01-senior-code-review.md).

---

## Customizing for your stack

The rules are written for Node.js / NestJS, but the methodology is general. To adapt:

- **Different framework** (Spring, Django, Rails): keep the structure, replace JS-specific syntax patterns (`.catch(() => throw)`, `eslint-disable-require-await`) with language equivalents.
- **Different language**: same — replace syntax patterns. The categories (architecture, async, error handling, testability, perf, observability, contracts) and the methodology (no rewrite, calibrated, atomic primitives, structured logging) transfer cleanly.
- **Specific business domains**: add domain-specific rules under "Things you will not do" (e.g., "never log PII", "never hardcode pricing rules", "always go through the audit service for state changes").

When customizing, keep these structural pieces intact:

- The HARD RULES block (especially #1 no scope creep, #4 no silent contract changes, #5 no fire-and-forget)
- The categories matching the review prompt (so review and proactive rules align)
- The "BEFORE FINAL ANSWER" checklist (forces self-review before output)

---

## A note on enforcement

Project rules in Cursor / Claude Code / ChatGPT are **soft enforcement**. The AI follows them most of the time but will occasionally drift, especially in long sessions or when the rules conflict with the user's immediate request.

Two practices that help:

1. **Run the review prompt periodically** on code the AI generated. The review catches what the rules missed.
2. **Refresh the rules in long sessions.** If the AI starts producing code that violates the rules (e.g., wraps errors without `cause`), paste the relevant rule again — the rule context can decay over many turns.

The full kit (review prompt + project rules + methodology doc) is designed to work as a system. Rules prevent most issues; the review catches the rest.
