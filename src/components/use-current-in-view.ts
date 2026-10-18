"use client";

import { useEffect, useRef } from "react";

/**
 * En una franja que se desliza de lado (las pestañas del encabezado, los chips del admin), muestra
 * entera la sección actual (`aria-current="page"`): si no, en un celular angosto quedaba cortada en
 * el borde ("Se…"). Solo se desliza la franja: scrollIntoView podría mover también la página. Vuelve
 * a mirar al cambiar de página y al cambiar el ancho (girar el celular). Devuelve la referencia que
 * va en la franja (`<nav ref={…}>`).
 */
export function useCurrentInView(pathname: string | null) {
  const strip = useRef<HTMLElement>(null);
  useEffect(() => {
    const showCurrent = () => {
      const bar = strip.current;
      const current = bar?.querySelector<HTMLElement>('[aria-current="page"]');
      if (!bar || !current) return;
      const overflow = current.getBoundingClientRect().right - bar.getBoundingClientRect().right;
      // Un poco más que lo justo, para que se vea que la franja sigue.
      if (overflow > 0) bar.scrollLeft += overflow + 16;
    };
    showCurrent();
    window.addEventListener("resize", showCurrent);
    return () => window.removeEventListener("resize", showCurrent);
  }, [pathname]);
  return strip;
}
