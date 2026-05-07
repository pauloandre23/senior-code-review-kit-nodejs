# What To Expect — Answer Key for `synthetic-input-code.ts`

This document lists every pattern deliberately embedded in the synthetic file, organized by the 7 review categories the prompt uses. Use it to:

- **Calibrate yourself** before running the prompt — which patterns can you spot?
- **Score the prompt's output** after running it — what did it catch, miss, or get wrong?
- **Understand the design** — why each pattern is dangerous in production, and what would change the confidence level

A strong run of the Senior Code Review prompt should catch most of these. The validation evidence (`validation-evidence.md`) shows what's typical and what slips.

---

## 1. Architecture / Responsibility leaks

### A. Class name does not match what it does

- **Location**: line 14 (class declaration)
- **What**: `NotificationDispatchService` claims to "dispatch" but actually owns batch processing, recipient resolution, channel mapping, template rendering orchestration, and cache management
- **Expected confidence**: **MEDIUM** (verifiable from method count, but "what dispatch should mean" is judgmental)
- **Production risk**: harder to know where to add new logic; class becomes a magnet for future leakage
- **Falsifier**: a team convention treats "dispatch" as "owns the full processing pipeline"

### B. Domain leakage in orchestrator

- **Location**: line 98 — `messages.every((msg) => msg.channelType === 'INTERNAL_NOTE')`
- **What**: orchestrator method checks a domain string literal to decide reprocessing
- **Expected confidence**: **MEDIUM** (verifiable; impact depends on whether team treats this layer as domain-aware)
- **Production risk**: adding a new `channelType` value forces editing this orchestration layer
- **Falsifier**: a domain helper like `ChannelType.isInternal()` is exposed and used elsewhere — the leak is intentional

### C. Methods >50 lines doing multiple things

- **Locations**:
  - `handleNotification` — lines 119-181 (62 lines)
  - `processBatchRecipients` — lines 183-260 (77 lines)
  - `fetchTemplateInfo` — lines 262-318 (56 lines)
  - `finalizeNotification` — lines 320-368 (48 lines, borderline)
- **What**: each method mixes orchestration, transformation, cache I/O, and external calls
- **Expected confidence**: **MEDIUM** (line counts are objective; "multiple unrelated things" requires reading)
- **Production risk**: hard to unit-test, easy to introduce side-effects on edits

### D. Injected dependencies bypassed by direct imports

- **Location**: lines 3-7 (imports), lines 322 and 345 (use sites)
- **What**: `fetchTemplateLines` and `generateMessagesForChannel` are imported as module globals; they're invoked from `finalizeNotification` despite the class having DI for everything else
- **Expected confidence**: **MEDIUM** (depends on whether they're pure functions or have side-effects)
- **Production risk**: cannot be mocked without `jest.mock(module)` gymnastics; A/B testing or instrumentation requires code changes
- **Falsifier**: helpers are pure, deterministic, and stable — DI provides no value

### E. Dead code (thin pass-through wrapper)

- **Location**: lines 370-372 — `getProcessingStatus` public method
- **What**: trivial pass-through to `cacheService.getProcessingStatus`. No transformation, no business logic, no additional checks.
- **Expected confidence**: **MEDIUM** (cannot be fully confirmed from this file — must grep the codebase for callers)
- **Production risk**: dead code accumulates as maintenance tax. New devs assume it's used. Refactors get blocked because "what if someone calls it?"
- **Falsifier**: a controller, test, or external service that calls `dispatchService.getProcessingStatus(...)` exists in the codebase. (We confirmed in the original IKEA codebase via grep that the equivalent wrapper has zero callers — it really is dead code there.)

---

## 2. Async / Concurrency / Race conditions ⚠

### A. TOCTOU on processing status (the canonical concurrency bug)

- **Location**: read at lines 34-36, conditional act at lines 38-58, write later at lines 131-134
- **What**: status is read, then act is conditional on the read value, then state is mutated — without atomic check-and-set
- **Expected confidence**: **MEDIUM** (verifiable pattern; impact depends on cache layer atomicity)
- **Production risk**: two concurrent requests for the same `notificationId` can both pass the "not STARTED" check and both set STARTED, both running the full pipeline → duplicate sends, duplicate charges
- **Falsifier**: `setProcessingStatus` uses Redis `SETNX` or a Lua script to make the check-and-set atomic, OR upstream controller/queue serializes per-notificationId

### B. Read-modify-write on shared counter

- **Location**: lines 206-214
- **What**: `getNextSequenceNumber` → mutate → `setNextSequenceNumber` is a non-atomic RMW pattern
- **Expected confidence**: **MEDIUM** (pattern verifiable; bug fires only under same-id concurrency)
- **Production risk**: two concurrent batch processings on the same notification assign duplicate `sequenceId`s to messages
- **Falsifier**: cache layer's `setNextSequenceNumber` uses Redis `INCR` instead of plain `SET`

### C. Lost-update on cached lists (read-merge-write)

- **Location**: lines 230-246
- **What**: read `currentRecipientInfo` and `currentChannelInfo`, merge with new arrays, write back — last writer wins
- **Expected confidence**: **MEDIUM** (pattern verifiable; bug fires under same-id concurrency)
- **Production risk**: items lost from the cache when concurrent writes overlap → silently dropped recipients
- **Falsifier**: cache layer offers atomic list operations (e.g. Redis `RPUSH`) and the writes use them

### D. Polling loop with very short interval

- **Location**: lines 70-83 (`pollIntervalMs = 5`)
- **What**: polls cache every 5ms for up to 5 seconds (up to 1000 polls)
- **Expected confidence**: **HIGH** (the interval is verifiable from the file alone; the pattern is unambiguous)
- **Production risk**: at scale, many concurrent waiters create a thundering herd on the cache layer
- **Falsifier**: workload analysis shows concurrency on hot keys is provably low

### E. Patterns that depend on reading the cache layer

The following patterns are likely present but would need `notification-cache.service.ts` to verify. The prompt should list this file in **Section D — Dependencies to read next**:

- **Fire-and-forget writes** — if the cache layer uses `void this.redisService.setValue(...)` without awaiting
- **Theatrical await** — `await markNotificationFailed(...)` returning before the write completes
- **Missing TTLs** on cached entries (memory leak risk)

A senior reviewer would say "I suspect these patterns; read the cache file to confirm."

---

## 3. Error handling / Failure modes

### A. `.catch(() => throw new Error(...))` discards original error

- **Locations**: lines 202-204 and 226-228
- **What**: the caught error is not received by the callback (no parameter); a generic new Error is thrown instead
- **Expected confidence**: **HIGH** (the code is unambiguously discarding the original — no parameter in callback)
- **Production risk**: HTTP status, response body, original stack trace, and error type are all lost; SREs see only "Failed to fetch X" with no root cause
- **Falsifier**: an upstream interceptor logs the original before this point — but that's unusual

### B. Catch returns success-shaped response (silent success on failure)

- **Location**: lines 164-176
- **What**: on any error, `markNotificationFailed` is called and the method returns `Promise.resolve({...messages, renderInfo: null})` — no throw, no rejection
- **Expected confidence**: **MEDIUM** (verifiable code pattern; "is this a bug?" depends on whether downstream consumers treat `renderInfo: null` as failure)
- **Production risk**: callers see HTTP 200 with broken data; failures look like successes; alerting never fires
- **Falsifier**: the API contract documents `renderInfo: null` as an explicit failure signal that all consumers check

### C. Outer catch wraps without `cause` chain

- **Location**: lines 60-62
- **What**: error is logged, then `Promise.reject(new Error('Failed to process notification'))` — a fresh Error with no `cause`
- **Expected confidence**: **MEDIUM** (the original is logged at this layer, so it's not totally lost; what's lost is type info in the propagation chain)
- **Production risk**: upstream code can't differentiate error classes (network vs validation vs service-down); typed retry logic is impossible
- **Falsifier**: structured logger captures the original error as a JSON field; team policy doesn't rely on error types

---

## 4. Testability

### A. Module-level helper imports can't be mocked easily

(Same as **1.D** — duplicated here because it's also a testability concern.)

- **Location**: lines 3-7 (imports), lines 322 and 345 (use)
- **Expected confidence**: **MEDIUM**
- **Production risk**: forces tests to use `jest.mock(module)` which is fragile and breaks easily

### B. Hidden time dependencies

- **Location**: lines 71 (`Date.now()`) and 81 (`setTimeout`)
- **What**: real clock and real timers used inside polling loop without injection
- **Expected confidence**: **MEDIUM** (low if test suite has Jest fake timers configured; medium otherwise)
- **Production risk**: tests either run slow (real waits) or break if fake timers aren't enabled
- **Falsifier**: test setup uses `jest.useFakeTimers()` and the team is comfortable with it

### C. Methods touch >5 collaborators

- **Locations**:
  - `processBatchRecipients` — touches 8+ cache methods, 2 external service methods, 1 batch processor (~11 collaborators)
  - `fetchTemplateInfo` — touches 9 cache methods + 1 external service method (~10 collaborators)
- **Expected confidence**: **MEDIUM**
- **Production risk**: unit tests require heavy fixture setup; teams skip fast unit tests in favor of slow integration tests, hurting feedback loop

---

## 5. Performance / Scalability

### A. Sequential awaits over independent cache reads (in `fetchTemplateInfo`)

- **Location**: lines 269-288 — **9 cache reads** with no inter-dependencies, all `await`ed serially
- **What**: each `await` waits for round-trip before starting the next; could be `Promise.all` with all 9 in parallel
- **Expected confidence**: **MEDIUM** (perf impact depends on cache layer latency)
- **Production risk**: cumulative latency proportional to cache RTT × 9; on slow cache, adds significant latency per request
- **Falsifier**: cache layer batches internally OR cache is in-process memory (sub-microsecond reads)

### B. Sequential awaits in `finalizeNotification`

- **Location**: lines 327-343 — **9 more cache reads**, same pattern
- **What**: same pattern as 5.A
- **Expected confidence**: **MEDIUM**
- **Production risk**: same as above; doubled per request because both methods are called in series

(**Lost-update on cached lists** belongs under category 2 — concurrency framing wins per the prompt's PRECEDENCE RULE.)

---

## 6. Observability / Debuggability

### A. Generic error messages without contextual fields

- **Locations**: lines 62, 203, 227 — error messages are template strings without structured `{checkoutId, requestId, externalEndpoint}` fields
- **Expected confidence**: **MEDIUM** (the messages don't include rich context; whether logs are enriched elsewhere depends on logger config)
- **Production risk**: SREs can't filter logs by `notificationId` or correlate to upstream requestId
- **Falsifier**: NestJS logger middleware injects request context automatically via async-local-storage

### B. Errors logged via template strings rather than structured fields

- **Locations**: lines 61, 162, 203, 227
- **What**: `logger.error(\`Failed to process notification ${notificationId}:\`, error)` puts the error as a separate argument; depending on logger config, it may not be captured as a structured field
- **Expected confidence**: **LOW** (depends entirely on logger config we can't see)

### C. (No TTL findings expected from this file)

Missing TTLs would only be visible by reading the cache layer — flag in Section D as something to investigate.

---

## 7. API contract / Behavior preservation

### A. Method called with empty/default values from one branch

- **Location**: line 111 — `await this.handleNotification(notificationId, '', '', '')` from the recovery branch
- **What**: from the happy path, `handleNotification` is called with real `tenantCode`, `languageCode`, `countryCode`. From the "data missing" recovery branch, all three are empty strings.
- **Expected confidence**: **MEDIUM** (the empty values are verifiable; whether the called method handles them safely is unverifiable from this file alone)
- **Production risk**: external services (`fetchRecipientInfo`, `fetchChannelInfo`, `fetchTemplateInfo`) called downstream may reject empty params, or worse, succeed with wrong/garbage data (e.g., wrong locale resolved by default)
- **Falsifier**: the called method explicitly handles empty inputs as "reuse cached context" with documented semantics

### B. Mixed failure signaling — exception vs success-shape

- **Locations**: exception path at 60-62 vs success-shaped path at 164-176
- **What**: the same public surface throws in some paths and returns `{renderInfo: null}` in others
- **Expected confidence**: **MEDIUM**
- **Production risk**: callers must implement two distinct error-handling paths (try/catch AND null-check); easy to miss one and ship a silent bug

---

## Summary — what a strong prompt run should catch

| Category | Findings expected | Notes |
|---|---|---|
| 1. Architecture | 5 (class name, domain leak, long methods, direct imports, dead code) | Domain leak is the test of the worked-example fix; dead code requires cross-file grep |
| 2. Async/Concurrency | 4 (TOCTOU, RMW counter, lost-update list, 5ms polling) | TOCTOU is the test of the worked-example fix |
| 3. Error handling | 3 (.catch discards, silent success, outer catch wraps) | Silent success calibration is HIGH inflation risk |
| 4. Testability | 3 (helper imports, time deps, >5 collaborators) | Some overlap with category 1 |
| 5. Performance | 2 (sequential awaits in 2 methods) | Should NOT include lost-update (precedence rule) |
| 6. Observability | 1-2 (generic messages, structured logging) | TTLs need cache file |
| 7. API contract | 2 (empty-string call, mixed signaling) | Empty-string call is the test of the worked-example fix |

**Realistic catches per run** (validated on ChatGPT o3, 2 runs):

- **Single run typically catches 10-13 of these patterns.** Variance is significant — different patterns surface in different runs, even on the same model with the same input.
- **Two runs combined catch 14-17 patterns.** That's ~30% more coverage from a second run. For serious reviews, run twice.
- **6 patterns are systematic misses** even with two runs:
  - Class name mismatch (architectural judgment)
  - Dead code (requires actual grep, which the model doesn't do)
  - Lost-update on cached lists at 230-246 (gets misclassified as perf)
  - The 9+9 sequential cache reads in `fetchTemplateInfo` and `finalizeNotification` (model fixates on smaller, more visible sequential examples)
  - Direct imports bypassing DI (caught in 1 of 3 runs; trending miss)
  - Mixed failure signaling (exception vs null)

For these systematic misses, **review the file yourself** — they're real bugs the prompt won't reliably surface.

**Calibration**: most findings should be at **MEDIUM** with a few **HIGH** and occasionally **LOW**.

If a run produces fewer than 8 findings, something is wrong (model variance, prompt mis-paste, or weak-tier model). If it produces more than 25, suspect filler.

---

## Composite (Section C) — what to expect

A strong run should produce **at least one end-to-end error path trace** through layers. Specifically:

1. External call fails (e.g., `fetchRecipientInfo`)
2. `.catch(() => ...)` at line 202-204 discards original, throws generic
3. Generic error propagates to outer catch in `handleNotification` (line 164)
4. Outer catch calls `markNotificationFailed` (fire-and-forget if cache layer doesn't await)
5. Returns `Promise.resolve({...messages, renderInfo: null})` — success-shaped
6. Caller sees HTTP 200 with broken data

**What's lost at each transition**: original error type, stack trace, HTTP context, ability to retry intelligently. By step 6, the original failure is unrecoverable from logs.

---

## Section D — what files should be listed

A strong run should list at least these in the "Dependencies to read next":

1. **`notification-cache.service.ts`** — to verify atomicity, fire-and-forget patterns, TTLs
2. **`external-services.service.ts`** — to verify error handling, retry logic, idempotency
3. **`batch-recipient-processor.service.ts`** — to verify the line-ID race surface
4. **`utils` module** (where `fetchTemplateLines`, `generateMessagesForChannel` live) — to verify purity

---

## Final calibration check

A strong output should have:

- All HIGH findings provably anchored in the file (e.g., "5ms poll interval is verifiable")
- All MEDIUM findings tagged with a falsifier referencing unread code
- Zero filler ("could be cleaner" / "consider naming")
- No rewrite at the end (the prompt's hard rule)
- A composite trace in Section C
- Section D listing 3-4 files to investigate

If a run is missing the composite trace, doesn't list any files in Section D, or has HIGH on findings that depend on frontend behavior — calibration regressed.
