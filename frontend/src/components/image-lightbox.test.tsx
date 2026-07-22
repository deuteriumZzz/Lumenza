import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImageLightbox } from "@/components/image-lightbox";

describe("ImageLightbox", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(URL, "createObjectURL");
    Reflect.deleteProperty(URL, "revokeObjectURL");
    document.body.style.overflow = "";
  });

  it("opens an accessible preview and closes with Escape", () => {
    render(
      <ImageLightbox
        src="https://cdn.example.test/sunset.webp"
        alt="Sunset over the sea"
        downloadName="lumenza-image-42"
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "Открыть картинку: Sunset over the sea",
    });
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", {
      name: "Просмотр картинки: Sunset over the sea",
    });
    expect(within(dialog).getByRole("img", { name: "Sunset over the sea" })).toBeDefined();
    expect(document.body.style.overflow).toBe("hidden");

    const closeButton = within(dialog).getByRole("button", {
      name: "Закрыть просмотр",
    });
    const zoomInButton = within(dialog).getByRole("button", { name: "Увеличить" });
    expect(document.activeElement).toBe(closeButton);
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(zoomInButton);
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe("");
  });

  it("zooms the preview while enforcing its limits", () => {
    render(
      <ImageLightbox
        src="https://cdn.example.test/poster.png"
        alt="Campaign poster"
        downloadName="lumenza-image-7"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Открыть картинку: Campaign poster" }),
    );
    const dialog = screen.getByRole("dialog");
    const preview = within(dialog).getByRole("img", { name: "Campaign poster" });
    const zoomOut = within(dialog).getByRole("button", { name: "Уменьшить" });
    const zoomIn = within(dialog).getByRole("button", { name: "Увеличить" });

    expect(zoomOut.hasAttribute("disabled")).toBe(true);
    fireEvent.click(zoomIn);
    expect(preview.style.width).toBe("150%");
    expect(within(dialog).getByText("150%")).toBeDefined();

    fireEvent.click(zoomOut);
    expect(preview.style.width).toBe("100%");
    fireEvent.click(zoomIn);
    fireEvent.click(zoomIn);
    fireEvent.click(zoomIn);
    fireEvent.click(zoomIn);
    expect(preview.style.width).toBe("300%");
    expect(zoomIn.hasAttribute("disabled")).toBe(true);
  });

  it("downloads the image blob with a matching extension", async () => {
    const imageBlob = new Blob(["image"], { type: "image/webp" });
    let resolveBlob: ((value: Blob) => void) | undefined;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn(
        () =>
          new Promise<Blob>((resolve) => {
            resolveBlob = resolve;
          }),
      ),
    });
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:preview-download"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    let downloadedName = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadedName = this.download;
    });

    render(
      <ImageLightbox
        src="http://localhost:8000/media/generated/result"
        alt="Generated visual"
        downloadName="lumenza-image-99"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Открыть картинку: Generated visual" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Скачать картинку" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/media/generated/result",
        expect.objectContaining({ credentials: "include" }),
      ),
    );
    expect(screen.getByRole("button", { name: "Скачивается картинка" })).toBeDefined();
    await act(async () => resolveBlob?.(imageBlob));
    expect(
      screen.getByRole("button", { name: "Картинка скачана" }),
    ).toBeDefined();
    expect(downloadedName).toBe("lumenza-image-99.webp");
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-download");
  });

  it("shows a retry state when the download fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    render(
      <ImageLightbox
        src="https://cdn.example.test/result.png"
        alt="Generated visual"
        downloadName="lumenza-image-11"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Открыть картинку: Generated visual" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Скачать картинку" }));

    expect(
      await screen.findByRole("button", {
        name: "Не удалось скачать картинку. Попробуйте снова",
      }),
    ).toBeDefined();
  });
});
