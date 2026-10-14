# Context Coach

A Pi extension for cost-aware context management, task-boundary compaction nudges,
and smarter agent workflows.

**Status: in development.** Pricing audits and task-boundary compaction actions
and narrow GitHub polling coaching are implemented.
Nothing is published to npm yet.

## Installation

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

## Optional onboarding and your workflow

Run `/context-coach onboard` for a guided walkthrough. It explains the pricing
audit, phase handoffs, and agent polling coaching, then walks through all five
milestones. For each, keep the opinionated default or add your own completion
criteria, including skills, checks, tools, or required artifacts. For example:

> Implementation complete: use our TDD skill, pass tests and typecheck, and record
> remaining risks before review.

The final screen previews all criteria and the destination before saving. Escape
or decline at any step to cancel without writing. Onboarding never launches a
model request, changes Pi settings, runs referenced skills, or compacts history.
It is opt-in; the defaults work without it.

Choose personal (`<agent-dir>/context-coach.json`) or project
(`.pi/context-coach.json`) scope. Project scope is offered and loaded only for
trusted projects. Project criteria override personal criteria per phase; an
explicit empty criterion selects the opinionated default for that phase.
Project files can be committed to share a team's workflow. Keep secrets out:
criteria are sent to the model provider as guidance.

Use `/context-coach workflow` to inspect the effective criteria and `onboard` to
revise them. Guidance is loaded on the next run into a stable prompt section,
not appended as repeated chat messages. Invalid files are reported and ignored.
Saving is atomic and rejects concurrent edits.

Custom criteria supplement—not replace—the milestones. The agent must explain
observed evidence and explicitly attest that applicable criteria are satisfied.
This is guidance and self-reporting, not independent verification or automatic
skill detection. Plan approval still requires your explicit checkpoint; custom
criteria cannot grant the agent permission to approve it or compact automatically.

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

## Agent polling coaching

The coach recognizes these explicit machine-readable checks:

```bash
gh run view <numeric-id> --json status,conclusion
gh pr checks <numeric-id> --json name,state
```

After three unchanged pending snapshots of the same target within ten minutes,
it sends one short agent-facing instruction after tool results are finalized,
without requesting another model turn. The instruction suggests a supported
watcher or bounded polling script with timeout and cancellation. It does not
rewrite commands, block tools, or trigger compaction. PR checks returning pending
exit code 8 are supported when structured output is available.

Normalized states are compared by hash; raw logs are not retained. Completion,
failure, progress, malformed JSON, and oversized results reset or bypass
coaching. Watcher-internal polling and unknown shell scripts are not inspected.

Use `/context-coach polling off` or `polling on` to control agent hints for the
active branch/session. This is separate from `dismiss`, which controls user
task-boundary suggestions. User suggestions stay outside model context; polling
guidance must enter model context to influence the agent.

## Coaching scope

- **Pricing-aware setup:** audit per-model compaction thresholds against known
  long-context pricing boundaries; show read-only settings previews for manual application.
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
npm run pack:check
npm run smoke
```

Pi loads the TypeScript entry point directly; no compilation or bundled host
runtime is needed. Host APIs are peer dependencies and development dependencies,
not runtime dependencies.

## Publishing

The initial candidate version is **0.1.0**. Nothing has been published by this
stack. Once the release PR is reviewed and merged, the package will be installable
from npm after an explicit publication:

```bash
pi install npm:pi-context-coach
```

Publishing is maintainer-controlled, not automatic on merge. The manual
`Publish npm package` workflow runs only on `main`, uses the GitHub `npm`
environment, reruns checks, loads the actual tarball in Pi without a model
request, and publishes that validated tarball with provenance.

Before enabling publication:

1. Review and merge the feature stack bottom-up. Retarget/rebase child PRs after
   merging parents so each review stays focused.
2. Configure required reviewers for the GitHub `npm` environment if your plan
   supports them, and restrict deployment branches to `main`.
3. Bootstrap the npm package if necessary. If npm does not allow trusted publisher
   configuration before the first release, an authenticated maintainer must
   explicitly run `npm publish --access public` from a clean, reviewed `main`
   checkout. The `prepublishOnly` hook runs local checks first. Never commit tokens.
4. Configure npm trusted publishing for owner `MrDHat`, repository
   `pi-context-coach`, workflow `publish.yml`, and environment `npm`. The workflow
   needs this external npm configuration; no token fallback is embedded.
5. For later releases, update manifest and lockfile together with
   `npm version <version> --no-git-tag-version`, summarize changes in the release
   PR, and merge it before manually dispatching the workflow on `main`.

The workflow cannot publish the same version twice. Releases remain 0.x while
interfaces and heuristics evolve; record release notes in GitHub rather than a
separate documentation file. CI covers Node 22.19 and 24 against Pi 1.2.0.

## Inspiration

[Context management is an underrated habit](https://ideas.fin.ai/p/context-management-is-an-underrated)
by Akshay Katyal. Context Coach translates those practices into Pi-specific,
explainable coaching rather than adopting Claude Code command names or thresholds
unchanged.

## License

MIT, copyright Akshay Katyal.
