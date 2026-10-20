export function PageSkeleton() {
  return (
    // role="status": los lectores de pantalla anuncian "Cargando" (aria-label en un div sin rol
    // no está permitido y se ignora).
    <div role="status" aria-busy="true" aria-label="Cargando" className="animate-pulse space-y-6">
      <div className="h-8 w-48 rounded-lg bg-border/60" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="h-24 rounded-xl bg-border/60" />
        <div className="h-24 rounded-xl bg-border/60" />
        <div className="h-24 rounded-xl bg-border/60" />
      </div>
      <div className="h-64 rounded-xl bg-border/60" />
    </div>
  );
}
