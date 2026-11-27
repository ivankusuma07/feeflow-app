import { expect } from "@playwright/test";
import { publicClient } from "./chain";

/** The real indexer (services/indexer) started by playwright.anvil.config.ts. */
export const INDEXER_PORT = Number(process.env.E2E_INDEXER_PORT ?? 42099);
export const INDEXER_URL = `http://127.0.0.1:${INDEXER_PORT}`;

/** Waits until the indexer has processed the chain head, so pages load current data. */
export async function waitIndexed() {
  const head = Number(await publicClient.getBlockNumber());
  await expect
    .poll(
      async () => {
        const res = await fetch(`${INDEXER_URL}/status`);
        if (!res.ok) return -1;
        const body = (await res.json()) as { main?: { block?: { number?: number } } };
        return body.main?.block?.number ?? -1;
      },
      { timeout: 30_000, message: `indexer at block ${head}` },
    )
    .toBeGreaterThanOrEqual(head);
}
