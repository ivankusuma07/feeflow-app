import { defineConfig } from "vitest/config";

/** Integration run: Anvil + `ponder start`. Needs Foundry (anvil, forge) on PATH. */
export default defineConfig({
  test: { include: ["test/**/*.test.ts"], testTimeout: 30_000, hookTimeout: 200_000 },
});
