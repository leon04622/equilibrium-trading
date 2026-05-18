# AGENTS.md

## Cursor Cloud specific instructions

This repository (`equilibrium-trading`) is currently an empty project scaffold with only a `README.md`. There are no services, dependencies, build systems, or test frameworks configured yet.

**Current state (as of initial setup):**
- No application code, package manifests, or dependency files exist.
- No lint, test, or build commands are available.
- No services need to be started.

**When code is added**, future agents should:
1. Re-examine the repo for new dependency files (`package.json`, `requirements.txt`, `pyproject.toml`, `Cargo.toml`, `go.mod`, etc.) and install accordingly.
2. Update the VM environment update script via `SetupVmEnvironment` to reflect new dependency installation commands.
3. Check for newly added `Makefile`, `docker-compose.yml`, or setup scripts and follow their instructions.
