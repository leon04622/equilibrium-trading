import { describe, expect, it } from "vitest";
import { withTimeout } from "./with-timeout";

describe("withTimeout", () => {
  it("returns the value when work finishes first", async () => {
    const result = await withTimeout(Promise.resolve("ok"), 200, () => {
      throw new Error("should not time out");
    });
    expect(result).toEqual({ timedOut: false, value: "ok" });
  });

  it("times out without rejecting when work hangs", async () => {
    let timedOut = false;
    const hang = new Promise<string>(() => {
      /* never settle */
    });
    const started = Date.now();
    const result = await withTimeout(hang, 50, () => {
      timedOut = true;
    });
    expect(result.timedOut).toBe(true);
    expect(timedOut).toBe(true);
    expect(Date.now() - started).toBeLessThan(400);
  });
});
