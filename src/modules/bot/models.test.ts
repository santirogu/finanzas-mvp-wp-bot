import { describe, expect, it } from "vitest";
import { BOT_MODELS, botModelName, DEFAULT_BOT_MODEL, isBotModel, resolveBotModel } from "./models";
import { priceOf } from "./pricing";

describe("los modelos que se pueden elegir", () => {
  it("cada uno tiene precio (para su costo en /admin/bot) y una evaluación que tiene sentido", () => {
    for (const model of BOT_MODELS) {
      expect(priceOf(model.id), model.id).not.toBeNull();
      expect(model.eval.passed).toBeLessThanOrEqual(model.eval.total);
    }
    expect(isBotModel(DEFAULT_BOT_MODEL)).toBe(true);
  });

  it("solo los de la lista", () => {
    expect(isBotModel("claude-sonnet-5-5")).toBe(true);
    expect(isBotModel("claude-sonnet-5")).toBe(false);
    expect(isBotModel(null)).toBe(false);
  });

  it("el que usa el bot: el que eligió el admin; si no, BOT_MODEL; si no, el de siempre", () => {
    expect(resolveBotModel("claude-opus-5-5", "claude-sonnet-5-5")).toBe("claude-opus-5-5");
    expect(resolveBotModel(null, "claude-sonnet-5-5")).toBe("claude-sonnet-5-5");
    expect(resolveBotModel(null, "")).toBe("claude-haiku-5-5");
    expect(resolveBotModel(null, undefined)).toBe("claude-haiku-5-5");
  });

  it("el nombre para mostrar; uno que no está en la lista, con su id", () => {
    expect(botModelName("claude-haiku-5-5")).toBe("Claude Haiku 5.5");
    expect(botModelName("claude-modelo-x")).toBe("claude-modelo-x");
  });
});
