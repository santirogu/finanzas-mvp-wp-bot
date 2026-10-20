import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, DataDeletionSteps, LEGAL_UPDATED_AT, legalProseClass } from "./legal";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: "Cómo Finanzas MVP trata tus datos personales y cómo solicitar su eliminación.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <Link href="/" className="text-sm font-medium text-brand">
        ← Finanzas MVP
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Política de privacidad</h1>
      <p className="mt-2 text-sm text-muted">Última actualización: {LEGAL_UPDATED_AT}</p>

      <div className={legalProseClass}>
        <section>
          <p>
            Finanzas MVP es una aplicación para registrar ingresos y egresos personales desde la web
            o escribiendo a un bot de WhatsApp. Esta política explica qué datos recopilamos, para
            qué los usamos y cómo puedes ejercer tus derechos, de acuerdo con la Ley 1581 de 2012 de
            Colombia sobre protección de datos personales.
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
              <strong>Tus gastos fijos marcados a mano:</strong> si en Fijos agregas o quitas un
              gasto fijo, guardamos su descripción (sin mayúsculas ni tildes) y si lo agregaste o lo
              quitaste, hasta que lo deshagas o elimines tu cuenta.
            </li>
            <li>
              <strong>Tus notas del historial de los gastos fijos:</strong> si le escribes una nota a
              un cambio de valor de un gasto fijo, guardamos la nota, el gasto (sin mayúsculas ni
              tildes) y el mes, hasta que la borres o elimines tu cuenta.
            </li>
            <li>
              <strong>Los pagos que marcas como que ya no aplican:</strong> si en los avisos de próximos
              pagos del Resumen marcas &quot;Este pago ya no aplica&quot;, guardamos el gasto (sin
              mayúsculas ni tildes) y el mes, hasta que elimines tu cuenta.
            </li>
            <li>
              <strong>Tu configuración de las notificaciones:</strong> si en Mi cuenta prendes o apagas los
              avisos de próximos pagos o cambias con cuántos días de anticipación llegan, guardamos esa
              elección, hasta que elimines tu cuenta.
            </li>
            <li>
              <strong>Datos de WhatsApp, si conectas tu número:</strong> tu número de teléfono y el
              contenido de los mensajes que envías al bot, junto con las respuestas del bot.
            </li>
            <li>
              <strong>Historial de tu cuenta:</strong> la fecha en que te registraste, la de cada
              vinculación, desvinculación o intento de vinculación de WhatsApp, con el número
              usado, y la de cada cambio de tu contraseña (nunca la contraseña).
            </li>
            <li>
              <strong>Datos técnicos de la sesión:</strong> dirección IP (si es IPv6, solo la parte
              que identifica la red) y navegador, usados solo para mantener tu sesión segura.
            </li>
            <li>
              <strong>Tu preferencia de apariencia:</strong> si eliges &quot;Claro&quot; u
              &quot;Oscuro&quot; en Mi cuenta, se guarda solo en tu navegador, en este dispositivo.
              No llega a nuestros servidores.
            </li>
            <li>
              <strong>Estadísticas de uso anónimas:</strong> con Vercel Web Analytics contamos qué
              páginas se visitan, desde qué país y ciudad, con qué tipo de dispositivo, sistema
              operativo y navegador, y desde qué sitio llegaste. No usa cookies, no guarda tu
              dirección IP ni te identifica: cada visita se reconoce con un código temporal que se
              descarta a las 24 horas, y solo vemos totales.
            </li>
            <li>
              <strong>Velocidad de carga anónima:</strong> con Vercel Speed Insights medimos qué tan
              rápido carga cada página, junto con el tipo de conexión, de dispositivo, el sistema
              operativo, el navegador y el país. Tampoco usa cookies ni se asocia a ninguna persona
              o dirección IP.
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
              Dar soporte y proteger las cuentas: el administrador de la app puede ver los datos de
              cada cuenta (nombre, correo, rol, fecha de registro, número de WhatsApp y si el inicio
              de sesión está bloqueado por intentos fallidos), sus sesiones abiertas (navegador,
              sistema operativo, dirección IP y fechas) y su historial de registro, vinculación de
              WhatsApp y cambios de contraseña, con un acceso protegido con verificación en dos pasos. No ve tus ingresos,
              egresos ni mensajes. Si hace falta (por ejemplo, a tu pedido o para proteger tu cuenta),
              puede desbloquear tu inicio de sesión, cerrar tus sesiones, desvincular tu WhatsApp,
              suspender tu cuenta (mientras esté suspendida no podrás entrar ni usar el bot, y tus datos
              se conservan) o eliminarla con todos sus datos; cada acción queda registrada. Solo el
              administrador principal puede darle a otra cuenta el rol de administrador o quitárselo, y
              eso también queda registrado.
            </li>
            <li>
              Mantener las categorías de ingresos y egresos: el administrador puede crearlas, cambiarlas,
              archivarlas o eliminarlas. Para decidirlo ve cuántos movimientos usan cada una, en total y
              sin saber de quién son ni por cuánto. Si elimina una categoría, tus movimientos que la
              tenían pasan a &quot;Otros&quot;; si la archiva, la conservan.
            </li>
            <li>
              Cuidar el funcionamiento del bot de WhatsApp: el administrador ve, por cuenta o por número,
              cuántos mensajes llegaron y qué pasó con cada uno (si registró movimientos, fue un comando,
              una respuesta o un error), cuántas veces se usó Claude (llamadas y tokens) y los errores
              técnicos. No ve el texto de tus mensajes, lo que te respondió el bot ni los movimientos
              que registraste. Si una respuesta del bot no te llegó por un problema de WhatsApp, puede
              hacer que el bot te la vuelva a enviar (sin verla), solo durante las 24 horas siguientes.
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
          <p>
            Conservamos tus datos mientras tu cuenta esté activa. Si eliminas tu cuenta desde la
            app, tus datos se borran de inmediato, incluido su historial y los mensajes que enviaste
            al bot desde cualquiera de tus números; si lo pides por correo, en un plazo máximo de 30
            días. Los movimientos que eliminas dejan de verse en ese momento y se borran del todo a
            los 30 días. Los mensajes y los intentos de vinculación de números que no están
            vinculados a ninguna cuenta se borran a los 30 días.
          </p>
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
