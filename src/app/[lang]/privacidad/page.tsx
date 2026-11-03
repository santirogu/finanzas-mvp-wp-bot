import type { Metadata } from "next";
import Link from "next/link";
import { BRAND_NAME } from "@/lib/brand";
import { DATA_CONTROLLER } from "@/lib/contact";
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
          <h2>Quién puede usar {BRAND_NAME}</h2>
          <p>
            {BRAND_NAME} es solo para mayores de 18 años: no recopilamos a sabiendas datos de niños, niñas ni
            adolescentes. Al autorizar el tratamiento de tus datos confirmas que eres mayor de edad. Si sabemos que una
            cuenta es de un menor de edad, la eliminamos con todos sus datos.
          </p>
        </section>

        <section>
          <h2>Responsable del tratamiento</h2>
          <p>
            El responsable de tus datos es <strong>{DATA_CONTROLLER.name}</strong>, persona natural, con domicilio en{" "}
            {DATA_CONTROLLER.city} ({DATA_CONTROLLER.address}). Teléfono: {DATA_CONTROLLER.phone}. Correo:{" "}
            <a href={`mailto:${DATA_CONTROLLER.email}`} className="text-brand underline">
              {DATA_CONTROLLER.email}
            </a>
            . A ese correo puedes enviar tus consultas y reclamos sobre tus datos.
          </p>
        </section>

        <section>
          <h2>Datos que recopilamos</h2>
          <ul>
            <li>
              <strong>Datos de la cuenta:</strong> nombre, correo electrónico, contraseña (guardada
              de forma cifrada, nunca en texto plano) y zona horaria (para saber qué día es para ti; hoy, la de
              Colombia).
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
              <strong>Los pagos que registras desde un aviso:</strong> si en un aviso de próximo pago tocas{" "}
              <strong>Registrar pago</strong>, además del egreso guardamos de qué mes es, para dar ese aviso por
              pagado. Se borra con ese egreso o con tu cuenta.
            </li>
            <li>
              <strong>Tu configuración de las notificaciones:</strong> si en <strong>Configuración</strong> prendes
              o apagas los avisos de próximos pagos, o cambias con cuántos días de anticipación llegan, guardamos
              esa elección. Se guarda hasta que elimines tu cuenta.
            </li>
            <li>
              <strong>Tu configuración del recordatorio de registro:</strong> si en <strong>Configuración</strong>{" "}
              prendes o apagas el recordatorio de registro, o cambias después de cuántos días sin registrar nada
              llega, guardamos esa elección. Se guarda hasta que elimines tu cuenta. Para saber si toca, la app mira
              cuándo registraste tu último movimiento: no guarda nada más.
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
              contenido de los mensajes que envías al bot, junto con las respuestas del bot. De las fotos de
              facturas guardamos solo el texto que escribiste con ellas y lo que se registró: la foto no se
              guarda.
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
              <strong>Tu configuración del 4x1000:</strong> si en <strong>Configuración</strong> lo apagas o lo prendes,
              guardamos esa elección hasta que elimines tu cuenta. El 4x1000 que registras es un egreso más, atado al que
              lo origina.
            </li>
            <li>
              <strong>El tutorial de bienvenida:</strong> guardamos cuándo lo terminaste o lo omitiste, para no
              mostrártelo otra vez, hasta que elimines tu cuenta.
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
              <strong>Los avisos generales:</strong> si ocultas con la ✕ un aviso de la app (por ejemplo, de un
              mantenimiento), una cookie de tu navegador (<code>aviso-cerrado</code>) lo recuerda. Dura 32 días y no
              se asocia a tu cuenta.
            </li>
            <li>
              <strong>Tu autorización:</strong> qué versión de esta política autorizaste y cuándo, como prueba. Se
              guarda hasta que elimines tu cuenta.
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
          <h2>Datos sensibles</h2>
          <p>
            Los datos sensibles son los que afectan tu intimidad o podrían usarse para discriminarte, como los de tu
            salud, tu origen étnico, tus creencias o tu vida sexual. {BRAND_NAME} no los necesita: no estás obligado a
            darlos ni a autorizar su tratamiento, y nada de la app depende de que lo hagas.
          </p>
          <p>Aun así, pueden llegar sin que los pidamos, por ejemplo en:</p>
          <ul>
            <li>la foto de una factura de una farmacia o de una clínica;</li>
            <li>una descripción como “cita con el psiquiatra”;</li>
            <li>un egreso en la categoría Salud.</li>
          </ul>
          <p>
            Si no quieres compartirlos, tapa esa parte de la foto, no la envíes o escribe una descripción más general.
          </p>
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
              <strong>Anthropic (Claude):</strong> recibe el texto de tus mensajes de WhatsApp y las fotos de
              facturas que le envías al bot, para interpretarlos (monto, tipo, categoría y fecha). Una factura
              puede traer otros datos, como tu nombre, tu cédula o tu NIT: si no quieres compartirlos, tápalos
              antes de tomar la foto o escribe el gasto.
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
              <strong>Si pides eliminarla por correo:</strong> en un plazo máximo de 15 días hábiles.
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
          <h2>Tu autorización</h2>
          <p>
            Para tratar tus datos necesitamos tu autorización previa, expresa e informada. La das al crear tu cuenta,
            con la casilla del registro; si tu cuenta es de antes, la primera vez que entras después de que empezamos a
            pedirla. Al darla confirmas que eres mayor de 18 años. Guardamos qué versión de esta política autorizaste y
            cuándo.
          </p>
          <p>
            Puedes revocarla cuando quieras eliminando tu cuenta o escribiéndonos; sin ella no puedes seguir usando la
            app.
          </p>
        </section>

        <section>
          <h2>Tus derechos</h2>
          <p>Como titular de tus datos, puedes:</p>
          <ul>
            <li>conocerlos, actualizarlos y rectificarlos;</li>
            <li>pedir la prueba de la autorización que nos diste;</li>
            <li>saber, si lo pides, cómo los usamos;</li>
            <li>revocar la autorización o pedir que los borremos;</li>
            <li>acceder a ellos gratis;</li>
            <li>presentar quejas ante la Superintendencia de Industria y Comercio (ver “Consultas y reclamos”).</li>
          </ul>
          <p>
            Tus movimientos los puedes editar o eliminar en la app, y
            descargar en un archivo (CSV) desde <strong>Reportes</strong>. Tu cuenta completa la
            puedes eliminar en <strong>Mi cuenta</strong>. Para cualquier otra
            solicitud, escríbenos a{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>

        <section>
          <h2>Consultas y reclamos</h2>
          <ul>
            <li>
              <strong>Cómo hacerlos:</strong> escríbenos a{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand underline">
                {CONTACT_EMAIL}
              </a>{" "}
              desde el correo de tu cuenta y dinos qué necesitas: conocer tus datos, corregirlos, actualizarlos,
              eliminarlos, pedir la prueba de tu autorización o revocarla. En un reclamo, cuéntanos qué pasó y adjunta
              lo que quieras que tengamos en cuenta.
            </li>
            <li>
              <strong>Consultas</strong> (conocer tus datos o cómo los usamos): te respondemos en máximo 10 días
              hábiles. Si no alcanzamos, te avisamos antes de que se cumplan y te respondemos en máximo 5 días hábiles
              más.
            </li>
            <li>
              <strong>Reclamos</strong> (corregir, actualizar o eliminar tus datos, revocar la autorización o avisarnos
              que no cumplimos esta política): te respondemos en máximo 15 días hábiles, contados desde el día
              siguiente a recibirlo. Si no alcanzamos, te avisamos y te respondemos en máximo 8 días hábiles más.
            </li>
            <li>
              <strong>Si a tu reclamo le falta información:</strong> te la pedimos en los 5 días siguientes. Si pasan 2
              meses sin que nos la envíes, entendemos que desististe.
            </li>
            <li>
              <strong>Superintendencia de Industria y Comercio:</strong> si después de reclamarnos no quedas
              conforme, puedes presentar una queja ante la SIC (
              <a href="https://www.sic.gov.co" className="text-brand underline">
                sic.gov.co
              </a>
              ), la autoridad de protección de datos personales en Colombia.
            </li>
          </ul>
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
          <h2>Vigencia</h2>
          <p>
            Esta versión de la política rige desde el {LEGAL_UPDATED_AT}. La base de datos de {BRAND_NAME} estará
            vigente mientras la app preste el servicio, y tus datos se conservan como explica “Cuánto tiempo los
            conservamos”.
          </p>
        </section>

        <section>
          <h2>Cambios a esta política</h2>
          <p>
            Si cambiamos esta política, actualizaremos la fecha de esta página. Si cambia lo que hacemos con tus
            datos, te pediremos de nuevo tu autorización la próxima vez que entres a la app o le escribas al bot.
          </p>
        </section>
      </div>
    </main>
  );
}
