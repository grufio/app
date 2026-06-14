import { describe, expect, it } from "vitest";
import { DEFAULT_USER, getActiveUser, USERS } from "./user";

describe("user", () => {
  it("defaults to admin without a window", () => {
    expect(DEFAULT_USER).toBe("admin");
    expect(getActiveUser()).toBe("admin");
  });

  it("lists all profiles with labels", () => {
    expect(USERS.map((u) => u.id)).toEqual(["admin", "q", "r"]);
    expect(USERS.find((u) => u.id === "q")?.label).toBe("Q");
    expect(USERS.find((u) => u.id === "r")?.label).toBe("R");
  });
});
