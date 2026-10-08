import { afterEach, describe, expect, it } from "vitest";
import { getStartupBenchmarkModeError, isStartupBenchmarkModeSupported } from "../src/main.ts";

const previousBenchmarkFlag = process.env.PI_STARTUP_BENCHMARK;
afterEach(() => {
	if (previousBenchmarkFlag === undefined) delete process.env.PI_STARTUP_BENCHMARK;
	else process.env.PI_STARTUP_BENCHMARK = previousBenchmarkFlag;
});

describe("startup benchmark mode integration", () => {
	it("allows the opt-in benchmark in print mode", () => {
		process.env.PI_STARTUP_BENCHMARK = "1";
		expect(getStartupBenchmarkModeError("print")).toBeUndefined();
	});

	it("supports every runtime mode that can load resources", () => {
		expect(["interactive", "print", "json", "rpc"].every(isStartupBenchmarkModeSupported)).toBe(true);
	});
});
