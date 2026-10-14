# Context Coach

An opinionated Pi extension that helps you keep useful context, hand off between
phases, and avoid wasteful agent workflows.

Context Coach does three things:

- **Audits compaction settings** against known long-context pricing boundaries.
- **Suggests compaction at meaningful milestones**, not whenever a token counter
  crosses a threshold.
- **Coaches repeated polling** toward bounded watchers instead of model-level
  check/sleep loops.

It suggests; you decide. It never automatically compacts, starts a new session,
or changes Pi's compaction settings.

**Experimental.** npm publication is pending; install from GitHub for now.

## Quick start

Requires Pi **1.2.0 or newer within 1.x** and Node.js **22.19.0 or newer**.
Compatibility is currently tested against Pi 1.2.0 on Node 22.19 and 24.

```bash
pi install git:github.com/MrDHat/pi-context-coach
```

Run `/reload` in an existing Pi session, then:

```text
/context-coach onboard
```

Onboarding is optional. The default milestone policy works without it. Extensions
run with your operating-system permissions; review the source before installing.

To try a checkout for one invocation without installing it:

```bash
pi -e ./src/index.ts
```

## Define what “complete” means in your workflow

Onboarding introduces the features, walks through five milestones, and lets you
keep the defaults or add requirements such as skills, checks, and artifacts:

> Implementation complete: our TDD skill is finished, tests and typecheck pass,
> and remaining risks are documented before review.

You choose where to save the criteria, then review everything before confirming:

| Scope    | Location                         | Behavior                                                                               |
| -------- | -------------------------------- | -------------------------------------------------------------------------------------- |
| Personal | `<agent-dir>/context-coach.json` | Used across projects; the default agent directory is `~/.pi/agent`                     |
| Project  | `.pi/context-coach.json`         | Offered and loaded only in trusted projects; overrides personal criteria per milestone |

An empty project criterion uses the opinionated default rather than inheriting
that personal criterion. Project profiles can be committed to share a team's
workflow. Cancel any step to exit without writing.

Use `/context-coach workflow` to inspect effective criteria, or rerun onboarding
to revise them. Saved guidance takes effect on the next agent run.

**Custom criteria guide the agent; they do not verify completion.** Naming a skill
does not execute it or prove it ran. The agent must explain its evidence and
explicitly attest that applicable criteria are satisfied. Keep secrets out of
criteria: this guidance is sent to your model provider.

## Compact at handoffs, not arbitrary token counts

These are the boundaries Context Coach recognizes:

| Milestone                          | Suggested next action                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| Investigation concluded            | Compact before implementation; preserve the conclusion and supporting evidence    |
| Plan agreed by you                 | Compact before execution; preserve the approved approach and acceptance checks    |
| Implementation complete            | Compact before review; preserve changes, verification results, and open questions |
| PR ready for review                | Compact before handling feedback; preserve scope, key decisions, and checks       |
| Task complete; unrelated work next | Start fresh; save a concise handoff if needed                                     |

The agent can report a milestone using `context_coach_checkpoint`. Edits, passing
commands, and commits alone never create a boundary. Continued edits or
contradictory verification invalidate a readiness report.

Plan approval is yours, not the agent's. Mark it explicitly:

```text
/context-coach checkpoint plan
```

You can mark any milestone with `checkpoint investigation`, `plan`,
`implementation`, `pr`, or `done`. A checkpoint records your assertion; it does
not independently validate the work.

A suggestion looks like this:

```text
Context Coach — Implementation complete
Compact before review to preserve the changed files, verification results,
unresolved questions, and next step.
/context-coach compact · /context-coach snooze
```

Suggestions appear after the agent settles. Context size is only an eligibility
gate: the default minimum is 120K current context tokens, lowered to 60% of the
effective budget for smaller models or earlier compaction limits. Crossing a
size threshold alone never produces a reminder or footer hint. Unknown context
usage produces no suggestion.

Suggestions have a 20K-token cooldown. Snooze, dismissal, the minimum, and cooldown
state are saved per model on the active session branch, outside model context.
Successful compaction resets cooldown and snooze, but preserves your minimum and
dismissal choice. Failed or cancelled compaction does not reset them.

`/context-coach compact` waits until idle, asks for confirmation, and rechecks
session, model, history, and queued work before making the summarization request.
Compaction is lossy and costs tokens. Save important decisions in a handoff or
issue when they need to survive reliably.

## Reduce the risk of long-context charges

At startup and model changes, the pricing audit warns when installed model
metadata describes higher long-context rates and your compaction trigger leaves
insufficient headroom. Unchanged warnings are deduplicated.

```text
/context-coach audit
```

The audit resolves per-model compaction overrides and suggests a trigger with at
least 25% headroom below the known pricing boundary. It shows a settings fragment
for you to merge manually, preserving other values, then apply with `/reload`.
It does not write Pi settings.

**This is not a billing cap.** Pricing metadata can be stale, token estimates can
differ from provider billing, and large inputs can overshoot a threshold. Missing
pricing tiers are reported as unknown—not proof that no surcharge exists.

## Keep polling inside a tool

For repeated unchanged GitHub status checks, the coach tells the agent to prefer
a supported watcher or a bounded polling script with timeout and cancellation.
It does not execute a watcher, rewrite commands, block tools, or trigger
compaction. Guidance reaches the agent after tool results are finalized, without
requesting an additional model turn.

Detection currently supports these explicit machine-readable commands:

```bash
gh run view <numeric-id> --json status,conclusion
gh pr checks <numeric-id> --json name,state
```

Three unchanged pending snapshots of the same target within ten minutes trigger
one hint. Normalized states are compared by hash; raw logs are not retained.
Progress, completion, failure, malformed output, and oversized results reset or
bypass coaching. Watcher-internal polling and unknown scripts are not inspected.
This is deliberately narrow detection, not universal polling enforcement.

Polling hints go to the agent, not the user notification UI. They are separate
from task-boundary suggestions and can be disabled independently.

## Commands

| Command                                     | Purpose                                                       |
| ------------------------------------------- | ------------------------------------------------------------- |
| `/context-coach` or `/context-coach status` | Inspect current context and session controls                  |
| `/context-coach onboard`                    | Walk through features and define completion criteria          |
| `/context-coach workflow`                   | Show effective completion criteria                            |
| `/context-coach audit`                      | Inspect pricing metadata and compaction headroom              |
| `/context-coach checkpoint <milestone>`     | Explicitly mark a meaningful boundary                         |
| `/context-coach compact`                    | Request a focused summary, with confirmation                  |
| `/context-coach snooze`                     | Defer boundary suggestions for another 20K context tokens     |
| `/context-coach dismiss`                    | Disable boundary suggestions for this model/session           |
| `/context-coach resume`                     | Re-enable boundary suggestions                                |
| `/context-coach minimum <tokens>`           | Set the minimum context for boundary suggestions              |
| `/context-coach polling on\|off`            | Enable or disable agent polling hints for this branch/session |

Dialogs and notifications require Pi's interactive UI or a compatible RPC client.
Headless runs do not open onboarding or user dialogs. Agent guidance still works
without a UI.

## Development

```bash
npm ci --ignore-scripts
npm run check
npm run test:watch
npm run format
npm run pack:check
npm run smoke
```

Pi loads the TypeScript entry point directly. Host APIs are peer dependencies,
not bundled runtime dependencies. CI checks formatting, types, tests, package
contents, and actual Pi loading of both source and tarball without model requests.

<details>
<summary>Maintainer release instructions</summary>

The candidate version is 0.1.0. Publication is an explicit maintainer action,
not automatic on merge. After publication, users can install with
`pi install npm:pi-context-coach`.

The manual **Publish npm package** workflow runs only on `main`. It validates the
release tarball and publishes it using npm trusted publishing and provenance.

1. Configure the GitHub `npm` environment with required reviewers where supported
   and restrict deployment branches to `main`.
2. Bootstrap the npm package if needed: an authenticated maintainer can explicitly
   run `npm publish --access public` from a clean, reviewed `main` checkout. The
   `prepublishOnly` hook runs validation first. Never commit credentials.
3. Configure npm trusted publishing for owner `MrDHat`, repository
   `pi-context-coach`, workflow `publish.yml`, and environment `npm`. The workflow
   has no embedded token fallback.
4. For subsequent releases, update manifest and lockfile with
   `npm version <version> --no-git-tag-version`, review and merge the release
   change, then manually dispatch the workflow on `main`.

A version cannot be published twice. Record release notes in GitHub. Interfaces
and heuristics may evolve while the package remains 0.x.

</details>

## Inspiration

[Context management is an underrated habit](https://ideas.fin.ai/p/context-management-is-an-underrated)
by Akshay Katyal. Context Coach translates those practices into an opinionated Pi
workflow rather than copying Claude Code commands or thresholds unchanged.

## License

MIT, copyright Akshay Katyal.
