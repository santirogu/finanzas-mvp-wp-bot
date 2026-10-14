import { describe, expect, it } from "vitest";
import { buildSystemPrompt, buildUserMessage } from "./prompt";

const categories = { expense: ["Ropa", "Mercado", "Otros"], income: ["Salario", "Otros"] };

describe("buildSystemPrompt", () => {
  it("lista las categorías de cada tipo", () => {
    const prompt = buildSystemPrompt(categories);
    expect(prompt).toContain("Categorías de egreso: Ropa, Mercado, Otros.");
    expect(prompt).toContain("Categorías de ingreso: Salario, Otros.");
  });

  it("explica el formato colombiano de montos y la jerga", () => {
    const prompt = buildSystemPrompt(categories);
    expect(prompt).toContain('"$500.000" = 500000');
    expect(prompt).toContain('"500 lucas" = 500000');
    expect(prompt).toContain('"1,5 palos" = 1500000');
  });

  it("no depende de la fecha, para que se pueda cachear entre mensajes", () => {
    expect(buildSystemPrompt(categories)).toBe(buildSystemPrompt(categories));
    expect(buildSystemPrompt(categories)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe("buildUserMessage", () => {
  it("incluye la fecha de hoy y el mensaje delimitado", () => {
    const message = buildUserMessage("gasté 20 mil", {
      iso: "2026-10-13",
      long: "martes 13 de octubre de 2026",
    });
    expect(message).toBe(
      "Hoy es martes 13 de octubre de 2026 (2026-10-13).\n\nMensaje del usuario:\n<mensaje>\ngasté 20 mil\n</mensaje>",
    );
  });
});
