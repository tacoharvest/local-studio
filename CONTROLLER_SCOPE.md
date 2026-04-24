# Controller Scope — v2 (Minimal, Functional, Scalable)

> Target location: `~/ai/vllm-studio` (greenfield) or `controller/` rewrite in-place.
> Current size: **21,258 LoC** / **100+ files** / **13 runtime deps** across 8 modules.
> Target size: **~4,500 LoC** / **~40 files** / **6 runtime deps** across 5 domains.

---

## 1. Problem statement

The controller does its job but has grown past what a single-purpose service should own. Symptoms:

- **Deep nesting without payoff.** `lifecycle/` has 8 sub-sub-directories (`state/`, `process/`, `engines/`, `runtime/`, `platform/`, `recipes/`, `routes/`, `metrics/`) for what is essentially "launch a subprocess and track it."
- **Chat module is bigger than the rest combined for its actual responsibility.** 5,666 LoC, 30+ files under `chat/agent/` for an OpenAI-compatible proxy plus a local agent runtime (tool registry, circuit breaker, compaction, run manager, SSE, factories, mock factories, event handlers…).
- **Three overlapping "orchestrators"** in `jobs/` (`auto-orchestrator`, `memory-orchestrator`, `orchestrator`) — none have a single clear purpose. `workflows/` contains one file.
- **Three parallel usage stores** (`sqlite-spend-logs.ts` 439 LoC, `postgres.ts` 404 LoC, `chat-database.ts` 292 LoC) when one canonical sqlite store would do.
- **`pi-agent-core` + `pi-ai` + `agentfs-sdk`** are external dependencies for features the product doesn't visibly use (or uses for one narrow path). Each drags surface area.
- **Metrics collector is a 364-line polling loop** that never wired up TTFT despite the frontend dashboard expecting it. Peak-gate logic quietly hides prompt-throughput data.
- **No clear layering.** `services/inference/inference-client.ts` and `modules/proxy/openai-routes.ts` both talk to the upstream server; `types/` competes with `contracts/` for schema ownership.

---

## 2. Design principles

1. **One reason to exist.** The controller is: *a local orchestrator for vLLM/SGLang/llama.cpp — launches them, proxies OpenAI traffic, exposes state over HTTP+SSE.* Nothing else.
2. **No feature without a frontend that renders it.** If the dashboard doesn't read it, it's not in v2.
3. **Sqlite is the only datastore.** No Postgres, no Redis, no external brokers. If we need more, we add it later with evidence.
4. **Flat modules, explicit boundaries.** Max 2 levels deep. Each module owns: its types, its store, its routes, its tests. No cross-module imports except through a thin `core/` (logger, config, errors, sqlite, sse).
5. **Streaming is first-class, not bolted on.** SSE lifecycle and usage emission live in the proxy, not the chat runtime.
6. **No dependencies with narrow blast radius.** Drop `pi-agent-core`, `pi-ai`, `agentfs-sdk`, `pg`. Keep: `hono`, `zod`, `prom-client`, `yaml`, `dotenv`, `bun:sqlite` (built-in).
7. **Tests live next to code.** No `/tests/` top-level folder.

---

## 3. Target domain model

Five domains. That's it.

| Domain       | Responsibility                                                              | Target LoC |
|--------------|-----------------------------------------------------------------------------|-----------:|
| `lifecycle/` | Launch/evict vLLM, SGLang, llama.cpp. Recipes. Process tracking.            |     ~1,200 |
| `proxy/`     | OpenAI-compatible passthrough. Streaming. Usage extraction. Tool calls.     |       ~800 |
| `chat/`      | Sqlite-persisted session history. Turns, messages, usage rollups.           |       ~600 |
| `telemetry/` | GPU info, process metrics, vLLM Prometheus scrape, SSE event bus, logs.     |       ~700 |
| `system/`    | Health, status, config, disk, GPU, model browser — all read-only endpoints. |       ~500 |
| `core/` + `http/` | logger, sqlite, errors, sse, hono app, middleware.                     |       ~700 |
| **Total**    |                                                                             | **~4,500** |

---

## 4. Target file tree

```
controller/src/
  main.ts                         # 40 LoC — start server, wire shutdown
  app-context.ts                  # 60 LoC — one container, no nested factories
  core/
    config.ts                     # env parsing (replaces config/env.ts + persisted-config.ts)
    logger.ts
    errors.ts                     # HttpStatus + onError handler
    sqlite.ts                     # bun:sqlite wrapper (replaces stores/sqlite.ts)
    sse.ts                        # event bus + SSE stream writer
    async.ts                      # AsyncLock, delay (keep)
  http/
    app.ts                        # Hono wiring
    middleware.ts                 # cors, auth, rate-limit, request log — one file
    openapi.ts                    # spec + /api/docs
  lifecycle/
    coordinator.ts                # ensureActive / launch / evict (flattened state/)
    process.ts                    # spawn, track, kill (flattened process/)
    engines.ts                    # vLLM + SGLang + llama.cpp arg builders (one file, replaces engines/backends.ts + runtime/*.ts)
    recipes.ts                    # sqlite-backed CRUD (flattened recipes/)
    gpu.ts                        # nvidia-smi + amd-smi (merge platform/*.ts into one)
    routes.ts
  proxy/
    openai.ts                     # /v1/chat/completions, /v1/models passthrough
    stream.ts                     # SSE relay with abort-safe lifecycle + usage extraction
    tool-calls.ts                 # parser (trimmed from 817 to ~300)
    tokenize.ts                   # /v1/tokenize passthrough
    routes.ts
  chat/
    store.ts                      # sessions + messages + runs + usage — one sqlite store
    routes.ts                     # /chats CRUD + /turn streaming
  telemetry/
    collector.ts                  # 5s poll: GPU + vLLM Prometheus + process state → SSE
    prometheus.ts                 # scrape parser (TTFT actually wired)
    events.ts                     # event manager + /events SSE endpoint
    logs.ts                       # tail + /logs endpoint
    metrics-store.ts              # peak + lifetime counters (sqlite)
    routes.ts                     # /metrics /events /logs
  system/
    health.ts                     # /health /status
    info.ts                       # /gpus /config /compat /runtime/* /studio/settings
    models.ts                     # /studio/models browser
    routes.ts
```

**Gone:**
- `modules/audio/` (STT/TTS) — move to a separate service if needed. Not core to "launch vLLM."
- `modules/jobs/` (three orchestrators + workflows) — replace with a single 80-line "background task" helper inside the caller that needs it, or cut entirely.
- `modules/studio/` — merged into `system/`.
- `modules/downloads/` — can live as `system/downloads.ts` (~150 LoC) or be removed if the frontend doesn't currently use it.
- `services/` top-level — folded into the domain that owns it (`inference-client` → `proxy/`; `provider-routing` → `proxy/`; `integrations/cli` → delete; `integrations/stt`/`tts` → out).
- `contracts/` — merged into `types/` with per-module co-location.
- `pi-agent-core`, `pi-ai`, `agentfs-sdk`, `pg` (and all `postgres.ts` + `sqlite-spend-logs.ts` code).

---

## 5. What each domain explicitly owns

### lifecycle
- **Public API:** `ensureActive(recipe)`, `launch(recipe)`, `evict(force)`, `cancelLaunch(id)`.
- **Engines:** one `buildArgs(recipe)` function per engine (vLLM, SGLang, llama.cpp). No subclass hierarchy.
- **Process:** spawn with stdio capture to log file, PID file, SIGTERM → SIGKILL escalation.
- **Recipes:** `id, name, backend, model_path, served_model_name, args, python_path`. That's the schema.
- **GPU:** one module that detects NVIDIA or AMD and returns a normalized `GpuInfo[]`.

### proxy
- **Passthrough** `/v1/*` with minimal body mutation. The only rewrite: inject `stream_options.include_usage=true` for streaming.
- **Stream lifecycle** is where the abort handling lives (client disconnects → cancel upstream; upstream errors → 499/502 based on cause).
- **Usage extraction** from both streaming chunks and non-streaming bodies. Emit `usage` to `telemetry` and persist to `chat.store` via `chat`.
- **Tool calls** parser is for non-native models only; keep XML/JSON extraction, drop the 500-line dead paths.

### chat
- **One sqlite schema:** `sessions`, `messages`, `runs`, `usage`.
- **Routes:** list/get/delete sessions; `/chats/:id/turn` proxies to `/v1/chat/completions` and persists.
- **No agent runtime.** No `pi-agent-core`, no `agentfs-sdk`, no in-controller tool registry. If the product needs agentic behavior, it goes in the frontend or a dedicated service.

### telemetry
- **Collector** polls GPU + vLLM `/metrics` every 5s and publishes `metrics` events.
- **TTFT wired properly** from `vllm:time_to_first_token_seconds_*` histograms (quantiles, not just sum/count).
- **Peak gate lives in the store, not the collector** — cleaner semantics.
- **Event manager** is the SSE backbone: `metrics`, `logs`, `lifecycle`, `chat`. One channel multiplexed.

### system
- Read-only endpoints only. No mutations. Pulls from lifecycle/telemetry state.

---

## 6. Migration path

Three phases, each independently shippable.

### Phase 1 — Prune (no new code)
- Delete `modules/audio/`, `modules/jobs/`, `modules/studio/` (move needed bits to `system/`).
- Delete `services/integrations/cli`, `stt`, `tts`.
- Delete `postgres.ts`, `sqlite-spend-logs.ts`, `chat-database.ts` — replace usage references with existing `LifetimeMetricsStore`.
- Delete `pi-agent-core`, `pi-ai`, `agentfs-sdk` imports and the files that reference them (chat/agent/*).
- Remove `pg` from deps.
- **Expected delta:** –9,000 to –11,000 LoC. Controller still functional as proxy + lifecycle + basic chat persistence.

### Phase 2 — Flatten
- Collapse `lifecycle/{state,process,engines,runtime,platform,recipes,routes,metrics}` → `lifecycle/{coordinator,process,engines,recipes,gpu,routes}.ts`.
- Collapse `chat/agent/*` → `chat/store.ts` + `chat/routes.ts`. Streaming + tool-call logic moves to `proxy/`.
- Move `services/` contents into `proxy/` and delete the folder.
- Rename `monitoring/` → `telemetry/`; merge `metrics.ts` + `metrics-store.ts` + `metrics-collector.ts` into `telemetry/collector.ts` + `telemetry/metrics-store.ts`.
- **Expected delta:** –3,000 LoC, same behavior.

### Phase 3 — Fix and polish
- Wire TTFT from vLLM Prometheus quantile buckets.
- Move peak-gate into `metrics-store.updateIfBetter`; remove the `generationThroughput > 5` conditional in the collector.
- Add staleness indicator to frontend: controller emits `metrics_stale: true` when no chat activity in N seconds, so the dashboard can grey out peak-derived numbers instead of showing stale data as live.
- Add `cached_tokens` and `context_window` to the `/metrics` payload so dashboard and chat-ctx chip read from one source.
- Replace 5-second poll with event-driven updates where possible (`lifecycle` emits on launch/evict; `proxy` emits on usage).

---

## 7. Non-goals (v2)

Explicitly out of scope — do not bring back without a concrete product need:

- Background job orchestration (`jobs/`, `workflows/`).
- Agentic tool-calling runtime inside the controller.
- Postgres / Redis / Temporal / any external infra dep.
- Voice pipelines (STT/TTS).
- Model downloads management (if frontend doesn't use it).
- Spend/cost tracking beyond raw token counts.
- Multi-tenant auth. The controller is a single-user local service.

---

## 8. Success criteria

- `wc -l src/**/*.ts` ≤ 5,000.
- `src/` tree fits on one screen when run through `tree -L 2`.
- `npm run typecheck && bun test && npm run lint` green.
- `package.json` dependencies ≤ 7 runtime.
- Dashboard shows live TTFT, prefill peak, decode peak, cache hit rate, and sessions with no regressions vs today.
- Cold-start + ready-for-requests in under 500 ms on the remote box.
- `docker compose` config no longer references controller (it's native-only, confirmed via remote memory).
