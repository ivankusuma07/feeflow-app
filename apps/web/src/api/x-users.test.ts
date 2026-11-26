import { decodeError } from "@feeflow/sdk";
import { describe, expect, it } from "vitest";
import { lookupXUser, normalizeHandle } from "./x-users";

const reply = (status: number, body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

const message = (p: Promise<unknown>) =>
  p.then(
    () => "resolved",
    (e) => decodeError(e).message,
  );

describe("normalizeHandle", () => {
  it("accepts handles with or without @ and rejects invalid ones", () => {
    expect(normalizeHandle(" @example_one ")).toBe("example_one");
    expect(normalizeHandle("Example_One")).toBe("Example_One");
    expect(normalizeHandle("bad handle")).toBeNull();
    expect(normalizeHandle("waytoolonghandle_x")).toBeNull();
    expect(normalizeHandle("@")).toBeNull();
  });
});

describe("lookupXUser", () => {
  it("queries the API by username and returns the account", async () => {
    let url = "";
    const fetchImpl = (async (u: string) => {
      url = u;
      return new Response(
        JSON.stringify({ id: "1234567890", username: "Example_One", name: "Example One" }),
      );
    }) as unknown as typeof fetch;
    const user = await lookupXUser("https://api.example/", "@example_one", fetchImpl);
    expect(url).toBe("https://api.example/x/users?username=example_one");
    expect(user).toEqual({
      id: "1234567890",
      username: "Example_One",
      name: "Example One",
      avatarUrl: null,
    });
  });

  it("returns null for an unknown handle", async () => {
    expect(await lookupXUser("https://api.example", "nobody", reply(404, {}))).toBeNull();
  });

  it("rejects bad replies and ids that don't fit uint64", async () => {
    const bad = (body: unknown) =>
      message(lookupXUser("https://api.example", "a", reply(200, body)));
    expect(await bad({ id: "x", username: "a", name: "" })).toBe(
      "The X account lookup sent an invalid reply. Try again.",
    );
    expect(await bad({ id: "99999999999999999999", username: "a", name: "" })).toBe(
      "The X account lookup sent an invalid reply. Try again.",
    );
    expect(await bad({ id: "1", username: "b", name: "" })).toBe(
      "The X account lookup returned a different account. Try again.",
    );
    expect(
      await bad({ id: "1", username: "a", name: "", avatarUrl: "http://insecure.example/a.png" }),
    ).toBe("The X account lookup sent an invalid reply. Try again.");
  });

  it("explains invalid handles and missing configuration", async () => {
    expect(await message(lookupXUser("https://api.example", "bad handle", reply(200, {})))).toBe(
      "That is not a valid X handle.",
    );
    expect(await message(lookupXUser(undefined, "a", reply(200, {})))).toBe(
      "The X account lookup is not set up yet.",
    );
  });
});
