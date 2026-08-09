// @vitest-environment node
import { describe, expect, it } from "vitest";
import { summarizePixelDiff } from "./pixel-diff.mjs";

describe("summarizePixelDiff", () => {
  it("reports identical RGBA pixels as an exact match", () => {
    const pixels = Uint8Array.from([10, 20, 30, 255, 40, 50, 60, 255]);

    expect(summarizePixelDiff(pixels, pixels)).toEqual({
      changedPixels: 0,
      changedRatio: 0,
      maxChannelDelta: 0,
      meanChannelDelta: 0,
      totalPixels: 2,
    });
  });

  it("counts a pixel when any visible channel exceeds the threshold", () => {
    const reference = Uint8Array.from([
      10, 20, 30, 255,
      40, 50, 60, 255,
    ]);
    const current = Uint8Array.from([
      10, 25, 30, 255,
      70, 50, 60, 255,
    ]);

    expect(
      summarizePixelDiff(reference, current, { threshold: 10 }),
    ).toEqual({
      changedPixels: 1,
      changedRatio: 0.5,
      maxChannelDelta: 30,
      meanChannelDelta: 35 / 6,
      totalPixels: 2,
    });
  });

  it("validates buffer shape and comparison options", () => {
    expect(() =>
      summarizePixelDiff(Uint8Array.of(1), Uint8Array.of(1, 2)),
    ).toThrow("Pixel buffers must have the same length");
    expect(() =>
      summarizePixelDiff(Uint8Array.of(1, 2, 3), Uint8Array.of(1, 2, 3)),
    ).toThrow("Pixel buffer length must be divisible by channels");
    expect(() =>
      summarizePixelDiff(Uint8Array.of(1, 2, 3, 4), Uint8Array.of(1, 2, 3, 4), {
        threshold: 256,
      }),
    ).toThrow("Threshold must be between 0 and 255");
  });
});
