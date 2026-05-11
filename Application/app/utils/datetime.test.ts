import { describe, expect, it } from "vitest";
import { localTimeToUTC } from "./datetime";

describe("localTimeToUTC", () => {
  it("converts picker-local EST input to UTC using the provided timezone", () => {
    expect(localTimeToUTC("2026-01-15 09:30:00", "America/New_York")).toBe(
      "2026-01-15T14:30:00+00:00"
    );
  });

  it("converts picker-local EDT input to UTC using the provided timezone", () => {
    expect(localTimeToUTC("2026-07-15 09:30:00", "America/New_York")).toBe(
      "2026-07-15T13:30:00+00:00"
    );
  });
});
