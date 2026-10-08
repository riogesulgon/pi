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

## Bundle contents

- `pi-core.patch` — changes to the nine Pi core source files required by the benchmark API.
- `extension/` — the three extension modules and dashboard launcher.
- `install.sh` — compatibility check, patch application, extension installation, and optional build/install.
- `test/install.test.sh` — installer smoke test.

The patch was generated from the benchmark implementation commit series beginning at `f07218c` and ending at `29ccb5d`. A substantially newer Pi checkout may require resolving a patch conflict or regenerating this small delta.
