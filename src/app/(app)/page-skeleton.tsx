export function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Cargando">
      <div className="h-8 w-48 rounded-lg bg-border/60" />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="h-24 rounded-xl bg-border/60" />
        <div className="h-24 rounded-xl bg-border/60" />
        <div className="h-24 rounded-xl bg-border/60" />
      </div>
      <div className="h-64 rounded-xl bg-border/60" />
    </div>
  );
}
