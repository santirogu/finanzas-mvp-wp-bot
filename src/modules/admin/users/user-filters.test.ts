import { describe, expect, it } from "vitest";
import {
  ANY,
  LOCKED_FILTER,
  NO_USER_FILTERS,
  ROLE_FILTER_LABELS,
  SUSPENDED_FILTER,
  USERS_PATH,
  WHATSAPP_FILTER_LABELS,
  activeUserFilters,
  isValidUserId,
  parseUserFilters,
  showMoreUsers,
  userDetailHref,
  usersHref,
  whatsappParam,
  withoutUserFilter,
  type UserFilters,
} from "./user-filters";

const f = (overrides: Partial<UserFilters> = {}): UserFilters => ({ ...NO_USER_FILTERS, ...overrides });

describe("configuración", () => {
  it("Usuarios vive en /admin/usuarios y empieza sin filtros, de a 50 cuentas", () => {
    expect(USERS_PATH).toBe("/admin/usuarios");
    expect(ANY).toBe("todos");
    expect(NO_USER_FILTERS).toEqual({
      search: "",
      role: null,
      whatsapp: null,
      locked: false,
      suspended: false,
      date: "todo",
      from: null,
      to: null,
      limit: 50,
    });
  });

  it("los chips tienen sus nombres en español", () => {
    expect(ROLE_FILTER_LABELS).toEqual({ admin: "Admin", user: "Usuario" });
    expect(WHATSAPP_FILTER_LABELS).toEqual({ si: "Vinculado", no: "Sin vincular" });
    expect(LOCKED_FILTER).toEqual({ value: "bloqueadas", label: "Inicio de sesión bloqueado" });
    expect(SUSPENDED_FILTER).toEqual({ value: "suspendidas", label: "Suspendidas" });
  });
});

describe("parseUserFilters", () => {
  it("sin parámetros, sin filtros", () => {
    expect(parseUserFilters({})).toEqual(NO_USER_FILTERS);
  });

  it("lee cada filtro de la URL", () => {
    expect(
      parseUserFilters({
        q: "  ana  ",
        rol: "admin",
        whatsapp: "no",
        estado: "bloqueadas",
        fecha: "personalizado",
        desde: "2026-10-01",
        hasta: "2026-10-15",
        mostrar: "100",
      }),
    ).toEqual({
      search: "ana",
      role: "admin",
      whatsapp: false,
      locked: true,
      suspended: false,
      date: "personalizado",
      from: "2026-10-01",
      to: "2026-10-15",
      limit: 100,
    });
    expect(parseUserFilters({ estado: "suspendidas" })).toMatchObject({ suspended: true, locked: false });
    expect(parseUserFilters({ estado: ["bloqueadas", "suspendidas"] })).toMatchObject({ suspended: true, locked: true });
    expect(parseUserFilters({ rol: "user", whatsapp: "si" })).toMatchObject({ role: "user", whatsapp: true });
  });

  it.each([
    ["rol", { rol: "todos" }, { role: null }],
    ["rol", { rol: "superadmin" }, { role: null }],
    ["rol", { rol: "ADMIN" }, { role: null }],
    ["rol", { rol: ["user", "admin"] }, { role: "user" }],
    ["whatsapp", { whatsapp: "todos" }, { whatsapp: null }],
    ["whatsapp", { whatsapp: "true" }, { whatsapp: null }],
    ["whatsapp", { whatsapp: "" }, { whatsapp: null }],
    ["estado", { estado: "otra" }, { locked: false }],
    ["estado", { estado: ["otra", "bloqueadas"] }, { locked: true }],
    ["fecha", { fecha: "ayer" }, { date: "todo" }],
    ["mostrar", { mostrar: "9999" }, { limit: 500 }],
  ])("ignora lo que no entiende (%s: %j)", (_, params, expected) => {
    expect(parseUserFilters(params)).toMatchObject(expected);
  });

  it("la búsqueda se recorta a 100 caracteres", () => {
    expect(parseUserFilters({ q: "a".repeat(150) }).search).toHaveLength(100);
  });
});

describe("usersHref", () => {
  it("sin filtros, la ruta sola", () => {
    expect(usersHref(NO_USER_FILTERS)).toBe("/admin/usuarios");
  });

  it("cada filtro va en la URL y se lee igual (ida y vuelta)", () => {
    const filters = f({
      search: "ana pérez",
      role: "user",
      whatsapp: true,
      locked: true,
      suspended: true,
      date: "personalizado",
      from: "2026-10-01",
      to: "2026-10-02",
      limit: 150,
    });
    const href = usersHref(filters);
    expect(href).toBe(
      "/admin/usuarios?rol=user&whatsapp=si&estado=bloqueadas&estado=suspendidas&fecha=personalizado&desde=2026-10-01&hasta=2026-10-02&q=ana+p%C3%A9rez&mostrar=150",
    );
    const url = new URL(href, "http://x").searchParams;
    const params = Object.fromEntries([...new Set(url.keys())].map((key) => [key, url.getAll(key).length > 1 ? url.getAll(key) : url.get(key)!]));
    expect(parseUserFilters(params)).toEqual(filters);
  });

  it("WhatsApp sin vincular y un atajo de fecha", () => {
    expect(usersHref(f({ whatsapp: false, date: "7d" }))).toBe("/admin/usuarios?whatsapp=no&fecha=7d");
  });

  it("los primeros 50 no llevan 'mostrar'", () => {
    expect(usersHref(f({ limit: 50 }))).toBe("/admin/usuarios");
    expect(usersHref(f({ limit: 100 }))).toBe("/admin/usuarios?mostrar=100");
  });
});

describe("whatsappParam", () => {
  it.each([
    [null, "todos"],
    [true, "si"],
    [false, "no"],
  ] as const)("%s → %s", (value, expected) => {
    expect(whatsappParam(value)).toBe(expected);
  });
});

describe("filtros activos", () => {
  const all = f({
    search: "ana",
    role: "admin",
    whatsapp: false,
    locked: true,
    suspended: true,
    date: "personalizado",
    from: "2026-10-01",
    to: "2026-10-15",
    limit: 200,
  });

  it("sin filtros, ninguna etiqueta", () => {
    expect(activeUserFilters(NO_USER_FILTERS)).toEqual([]);
  });

  it("una etiqueta por filtro, en orden", () => {
    expect(activeUserFilters(all)).toEqual([
      { key: "role", label: "Rol: Admin" },
      { key: "whatsapp", label: "WhatsApp: sin vincular" },
      { key: "locked", label: "Inicio de sesión bloqueado" },
      { key: "suspended", label: "Suspendidas" },
      { key: "date", label: "Registro: 1 de oct – 15 de oct" },
      { key: "search", label: "“ana”" },
    ]);
    expect(activeUserFilters(f({ role: "user", whatsapp: true, date: "hoy" })).map((i) => i.label)).toEqual([
      "Rol: Usuario",
      "WhatsApp: vinculado",
      "Registro: Hoy",
    ]);
  });

  it.each([
    ["role", { role: null }],
    ["whatsapp", { whatsapp: null }],
    ["locked", { locked: false }],
    ["suspended", { suspended: false }],
    ["date", { date: "todo", from: null, to: null }],
    ["search", { search: "" }],
  ] as const)("quitar %s deja los demás y vuelve a las primeras 50", (key, cleared) => {
    expect(withoutUserFilter(all, key)).toEqual({ ...all, ...cleared, limit: 50 });
    expect(activeUserFilters(withoutUserFilter(all, key)).map((i) => i.key)).not.toContain(key);
  });
});

describe("showMoreUsers", () => {
  it("suma 50 hasta el tope de 500", () => {
    expect(showMoreUsers(f()).limit).toBe(100);
    expect(showMoreUsers(f({ limit: 450 })).limit).toBe(500);
    expect(showMoreUsers(f({ limit: 500 })).limit).toBe(500);
    expect(showMoreUsers(f({ role: "admin" }))).toMatchObject({ role: "admin" });
  });
});

describe("el id de una cuenta", () => {
  it.each(["psU7icUBm9GNOKprrkFNmWyFxQepuSlp", "6f1c2a9e-1b7d-4c1e-9a55-0d1e2f3a4b5c", "a_b-C"])("acepta %s", (id) => {
    expect(isValidUserId(id)).toBe(true);
  });

  it.each(["", "a b", "a/b", "../admin", "a'; drop table user;--", "x".repeat(65), "ñandú", "a%20b"])("rechaza %j", (id) => {
    expect(isValidUserId(id)).toBe(false);
  });

  it("el enlace al detalle", () => {
    expect(userDetailHref("abc-123")).toBe("/admin/usuarios/abc-123");
    expect(userDetailHref("a/b")).toBe("/admin/usuarios/a%2Fb");
  });
});
