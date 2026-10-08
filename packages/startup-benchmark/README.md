# Pi startup-benchmark patch bundle

This directory contains only the startup-benchmark delta. It does **not** contain the Pi runtime or any unchanged Pi source files.

## Install from npm

From Pi's package command, install `npm:pi-startup-benchmark` so the extension is auto-discovered. The package also exposes the dashboard as `pi-startup-benchmark` when installed globally. It includes the patch bundle, but the patched Pi core must still be applied to a source checkout separately.

## Install on another machine

1. Obtain the Pi source checkout that is already installed or that you intend to build.
2. Copy this `packages/startup-benchmark` directory into that checkout, or copy it separately and run its installer.
3. Check compatibility without changing anything:

```sh
./packages/startup-benchmark/install.sh --check /path/to/pi
```

4. Apply the patched core files and install the companion extension:

```sh
./packages/startup-benchmark/install.sh /path/to/pi
```

5. To build and install the patched Pi package globally, opt in explicitly:

```sh
./packages/startup-benchmark/install.sh --install /path/to/pi
```

The extension is installed under `~/.pi/agent` by default. Override that location with `PI_AGENT_DIR=/some/path` or `--agent-dir /some/path`.

The installer refuses incompatible source checkouts and does not modify files when `--check` is used. If the patch is already applied, it skips the core changes and still refreshes the extension files.

## Benchmarking workflow

Benchmarking is opt-in. Normal Pi startup is unchanged unless `PI_STARTUP_BENCHMARK=1` is set.

```text
1. Apply the patched core and install the extension.
2. Start Pi with benchmarking enabled.
3. Inspect the current run with /startup-benchmark.
4. Review prior runs with /startup-benchmark history.
```

The launcher combines steps 2 and 3:

```sh
~/.pi/agent/bin/pi-startup-benchmark start
~/.pi/agent/bin/pi-startup-benchmark
```

The launcher also accepts:

```sh
~/.pi/agent/bin/pi-startup-benchmark history
~/.pi/agent/bin/pi-startup-benchmark clear
```

Inside Pi, the extension provides the same command chain:

| Command | Action |
|---|---|
| `/startup-benchmark` | Show the current run, or the latest persisted run. |
| `/startup-benchmark history` | Show the persisted run history. |
| `/startup-benchmark clear` | Delete the latest run and history after confirmation in the TUI. |

The core instrumentation works in TUI, print, JSON, and RPC modes. The extension persists completed runs when the opt-in environment variable is enabled. Data is stored at:

```text
~/.pi/agent/startup-benchmark/latest.json
~/.pi/agent/startup-benchmark/history.json
```

## Benchmark and resource names

Each recorded resource has a stable descriptive shape:

| Name | Values | Meaning |
|---|---|---|
| `kind` | `extension`, `skill` | Resource category. |
| `phase` | `module-import`, `factory`, `parse` | Startup operation being measured. Extension factories include inline factories; skills use `parse`. |
| `name` | Extension or skill name | Human-readable resource identity. |
| `path` | Source path | File or synthetic path associated with the resource. |
| `trigger` | `startup`, `reload` | Whether the run came from initial loading or a resource reload. |
| `mode` | `tui`, `print`, `json`, `rpc` | Pi mode in which the run occurred. |

Resources are displayed slowest first. Failed operations remain in the report with `status:error` and a sanitized error message, so a failed load does not hide the timing data.

## Bundle contents

- `pi-core.patch` — changes to the nine Pi core source files required by the benchmark API.
- `extension/` — the three extension modules and dashboard launcher.
- `install.sh` — compatibility check, patch application, extension installation, and optional build/install.
- `test/install.test.sh` — installer smoke test.

The patch was generated from the benchmark implementation commit series beginning at `f07218c` and ending at `29ccb5d`. A substantially newer Pi checkout may require resolving a patch conflict or regenerating this small delta.
