import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileUploadButton } from "@/components/file-upload-button";

describe("FileUploadButton", () => {
  afterEach(cleanup);

  it("opens the file chooser from a semantic button", () => {
    render(<FileUploadButton accept="image/*" label="Upload photo" onFile={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const click = vi.spyOn(input, "click");

    fireEvent.click(screen.getByRole("button", { name: "Upload photo" }));

    expect(click).toHaveBeenCalledTimes(1);
    expect(input.tabIndex).toBe(-1);
  });

  it("passes the selected file and clears the native input", () => {
    const onFile = vi.fn();
    render(<FileUploadButton accept="audio/*" label="Upload audio file" onFile={onFile} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["audio"], "note.webm", { type: "audio/webm" });

    fireEvent.change(input, { target: { files: [file] } });

    expect(onFile).toHaveBeenCalledWith(file);
    expect(input.value).toBe("");
  });

  it("does not open the chooser while disabled", () => {
    render(
      <FileUploadButton accept="image/*" label="Uploading…" onFile={vi.fn()} disabled />,
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const click = vi.spyOn(input, "click");

    fireEvent.click(screen.getByRole("button", { name: "Uploading…" }));

    expect(click).not.toHaveBeenCalled();
  });
});
