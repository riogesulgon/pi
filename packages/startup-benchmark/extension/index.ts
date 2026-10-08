import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { join } from "node:path";
import { formatCurrentRun, formatHistory, safeText } from "./benchmark-report.ts";
import {
  clearBenchmarkData,
  readHistory,
  readLatest,
  saveRun,
  type StartupBenchmarkRun,
} from "./benchmark-store.ts";

const BENCHMARK_DIR = join(homedir(), ".pi", "agent", "startup-benchmark");
export const UNSUPPORTED_RUNTIME_MESSAGE =
  "Startup benchmark needs the custom Pi runtime; its getStartupBenchmark API is unavailable after this Pi upgrade.";

type BenchmarkContext = {
  getStartupBenchmark?: () => StartupBenchmarkRun | undefined;
};

export function hasBenchmarkRuntime(ctx: unknown): ctx is Required<BenchmarkContext> {
  return typeof (ctx as BenchmarkContext | undefined)?.getStartupBenchmark === "function";
}

export function getBenchmarkRun(ctx: unknown): StartupBenchmarkRun | undefined {
  if (!hasBenchmarkRuntime(ctx)) return undefined;
  try {
    return ctx.getStartupBenchmark();
  } catch {
    return undefined;
  }
}

export type StartupBenchmarkCommand =
  | { kind: "current"; run: StartupBenchmarkRun | undefined }
  | { kind: "history" }
  | { kind: "clear" }
  | { kind: "usage" };

export function resolveCommand(args: string, currentRun: StartupBenchmarkRun | undefined): StartupBenchmarkCommand {
  const command = args.trim().split(/\s+/, 1)[0] ?? "";
  if (command === "") return { kind: "current", run: currentRun };
  if (command === "history") return { kind: "history" };
  if (command === "clear") return { kind: "clear" };
  return { kind: "usage" };
}

function slowestResource(run: StartupBenchmarkRun | undefined): string {
  const resource = run?.resources.reduce((slowest, current) => !slowest || current.durationMs > slowest.durationMs ? current : slowest, undefined as StartupBenchmarkRun["resources"][number] | undefined);
  return resource ? `${safeText(resource.path)} (${resource.durationMs.toFixed(2)}ms)` : "none";
}

export function formatHistoryNotification(report: string, dataDir = BENCHMARK_DIR): string {
  const summary = report.split("\n").find((line) => line && !line.startsWith("Startup benchmark history"));
  return `Startup benchmark history: ${safeText(summary ?? "No startup benchmark data")}; data: ${safeText(dataDir)}/history.json`;
}

function notifyHistory(report: string, ctx: ExtensionCommandContext): void {
  ctx.ui.notify(formatHistoryNotification(report), "info");
}

async function showReport(report: string, run: StartupBenchmarkRun | undefined, ctx: ExtensionCommandContext): Promise<void> {
  if (ctx.mode !== "tui") {
    ctx.ui.notify(`Slowest startup resource: ${slowestResource(run)}; data: ${safeText(BENCHMARK_DIR)}/latest.json`, "info");
    return;
  }
  await ctx.ui.editor("Startup benchmark", report);
}

export default function startupBenchmark(pi: ExtensionAPI): void {
  pi.on("session_start_complete", (_event, ctx) => {
    if (process.env.PI_STARTUP_BENCHMARK !== "1") return;
    if (!hasBenchmarkRuntime(ctx)) {
      if (ctx.hasUI) ctx.ui.notify(UNSUPPORTED_RUNTIME_MESSAGE, "warning");
      return;
    }
    const run = getBenchmarkRun(ctx);
    if (run) {
      const result = saveRun(run, BENCHMARK_DIR);
      if (!result.ok && ctx.hasUI) ctx.ui.notify(`Could not save startup benchmark data: ${result.error}`, "warning");
    }
  });

  pi.registerCommand("startup-benchmark", {
    description: "Show slowest Pi startup extensions and skills",
    handler: async (args, ctx) => {
      if (!hasBenchmarkRuntime(ctx)) {
        ctx.ui.notify(UNSUPPORTED_RUNTIME_MESSAGE, "warning");
        return;
      }
      const command = resolveCommand(args, getBenchmarkRun(ctx));
      if (command.kind === "usage") {
        ctx.ui.notify("Usage: /startup-benchmark [history|clear]", "warning");
        return;
      }
      if (command.kind === "clear") {
        if (ctx.mode === "tui") {
          const confirmed = await ctx.ui.confirm("Clear startup benchmark", "Delete the latest run and history?");
          if (!confirmed) {
            ctx.ui.notify("Startup benchmark data was not cleared", "info");
            return;
          }
        }
        const result = clearBenchmarkData(BENCHMARK_DIR);
        ctx.ui.notify(result.ok ? "Startup benchmark data cleared" : `Could not clear startup benchmark data: ${result.error}`, result.ok ? "info" : "error");
        return;
      }
      if (command.kind === "history") {
        const report = formatHistory(readHistory(BENCHMARK_DIR));
        if (ctx.mode === "rpc") notifyHistory(report, ctx);
        else await showReport(report, undefined, ctx);
        return;
      }
      const run = command.run ?? readLatest(BENCHMARK_DIR);
      await showReport(formatCurrentRun(run), run, ctx);
    },
  });
}
