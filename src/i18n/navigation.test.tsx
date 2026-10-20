import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAppPathname } from "./navigation";

const navigation = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

describe("useAppPathname", () => {
  it.each([
    ["/es/ayuda", "/ayuda"],
    ["/ayuda", "/ayuda"],
    ["/es", "/"],
  ])("con %s (en el servidor o en el navegador) da %s", (pathname, expected) => {
    navigation.pathname = pathname;
    expect(renderHook(() => useAppPathname()).result.current).toBe(expected);
  });
});
