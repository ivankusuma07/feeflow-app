import { describe, expect, it, vi } from "vitest";
import { createXClient, largeAvatar, XUnavailableError } from "./x-client";

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const DATA = {
  data: {
    id: "1000000000",
    username: "Example_One",
    name: "Example",
    profile_image_url: "https://pbs.twimg.com/profile_images/1/a_normal.jpg",
  },
};

describe("createXClient", () => {
  it("maps the X API reply, sends the bearer, and caches by handle and id", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => reply(200, DATA));
    const x = createXClient("secret-bearer", fetchImpl);
    expect(await x.byUsername("example_one")).toEqual({
      id: "1000000000",
      username: "Example_One",
      name: "Example",
      avatarUrl: "https://pbs.twimg.com/profile_images/1/a_400x400.jpg",
    });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://api.x.com/2/users/by/username/example_one?user.fields=profile_image_url",
    );
    expect((init!.headers as Record<string, string>).authorization).toBe("Bearer secret-bearer");

    await x.byUsername("EXAMPLE_ONE");
    await x.byId("1000000000");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("treats 200-without-data and 404 as not found, and caches misses for an hour", async () => {
    let t = 0;
    const fetchImpl = vi.fn<typeof fetch>(async () => reply(200, { errors: [{}] }));
    const x = createXClient("b", fetchImpl, () => t);
    expect(await x.byUsername("ghost")).toBeNull();
    t = 30 * 60 * 1000;
    expect(await x.byUsername("ghost")).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    t = 61 * 60 * 1000;
    await x.byUsername("ghost");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws XUnavailableError on rate limits, server errors and network failures", async () => {
    await expect(
      createXClient("b", async () => reply(429, {})).byUsername("a"),
    ).rejects.toBeInstanceOf(XUnavailableError);
    await expect(
      createXClient("b", async () => {
        throw new TypeError("network");
      }).byId("1"),
    ).rejects.toBeInstanceOf(XUnavailableError);
  });
});

describe("largeAvatar", () => {
  it("upgrades _normal and drops non-https urls", () => {
    expect(largeAvatar("https://x/a_normal.png")).toBe("https://x/a_400x400.png");
    expect(largeAvatar("http://x/a_normal.png")).toBeNull();
    expect(largeAvatar(undefined)).toBeNull();
  });
});
