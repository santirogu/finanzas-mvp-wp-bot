import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LocaleProvider, useLocale, useTexts } from "./client";
import { texts } from "./texts";

const GREETING = texts({ hello: "Hola" }, { en: { hello: "Hello" } });

function Greeting() {
  const t = useTexts(GREETING);
  return (
    <p>
      {t.hello} ({useLocale()})
    </p>
  );
}

describe("el idioma en el cliente", () => {
  it("el que pone el layout, con sus textos", () => {
    render(
      <LocaleProvider locale="en">
        <Greeting />
      </LocaleProvider>,
    );
    expect(screen.getByText("Hello (en)")).toBeVisible();
  });

  it("sin el layout (como en las pruebas de cada componente), en español", () => {
    render(<Greeting />);
    expect(screen.getByText("Hola (es)")).toBeVisible();
  });
});
