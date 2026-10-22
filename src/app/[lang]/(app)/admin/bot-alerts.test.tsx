import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BotAlert } from "@/modules/bot/alerts";
import { BotAlerts } from "./bot-alerts";

const SINCE = new Date("2026-10-21T14:30:00Z");
const TOKEN: BotAlert = { kind: "whatsapp_token", since: SINCE, unsent: 2 };
const NEAR: BotAlert = { kind: "monthly_limit_near", share: 0.9, resetsOn: "2026-11-01" };
const region = () => screen.getByRole("region", { name: /del bot|Bot / });

describe("BotAlerts", () => {
  it("sin alertas, nada", () => {
    const { container } = render(<BotAlerts alerts={[]} locale="es" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("cada alerta con qué pasa, desde cuándo y qué hacer; en rojo si alguna es una falla", () => {
    render(<BotAlerts alerts={[TOKEN, NEAR]} locale="es" />);
    expect(screen.getByRole("heading", { level: 2, name: "Alertas del bot" })).toHaveClass("text-danger");
    const items = within(region()).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("El token de WhatsApp no sirve: el bot no puede responder");
    expect(items[0]).toHaveTextContent("2 respuestas no salieron");
    expect(items[0]).toHaveTextContent("WHATSAPP_ACCESS_TOKEN");
    expect(within(items[0]).getByText(/El token de WhatsApp/)).toHaveClass("text-danger");
    // El aviso, en el tono de siempre.
    expect(within(items[1]).getByText(/del tope mensual/)).not.toHaveClass("text-danger");
    // En /admin/bot no lleva el enlace a sí mismo.
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("solo avisos: «Avisos del bot», sin rojo", () => {
    render(<BotAlerts alerts={[NEAR]} locale="es" />);
    expect(screen.getByRole("heading", { level: 2, name: "Avisos del bot" })).not.toHaveClass("text-danger");
  });

  it("en el Inicio, con el enlace a Bot de WhatsApp; en inglés", () => {
    render(<BotAlerts alerts={[TOKEN]} locale="en" link />);
    expect(screen.getByRole("heading", { level: 2, name: "Bot alerts" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See WhatsApp bot" })).toHaveAttribute("href", "/admin/bot");
    expect(region()).toHaveTextContent("The WhatsApp token doesn't work");
  });
});
