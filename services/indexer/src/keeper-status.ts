import type { KeeperStatus } from "@feeflow/sdk";

/**
 * "Last keeper run" for /payments, from the keeper's /health on the same host. The last value
 * seen is kept, so a keeper that stops answering turns "delayed" instead of disappearing.
 */
export function createKeeperStatus(opts: {
  healthUrl: string | undefined;
  staleAfterSeconds: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? (() => Math.floor(Date.now() / 1000));
  let lastRunAt: number | null = null;

  return async function status(): Promise<KeeperStatus> {
    // No keeper configured: nothing to report, and nothing is late.
    if (!opts.healthUrl) return { lastRunAt: null, stale: false };
    try {
      const res = await fetchImpl(opts.healthUrl, { signal: AbortSignal.timeout(2000) });
      // The keeper answers 503 with the same body when its last success is old.
      if (res.ok || res.status === 503) {
        const body = (await res.json()) as { lastRunAt?: unknown };
        if (typeof body.lastRunAt === "number" && body.lastRunAt > (lastRunAt ?? 0)) {
          lastRunAt = body.lastRunAt;
        }
      }
    } catch {
      /* unreachable keeper: fall through to the last value seen */
    }
    return {
      lastRunAt,
      stale: lastRunAt === null || now() - lastRunAt > opts.staleAfterSeconds,
    };
  };
}
