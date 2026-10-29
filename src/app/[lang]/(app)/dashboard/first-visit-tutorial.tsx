import { WelcomeTutorial } from "@/components/welcome-tutorial";
import { requireUser } from "@/lib/session";
import { getAppValues } from "@/modules/app-values/current";
import { isTutorialPending } from "@/modules/tutorial/tutorial";

/** El tutorial de bienvenida, la primera vez que una cuenta nueva entra al Resumen (hasta que lo termina u omite). */
export async function FirstVisitTutorial() {
  const user = await requireUser();
  if (!(await isTutorialPending(user.id))) return null;
  const { upcomingEnabled, budgetNearShare } = await getAppValues();
  return <WelcomeTutorial values={{ upcomingEnabled, budgetNearShare }} remember />;
}
