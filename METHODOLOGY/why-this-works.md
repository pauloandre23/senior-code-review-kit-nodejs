# Why This Works

The deeper story behind the prompt: why each design choice exists, what was learned through iteration, and where the ceiling is.

This doc is for buyers who want to understand the methodology well enough to **extend it for their stack**, **defend the choices in code review**, or **build on top of it** for an internal tool. It's also useful for anyone evaluating whether the kit is rigorous enough to trust.

---

## The thesis

> **The kit is a methodology. The prompt is one expression of it.**

Most "AI code review prompts" you can buy are templates with vague instructions like "review this code thoroughly." Those produce confident-sounding noise because they don't constrain the model toward what makes a real senior review valuable.

A real senior review is:

1. **Structured** — covers known failure modes, doesn't drift to whatever the reviewer notices first
2. **Calibrated** — distinguishes "I'm sure this is broken" from "this might be a problem under conditions X"
3. **Falsifiable** — every claim has a "what would change my mind" attached
4. **Boundary-aware** — knows when to investigate cross-file vs commit to a finding
5. **Composite-aware** — sees how individual smells combine into bigger production damage
6. **Workflow-disciplined** — refuses to rewrite before risks are agreed on

A good AI code review prompt has to **structurally force the model into all six modes**. That's what the v2.2.1 prompt does. This doc explains the why behind each design choice.

---

## The problem with generic AI review prompts

Generic prompts produce four characteristic failure modes:

### 1. Confident noise

> "Consider better naming."
> "This could be cleaner."
> "Adding tests would improve maintainability."

Vague advice that's true of any code anywhere. Useless because it doesn't tell you what to do or where.

### 2. Confident wrongness

> "This catch block is good — it handles errors gracefully."

Output that looks authoritative but is actually wrong (the catch block was a silent-success bug). The model doesn't know it's wrong because it's not constrained to verify, calibrate, or check assumptions.

### 3. The rewrite escape hatch

> "Here's an improved version of the code:"

Then dumps a refactored block that may or may not preserve behavior. This is the model's escape from doing review — it's easier to rewrite than to reason about why the original is broken. The buyer can't tell what was actually wrong because the diff hides it.

### 4. Per-method tunnel vision

The model reads one method, comments on it, moves to the next. It never traces an error path through layers. It never asks "what does the cache layer do?" — it just judges what's in front of it.

---

## The methodology — 8 design choices

Each choice in the prompt corresponds to a specific failure mode it prevents.

### 1. Named patterns over generic descriptions

**Bad prompt:** "Look for concurrency bugs."

**This kit:** "Hunt for TOCTOU (time-of-check / time-of-use) on shared state. Hunt for read-modify-write on counters. Hunt for fire-and-forget writes (`void promise`, `eslint-disable-require-await`). Hunt for theatrical awaits where the underlying work is fire-and-forget."

The difference is **commitment**. A vague hunt produces vague findings. A named hunt forces the model to either match a specific known pattern (and produce a useful finding) or stay silent.

This also enables a critical evaluation property: **falsifiability of the prompt itself**. If we say "hunt for TOCTOU" and the file contains a TOCTOU and the model doesn't catch it, we know the prompt has a gap. With "look for concurrency bugs," we can't tell whether the model missed something or whether nothing was there.

### 2. Hard rules with structural enforcement

The prompt's HARD RULES block is the most important section. It forces the model into specific behaviors **before content categories matter**:

- Don't rewrite (rule 1)
- Don't be vague (rule 2)
- Don't make confident claims about unseen code (rule 3)
- Don't skip categories (rule 4)
- Don't invent (rule 5)
- Cite exact line numbers (rule 6)
- Verify counts (rule 7)
- Multiple findings per category required (rule 8)

These aren't suggestions. They're framed as "DO NOT BREAK" because LLMs respond to imperative framing — soft language ("try to") is reliably ignored.

The rules also create **internal tension** that improves output quality. Rule 5 ("don't invent") and Rule 8 ("multiple findings required") look contradictory but actually force the model to surface only real findings, while still being comprehensive within each category. That tension prevents both filler and parsimony.

### 3. The "no rewrite" rule (rule 1)

This is the single most consequential rule.

When LLMs review code, they default to "let me show you a better version." That output is useless because:

- The original problems get hidden inside the new code
- Behavior changes are not flagged
- Architecture drift is invisible
- The buyer can't audit the diff against what was actually wrong

The "no rewrite" rule forces the model to **stay in review mode**. It produces findings, not refactors. It explicitly refuses to rewrite even when asked. This is the difference between "I'll teach you to fish" and "here, eat this fish I made."

The rule also has a workflow benefit: it forces the buyer to **agree on which findings to address before any code changes**. That sequence — risks → agreement → smallest safe change — is how senior engineers actually work. The prompt enforces it.

### 4. Calibration discipline (HIGH / MEDIUM / LOW + falsifier)

The most differentiating design choice.

Most prompts produce findings without confidence levels. The buyer gets a flat list of "here are bugs" with no signal about which to act on. The CALIBRATION RULES force every finding to be tagged:

- **HIGH** = verifiable from the code shown AND impact doesn't depend on unseen dependencies
- **MEDIUM** = pattern is verifiable but impact requires assumption about cache layer, frontend behavior, ops alerting, or workload
- **LOW** = the pattern's existence requires inference, not direct evidence

Plus every finding gets a **"What would falsify this"** line — a specific file, test, or observation that would change the confidence.

Why this matters:

1. **Forces the model to think about what it doesn't know.** Most LLM output assumes the world is whatever the model sees. Calibration forces explicit acknowledgment of unseen dependencies.
2. **Makes the output auditable.** A buyer reading "MEDIUM, falsifier: cache layer uses SETNX" can immediately decide: "is this falsifiable? let me check." That's the senior workflow.
3. **Counter-pressures the model's tendency to overclaim.** LLMs default to confident phrasing. The calibration rules push back.

### 5. Composite tracing (Section C)

Per-method analysis is shallow. The most consequential bugs span layers:

- An error gets discarded in a `.catch()` block
- The wrapped error reaches an outer catch that converts it to a success-shape
- The success-shape returns to the caller
- The caller treats it as success and proceeds

No single method is "wrong." The composite is broken.

The prompt **requires** Section C to trace at least one error path end-to-end through layers, documenting what's lost at each transition. This forces the model to look at composite behavior, not just per-method smells.

This is also where the kit's calibration discipline pays off most: composite findings often have HIGH confidence because the chain is verifiable from the code alone, even when individual links are MEDIUM.

### 6. Cross-file dependency awareness (Section D)

Real senior review is iterative. You read one file, form hypotheses, then read the dependencies to confirm or refute. The prompt formalizes this with Section D — "dependencies to read next to validate."

Two effects:

1. **The model learns to acknowledge what it doesn't know.** Saying "the cache layer would need to be read to confirm" is more honest than fabricating an opinion.
2. **The buyer gets a research plan.** The output isn't "here are the answers" — it's "here are the leads."

This is also one of the strongest arguments for the v2.0 agent version: the prompt asks the model to *recommend* reading certain files, but the model can't *actually* read them. An agent with file-reading tools closes that loop autonomously.

### 7. The "don't invent / multiple findings" tension (rules 5 + 8)

Generic prompts have a parsimony problem: the model surfaces one finding per category and stops, leaving real issues uncovered. Other prompts overcorrect with "find as much as possible," producing filler.

The kit's two rules create deliberate tension:

- **Rule 5**: "Do NOT invent issues to look thorough."
- **Rule 8**: "EACH CATEGORY MAY HAVE MULTIPLE FINDINGS. Do not stop at the most prominent one if more real patterns are present. Comprehensiveness within a category is required, not padding."

The model has to be both **comprehensive** (don't stop at one finding when more exist) and **honest** (don't invent to look thorough). The tension forces calibration of what's real.

### 8. Counting and exact line numbers (rules 6 + 7)

LLMs love approximations. They write "around line 90" or "approximately ten cache reads" because exact numbers are harder to compute. The prompt forbids approximation:

- **Rule 6**: "Cite exact line numbers verifiable in the provided file. Do not approximate ranges. The file is right in front of you."
- **Rule 7**: "Verify counts by counting. If you say 'ten cache reads' or 'eight awaits,' that number must be exact."

Why this matters: every approximation is a place where the buyer can't verify. "Approximately 10" hides whether the model actually counted or guessed. "Exactly 9" is verifiable in 30 seconds.

The "the file is right in front of you" phrasing is intentional. It's a psychological push — the model is being told that approximation is laziness, not difficulty.

---

## What we learned through 4 iterations

The prompt went through 4 versions. Each iteration was driven by observed failures, not theoretical improvements.

### v1: First draft

Baseline. 7 categories, named patterns, calibration rules, output format. Tested against real production NestJS code (a checkout dispatch service).

**Findings on v1**: caught most patterns, but had three problems:
- Domain leakage was completely missed (the model didn't pattern-match "TEXTLINE check in orchestrator" against the abstract description "domain concepts leaking into orchestration")
- Line numbers were approximated ("≈ 90-155")
- Counts were estimated ("ten cache reads" when actual was 8)
- Calibration was inflated (everything got HIGH)

### v2: Worked examples + count enforcement

Changes:
- Added a worked example for domain leakage (the `TEXTLINE` check shape)
- Added Hard Rules 6 and 7 (exact line numbers, verify counts)
- Added a precedence rule (concurrency framing wins over perf for RMW patterns)
- Strengthened calibration rules with explicit dependency conditions
- Added explicit Section C error-tracing requirement

**Findings on v2**: caught domain leakage. Counts became accurate. Composite tracing improved. But: TOCTOU and empty-string call (which v1 had caught) were missed in v2 because the calibration tightening made the model more conservative — it skipped findings rather than mark them MEDIUM.

### v2.1: De-Redis-ifying

The opening line of v1/v2 mentioned Redis specifically. While many of the patterns happen to apply to Redis-backed cache layers, the methodology is general. v2.1 broadened the framing to "any caching layer" so the prompt didn't artificially limit the buyer to one stack.

This was a small change with positioning value, not a behavioral change.

### v2.2: Tension rules + worked examples for missed patterns

Changes:
- Added Hard Rule 8 ("multiple findings per category required") to fix v2's parsimony regression
- Added worked example for TOCTOU (the read-then-act pattern shape)
- Added worked example for empty-string-call (recovery branch with default values)
- Strengthened calibration: explicit instruction that conditional findings should still be surfaced at MEDIUM, not skipped

**Findings on v2.2**: regained TOCTOU and empty-string. Domain leakage held. Calibration improved.

### v2.2.1: Dead code addition

During synthetic-file validation, the user discovered that the original IKEA file's `getProcessingStatus` wrapper had no callers in the codebase — confirmed via grep. Real production tech debt that the prompt wasn't hunting for.

Added: a "dead code" hunt pattern under Architecture, explicitly noting that verification requires `grep` and the finding should be MEDIUM with the codebase grep listed in Section D.

In practice, the dead-code pattern still doesn't fire reliably because the model can't actually run grep. This is a documented limitation that motivates the v2.0 agent version.

### What 4 iterations taught us

Three meta-lessons:

1. **Worked examples are more effective than abstract descriptions.** Telling the model "domain concepts leaking into orchestration" doesn't reliably trigger pattern-matching. Showing the model `item.itemType === 'TEXTLINE'` does.
2. **Tightening one rule can regress another behavior.** The v2 calibration tightening reduced HIGH inflation but also reduced finding count. Rule changes have systemic effects.
3. **Some gaps are LLM ceilings, not prompt gaps.** No amount of worked examples will reliably teach a model to grep — that requires tools.

---

## Where the ceiling is and why

After 4 iterations, the gain per iteration shrank rapidly:

- v1 → v2: large gains in calibration, composite tracing, accuracy
- v2 → v2.2: targeted recoveries (TOCTOU, empty-string), with regressions on accuracy
- v2.2 → hypothetical v3: would target persistent misses with more worked examples, but adding more examples risks **prompt bloat** — making the prompt longer can degrade other axes (the model loses focus, treats some rules as suggestions, etc.)

The patterns that **persistently miss** across all runs:

| Pattern | Why it's a structural limit |
|---|---|
| Class name mismatch | Requires architectural judgment ("what should a 'Dispatch' service do?") that's too subjective for the model to commit to confidently |
| Dead code (grep verification) | The model can't actually grep. Adding a "use grep" instruction doesn't help because the tool isn't available. |
| Lost-update on cached lists (read-merge-write) | The model defaults to perf framing instead of concurrency framing, even with the precedence rule explicitly stating concurrency wins |
| Deeply-nested sequential awaits in long methods | The model gravitates to more visible sequential examples (like 2 external calls in series) and stops looking |
| Mixed failure signaling | Persistent miss; the model can flag "throws" or "returns null" individually but rarely connects them as inconsistent failure modes |

These are LLM **behavioral** limits — what the model defaults to when reasoning under prompt constraints. They're not fixable by writing a better prompt.

This is why **v2.0 is the agent version**, not v3 of the prompt. An agent with file-reading and grep tools can:

- Actually run `grep getProcessingStatus` to verify dead code
- Read the cache layer file when investigating concurrency claims
- Walk the call graph to verify whether `priceInfo: null` is treated as failure by callers
- Re-read the original file with a focused lens after the first pass

That's the path that closes the systematic-miss gap. v1.x is "single-shot prompt with a competent operator." v2.0 is "autonomous agent with tools."

---

## How to extend the methodology

The kit's prompt is for Node.js / NestJS. The methodology is general. To adapt:

### To a different framework (Spring, Django, Rails, etc.)

Keep these structural pieces verbatim:
- All 8 HARD RULES
- The CALIBRATION RULES section
- The OUTPUT FORMAT (Sections A through F)
- The IF ASKED TO REFACTOR clause

Adjust within categories:
- Replace JS-specific syntax patterns with framework-equivalents (`@Transactional` for Spring instead of `@Injectable`)
- Add framework-specific patterns (e.g., Spring's `@Autowired` field injection vs constructor injection; Django's `select_related` vs `prefetch_related`)
- Update worked examples to use the target language's syntax

### To a different file type (controllers, middleware, modules, etc.)

The methodology applies. The hunt patterns shift:
- Controllers: missing input validation, response shape leakage, wrong HTTP codes, exception filter gaps
- Middleware: blocking the chain, async ordering issues, error propagation
- Pipes: silent transformations, validation bypass paths
- Modules: provider scope mistakes, circular dependencies, dynamic module misuse

Build a new EXAMPLES folder per file type, with synthetic + answer key + cross-run validation. This is the v1.1-v1.3 expansion path.

### To a different language

Same structural pieces. JS-specific patterns (`.catch(() => throw)`, `eslint-disable-require-await`) need replacement with language equivalents:
- Python: `except Exception as e: raise Exception(...)` (loses cause chain in Python 2 / weak in 3 without `raise X from e`)
- Go: ignored errors (`result, _ := f()`), missing `defer cleanup()`, channel race conditions
- Rust: `unwrap()` in production code, missing `Drop` implementations, `.lock().unwrap()` patterns

The methodology — calibration discipline, composite tracing, falsifiers — transfers cleanly.

---

## Senior engineering as the underlying principle

The kit isn't really about AI. It's about **good code review**, expressed through a tool that happens to be an LLM.

A senior engineer doing code review:

- Hunts named patterns (not "let me see what I notice")
- Calibrates confidence (not "this is bad, period")
- Refuses to rewrite before risks are agreed on
- Traces composite issues across layers
- Notes what they haven't yet read
- Doesn't pad findings to look thorough
- Counts when claiming counts

The prompt forces a model into all of those behaviors. That's why the output reads as senior-grade — because the underlying methodology *is* senior-grade.

If you remove the AI and run this methodology by hand, it still works. It's just slower. The AI makes the methodology fast and accessible to anyone who can paste a file into ChatGPT.

That's the actual value proposition: **senior code review methodology, made accessible.** The AI is the delivery mechanism, not the substance.

---

## Reading next

For the full validation evidence (specific runs, scoring, what's caught vs. missed), see:

[`EXAMPLES/01-real-nestjs-service-review/validation-evidence.md`](../EXAMPLES/01-real-nestjs-service-review/validation-evidence.md)

For the prompt itself and how to use it:

[`PROMPTS/01-senior-code-review.md`](../PROMPTS/01-senior-code-review.md)

For the answer key on the synthetic file:

[`EXAMPLES/01-real-nestjs-service-review/what-to-expect.md`](../EXAMPLES/01-real-nestjs-service-review/what-to-expect.md)
