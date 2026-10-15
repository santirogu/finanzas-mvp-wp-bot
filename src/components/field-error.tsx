/** El error de un campo, debajo de él (fuera de su <label>: si no, cambiaría el nombre del campo). */
export function FieldError({ id, message }: { id: string; message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-danger">
      {message}
    </p>
  );
}

/** aria-describedby con los ids que apliquen ("" si ninguno). */
export const describedBy = (...ids: (string | false | null | undefined)[]) => ids.filter(Boolean).join(" ") || undefined;
