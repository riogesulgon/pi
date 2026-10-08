import { describe, expect, it } from "vitest";
import { createStartupBenchmark } from "../src/core/startup-benchmark.ts";

describe("startup benchmark", () => {
	it("returns no run and invokes operations without allocating records when disabled", async () => {
		const benchmark = createStartupBenchmark({ enabled: false, now: () => 0 });
		await expect(
			benchmark.measure({ kind: "skill", phase: "parse", path: "/a/SKILL.md", name: "a" }, async () => "ok"),
		).resolves.toBe("ok");
		expect(benchmark.getRun()).toBeUndefined();
	});

	it("records extension factory and skill parse rows with monotonic durations", async () => {
		const times = [10, 10, 18, 18, 31, 31];
		const benchmark = createStartupBenchmark({ enabled: true, now: () => times.shift()! });
		benchmark.start({ trigger: "startup", mode: "tui" });
		await benchmark.measure(
			{ kind: "extension", phase: "factory", path: "/ext/a.ts", name: "a" },
			async () => undefined,
		);
		await benchmark.measure(
			{ kind: "skill", phase: "parse", path: "/skill/SKILL.md", name: "skill" },
			async () => undefined,
		);
		const run = benchmark.finish()!;
		expect(run.totalMs).toBe(21);
		expect(run.resources).toEqual([
			expect.objectContaining({ kind: "extension", phase: "factory", durationMs: 8, status: "ok" }),
			expect.objectContaining({ kind: "skill", phase: "parse", durationMs: 13, status: "ok" }),
		]);
	});

	it("records a failed operation then rethrows its original error", async () => {
		const error = new Error("broken");
		const benchmark = createStartupBenchmark({ enabled: true, now: () => 10 });
		benchmark.start({ trigger: "startup", mode: "tui" });
		await expect(
			benchmark.measure({ kind: "extension", phase: "module-import", path: "/ext/a.ts", name: "a" }, async () => {
				throw error;
			}),
		).rejects.toBe(error);
		expect(benchmark.finish()!.resources[0]).toEqual(expect.objectContaining({ status: "error", error: "broken" }));
	});

	it("does not expose a previous snapshot while a new run is active", () => {
		const benchmark = createStartupBenchmark({ enabled: true, now: () => 10 });
		benchmark.start({ trigger: "startup", mode: "tui" });
		const startup = benchmark.finish()!;
		benchmark.start({ trigger: "reload", mode: "tui" });
		expect(benchmark.getRun()).toBeUndefined();
		expect(benchmark.finish()).not.toBe(startup);
	});

	it("returns immutable completed snapshots and keeps startup and reload runs distinct", () => {
		const benchmark = createStartupBenchmark({ enabled: true, now: () => 10 });
		benchmark.start({ trigger: "startup", mode: "tui" });
		const startup = benchmark.finish()!;
		benchmark.start({ trigger: "reload", mode: "tui" });
		const reload = benchmark.finish()!;
		expect(startup.trigger).toBe("startup");
		expect(reload.trigger).toBe("reload");
		expect(startup).not.toBe(reload);
		expect(Object.isFrozen(startup)).toBe(true);
		expect(Object.isFrozen(startup.resources)).toBe(true);
	});

	it("measures an empty run from start through finish", () => {
		const times = [100, 137];
		const benchmark = createStartupBenchmark({ enabled: true, now: () => times.shift()! });
		benchmark.start({ trigger: "startup", mode: "tui" });
		expect(benchmark.finish()!.totalMs).toBe(37);
	});

	it("records opt-in runs for noninteractive modes", () => {
		const benchmark = createStartupBenchmark({ enabled: true, now: () => 10 });
		benchmark.start({ trigger: "startup", mode: "print" });
		expect(benchmark.finish()!.mode).toBe("print");
	});
});
