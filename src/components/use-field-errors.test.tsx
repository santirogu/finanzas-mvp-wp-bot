import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { describedBy, FieldError } from "./field-error";
import { useFieldErrors } from "./use-field-errors";

// El hook con un formulario de prueba: los mensajes del navegador se reemplazan por los nuestros,
// debajo de cada campo, y el formulario no se envía.

const submitted = vi.fn();

function Example() {
  const { errors, formProps } = useFieldErrors({
    name: { required: "Escribe tu nombre." },
    email: { required: "Escribe tu correo." },
    code: { pattern: "Seis dígitos." },
    kind: { required: "Elige un tipo." },
  });
  const field = (name: string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div>
      <label>
        {name}
        <input name={name} aria-invalid={Boolean(errors[name]) || undefined} aria-describedby={describedBy(errors[name] && `${name}-error`)} {...props} />
      </label>
      <FieldError id={`${name}-error`} message={errors[name]} />
    </div>
  );
  return (
    <form
      {...formProps}
      onSubmit={(event) => {
        event.preventDefault();
        submitted();
      }}
    >
      {field("name", { required: true })}
      {field("email", { type: "email", required: true })}
      {field("password", { required: true, minLength: 8 })}
      {field("code", { pattern: "\\d{6}" })}
      <label>
        tipo
        <select name="kind" required aria-describedby={describedBy(errors.kind && "kind-error")} defaultValue="">
          <option value="">Elige</option>
          <option value="a">A</option>
        </select>
      </label>
      <FieldError id="kind-error" message={errors.kind} />
      <label>
        sin nombre
        <input />
      </label>
      <button type="submit">Enviar</button>
    </form>
  );
}

const input = (name: string) => screen.getByLabelText(name);

describe("useFieldErrors", () => {
  it("al enviar, marca todos los campos con problemas en español, no envía y lleva el cursor al primero", async () => {
    submitted.mockReset();
    render(<Example />);
    await userEvent.type(input("code"), "12");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

    expect(submitted).not.toHaveBeenCalled();
    expect(input("name")).toHaveAccessibleDescription("Escribe tu nombre.");
    expect(input("email")).toHaveAccessibleDescription("Escribe tu correo.");
    // Sin mensaje propio: el general.
    expect(input("password")).toHaveAccessibleDescription("Completa este campo.");
    expect(input("code")).toHaveAccessibleDescription("Seis dígitos.");
    for (const name of ["name", "email", "password", "code"]) expect(input(name)).toHaveAttribute("aria-invalid", "true");
    expect(input("name")).toHaveFocus();
  });

  it("cada mensaje cambia o se va mientras se corrige el campo", async () => {
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await userEvent.type(input("email"), "ana@");
    expect(input("email")).toHaveAccessibleDescription("Revisa el correo: debe verse como nombre@correo.com.");
    await userEvent.type(input("email"), "correo.com");
    expect(input("email")).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText(/Revisa el correo/)).toBeNull();

    // (El largo mínimo no lo implementa jsdom: lo prueba la E2E en un navegador de verdad.)
    await userEvent.type(input("password"), "clave-segura");
    expect(input("password")).not.toHaveAttribute("aria-invalid");
  });

  it("un select obligatorio: dice que falta y se va al elegir", async () => {
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
    const select = screen.getByLabelText("tipo");
    expect(select).toHaveAccessibleDescription("Elige un tipo.");
    await userEvent.selectOptions(select, "a");
    expect(screen.queryByText("Elige un tipo.")).toBeNull();
  });

  it("mientras siga con el mismo problema, el mensaje no cambia; un campo sin nombre no se toca", async () => {
    render(<Example />);
    await userEvent.type(input("code"), "1");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
    expect(input("code")).toHaveAccessibleDescription("Seis dígitos.");
    await userEvent.type(input("code"), "23");
    expect(input("code")).toHaveAccessibleDescription("Seis dígitos.");
    await userEvent.type(screen.getByLabelText("sin nombre"), "algo");
    expect(input("code")).toHaveAccessibleDescription("Seis dígitos.");
    await userEvent.type(input("code"), "456");
    expect(input("code")).not.toHaveAttribute("aria-invalid");
  });

  it("un campo que nunca tuvo error no muestra nada al escribir", async () => {
    render(<Example />);
    await userEvent.type(input("email"), "ana@");
    expect(input("email")).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText(/Revisa el correo/)).toBeNull();
  });

  it("con todo bien, se envía sin mensajes", async () => {
    submitted.mockReset();
    render(<Example />);
    await userEvent.type(input("name"), "Ana");
    await userEvent.type(input("email"), "ana@correo.com");
    await userEvent.type(input("password"), "clave-segura");
    await userEvent.selectOptions(screen.getByLabelText("tipo"), "a");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
    expect(submitted).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Escribe|Completa|Revisa/)).toBeNull();
  });

  it("evita el globo del navegador (cancela el evento invalid)", async () => {
    render(<Example />);
    const prevented: boolean[] = [];
    document.addEventListener("invalid", (event) => setTimeout(() => prevented.push(event.defaultPrevented)), true);
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await new Promise((r) => setTimeout(r));
    expect(prevented.length).toBeGreaterThan(0);
    expect(prevented.every(Boolean)).toBe(true);
  });
});
