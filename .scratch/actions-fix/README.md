# Release Actions failure reproduction

Failed run: https://github.com/sunven/default-apps/actions/runs/42795062101

The `v0.1.2` run stopped before building: the anonymous repository API request
returned HTTP 404. An authenticated metadata request confirmed that
`sunven/default-apps` was private. The client also uses anonymous GitHub requests,
so bypassing this check would not enable automatic updates. The user subsequently
authorized making the existing repository public, and its visibility was changed.

A clean checkout exposed an additional failure: Go tests ran before the frontend
build, while `main.go` embeds the untracked `frontend/dist` directory.

## Reproduction

Run from the repository root on the configured macOS toolchain:

```sh
python3 .scratch/actions-fix/replay-tests.py
```

The harness reads the actual workflow's `Test` shell block and executes it in a
temporary `git archive HEAD` checkout, asserting that `frontend/dist` does not
already exist. It reads the working copy of the workflow so the same checkout
can verify the ordering change before committing.

- Before the fix: `before.log`, exit 1, `pattern all:frontend/dist: no matching files found`.
- After the fix: `after.log`, exit 0, 9 release integration tests, 109 frontend tests,
  frontend production build and all Go race tests passed.
- Workflow validation: `go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.7 .github/workflows/release.yml`, exit 0.
- The actual visibility/version shell block passed against the public repository;
  replaying it with controlled `gh` responses also confirmed public repositories
  pass, private repositories fail with a clear error, and API failures fail closed.
- Anonymous download of `https://raw.githubusercontent.com/sunven/default-apps/main/internal/buildinfo/version.txt`
  succeeded and returned `0.1.2` after the visibility change.

The workflow now builds frontend assets before Go tests, and gives an explicit
error when the release repository is not public. The visibility check uses the
workflow's existing GitHub token to avoid anonymous API rate limits (HTTP 403 was
observed locally after the visibility change). Client requests remain anonymous.
No tags or releases were changed during this diagnosis. These checks do not claim
that a new GitHub-hosted run has completed successfully.
