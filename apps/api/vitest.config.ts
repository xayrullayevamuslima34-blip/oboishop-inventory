import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // FIFO/ledger invariant tests (Phase 2+) run against a real Postgres —
    // see docs/ARCHITECTURE.md — so tests are sequential by default to avoid
    // cross-test data races on the same dev database. Revisit once a
    // dedicated per-run test schema exists.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
