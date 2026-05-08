# Claude Code Skill — Senior Code Review

A drop-in **Agent Skill** version of the Senior Code Review prompt. Unlike the paste-into-chat prompt and the slash command, **a Skill auto-activates** when Claude Code detects that the user is asking for a code review — no `/command` typing required.

This is the **recommended Claude Code packaging** of the kit.

---

## Skill vs. slash command vs. paste-into-chat

The same review methodology ships in three forms. Pick based on how you work.

| Form | How you invoke it | Where it lives |
|---|---|---|
| **Skill** *(this folder)* | Auto-activated when you say "review this", "audit src/foo.ts", "check this file for bugs" | `~/.claude/skills/code-review/SKILL.md` (user) or `.claude/skills/code-review/SKILL.md` (project) |
| **Slash command** ([`CLAUDE-COMMANDS/`](../CLAUDE-COMMANDS/)) | Explicit: `/code-review src/foo.ts` | `~/.claude/commands/code-review.md` or `.claude/commands/code-review.md` |
| **Paste-into-chat** ([`PROMPTS/01-senior-code-review.md`](../PROMPTS/01-senior-code-review.md)) | Paste prompt + paste file into ChatGPT, Claude.ai, Cursor chat | N/A — copy/paste each time |

**The Skill is the right default for Claude Code.** A Skill auto-fires when its description matches your request. You write "can you review src/foo/bar.service.ts" and Claude Code pulls in the methodology automatically. No command to remember, no paste step.

The slash command is useful if you want **explicit** invocation — for example, in a workflow where you want to be sure the review methodology runs and not some other interpretation of "review."

---

## Installation

### Option A — Project-scoped (recommended)

Inside a project where you want the Skill available:

```bash
mkdir -p .claude/skills/code-review
cp /path/to/this-kit/SKILLS/code-review/SKILL.md .claude/skills/code-review/SKILL.md
```

The Skill activates only inside this project.

### Option B — User-scoped (available everywhere)

```bash
mkdir -p ~/.claude/skills/code-review
cp /path/to/this-kit/SKILLS/code-review/SKILL.md ~/.claude/skills/code-review/SKILL.md
```

The Skill activates in every Claude Code session on your machine.

After install, **restart Claude Code** so it picks up the new Skill.

---

## Usage

You don't type a command. Just ask for a review naturally:

```
review src/checkout/checkout-dispatch.service.ts
```

```
can you audit this file for production risks?
```

```
look at src/foo/bar.controller.ts and tell me what's wrong with it
```

When the Skill activates, Claude Code will:

1. Identify the target file from your request (or ask if ambiguous)
2. Read the file
3. Run the senior code review methodology across 7 categories
4. Identify dependencies it should also read (cache layer, controllers, etc.)
5. **Actually read those dependencies** and update confidence levels
6. **Run grep** to verify claims like dead code
7. Produce the structured review with verified findings

---

## What you'll see vs. paste-into-chat

| Pattern | Paste-into-chat (PROMPTS/01) | Skill / slash command (with tools) |
|---|---|---|
| TOCTOU on processing status | Caught at MEDIUM (depends on cache layer) | After reading cache: confirmed HIGH or dropped |
| Dead code (unused public method) | Persistent miss | Verified via grep — caught reliably |
| Lost-update on cached lists | Persistent miss (perf framing) | Verified via reading cache atomicity — caught |
| Fire-and-forget cache writes | Persistent miss | Verified by reading cache service implementation |
| Sequential cache reads | Sometimes caught | Same |

The Skill closes several v1.0 documented persistent-miss gaps.

---

## Tool scoping (security)

The frontmatter declares `allowed-tools: Read, Grep`. The Skill cannot use Bash, Edit, Write, or any tool outside that allowlist. This is deliberate: a code review should not be able to modify your codebase, run shell commands, or fetch from the network. Principle of least privilege.

If you need broader behavior (e.g., a Skill that also writes a fix), that's a different Skill — keep them separate.

---

## Caveats

- **The Skill only works inside Claude Code.** ChatGPT, Cursor, and Claude.ai web don't have Agent Skills. For those, use [`PROMPTS/01-senior-code-review.md`](../PROMPTS/01-senior-code-review.md).
- **Don't put the review methodology in CLAUDE.md.** A Skill is the right place for on-demand methodology. Putting it in CLAUDE.md loads it on every conversation, including code-writing tasks where review-mode rules don't apply.
- **Cross-file investigation costs tokens.** Reviewing a file with 4-5 dependencies will use significantly more tokens than paste-into-chat. Worth it for high-stakes reviews; overkill for quick spot-checks.
- **Skill activation depends on the description matching your request.** If Claude Code doesn't auto-trigger the Skill, you can prompt it directly: "use the senior-code-review Skill on src/foo.ts."

---

## Why a Skill (and not just a slash command)

Slash commands and Skills are both "on-demand actions" — but they have different ergonomics:

- **Slash command:** user must remember the command exists, type `/code-review`, pass arguments.
- **Skill:** description-matched auto-activation. The user describes their intent in natural language; Claude Code picks the right Skill.

For a review prompt, **Skill is the better fit** — reviewers don't think "I should run the review command," they think "review this file." A Skill matches that mental model directly.

The slash command stays in this kit as an alternative for explicit-invocation workflows.

---

## Why this matters strategically

The split between Skill (on-demand action), slash command (explicit on-demand action), and proactive `PROJECT-RULES/cursor-rules.md` reflects a real LLM-product principle:

- **Persistent context** (CLAUDE.md, .cursorrules) is for things that should always apply — coding standards, project architecture, conventions
- **On-demand actions** (Skills, slash commands) are for things invoked when needed — code review, refactor planning, debugging

Mixing them — putting the review prompt in CLAUDE.md — wastes context budget and biases the model toward review-mode thinking even when writing code.

The same principle shows up across agentic tools: system prompt vs user prompt, RAG retrieval vs tool calls, persistent memory vs on-demand search. Choosing the right channel is a design decision, not just packaging.

---

## Reading next

- The slash command: [`CLAUDE-COMMANDS/`](../CLAUDE-COMMANDS/) — same content, explicit-invocation form
- The base prompt: [`PROMPTS/01-senior-code-review.md`](../PROMPTS/01-senior-code-review.md) — for ChatGPT, Claude.ai, Cursor's chat
- The proactive rules: [`PROJECT-RULES/cursor-rules.md`](../PROJECT-RULES/cursor-rules.md) — for CLAUDE.md, .cursorrules, ChatGPT custom GPT instructions
- The methodology: [`METHODOLOGY/why-this-works.md`](../METHODOLOGY/why-this-works.md)
- Validation evidence: [`EXAMPLES/01-real-nestjs-service-review/validation-evidence.md`](../EXAMPLES/01-real-nestjs-service-review/validation-evidence.md)
