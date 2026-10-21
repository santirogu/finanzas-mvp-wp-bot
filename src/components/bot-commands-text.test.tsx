import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BotCommandsText } from "./bot-commands-text";

describe("BotCommandsText", () => {
  it("en inglés, cada comando del bot va en lang=es y el resto queda igual", () => {
    const { container } = render(
      <p>
        <BotCommandsText text="Paused: the bot only answers balance, reporte, deshacer and ayuda." locale="en" />
      </p>,
    );
    expect(container.textContent).toBe("Paused: the bot only answers balance, reporte, deshacer and ayuda.");
    expect([...container.querySelectorAll('[lang="es"]')].map((el) => el.textContent)).toEqual(["balance", "reporte", "deshacer", "ayuda"]);
  });

  it("solo las palabras completas: «balanced» o «reportes» no son comandos", () => {
    const { container } = render(<BotCommandsText text="A balanced reportes page" locale="en" />);
    expect(container.querySelectorAll("[lang]")).toHaveLength(0);
  });

  it("en español, el texto tal cual (la página ya está en español)", () => {
    const { container } = render(<BotCommandsText text="En pausa: el bot solo responde balance, reporte, deshacer y ayuda." locale="es" />);
    expect(container.innerHTML).toBe("En pausa: el bot solo responde balance, reporte, deshacer y ayuda.");
  });
});
