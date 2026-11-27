import { defineConfig } from "vitest/config";

/** Integration run: Anvil + `ponder start` + the keeper. Needs Foundry (anvil, forge) on PATH. */
export default defineConfig({
  test: { include: ["test/**/*.test.ts"], testTimeout: 60_000, hookTimeout: 200_000 },
});
