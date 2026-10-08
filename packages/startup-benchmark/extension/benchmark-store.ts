import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

export type StartupResourceKind = "extension" | "skill";
export type StartupResourcePhase = "module-import" | "factory" | "parse";
export type StartupBenchmarkTrigger = "startup" | "reload";
export interface StartupResourceTiming { kind: StartupResourceKind; phase: StartupResourcePhase; path: string; name: string; durationMs: number; status: "ok" | "error"; error?: string; }
export interface StartupBenchmarkRun { version: 1; runId: string; startedAt: string; mode: string; trigger: StartupBenchmarkTrigger; totalMs: number; resources: readonly StartupResourceTiming[]; }

export const HISTORY_LIMIT = 50;
export function benchmarkDir(agentDir = join(homedir(), ".pi", "agent")): string { return join(agentDir, "startup-benchmark"); }

type FsOps = {
  mkdirSync: typeof mkdirSync; readFileSync: typeof readFileSync; openSync: typeof openSync; writeSync: typeof writeSync;
  fsyncSync: typeof fsyncSync; closeSync: typeof closeSync; renameSync: typeof renameSync; unlinkSync: typeof unlinkSync;
};
const systemFs: FsOps = { mkdirSync, readFileSync, openSync, writeSync, fsyncSync, closeSync, renameSync, unlinkSync };

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isString(value: unknown): value is string { return typeof value === "string"; }
function isDuration(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value >= 0; }
function validRun(value: unknown): value is StartupBenchmarkRun {
  if (!isRecord(value) || value.version !== 1 || !isString(value.runId) || !isString(value.startedAt) || !isString(value.mode) || (value.trigger !== "startup" && value.trigger !== "reload") || !isDuration(value.totalMs) || !Array.isArray(value.resources)) return false;
  return value.resources.every((resource) => isRecord(resource) && (resource.kind === "extension" || resource.kind === "skill") && (resource.phase === "module-import" || resource.phase === "factory" || resource.phase === "parse") && isString(resource.path) && isString(resource.name) && isDuration(resource.durationMs) && (resource.status === "ok" || resource.status === "error") && (resource.error === undefined || isString(resource.error)));
}
function readJson(path: string, fs: FsOps): unknown {
  try { return JSON.parse(fs.readFileSync(path, "utf8")); } catch { return undefined; }
}
function atomicWrite(path: string, content: string, fs: FsOps): void {
  const temp = `${path}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  let fd: number | undefined;
  try {
    fd = fs.openSync(temp, "wx", 0o600);
    fs.writeSync(fd, content, undefined, "utf8");
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    fs.renameSync(temp, path);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    try { fs.unlinkSync(temp); } catch { /* absent after successful rename */ }
  }
}

export function readLatest(dir = benchmarkDir()): StartupBenchmarkRun | undefined {
  const value = readJson(join(dir, "latest.json"), systemFs);
  return validRun(value) ? value : undefined;
}
export function readHistory(dir = benchmarkDir()): { version: 1; runs: StartupBenchmarkRun[] } {
  const value = readJson(join(dir, "history.json"), systemFs);
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.runs) || !value.runs.every(validRun)) return { version: 1, runs: [] };
  return { version: 1, runs: value.runs.slice(-HISTORY_LIMIT) };
}
export function saveRun(run: StartupBenchmarkRun, dir = benchmarkDir(), fs: FsOps = systemFs): { ok: true } | { ok: false; error: string } {
  if (!validRun(run)) return { ok: false, error: "Invalid benchmark run" };
  try {
    fs.mkdirSync(dir, { recursive: true });
    const historyValue = readJson(join(dir, "history.json"), fs);
    const runs = isRecord(historyValue) && historyValue.version === 1 && Array.isArray(historyValue.runs) && historyValue.runs.every(validRun) ? historyValue.runs.slice(-HISTORY_LIMIT) : [];
    runs.push(run);
    const trimmed = runs.slice(-HISTORY_LIMIT);
    // Commit history first. If committing latest fails, restore the previous history;
    // this prevents a failed save from advancing latest while leaving history stale.
    const historyPath = join(dir, "history.json");
    let previousHistory: string | undefined;
    try { previousHistory = fs.readFileSync(historyPath, "utf8"); } catch { previousHistory = undefined; }
    atomicWrite(historyPath, JSON.stringify({ version: 1, runs: trimmed }, null, 2) + "\n", fs);
    try {
      atomicWrite(join(dir, "latest.json"), JSON.stringify(run, null, 2) + "\n", fs);
    } catch (error) {
      if (previousHistory === undefined) {
        try { fs.unlinkSync(historyPath); } catch { /* absent */ }
      } else {
        atomicWrite(historyPath, previousHistory, fs);
      }
      throw error;
    }
    return { ok: true };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
}
export function clearBenchmarkData(dir = benchmarkDir()): { ok: true } | { ok: false; error: string } {
  try { for (const file of ["latest.json", "history.json"]) { try { unlinkSync(join(dir, file)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } } return { ok: true }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
}

export type { FsOps as BenchmarkStoreFileSystem };
