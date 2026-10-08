import type { StartupBenchmarkRun, StartupResourceTiming } from "./benchmark-store.ts";

export const compareResourceTimings = (a: StartupResourceTiming, b: StartupResourceTiming) => b.durationMs - a.durationMs || a.path.localeCompare(b.path);

function ms(value: number): string { return `${value.toFixed(2)}ms`; }
export function safeText(value: string): string { return value.replace(/[\u0000-\u001f\u007f\u0080-\u009f\u2028\u2029]/g, (character) => `\\u${character.codePointAt(0)!.toString(16).padStart(4, "0")}`); }
export function formatCurrentRun(run: StartupBenchmarkRun | undefined): string {
  if (!run) return "No startup benchmark data";
  const lines = [`Startup benchmark ${safeText(run.runId)} (${run.trigger}, ${safeText(run.mode)})`, `Total: ${ms(run.totalMs)}`];
  const totals = new Map<string, number>();
  for (const resource of run.resources) totals.set(resource.kind, (totals.get(resource.kind) ?? 0) + resource.durationMs);
  for (const [kind, total] of totals) lines.push(`${kind}: ${ms(total)}`);
  for (const resource of [...run.resources].sort(compareResourceTimings)) {
    lines.push(`${safeText(resource.path)} (${safeText(resource.name)}) ${ms(resource.durationMs)} [${resource.kind}/${resource.phase}] status:${resource.status}${resource.status === "error" && resource.error ? ` (${safeText(resource.error)})` : ""}`);
  }
  return lines.join("\n");
}

export interface ResourceHistorySummary { kind: StartupResourceTiming["kind"]; phase: StartupResourceTiming["phase"]; path: string; averageMs: number; maxMs: number; count: number; }
export function formatHistory(history: { version: 1; runs: readonly StartupBenchmarkRun[] } | readonly StartupBenchmarkRun[]): string {
  const runs = Array.isArray(history) ? history : history.runs;
  if (runs.length === 0) return "No startup benchmark data";
  const groups = new Map<string, ResourceHistorySummary>();
  for (const run of runs) for (const resource of run.resources) {
    const key = `${resource.kind}\0${resource.phase}\0${resource.path}`;
    const current = groups.get(key);
    if (current) { current.averageMs = (current.averageMs * current.count + resource.durationMs) / (current.count + 1); current.maxMs = Math.max(current.maxMs, resource.durationMs); current.count++; }
    else groups.set(key, { kind: resource.kind, phase: resource.phase, path: resource.path, averageMs: resource.durationMs, maxMs: resource.durationMs, count: 1 });
  }
  const rows = [...groups.values()].sort((a, b) => b.maxMs - a.maxMs || a.path.localeCompare(b.path));
  return [`Startup benchmark history (${runs.length} runs)`, ...rows.map((row) => `${safeText(row.path)} [${row.kind}/${row.phase}] average:${ms(row.averageMs)} max:${ms(row.maxMs)} (${row.count} samples)`)].join("\n");
}
