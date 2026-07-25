import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  ChatRoutingProvider,
  useChatRouting,
} from "@/components/chat-routing";

function RoutingProbe() {
  const { routing, setRouting } = useChatRouting();
  return (
    <button
      type="button"
      onClick={() =>
        setRouting({
          kind: "model",
          task: "repurpose",
          model: "gpt-4o-mini",
        })
      }
    >
      {routing.kind === "model" ? `${routing.task}:${routing.model}` : routing.kind}
    </button>
  );
}

describe("ChatRoutingProvider", () => {
  afterEach(cleanup);

  it("keeps routing selection in shared chat state", () => {
    render(
      <ChatRoutingProvider>
        <RoutingProbe />
      </ChatRoutingProvider>,
    );

    const probe = screen.getByRole("button", { name: "auto" });
    fireEvent.click(probe);
    expect(
      screen.getByRole("button", { name: "repurpose:gpt-4o-mini" }),
    ).toBeDefined();
  });

  it("rejects use outside the chat provider", () => {
    expect(() => render(<RoutingProbe />)).toThrow(
      "useChatRouting must be used within ChatRoutingProvider",
    );
  });
});
