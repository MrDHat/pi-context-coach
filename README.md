# Context Coach

A Pi extension for cost-aware context management, task-boundary compaction nudges,
and smarter agent workflows.

**Status: scaffold only.** `/context-coach` confirms the extension is loaded.
Pricing audits, nudges, compaction actions, and polling coaching are planned, not
implemented. Nothing is published to npm yet.

## Try the scaffold

Requires Node.js **22.19.0 or newer** and Pi **1.2.x**. The declared peer range is
Pi 1.x from 1.2.0 onward; CI currently typechecks against 1.2.0.

From a checkout, load it for one invocation without changing your Pi settings:

```bash
pi -e ./src/index.ts
```

Then run `/context-coach`. To install the repository persistently:

```bash
pi install git:github.com/MrDHat/pi-context-coach
```

Run `/reload` in an existing Pi session after installation. Extensions execute
with your operating-system permissions; review source before installing.

## Planned coaching

- **Pricing-aware setup:** audit per-model compaction thresholds against known
  long-context pricing boundaries; preview changes and apply only with approval.
- **Context nudges:** quiet reminders around 120K tokens, stronger reminders around
  180K, adjusted for the active model and configuration.
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
