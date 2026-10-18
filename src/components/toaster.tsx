"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { TOAST_PARAM, type ToastTone, urlToast, withoutParams } from "@/lib/toasts";

export type { ToastTone };

// Los avisos emergentes de la app: la confirmación de algo que ya pasó ("Egreso registrado", "Se
// borró «Mercado»"). Aparecen abajo (al centro en celular y tableta, a la derecha en computador) y se
// van solos. Los errores no van aquí: se quedan junto a su campo hasta que se corrigen.


export type Toast = {
  /** Para no mostrar dos veces el mismo aviso (la página que lo pide puede volver a renderizarse). */
  id?: string;
  tone: ToastTone;
  message: string;
  /**
   * Un botón dentro del aviso ("Deshacer"): envía `fields` a la Server Action `formAction`. El aviso
   * se cierra al tocarlo.
   */
  action?: { label: string; formAction: (data: FormData) => void | Promise<void>; fields: Record<string, string> };
  /**
   * Recibe el foco al aparecer: cuando lo que se tocó ya no está (la fila borrada, la ventana que se
   * cerró), el teclado y el lector de pantalla siguen desde aquí.
   */
  focus?: boolean;
};

/** Cuánto dura un aviso (sin contar las pausas). */
export const TOAST_MS = 4000;
/** Uno con un botón ("Deshacer") dura más: hay que alcanzar a leerlo y a usarlo. */
export const TOAST_WITH_ACTION_MS = 10_000;
/** Cuántos se ven a la vez: el más viejo se va al llegar otro. */
export const MAX_TOASTS = 3;

type Shown = Toast & { key: string };

const ToastContext = createContext<(toast: Toast) => void>(() => {});

/** Muestra un aviso emergente. Fuera de <Toaster> no hace nada. */
export const useToast = () => useContext(ToastContext);

export function Toaster({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Shown[]>([]);
  const counter = useRef(0);

  const show = useCallback((toast: Toast) => {
    setToasts((shown) => {
      if (toast.id && shown.some((t) => t.key === toast.id)) return shown;
      const key = toast.id ?? `aviso-${++counter.current}`;
      return [...shown, { ...toast, key }].slice(-MAX_TOASTS);
    });
  }, []);
  const dismiss = useCallback((key: string) => setToasts((shown) => shown.filter((t) => t.key !== key)), []);

  useEffect(() => {
    const keyboard = () => (usingKeyboard = true);
    const pointer = () => (usingKeyboard = false);
    document.addEventListener("keydown", keyboard, true);
    document.addEventListener("pointerdown", pointer, true);
    return () => {
      document.removeEventListener("keydown", keyboard, true);
      document.removeEventListener("pointerdown", pointer, true);
    };
  }, []);

  return (
    <ToastContext value={show}>
      {children}
      {/* La región existe siempre (vacía si no hay avisos): así el lector de pantalla anuncia cada
          aviso que entra. data-toaster: la auditoría de diseño no cuenta como "tapado" lo de abajo. */}
      <section
        aria-label="Avisos"
        data-toaster
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:justify-end"
      >
        <ol aria-live="polite" className="flex w-full max-w-sm flex-col gap-2">
          {toasts.map((toast) => (
            <ToastItem key={toast.key} toast={toast} onDismiss={dismiss} />
          ))}
        </ol>
      </section>
    </ToastContext>
  );
}

const TONES: Record<ToastTone, { box: string; icon: string; bar: string; button: string; path: string }> = {
  success: {
    box: "border-success-border bg-success-surface",
    icon: "text-success",
    bar: "bg-success",
    button: "border-success text-success hover:bg-success/10",
    path: "M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z",
  },
  removal: {
    box: "border-danger-border bg-danger-surface",
    icon: "text-danger",
    bar: "bg-danger",
    button: "border-danger text-danger hover:bg-danger/10",
    // Una papelera: lo que se quitó (nunca el ícono de un error).
    path: "M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z",
  },
};

/**
 * ¿Lo último que se usó fue el teclado? El foco que llega así pausa el aviso; el que llega después de
 * un clic o un toque, no (es la misma regla del navegador para mostrar el anillo del foco).
 */
let usingKeyboard = false;

function ToastItem({ toast, onDismiss }: { toast: Shown; onDismiss: (key: string) => void }) {
  const duration = toast.action ? TOAST_WITH_ACTION_MS : TOAST_MS;
  const ref = useRef<HTMLLIElement>(null);
  // Se pausa con el mouse encima (o el dedo, al tocarlo) y con el foco del teclado adentro.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  const remaining = useRef(duration);
  const { key } = toast;

  const close = useCallback(() => {
    // Si el foco estaba aquí, vuelve al contenido (si no, quedaría en ninguna parte).
    if (ref.current?.contains(document.activeElement)) document.getElementById("contenido")?.focus();
    onDismiss(key);
  }, [key, onDismiss]);

  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = setTimeout(close, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - started;
    };
  }, [paused, close]);

  useEffect(() => {
    if (toast.focus) ref.current?.focus();
  }, [toast.focus]);

  const tone = TONES[toast.tone];
  return (
    <li
      ref={ref}
      tabIndex={toast.focus ? -1 : undefined}
      data-tone={toast.tone}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => {
        if (usingKeyboard) setFocused(true);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      className={`pointer-events-auto relative flex items-center gap-2 overflow-hidden rounded-xl border py-2 pl-3 pr-1.5 text-sm text-foreground shadow-lg outline-none animate-[toast-in_150ms_ease-out] focus-visible:ring-2 focus-visible:ring-brand/40 motion-reduce:animate-none ${tone.box}`}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className={`size-5 shrink-0 ${tone.icon}`} aria-hidden>
        <path fillRule="evenodd" d={tone.path} clipRule="evenodd" />
      </svg>
      <p className="min-w-0 flex-1 py-1.5">{toast.message}</p>
      {toast.action && (
        <form
          action={async (data) => {
            close();
            await toast.action!.formAction(data);
          }}
        >
          {Object.entries(toast.action.fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <button
            type="submit"
            className={`inline-flex min-h-11 shrink-0 items-center rounded-lg border px-3 font-medium pointer-fine:min-h-8 ${tone.button}`}
          >
            {toast.action.label}
          </button>
        </form>
      )}
      <button
        type="button"
        onClick={close}
        aria-label="Cerrar el aviso"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-border/60 hover:text-foreground pointer-fine:size-8"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden>
          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
        </svg>
      </button>
      {/* El tiempo que le queda. Con movimiento reducido no se muestra (el aviso se va igual). */}
      <span
        aria-hidden
        className={`absolute inset-x-0 bottom-0 h-[3px] origin-left animate-[toast-timer_linear_forwards] motion-reduce:hidden ${tone.bar}`}
        style={{ animationDuration: `${duration}ms`, animationPlayState: paused ? "paused" : "running" }}
      />
    </li>
  );
}

/**
 * Muestra el aviso que pide la URL (`?aviso=guardado`, después de una redirección del servidor) y lo
 * quita de la dirección. Va en el marco de la app, dentro de Suspense (lee la URL).
 */
export function UrlToasts() {
  const show = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const code = params.get(TOAST_PARAM);

  useEffect(() => {
    const toast = urlToast(code, pathname);
    if (!toast) return;
    show({ id: `url:${code}`, ...toast });
    router.replace(withoutParams(pathname, params.toString(), [TOAST_PARAM]), { scroll: false });
  }, [code, show, router, pathname, params]);
  return null;
}

/**
 * Muestra un aviso que arma el servidor al cargar la página (el de "Se borró «Mercado»", con su
 * "Deshacer") y deja la dirección en `cleanHref`, sin el parámetro que lo pidió.
 */
export function ToastOnLoad({ toast, cleanHref }: { toast: Toast & { id: string }; cleanHref: string }) {
  const show = useToast();
  const router = useRouter();

  useEffect(() => {
    show(toast);
    router.replace(cleanHref, { scroll: false });
  }, [toast, cleanHref, show, router]);
  return null;
}
