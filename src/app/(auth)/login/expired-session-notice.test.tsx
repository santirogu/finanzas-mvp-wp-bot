import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(navigation.search) }));

const { ExpiredSessionNotice } = await import("./expired-session-notice");

describe("ExpiredSessionNotice", () => {
  it("con ?sesion=vencida avisa que la sesión se cerró", () => {
    navigation.search = "sesion=vencida";
    render(<ExpiredSessionNotice />);
    expect(screen.getByRole("status")).toHaveTextContent("Tu sesión se cerró. Vuelve a iniciar sesión.");
  });

  it.each(["", "sesion=otra", "vencida=1"])("con %j no muestra nada", (search) => {
    navigation.search = search;
    const { container } = render(<ExpiredSessionNotice />);
    expect(container).toBeEmptyDOMElement();
  });
});
