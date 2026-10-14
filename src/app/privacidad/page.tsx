import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: "Cómo Finanzas MVP trata tus datos personales y cómo solicitar su eliminación.",
};

const CONTACT_EMAIL = "santiagorock000@gmail.com";
const UPDATED_AT = "13 de octubre de 2026";

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <Link href="/" className="text-sm font-medium text-brand">
        ← Finanzas MVP
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Política de privacidad</h1>
      <p className="mt-2 text-sm text-muted">Última actualización: {UPDATED_AT}</p>

      <div className="mt-8 space-y-8 leading-relaxed [&_h2]:text-lg [&_h2]:font-semibold [&_li]:mt-1 [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
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
              <strong>Datos de WhatsApp, si conectas tu número:</strong> tu número de teléfono y el
              contenido de los mensajes que envías al bot, junto con las respuestas del bot.
            </li>
            <li>
              <strong>Datos técnicos de la sesión:</strong> dirección IP y navegador, usados solo
              para mantener tu sesión segura.
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
              <strong>Vercel</strong> (alojamiento de la aplicación) y <strong>Neon</strong> (base
              de datos), donde se almacena la información.
            </li>
          </ul>
          <p>Estos proveedores pueden procesar datos fuera de Colombia, incluido Estados Unidos.</p>
        </section>

        <section>
          <h2>Cuánto tiempo los conservamos</h2>
          <p>
            Conservamos tus datos mientras tu cuenta esté activa. Cuando solicitas eliminar tu
            cuenta, borramos tus datos en un plazo máximo de 30 días.
          </p>
        </section>

        <section>
          <h2>Tus derechos</h2>
          <p>
            Puedes conocer, actualizar, rectificar y solicitar la eliminación de tus datos, así como
            revocar la autorización para tratarlos. Para ejercer cualquiera de estos derechos,
            escríbenos a{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>

        <section id="eliminar-datos">
          <h2>Cómo eliminar tus datos</h2>
          <ul>
            <li>
              <strong>Desconectar WhatsApp:</strong> en el dashboard, tarjeta WhatsApp →
              “Desvincular número”. El bot deja de asociar tus mensajes a tu cuenta.
            </li>
            <li>
              <strong>Eliminar tu cuenta y todos tus datos:</strong> envía un correo a{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}?subject=Eliminar%20mi%20cuenta`}
                className="text-brand underline"
              >
                {CONTACT_EMAIL}
              </a>{" "}
              desde el correo con el que te registraste, con el asunto “Eliminar mi cuenta”.
              Borraremos tu cuenta, tus movimientos y tus mensajes en un plazo máximo de 30 días y
              te confirmaremos por correo.
            </li>
          </ul>
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
