# Slash Command for Claude Code

A drop-in slash command version of the Senior Code Review prompt for Claude Code. Unlike the paste-into-chat version, this one **uses Claude Code's file-reading and grep tools** to do real cross-file investigation.

---

## Why this exists (and why it's better than paste-into-chat)

The base prompt at [`PROMPTS/01-senior-code-review.md`](../PROMPTS/01-senior-code-review.md) is designed for ChatGPT or Claude.ai web — paste prompt + paste file, get review. That works, but the model can only see what you paste. So patterns like:

- **Dead code** (requires grep across the codebase)
- **Cache layer atomicity** (requires reading the cache service file)
- **Theatrical-await detection** (requires reading the called function)

…are **persistent misses** in single-file paste-into-chat reviews. The model can flag them as "needs verification" but can't actually verify.

**This slash command fixes that** by giving Claude Code explicit instructions to use its Read and Grep tools after the initial review, to verify cross-file claims and upgrade or drop findings based on what it finds.

In effect, this is a **partial step toward the v2.0 agent version** of the kit — the model still works one-shot, but it can now investigate.

---

## Installation

### Option A — Project-scoped (recommended)

In any project where you want this slash command:

```bash
mkdir -p .claude/commands
cp /path/to/this-kit/CLAUDE-COMMANDS/code-review.md .claude/commands/code-review.md
```

The slash command will be available only in this project.

### Option B — User-scoped (available everywhere)

```bash
mkdir -p ~/.claude/commands
cp /path/to/this-kit/CLAUDE-COMMANDS/code-review.md ~/.claude/commands/code-review.md
```

The slash command will be available in every project on your machine.

---

## Usage

From inside Claude Code, type:

```
/code-review src/path/to/file.ts
```

The slash command will:

1. Read the file you specified
2. Run the senior code review methodology
3. Identify dependencies it should also read (cache layer, controllers, etc.)
4. **Actually read those dependencies** and update its confidence levels
5. **Run grep** to verify claims like dead code
6. Produce the final structured review with verified findings

---

## What you'll see vs. paste-into-chat

| Pattern | Paste-into-chat (PROMPTS/01) | Slash command (CLAUDE-COMMANDS/code-review) |
|---|---|---|
| TOCTOU on processing status | Caught at MEDIUM (depends on cache layer) | After reading cache: confirmed HIGH or dropped |
| Dead code (unused public method) | Persistent miss | Verified via grep — caught reliably |
| Lost-update on cached lists | Persistent miss (perf framing) | Verified via reading cache atomicity — caught |
| Fire-and-forget cache writes | Persistent miss | Verified by reading cache service implementation |
| Sequential cache reads | Sometimes caught | Same |

The slash command isn't perfect — it's still constrained by Claude Code's reasoning depth and the fact that it works one-shot. But it closes several of v1.0's documented persistent-miss gaps.

---

## Caveats

- **The slash command only works inside Claude Code.** It uses Read and Grep tools that don't exist in ChatGPT or Claude.ai web. For those, use [`PROMPTS/01-senior-code-review.md`](../PROMPTS/01-senior-code-review.md).
- **Don't put this slash command's content into CLAUDE.md.** That defeats the purpose — review instructions would load on every conversation, including code-writing tasks. The slash command is designed to be invoked on-demand.
- **Cross-file investigation costs tokens.** Reviewing a file that has 4-5 dependency files to check will use significantly more tokens than paste-into-chat. Worth it for high-stakes reviews; overkill for quick spot-checks.

---

## Why this matters strategically

The split between this slash command and the proactive `PROJECT-RULES/cursor-rules.md` reflects a real LLM-product principle:

- **Persistent context** (CLAUDE.md, .cursorrules) is for things that should always apply — coding standards, project architecture, conventions
- **On-demand actions** (slash commands, skills) are for things invoked when needed — code review, refactor planning, debugging

Mixing them — putting the review prompt in CLAUDE.md — wastes context budget and biases the model toward review-mode thinking even when writing code.

The same principle shows up across agentic tools: system prompt vs user prompt, RAG retrieval vs tool calls, persistent memory vs on-demand search. Choosing the right channel is a design decision, not just packaging.

---

## Reading next

- The base prompt: [`PROMPTS/01-senior-code-review.md`](../PROMPTS/01-senior-code-review.md) — for ChatGPT, Claude.ai, Cursor's chat
- The proactive rules: [`PROJECT-RULES/cursor-rules.md`](../PROJECT-RULES/cursor-rules.md) — for CLAUDE.md, .cursorrules, ChatGPT custom GPT instructions
- The methodology: [`METHODOLOGY/why-this-works.md`](../METHODOLOGY/why-this-works.md)
- Validation evidence: [`EXAMPLES/01-real-nestjs-service-review/validation-evidence.md`](../EXAMPLES/01-real-nestjs-service-review/validation-evidence.md)
