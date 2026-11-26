import { describe, expect, it, vi } from "vitest";
import { createXProfiles } from "./x-profiles";

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("createXProfiles", () => {
  it("batches ids into one call, caches found and missing ids for a week", async () => {
    let t = 0;
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      reply(200, {
        data: [
          {
            id: "1",
            username: "one",
            name: "One",
            profile_image_url: "https://pbs.twimg.com/a_normal.jpg",
          },
        ],
        errors: [{ value: "2" }],
      }),
    );
    const x = createXProfiles("bearer", fetchImpl, () => t);
    const got = await x.get(["1", "2", "1", "not-an-id"]);
    expect(got.get("1")).toEqual({
      username: "one",
      name: "One",
      avatarUrl: "https://pbs.twimg.com/a_400x400.jpg",
    });
    expect(got.has("2")).toBe(false);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe("https://api.x.com/2/users?ids=1,2&user.fields=profile_image_url");
    expect((init!.headers as Record<string, string>).authorization).toBe("Bearer bearer");

    t = 6 * 86_400_000;
    await x.get(["1", "2"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    t = 8 * 86_400_000;
    await x.get(["1"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("splits more than 100 ids into several calls", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => reply(200, { data: [] }));
    const ids = Array.from({ length: 150 }, (_, i) => String(i + 1));
    await createXProfiles("b", fetchImpl).get(ids);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("keeps serving cached data when X fails, and waits before retrying", async () => {
    let t = 0;
    let fail = false;
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      if (fail) return reply(429, {});
      return reply(200, { data: [{ id: "1", username: "one", name: "One" }] });
    });
    const x = createXProfiles("b", fetchImpl, () => t);
    await x.get(["1"]);
    fail = true;
    t = 8 * 86_400_000;
    expect((await x.get(["1"])).get("1")?.username).toBe("one");
    await x.get(["1"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
