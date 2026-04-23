import { defineConfig } from 'vitest/config';

// Coverage configuration. See the "Test coverage" section in RELEASING.md
// for policy (baseline-anchored, per-file, V8 provider, not a target).
//
// Gate mechanics:
//   - perFile: true → every file must independently meet the threshold.
//     Global average gating would let a 0%-covered new module sit next
//     to a 99%-covered existing module and pass unnoticed. Per-file forces
//     the gap to surface.
//   - thresholds.lines / branches → baseline-anchored (per-file-minimum
//     among non-grandfathered files, minus 3pp for refactor tolerance).
//     NOT an aspirational target. Anchor shifts only via deliberate manual
//     ratchet, never by autoUpdate.
//   - Per-path overrides (below) handle specific legitimate cases where
//     coverage-as-reported is a partial signal, not a floor for total code.

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Explicit exclude so the locally-cloned upstream reference/ dir never
    // gets picked up even if someone widens `include` later.
    exclude: ['**/node_modules/**', '**/dist/**', 'reference/**'],
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html', 'lcov', 'json-summary'],
      // Include completely-untested files in the report (e.g. src/cli/index.ts
      // currently). Without `all: true`, untested files are invisible — which
      // defeats the "surface the gap" point of enforcement. Vitest 4's default
      // is true, but silent default-flips across majors are a real vector, so
      // set explicitly.
      all: true,
      include: ['src/**/*.ts'],
      exclude: [
        'src/types.ts',
        '**/*.d.ts',
      ],
      thresholds: {
        perFile: true,
        // TODO(commit 2): set to per-file-minimum − 3pp after baseline run.
        // These 0/0 placeholders ship with commit 1 so CI stays green while
        // the baseline measurement happens. See RELEASING.md → "Test coverage".
        lines: 0,
        branches: 0,

        // Grandfather the currently-untested CLI entrypoint. Scoped to the
        // specific file — NOT `src/cli/**` — so any NEW file added under
        // src/cli/ later fails the gate and surfaces as an untested module,
        // which is exactly what the gate exists to catch. Remove this
        // override when src/cli/index.ts gets real unit tests in a follow-up PR.
        'src/cli/index.ts': {
          lines: 0,
          branches: 0,
        },

        // Pre-empted override for commit 2 — DO NOT enable in commit 1.
        //
        // RATIONALE — what the number for this file actually measures:
        //   V8 coverage does not follow into child processes. Signal
        //   handlers, main-entry guards, and process-lifetime code in
        //   src/server.ts are exercised ONLY by
        //   test/integration/server-stdin-shutdown.test.ts, which spawns
        //   a real subprocess. Those lines are always reported as
        //   uncovered regardless of whether they're actually tested.
        //
        //   Therefore: the reported coverage for this file is in-process-
        //   test coverage only. The threshold here is a floor for THAT
        //   subset — a regression means an in-process-testable line lost
        //   coverage, which IS actionable.
        //
        //   The subprocess-only code is validated separately and its
        //   correctness is NOT gated by this number. If this file's
        //   reported coverage drops, the question is "what in-process-
        //   tested path lost coverage" — not "did we break a signal
        //   handler."
        //
        // 'src/server.ts': {
        //   lines: <set in commit 2 after baseline measurement>,
        //   branches: <set in commit 2 after baseline measurement>,
        // },
      },
    },
  },
});
