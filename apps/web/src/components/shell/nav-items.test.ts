import { describe, expect, it } from "vitest";
import { isActive } from "./nav-items";

describe("isActive", () => {
  it("matches Home only on / and other items on their sub-paths", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/payments", "/")).toBe(false);
    expect(isActive("/claim/success", "/claim")).toBe(true);
    expect(isActive("/claims", "/claim")).toBe(false);
  });
});
