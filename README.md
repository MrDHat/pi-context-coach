# Context Coach

A Pi extension for cost-aware context management, task-boundary compaction nudges,
and smarter agent workflows.

**Status: in development.** Pricing audits and task-boundary compaction actions
are implemented. Polling coaching is coming in the next PR.
Nothing is published to npm yet.

## Try the scaffold

Requires Node.js **22.19.0 or newer** and Pi **1.2.x**. The declared peer range is
Pi 1.x from 1.2.0 onward; CI currently typechecks against 1.2.0.

From a checkout, load it for one invocation without changing your Pi settings:

```bash
pi -e ./src/index.ts
```

Then run `/context-coach audit` to inspect the active model's pricing metadata and
effective compaction trigger. Risky configurations get a deduplicated startup or
model-change warning. Suggested settings are a read-only preview: merge them
manually, preserving your other settings, then `/reload`. Missing pricing tiers
are reported as unknown, not as proof of no surcharge.

To install the repository persistently:

```bash
pi install git:github.com/MrDHat/pi-context-coach
```

Run `/reload` in an existing Pi session after installation. Extensions execute
with your operating-system permissions; review source before installing.

## Task boundaries and compaction

The boundary policy is opinionated, following the article's meaningful stopping
points—not counts of tool calls:

| Milestone                          | Suggested handoff                                                         |
| ---------------------------------- | ------------------------------------------------------------------------- |
| Investigation concluded            | Compact before implementation; preserve conclusion and evidence           |
| Plan agreed by the user            | Compact before execution; preserve approach and acceptance checks         |
| Implementation complete            | Compact before review; preserve changes, verification, and open questions |
| PR ready for review                | Compact before handling review feedback; preserve scope and key decisions |
| Task complete; unrelated work next | Start fresh; write a handoff if needed                                    |

Edits, passing commands, and commits alone **never nominate a boundary**. The
agent can report a milestone with the `context_coach_checkpoint` tool and concise
factual evidence. Reports are attestations, not independently verified completion.
Plan agreement must be marked explicitly by the user; the tool cannot report it.
Continued edits or contradictory verification invalidate a readiness report.
Notifications wait for the agent to settle and respect snoozing/dismissal.
Boundary suggestions have a persisted 20K-token cooldown.

**Context size alone never triggers a reminder or a footer/status hint.** A task
boundary is required. Current context usage is only an eligibility gate: by
default, at least 120K tokens, reduced to 60% of the effective budget for smaller
models or earlier compaction limits. Unknown usage produces no suggestion.

- `/context-coach` or `/context-coach status`: explicitly inspect context and controls.
- `/context-coach minimum 120000`: set the minimum context for boundary suggestions.
- `/context-coach snooze`: postpone boundary suggestions for another 20K tokens.
- `/context-coach dismiss`: disable boundary suggestions for this model/session.
- `/context-coach resume`: re-enable boundary suggestions.

Controls and cooldowns are saved outside model context and restored from the
active branch. Successful compaction resets cooldown/snooze; failed or cancelled
compaction does not. No size-triggered warnings or automatic compaction are added.

You can explicitly mark a phase with `/context-coach checkpoint` followed by
`investigation`, `plan`, `implementation`, `pr`, or `done`. This does not infer
approval from natural language or tell the agent the task is finished. `done` suggests `/new`
for unrelated work; the coach never changes sessions for you.

Use `/context-coach compact` to request a focused summary. It waits until idle,
asks for confirmation, and checks session/model/history identity and queued work
again before starting. Compaction is lossy and makes a model request. Important
decisions should also live in an inspectable handoff or issue.

## Coaching scope

- **Pricing-aware setup:** audit per-model compaction thresholds against known
  long-context pricing boundaries; preview changes and apply only with approval.
- **Task boundaries:** suggest compaction after meaningful checkpoints, or a fresh
  session for unrelated work. Tool sequences are evidence, not proof of completion.
- **Agent workflow:** recognize repeated unchanged polling and suggest a bounded
  watcher instead of model-level check/sleep loops.

The coach will not guarantee a billing cap. Token estimates and pricing metadata
can differ from provider billing, and a single large request can overshoot a
threshold. Existing Pi automatic compaction remains the safety net.

## Development

```bash
npm ci --ignore-scripts
npm run check
npm run test:watch
npm run format
npm pack --dry-run --ignore-scripts
```

Pi loads the TypeScript entry point directly; no compilation or bundled host
runtime is needed. Host APIs are peer dependencies and development dependencies,
not runtime dependencies.

## Inspiration

[Context management is an underrated habit](https://ideas.fin.ai/p/context-management-is-an-underrated)
by Akshay Katyal. Context Coach translates those practices into Pi-specific,
explainable coaching rather than adopting Claude Code command names or thresholds
unchanged.

## License

MIT, copyright Akshay Katyal.
