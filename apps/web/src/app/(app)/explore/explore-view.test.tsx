import { describe, expect, it } from "vitest";
import { age } from "./explore-view";

describe("age", () => {
  const now = 1_800_000_000;
  it("is minutes, hours, then days", () => {
    expect(age(now - 10, now)).toBe("1m");
    expect(age(now - 45 * 60, now)).toBe("45m");
    expect(age(now - 6 * 3600, now)).toBe("6h");
    expect(age(now - 62 * 86_400, now)).toBe("62d");
    expect(age(now + 100, now)).toBe("1m");
  });
});
