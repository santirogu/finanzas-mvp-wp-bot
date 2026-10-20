import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { TransactionForm } from "@/components/transaction-form";
import { getTexts } from "@/i18n/server";
import { texts } from "@/i18n/texts";
import { currentMonthRange, monthOf, todayInTimezone } from "@/lib/dates";
import { monthHref } from "@/lib/month-nav";
import { requireUser } from "@/lib/session";
import { getCategoryOption, getTransaction, listCategories } from "@/modules/transactions/queries";
import { PageSkeleton } from "../../../page-skeleton";

const TEXTS = texts(
  { title: "Editar movimiento", whatsapp: "Registrado por WhatsApp", web: "Registrado en la web" },
  { en: { title: "Edit transaction", whatsapp: "Added through WhatsApp", web: "Added on the web" } },
);

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTexts(TEXTS)).title };
}

// El id de la URL es un dato de cada request: se lee dentro de Suspense (Cache Components).
export default function EditTransactionPage({ params }: PageProps<"/[lang]/movimientos/[id]/editar">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {params.then(({ id }) => (
        <EditTransaction id={id} />
      ))}
    </Suspense>
  );
}

async function EditTransaction({ id }: { id: string }) {
  const user = await requireUser();
  const t = await getTexts(TEXTS);
  // Un id inválido, un movimiento de otro usuario o uno eliminado: todos dan el mismo 404, sin
  // revelar si el movimiento existe.
  const transaction = z.uuid().safeParse(id).success ? await getTransaction(user.id, id) : null;
  if (!transaction) notFound();

  const [active, current] = await Promise.all([
    listCategories(user.id, transaction.type),
    getCategoryOption(user.id, transaction.categoryId),
  ]);
  // Si el admin archivó su categoría, se sigue ofreciendo (marcada) para no perderla al guardar.
  const categories = current?.archived ? [...active, current] : active;
  // "Cancelar" vuelve a la lista de su tipo, en el mes del movimiento.
  const list = monthHref(
    transaction.type === "income" ? "/ingresos" : "/egresos",
    monthOf(transaction.occurredOn),
    currentMonthRange(user.timezone),
  );

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <p className="text-sm text-muted">
          {transaction.source === "whatsapp" ? t.whatsapp : t.web}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
      </div>
      <TransactionForm
        type={transaction.type}
        categories={categories}
        today={todayInTimezone(user.timezone)}
        transaction={transaction}
        cancelHref={list}
      />
    </div>
  );
}
