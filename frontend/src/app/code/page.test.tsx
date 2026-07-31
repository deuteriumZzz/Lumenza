import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createCodeExecution: vi.fn(),
  refreshBalance: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ refreshBalance: mocks.refreshBalance }),
}));

vi.mock("@/lib/use-polled-status", () => ({
  usePolledStatus: () => undefined,
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      createCodeExecution: mocks.createCodeExecution,
    },
  };
});

import { Code } from "@/app/code/page";
import { ApiError } from "@/lib/api";

describe("Code", () => {
  beforeEach(() => {
    mocks.createCodeExecution.mockReset();
    mocks.refreshBalance.mockReset();
  });

  afterEach(cleanup);

  it("disables the submit button until code is entered", () => {
    render(<Code />);

    const button = screen.getByRole("button", { name: "Выполнить" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Python-код"), {
      target: { value: "print(1)" },
    });
    expect(button.disabled).toBe(false);
  });

  it("submits code and renders stdout once the execution completes", async () => {
    mocks.createCodeExecution.mockResolvedValue({
      id: 1,
      code: "print(2 + 2)",
      language: "python",
      version: "3.12.0",
      stdout: "4\n",
      stderr: "",
      exit_code: 0,
      status: "ok",
      credits_charged: "1.30",
      mocked: true,
      created_at: "",
      completed_at: "",
    });

    render(<Code />);
    fireEvent.change(screen.getByLabelText("Python-код"), {
      target: { value: "print(2 + 2)" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Выполнить" }));

    await waitFor(() =>
      expect(mocks.createCodeExecution).toHaveBeenCalledWith("print(2 + 2)"),
    );
    expect(await screen.findByText("4")).toBeDefined();
    expect(screen.getByRole("status").textContent).toBe("ok");
    await waitFor(() => expect(mocks.refreshBalance).toHaveBeenCalled());
  });

  it("shows an insufficient-credits message on 402", async () => {
    mocks.createCodeExecution.mockRejectedValue(new ApiError(402, null));

    render(<Code />);
    fireEvent.change(screen.getByLabelText("Python-код"), {
      target: { value: "print(1)" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Выполнить" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Недостаточно кредитов для этого запроса.",
    );
  });
});
