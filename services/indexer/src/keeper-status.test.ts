import { describe, expect, it } from "vitest";
import { createKeeperStatus } from "./keeper-status";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("createKeeperStatus", () => {
  it("reports nothing, and nothing late, when no keeper is configured", async () => {
    expect(await createKeeperStatus({ healthUrl: undefined, staleAfterSeconds: 60 })()).toEqual({
      lastRunAt: null,
      stale: false,
    });
  });

  it("serves the keeper's last run and turns stale after the threshold", async () => {
    let t = 1000;
    let up = true;
    const status = createKeeperStatus({
      healthUrl: "http://keeper/health",
      staleAfterSeconds: 60,
      now: () => t,
      fetchImpl: async () => {
        if (!up) throw new TypeError("connection refused");
        return json({ lastRunAt: 990 });
      },
    });
    expect(await status()).toEqual({ lastRunAt: 990, stale: false });
    // The keeper goes down: the last run is kept and becomes "delayed".
    up = false;
    t = 1100;
    expect(await status()).toEqual({ lastRunAt: 990, stale: true });
  });

  it("is stale when a configured keeper has never answered", async () => {
    const status = createKeeperStatus({
      healthUrl: "http://keeper/health",
      staleAfterSeconds: 60,
      fetchImpl: async () => new Response("", { status: 503 }),
    });
    expect(await status()).toEqual({ lastRunAt: null, stale: true });
  });
});
