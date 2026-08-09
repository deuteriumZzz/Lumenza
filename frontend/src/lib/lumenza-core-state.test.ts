import { describe, expect, it } from "vitest";
import {
  CORE_STATES,
  coreStatePattern,
  resolveChatCoreState,
} from "@/lib/lumenza-core-state";

describe("Lumenza Core state contract", () => {
  it("defines every product state once", () => {
    expect(CORE_STATES).toEqual([
      "idle",
      "listening",
      "routing",
      "thinking",
      "typing",
      "success",
      "error",
    ]);
    expect(new Set(CORE_STATES).size).toBe(CORE_STATES.length);
  });

  it("gives every state a distinct non-color pattern", () => {
    expect(new Set(CORE_STATES.map(coreStatePattern)).size).toBe(
      CORE_STATES.length,
    );
  });

  it("resolves chat activity in user-impact priority order", () => {
    expect(resolveChatCoreState({ error: true })).toBe("error");
    expect(resolveChatCoreState({ dictating: true })).toBe("listening");
    expect(resolveChatCoreState({ transcribing: true })).toBe("thinking");
    expect(resolveChatCoreState({ streaming: true })).toBe("typing");
    expect(resolveChatCoreState({ sending: true })).toBe("routing");
    expect(resolveChatCoreState({ succeeded: true })).toBe("success");
    expect(resolveChatCoreState({})).toBe("idle");
  });
});
