"use client";

import { useEffect } from "react";

/**
 * Baja hasta el ancla de la dirección (/reportes#categorias) cuando el contenido ya está. Next lo hace al cambiar
 * de página, pero en una página que se arma dentro de Suspense la sección llega después y se queda arriba. Va al
 * final del contenido que trae las secciones.
 */
export function ScrollToHash() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);
  return null;
}
