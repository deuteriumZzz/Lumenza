import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LocaleProvider, useLocale } from "@/lib/locale-context";

function LocaleProbe() {
  const { locale, setLocale } = useLocale();
  return (
    <>
      <output>{locale}</output>
      <button type="button" onClick={() => setLocale("en")}>
        English
      </button>
    </>
  );
}

describe("LocaleProvider", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    document.documentElement.lang = "ru";
  });

  it("defaults to Russian and keeps the html language in sync", () => {
    render(
      <LocaleProvider>
        <LocaleProbe />
      </LocaleProvider>,
    );

    expect(screen.getByText("ru")).toBeDefined();
    expect(document.documentElement.lang).toBe("ru");
  });

  it("persists an explicit language choice", () => {
    render(
      <LocaleProvider>
        <LocaleProbe />
      </LocaleProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "English" }));

    expect(screen.getByText("en")).toBeDefined();
    expect(document.documentElement.lang).toBe("en");
    expect(window.localStorage.getItem("lumenza:locale")).toBe("en");
  });
});
