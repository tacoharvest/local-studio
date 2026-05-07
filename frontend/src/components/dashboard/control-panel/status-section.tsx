// CRITICAL
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GPU, Metrics, ProcessInfo, RecipeWithStatus, RuntimePlatformKind } from "@/lib/types";
import { toGB, toGBFromMB } from "@/lib/formatters";

interface StatusSectionProps {
  currentProcess: ProcessInfo | null;
  currentRecipe: RecipeWithStatus | null;
  metrics: Metrics | null;
  gpus: GPU[];
  isConnected: boolean;
  platformKind?: RuntimePlatformKind | null;
  inferencePort?: number;
  onNavigateLogs: () => void;
  onBenchmark: () => void;
  benchmarking: boolean;
  recipes?: RecipeWithStatus[];
  lifecycleStatus?: "idle" | "starting" | "ready" | "error";
  onLaunch?: (recipeId: string) => Promise<void>;
  onNewRecipe?: () => void;
  onViewAll?: () => void;
}

export function StatusSection({
  currentProcess,
  currentRecipe,
  metrics,
  gpus,
  isConnected,
  platformKind,
  inferencePort,
  onNavigateLogs,
  onBenchmark,
  benchmarking,
  recipes,
  lifecycleStatus,
  onLaunch,
  onNewRecipe,
  onViewAll,
}: StatusSectionProps) {
  const modelName = currentRecipe?.name || currentProcess?.model_path?.split("/").pop();
  const isRunning = !!currentProcess;
  const backend = currentProcess?.backend;

  const fallbackTotalPower = gpus.reduce((sum, g) => sum + (g.power_draw || 0), 0);
  const fallbackTotalMemUsed = gpus.reduce((sum, g) => {
    if (g.memory_used_mb != null) return sum + toGBFromMB(g.memory_used_mb);
    return sum + toGB(g.memory_used ?? 0);
  }, 0);
  const fallbackMemCapacity = gpus.reduce((sum, g) => {
    if (g.memory_total_mb != null) return sum + toGBFromMB(g.memory_total_mb);
    return sum + toGB(g.memory_total ?? 0);
  }, 0);
  const fallbackPowerLimit = gpus.reduce((sum, g) => sum + (g.power_limit || 0), 0);

  const totalPower = metrics?.current_power_watts ?? fallbackTotalPower;
  const totalMemUsed = metrics?.vram_used_gb ?? fallbackTotalMemUsed;
  const vramCapacity = metrics?.vram_capacity_gb ?? fallbackMemCapacity;
  const powerLimit = metrics?.power_limit_watts ?? fallbackPowerLimit;

  const genTps = firstPositive(metrics?.session_avg_generation, metrics?.generation_throughput);
  const prefillTps = firstPositive(metrics?.session_avg_prefill, metrics?.prompt_throughput);
  const ttftMs = firstPositive(metrics?.avg_ttft_ms);
  const sessions = metrics?.running_requests ?? 0;
  const peakGenTps = firstPositive(
    metrics?.session_peak_generation_throughput,
    metrics?.session_peak_generation,
    metrics?.peak_generation_tps,
  );
  const peakTtftMs = firstPositive(metrics?.session_peak_ttft_ms, metrics?.peak_ttft_ms);
  const peakReq = metrics?.session_peak_running_requests ?? 0;
  const samples = useMetricSamples({
    generation: genTps,
    prefill: prefillTps,
    ttft: ttftMs,
    requests: sessions,
    active: isRunning,
  });

  const headerActions = (
    <div className="flex items-center gap-1.5">
      {recipes && onLaunch && (
        <ModelsDropdown
          recipes={recipes}
          currentRecipeId={currentRecipe?.id}
          lifecycleStatus={lifecycleStatus ?? "idle"}
          onLaunch={onLaunch}
          onNewRecipe={onNewRecipe}
          onViewAll={onViewAll}
        />
      )}
      <ActionBtn label="Logs" onClick={onNavigateLogs} />
      {isRunning ? (
        <ActionBtn
          label={benchmarking ? "Run" : "Bench"}
          onClick={onBenchmark}
          disabled={benchmarking}
        />
      ) : (
        <ActionBtn label="Bench" onClick={onBenchmark} disabled />
      )}
    </div>
  );

  const statusLine = (
    <div className="flex flex-wrap items-center gap-2 text-[11px] tracking-[0.04em]">
      <StatusDot running={isRunning} />
      <span className="font-medium uppercase tracking-[0.14em] text-(--dim)">
        {isRunning ? "Active" : "Standby"}
      </span>
      {!isConnected && <Tag tone="err">offline</Tag>}
      {backend && <Tag>{backend}</Tag>}
      {platformKind && <Tag>{platformKind}</Tag>}
      {inferencePort && (
        <span className="font-mono text-[10px] tabular-nums text-(--dim)/70">:{inferencePort}</span>
      )}
    </div>
  );

  // STANDBY — quiet, intentional, no skeleton stats. Just identity + CTA.
  if (!isRunning) {
    return (
      <section className="px-2 pt-2 pb-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {statusLine}
            <h1 className="mt-2 truncate text-[26px] font-semibold leading-tight tracking-[-0.01em] text-(--fg)">
              {modelName || "No model loaded"}
            </h1>
            <p className="mt-1.5 text-[13px] leading-snug text-(--dim)">
              {modelName
                ? "Ready to launch — pick this recipe from the Models menu to start serving."
                : "Pick a recipe from the Models menu to start streaming live metrics."}
            </p>
          </div>
          {headerActions}
        </div>
      </section>
    );
  }

  // ACTIVE — model name hero, metrics, and quiet inline trends on one operator sheet.
  return (
    <section className="px-2 pt-2 pb-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {statusLine}
          <h1
            className="mt-1.5 truncate text-[22px] font-semibold leading-tight tracking-[-0.01em] text-(--fg)"
            title={modelName || ""}
          >
            {modelName || "Active"}
          </h1>
        </div>
        {headerActions}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-x-12 gap-y-4 sm:grid-cols-2">
        <HeroStat
          label="Decode"
          value={genTps > 0 ? genTps.toFixed(1) : null}
          unit="tok/s"
          detail={peakGenTps > 0 ? `peak ${peakGenTps.toFixed(1)}` : undefined}
        />
        <HeroStat
          label="TTFT"
          value={ttftMs > 0 ? ttftMs.toFixed(0) : null}
          unit="ms"
          detail={peakTtftMs > 0 ? `peak ${peakTtftMs.toFixed(0)}` : undefined}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-1.5 font-mono text-[11.5px] tabular-nums text-(--dim)">
        <Inline label="Prefill">
          <Pair value={prefillTps > 0 ? prefillTps.toFixed(1) : null} unit="t/s" />
        </Inline>
        <Inline label="Req">
          <Pair value={sessions > 0 ? String(sessions) : null} unit="" />
          {peakReq > 0 ? <span className="text-(--dim)/55">peak {peakReq}</span> : null}
        </Inline>
        <Inline label="VRAM">
          <Pair
            value={totalMemUsed > 0 ? totalMemUsed.toFixed(1) : null}
            unit={vramCapacity > 0 ? `/${vramCapacity.toFixed(0)}G` : "G"}
          />
        </Inline>
        <Inline label="Power">
          <Pair
            value={totalPower > 0 ? String(Math.round(totalPower)) : null}
            unit={powerLimit > 0 ? `/${Math.round(powerLimit)}W` : "W"}
          />
        </Inline>
      </div>

      <MetricTrends samples={samples} />
    </section>
  );
}

type MetricSample = {
  at: number;
  generation: number;
  prefill: number;
  ttft: number;
  requests: number;
};

function useMetricSamples({
  generation,
  prefill,
  ttft,
  requests,
  active,
}: {
  generation: number;
  prefill: number;
  ttft: number;
  requests: number;
  active: boolean;
}) {
  const samplesRef = useRef<MetricSample[]>([]);

  if (!active) return [];

  const next: MetricSample = {
    at: Date.now(),
    generation: finitePositive(generation),
    prefill: finitePositive(prefill),
    ttft: finitePositive(ttft),
    requests: finitePositive(requests),
  };
  const current = samplesRef.current;
  const previous = current[current.length - 1];
  if (
    !previous ||
    previous.generation !== next.generation ||
    previous.prefill !== next.prefill ||
    previous.ttft !== next.ttft ||
    previous.requests !== next.requests
  ) {
    samplesRef.current = [...current, next].slice(-56);
  }

  return samplesRef.current;
}

function MetricTrends({ samples }: { samples: MetricSample[] }) {
  const hasThroughput = samples.some((sample) => sample.generation > 0 || sample.prefill > 0);
  const hasLatency = samples.some((sample) => sample.ttft > 0 || sample.requests > 0);

  return (
    <div className="mt-6 border-t border-(--border)/40 pt-3">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <TrendPanel
          label="Throughput"
          meta="last samples"
          empty={!hasThroughput}
          lines={[
            { values: samples.map((sample) => sample.prefill), className: "text-(--dim)/35" },
            { values: samples.map((sample) => sample.generation), className: "text-(--fg)/80" },
          ]}
        />
        <TrendPanel
          label="TTFT / req"
          meta="live"
          empty={!hasLatency}
          lines={[
            { values: samples.map((sample) => sample.ttft), className: "text-(--dim)/45" },
            { values: samples.map((sample) => sample.requests), className: "text-(--fg)/70" },
          ]}
        />
      </div>
    </div>
  );
}

function TrendPanel({
  label,
  meta,
  lines,
  empty,
}: {
  label: string;
  meta: string;
  lines: Array<{ values: number[]; className: string }>;
  empty: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-(--dim)/75">
          {label}
        </span>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-(--dim)/45">
          {meta}
        </span>
      </div>
      <div className="h-28">
        {empty ? (
          <div className="flex h-full items-center border-t border-(--border)/25 font-mono text-[11px] text-(--dim)/55">
            waiting for live samples…
          </div>
        ) : (
          <Sparkline lines={lines} />
        )}
      </div>
    </div>
  );
}

function Sparkline({ lines }: { lines: Array<{ values: number[]; className: string }> }) {
  const paths = useMemo(() => {
    const all = lines.flatMap((line) => line.values).filter((value) => Number.isFinite(value));
    const max = Math.max(1, ...all);
    return lines.map((line) => ({ ...line, points: toPolyline(line.values, max) }));
  }, [lines]);

  return (
    <svg
      className="h-full w-full overflow-visible text-(--border)"
      viewBox="0 0 320 96"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d="M0 16H320 M0 48H320 M0 80H320"
        stroke="currentColor"
        strokeOpacity="0.42"
        strokeWidth="0.6"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M0 95.5H320"
        stroke="currentColor"
        strokeOpacity="0.75"
        strokeWidth="0.7"
        vectorEffect="non-scaling-stroke"
      />
      {paths.map((line, index) => (
        <polyline
          key={index}
          points={line.points}
          fill="none"
          className={line.className}
          stroke="currentColor"
          strokeWidth={index === paths.length - 1 ? 1.6 : 1.1}
          strokeLinecap="square"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

function toPolyline(values: number[], max: number): string {
  const padded = values.length >= 2 ? values : [0, ...values];
  const width = 320;
  const height = 92;
  const last = Math.max(1, padded.length - 1);
  return padded
    .map((value, index) => {
      const x = (index / last) * width;
      const y = 94 - (Math.max(0, value) / max) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function finitePositive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function HeroStat({
  label,
  value,
  unit,
  detail,
}: {
  label: string;
  value: string | null;
  unit: string;
  detail?: string;
}) {
  const idle = value == null;
  return (
    <div className="min-w-0 border-t border-(--border)/40 pt-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-(--dim)">
          {label}
        </span>
        {detail ? (
          <span className="font-mono text-[10.5px] tabular-nums text-(--dim)">{detail}</span>
        ) : null}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span
          className={`font-mono text-[34px] font-medium leading-none tabular-nums ${
            idle ? "text-(--dim)/60" : "text-(--fg)"
          }`}
        >
          {idle ? "—" : value}
        </span>
        {!idle ? <span className="font-mono text-[11px] text-(--dim)">{unit}</span> : null}
      </div>
    </div>
  );
}

function Pair({ value, unit }: { value: string | null; unit: string }) {
  if (value == null) {
    return <span className="text-(--dim)/55">—</span>;
  }
  return (
    <>
      <span className="text-(--fg)/85">{value}</span>
      {unit ? <span className="text-(--dim)/65">{unit}</span> : null}
    </>
  );
}

function Inline({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-[9.5px] font-medium uppercase tracking-[0.14em] text-(--dim)/70">
        {label}
      </span>
      <span className="inline-flex items-baseline gap-1">{children}</span>
    </span>
  );
}

function StatusDot({ running }: { running: boolean }) {
  return (
    <span
      className={`relative inline-flex h-1.5 w-1.5 shrink-0 rounded-full ${
        running ? "bg-emerald-400" : "bg-(--dim)/55"
      }`}
    >
      {running && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60" />}
    </span>
  );
}

function Tag({ tone, children }: { tone?: "err"; children: React.ReactNode }) {
  const cls =
    tone === "err" ? "border-(--err)/60 text-(--err)" : "border-(--border)/70 text-(--dim)";
  return (
    <span
      className={`border px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.14em] ${cls}`}
    >
      {children}
    </span>
  );
}

function ActionBtn({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`h-7 rounded-[3px] border px-2.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
        danger
          ? "border-(--err)/40 text-(--err) hover:bg-(--err)/10"
          : "border-(--border)/70 text-(--dim) hover:border-(--border) hover:bg-(--fg)/5 hover:text-(--fg)"
      }`}
    >
      {label}
    </button>
  );
}

function firstPositive(...values: Array<number | null | undefined>): number {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  }
  return 0;
}

/* Inline Models dropdown — auto-closes on outside click and selection. */
function ModelsDropdown({
  recipes,
  currentRecipeId,
  lifecycleStatus,
  onLaunch,
  onNewRecipe,
  onViewAll,
}: {
  recipes: RecipeWithStatus[];
  currentRecipeId?: string;
  lifecycleStatus: "idle" | "starting" | "ready" | "error";
  onLaunch: (id: string) => Promise<void>;
  onNewRecipe?: () => void;
  onViewAll?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const q = filter.toLowerCase();
  const filtered = q
    ? recipes.filter((r) => r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q))
    : recipes;
  const visible = filtered.slice(0, q ? 8 : 6);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="h-7 rounded-[3px] border border-(--border)/70 px-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-(--fg) hover:border-(--border) hover:bg-(--fg)/5"
      >
        Models ▾
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-[22rem] rounded-[4px] border border-(--border) bg-(--surface) shadow-lg">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] border-b border-(--border)">
            <input
              autoFocus
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search models…"
              className="min-w-0 bg-transparent px-2.5 py-1.5 font-mono text-xs text-(--fg) placeholder:text-(--dim)/60 focus:outline-none"
            />
            {onNewRecipe && (
              <button
                onClick={() => {
                  setOpen(false);
                  onNewRecipe();
                }}
                className="border-l border-(--border) px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-(--dim) hover:bg-(--fg)/5 hover:text-(--fg)"
              >
                + new
              </button>
            )}
          </div>
          <div className="max-h-[18rem] overflow-auto">
            {visible.length === 0 && (
              <div className="px-3 py-4 font-mono text-xs text-(--dim)">No models</div>
            )}
            {visible.map((r) => {
              const row = { isCurrent: r.id === currentRecipeId };
              const running = r.status === "running";
              const disabled = lifecycleStatus === "starting" || row.isCurrent;
              return (
                <button
                  key={r.id}
                  disabled={disabled}
                  onClick={async () => {
                    setOpen(false);
                    await onLaunch(r.id);
                  }}
                  className={`flex w-full items-center gap-2 border-b border-(--border)/60 px-2.5 py-1.5 text-left last:border-b-0 ${
                    row.isCurrent ? "bg-(--fg)/8" : "hover:bg-(--fg)/5"
                  } ${disabled && !row.isCurrent ? "cursor-not-allowed opacity-30" : ""}`}
                >
                  <span
                    className={`h-3 w-0.5 shrink-0 ${
                      row.isCurrent ? "bg-(--fg)" : running ? "bg-(--fg)/60" : "bg-(--dim)/40"
                    }`}
                  />
                  <span className="flex-1 truncate font-mono text-xs text-(--fg)" title={r.name}>
                    {r.name}
                  </span>
                  {running && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                  <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-(--dim)">
                    tp{r.tp || r.tensor_parallel_size}
                  </span>
                </button>
              );
            })}
          </div>
          {onViewAll && filtered.length > visible.length && (
            <button
              onClick={() => {
                setOpen(false);
                onViewAll();
              }}
              className="block w-full border-t border-(--border) px-2.5 py-1.5 text-left font-mono text-[10px] text-(--dim) hover:bg-(--fg)/5 hover:text-(--fg)"
            >
              {filter
                ? `${filtered.length - visible.length} more →`
                : `View all ${recipes.length} →`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
