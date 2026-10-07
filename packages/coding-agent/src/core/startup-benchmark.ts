export type StartupResourceKind = "extension" | "skill";
export type StartupResourcePhase = "module-import" | "factory" | "parse";
export type StartupBenchmarkTrigger = "startup" | "reload";

export interface StartupResourceTiming {
	kind: StartupResourceKind;
	phase: StartupResourcePhase;
	path: string;
	name: string;
	durationMs: number;
	status: "ok" | "error";
	error?: string;
}

export interface StartupBenchmarkRun {
	version: 1;
	runId: string;
	startedAt: string;
	mode: string;
	trigger: StartupBenchmarkTrigger;
	totalMs: number;
	resources: readonly StartupResourceTiming[];
}

export interface StartupResourceInput {
	kind: StartupResourceKind;
	phase: StartupResourcePhase;
	path: string;
	name: string;
}

export interface StartupBenchmark {
	start(input: { trigger: StartupBenchmarkTrigger; mode: string }): void;
	measure<T>(input: StartupResourceInput, operation: () => T | Promise<T>): Promise<T>;
	finish(): StartupBenchmarkRun | undefined;
	getRun(): StartupBenchmarkRun | undefined;
}

interface Clock {
	now: () => number;
}

let nextRunId = 0;

function freezeRun(run: StartupBenchmarkRun): StartupBenchmarkRun {
	const resources = run.resources.map((resource) => Object.freeze({ ...resource }));
	return Object.freeze({ ...run, resources: Object.freeze(resources) });
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function createStartupBenchmark(options: { enabled: boolean; now?: () => number }): StartupBenchmark {
	const clock: Clock = { now: options.now ?? (() => Number(process.hrtime.bigint()) / 1_000_000) };
	let active:
		| {
				run: StartupBenchmarkRun;
				lastTimestamp: number;
				startedTimestamp: number;
				resources: StartupResourceTiming[];
		  }
		| undefined;
	let completed: StartupBenchmarkRun | undefined;

	return {
		start(input) {
			if (!options.enabled) return;
			const startedAt = new Date().toISOString();
			const startedTimestamp = clock.now();
			active = {
				run: {
					version: 1,
					runId: `startup-${++nextRunId}`,
					startedAt,
					mode: input.mode,
					trigger: input.trigger,
					totalMs: 0,
					resources: [],
				},
				lastTimestamp: startedTimestamp,
				startedTimestamp,
				resources: [],
			};
		},
		async measure(input, operation) {
			if (!options.enabled || active === undefined) return await operation();
			const run = active;
			const started = clock.now();
			try {
				const result = await operation();
				const ended = clock.now();
				run.lastTimestamp = ended;
				run.resources.push({ ...input, durationMs: Math.max(0, ended - started), status: "ok" });
				return result;
			} catch (error) {
				const ended = clock.now();
				run.lastTimestamp = ended;
				run.resources.push({
					...input,
					durationMs: Math.max(0, ended - started),
					status: "error",
					error: errorMessage(error),
				});
				throw error;
			}
		},
		finish() {
			if (!options.enabled || active === undefined) return undefined;
			const run = active;
			const finishedTimestamp = clock.now();
			const snapshot = freezeRun({
				...run.run,
				totalMs: Math.max(0, finishedTimestamp - run.startedTimestamp),
				resources: run.resources,
			});
			completed = snapshot;
			active = undefined;
			return snapshot;
		},
		getRun() {
			return completed;
		},
	};
}

const singleton = createStartupBenchmark({ enabled: process.env.PI_STARTUP_BENCHMARK === "1" });

export function startStartupBenchmarkRun(trigger: StartupBenchmarkTrigger, mode: string): void {
	singleton.start({ trigger, mode });
}

export async function measureStartupResource<T>(
	input: StartupResourceInput,
	operation: () => T | Promise<T>,
): Promise<T> {
	return await singleton.measure(input, operation);
}

export function finishStartupBenchmarkRun(): StartupBenchmarkRun | undefined {
	return singleton.finish();
}

export function getStartupBenchmarkRun(): StartupBenchmarkRun | undefined {
	return singleton.getRun();
}
