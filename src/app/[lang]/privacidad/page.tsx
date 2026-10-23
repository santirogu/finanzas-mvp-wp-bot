import type { Metadata } from "next";
import Link from "next/link";
import { BRAND_NAME } from "@/lib/brand";
import { CONTACT_EMAIL, DataDeletionSteps, LEGAL_UPDATED_AT, legalProseClass } from "./legal";
import { SpanishOnlyNote } from "./spanish-only";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: `Cómo ${BRAND_NAME} trata tus datos personales y cómo solicitar su eliminación.`,
};

export default function PrivacyPage() {
  return (
    <main lang="es" className="mx-auto w-full max-w-3xl px-6 py-12">
      <Link href="/" className="text-sm font-medium text-brand">
        ← {BRAND_NAME}
      </Link>
      <SpanishOnlyNote />
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Política de privacidad</h1>
      <p className="mt-2 text-sm text-muted">Última actualización: {LEGAL_UPDATED_AT}</p>

      <div className={legalProseClass}>
        <section>
          <p>
            {BRAND_NAME} (antes, Finanzas MVP) es una aplicación para registrar ingresos y egresos personales desde
            la web o escribiendo a un bot de WhatsApp. Esta política explica qué datos recopilamos, para qué los
            usamos y cómo puedes ejercer tus derechos. Sigue la Ley 1581 de 2012 de Colombia, sobre protección de
            datos personales.
          </p>
        </section>

        <section>
          <h2>Datos que recopilamos</h2>
          <ul>
            <li>
              <strong>Datos de la cuenta:</strong> nombre, correo electrónico y contraseña (guardada
              de forma cifrada, nunca en texto plano).
            </li>
            <li>
              <strong>Información financiera que registras:</strong> montos, descripciones,
              categorías y fechas de tus ingresos y egresos.
            </li>
            <li>
              <strong>Tus gastos fijos marcados a mano:</strong> si en <strong>Fijos</strong> agregas o quitas
              un gasto fijo, guardamos su descripción (sin mayúsculas ni tildes) y si lo agregaste o lo quitaste.
              Se guarda hasta que lo deshagas o elimines tu cuenta.
            </li>
            <li>
              <strong>Tus notas del historial de los gastos fijos:</strong> si le escribes una nota a un cambio
              de valor, guardamos la nota, el gasto (sin mayúsculas ni tildes) y el mes. Se
              guardan hasta que borres la nota o elimines tu cuenta.
            </li>
            <li>
              <strong>Los pagos que ya no aplican:</strong> si en un aviso de próximo pago tocas{" "}
              <strong>Este pago ya no aplica</strong>, guardamos el gasto (sin mayúsculas ni tildes) y el mes. Se
              guardan hasta que elimines tu cuenta.
            </li>
            <li>
              <strong>Tu configuración de las notificaciones:</strong> si en <strong>Configuración</strong> prendes
              o apagas los avisos de próximos pagos, o cambias con cuántos días de anticipación llegan, guardamos
              esa elección. Se guarda hasta que elimines tu cuenta.
            </li>
            <li>
              <strong>Las notificaciones que marcas como leídas:</strong> si en la campana marcas una
              notificación como leída, guardamos cuál fue y cuándo, hasta que elimines tu cuenta.
            </li>
            <li>
              <strong>Tus presupuestos:</strong> si en <strong>Configuración → Presupuestos</strong> le pones un tope por mes a
              una categoría de egresos, guardamos la categoría y el monto. Se guardan hasta que los quites o
              elimines tu cuenta.
            </li>
            <li>
              <strong>Datos de WhatsApp, si conectas tu número:</strong> tu número de teléfono y el
              contenido de los mensajes que envías al bot, junto con las respuestas del bot.
            </li>
            <li>
              <strong>Si te invitamos a crear una cuenta:</strong> guardamos el correo invitado, quién lo invitó y
              cuándo, y la fecha en que creaste tu cuenta. El correo también queda en el registro de cambios de la
              administración. Si eliminas tu cuenta, se borran ambos; si no la creaste, puedes pedirnos que los
              borremos.
            </li>
            <li>
              <strong>Historial de tu cuenta:</strong> la fecha en que te registraste y la de cada cambio de tu
              contraseña (nunca la contraseña). También la de cada vinculación, desvinculación o intento de
              vinculación de WhatsApp, con el número usado.
            </li>
            <li>
              <strong>Datos técnicos de la sesión:</strong> dirección IP (si es IPv6, solo la parte
              que identifica la red) y navegador, usados solo para mantener tu sesión segura.
            </li>
            <li>
              <strong>Tu preferencia de apariencia:</strong> si en <strong>Configuración</strong> eliges{" "}
              <strong>Sistema</strong>, <strong>Claro</strong> u <strong>Oscuro</strong>, se guarda en dos lugares:
              <ul>
                <li>
                  en tu cuenta, hasta que la elimines, para mostrarte la app así en cualquier dispositivo donde
                  inicies sesión;
                </li>
                <li>
                  en una cookie de tu navegador (<code>tema</code>), que dura un año.
                </li>
              </ul>
            </li>
            <li>
              <strong>Tu idioma:</strong> si eliges el idioma en <strong>Configuración</strong>, se guarda en dos
              lugares:
              <ul>
                <li>
                  en tu cuenta, hasta que la elimines, para mostrarte la app en ese idioma en cualquier
                  dispositivo donde inicies sesión;
                </li>
                <li>
                  en una cookie de tu navegador (<code>idioma</code>), que dura un año.
                </li>
              </ul>
              <p>
                Si no lo eliges, la app sale en español. Sin sesión, puedes cambiarlo arriba en la portada, al
                iniciar sesión o al registrarte: se guarda solo en esa cookie de tu navegador.
              </p>
            </li>
            <li>
              <strong>Estadísticas de uso anónimas:</strong> con Vercel Web Analytics contamos:
              <ul>
                <li>qué páginas se visitan y desde qué sitio llegaste;</li>
                <li>desde qué país y ciudad;</li>
                <li>con qué tipo de dispositivo, sistema operativo y navegador.</li>
              </ul>
              <p>
                No usa cookies, no guarda tu dirección IP ni te identifica. Cada visita se reconoce con un
                código temporal que se descarta a las 24 horas, y solo vemos totales.
              </p>
            </li>
            <li>
              <strong>Velocidad de carga anónima:</strong> con Vercel Speed Insights medimos qué tan rápido
              carga cada página. La medida incluye el tipo de conexión y de dispositivo, el sistema operativo, el
              navegador y el país. Tampoco usa cookies ni se asocia a ninguna persona o dirección IP.
            </li>
          </ul>
        </section>

        <section>
          <h2>Para qué usamos tus datos</h2>
          <ul>
            <li>Crear y mantener tu cuenta, y calcular tu balance mensual.</li>
            <li>
              Interpretar los mensajes que envías por WhatsApp para registrarlos como ingresos o
              egresos, y responderte.
            </li>
            <li>Detectar errores y mejorar el funcionamiento del servicio.</li>
            <li>
              Dar soporte y proteger las cuentas. El administrador de la app entra con verificación en dos
              pasos y puede ver de cada cuenta:
              <ul>
                <li>
                  sus datos: nombre, correo, rol, fecha de registro, número de WhatsApp y si el inicio de sesión
                  está bloqueado por intentos fallidos;
                </li>
                <li>sus sesiones abiertas: navegador, sistema operativo, dirección IP y fechas;</li>
                <li>su historial de registro, vinculación de WhatsApp y cambios de contraseña.</li>
              </ul>
              <p>
                No ve tus ingresos, egresos ni mensajes. Si hace falta (por ejemplo, a tu pedido o para proteger
                tu cuenta), puede:
              </p>
              <ul>
                <li>desbloquear tu inicio de sesión;</li>
                <li>cerrar tus sesiones;</li>
                <li>desvincular tu WhatsApp;</li>
                <li>
                  suspender tu cuenta: mientras esté suspendida no podrás entrar ni usar el bot, y tus datos se
                  conservan;
                </li>
                <li>eliminarla con todos sus datos.</li>
              </ul>
              <p>
                Cada acción queda registrada. Solo el superadministrador puede darle a otra cuenta el rol de
                administrador o quitárselo, y eso también queda registrado.
              </p>
            </li>
            <li>
              Mantener las categorías de ingresos y egresos: el administrador puede crearlas, cambiarlas,
              archivarlas o eliminarlas. Para decidirlo, ve cuántos movimientos usa cada una, en total y
              sin saber de quién son ni por cuánto. Si elimina una categoría, tus movimientos que la
              tenían pasan a “Otros”; si la archiva, la conservan.
            </li>
            <li>
              Decidir quién crea una cuenta: el administrador abre o cierra los registros, o los deja solo con
              invitación. Ve los correos invitados y si ya crearon su cuenta.
            </li>
            <li>
              Cuidar el funcionamiento del bot de WhatsApp. El administrador ve, por cuenta o por número:
              <ul>
                <li>
                  cuántos mensajes llegaron y qué pasó con cada uno: si registró movimientos, o si fue un
                  comando, una respuesta o un error;
                </li>
                <li>cuántas veces se usó Claude (llamadas y tokens);</li>
                <li>los errores técnicos.</li>
              </ul>
              <p>
                No ve el texto de tus mensajes, lo que te respondió el bot ni los movimientos que registraste.
                Si una respuesta del bot no te llegó por un problema de WhatsApp, puede hacer que el bot te la
                reenvíe (sin verla), solo durante las 24 horas siguientes.
              </p>
            </li>
            <li>
              Saber qué partes de la app se usan más y qué tan rápido cargan, con estadísticas
              anónimas, para mejorarla.
            </li>
          </ul>
          <p>No vendemos tus datos ni los usamos para publicidad.</p>
        </section>

        <section>
          <h2>Con quién compartimos datos</h2>
          <p>Solo con los proveedores necesarios para prestar el servicio:</p>
          <ul>
            <li>
              <strong>Meta (WhatsApp Business Platform):</strong> para recibir y enviar los mensajes
              del bot.
            </li>
            <li>
              <strong>Anthropic (Claude):</strong> recibe el texto de tus mensajes de WhatsApp para
              interpretarlos (monto, tipo, categoría y fecha).
            </li>
            <li>
              <strong>Vercel</strong> (alojamiento de la aplicación, estadísticas de uso y medición
              de velocidad, anónimas) y <strong>Neon</strong> (base de datos), donde se almacena la
              información.
            </li>
          </ul>
          <p>Estos proveedores pueden procesar datos fuera de Colombia, incluido Estados Unidos.</p>
        </section>

        <section>
          <h2>Cuánto tiempo los conservamos</h2>
          <p>Conservamos tus datos mientras tu cuenta esté activa. Se borran así:</p>
          <ul>
            <li>
              <strong>Si eliminas tu cuenta desde la app:</strong> tus datos se borran de inmediato. Eso incluye
              el historial de tu cuenta y los mensajes que enviaste al bot desde cualquiera de tus números.
            </li>
            <li>
              <strong>Si pides eliminarla por correo:</strong> en un plazo máximo de 30 días.
            </li>
            <li>
              <strong>Los movimientos que eliminas:</strong> dejan de verse en ese momento y se borran del todo a
              los 30 días.
            </li>
            <li>
              <strong>Los números sin cuenta:</strong> los mensajes y los intentos de vinculación de números que no
              están vinculados a ninguna cuenta se borran a los 30 días.
            </li>
          </ul>
        </section>

        <section>
          <h2>Tus derechos</h2>
          <p>
            Puedes conocer, actualizar, rectificar y eliminar tus datos, así como revocar la
            autorización para tratarlos. Tus movimientos los puedes editar o eliminar en la app, y
            descargar en un archivo (CSV) desde <strong>Reportes</strong>. Tu cuenta completa la
            puedes eliminar en <strong>Mi cuenta</strong>. Para cualquier otra
            solicitud, escríbenos a{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>

        <section id="eliminar-datos">
          <h2>Cómo eliminar tus datos</h2>
          <DataDeletionSteps />
        </section>

        <section>
          <h2>Seguridad</h2>
          <p>
            Usamos conexiones cifradas (HTTPS), contraseñas cifradas y verificación de la firma de
            cada mensaje recibido desde WhatsApp. Ningún sistema es infalible, pero tomamos medidas
            razonables para proteger tu información.
          </p>
        </section>

        <section>
          <h2>Cambios a esta política</h2>
          <p>
            Si cambiamos esta política, actualizaremos la fecha de esta página. Si los cambios son
            importantes, te avisaremos por correo o en la aplicación.
          </p>
        </section>
      </div>
    </main>
  );
}
