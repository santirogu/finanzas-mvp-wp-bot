# Checklist de la auditoría legal

Cada punto dice qué norma lo pide y dónde mirarlo en la app. Las normas se leyeron en el compilador normativo
de la Alcaldía de Bogotá (sisjur) el 2026-11-03:
- Ley 1581 de 2012: https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=49981
- Decreto 1377 de 2013 (hoy compilado en el Decreto 1074 de 2015, capítulo 2.2.2.25):
  https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=53646

Antes de citar un artículo en un informe, vuélvelo a leer en su fuente (SKILL.md, regla 2): la norma pudo
cambiar. Lo marcado "(fuentes secundarias)" no se pudo leer en la fuente oficial: confírmalo antes de usarlo.

## 1. La autorización

| Qué exige | Norma | Dónde mirar |
|---|---|---|
| Autorización **previa e informada**, obtenida por un medio que se pueda consultar después. | Ley 1581, art. 9 | El registro (`src/app/[lang]/(auth)/auth-form.tsx`, el hook de `/sign-up/email` en `src/lib/auth.ts`). |
| A más tardar al recolectar los datos. | Decreto 1377, art. 5 | ¿Algún dato entra antes de la casilla? (el bot solo a cuentas vinculadas; el webhook guarda el mensaje antes de mirar la autorización). |
| Expresa: por escrito, de palabra o con una conducta inequívoca; **el silencio nunca cuenta**. | Decreto 1377, art. 7 | La casilla empieza sin marcar; nada la marca solo. |
| **Conservar la prueba** de la autorización. | Decreto 1377, art. 8; Ley 1581, art. 17 lit. b | `user.privacy_version` y `privacy_accepted_at`, el evento `privacy_accepted` (no se borra mientras exista la cuenta). |
| Al pedirla, informar: el tratamiento y su finalidad; que las respuestas sobre datos sensibles o de menores son opcionales; los derechos; la identidad, la dirección y el teléfono del responsable. | Ley 1581, art. 12 | `/autorizacion` y el enlace a `/privacidad` en el registro. ¿El registro, además del enlace, muestra el resumen? |
| Si cambia la finalidad, **nueva autorización**; si cambia el responsable, comunicarlo. | Decreto 1377, art. 5 | `PRIVACY_VERSION` (`src/lib/privacy.ts`) y lo que cambió después (inventario). |
| Revocarla en cualquier momento, con un mecanismo gratuito y fácil. | Decreto 1377, art. 9 | Eliminar la cuenta (también sin autorizar: `requireSignedIn`) y el correo de la política. |
| Nada de la app usa los datos sin la autorización vigente. | (control del proyecto) | `requireUser` en todas las páginas, acciones y rutas (`src/authorization-matrix.test.ts`); el bot (`handle-message.ts`). |
| Datos recolectados antes de pedirla: pedirla por los medios habituales; con mecanismos alternos, avisar a la SIC en 5 días. | Decreto 1377, art. 10 | Las cuentas de antes van a `/autorizacion` al entrar (medio habitual: la app). |

## 2. La política de tratamiento y el aviso de privacidad

| Qué exige | Norma | Dónde mirar |
|---|---|---|
| Lenguaje claro y sencillo, en un medio físico o electrónico. | Decreto 1377, art. 13 | `/privacidad`. |
| 1. Nombre, domicilio, dirección, correo y teléfono del responsable. | Decreto 1377, art. 13 num. 1 | `DATA_CONTROLLER` (`src/lib/contact.ts`, su prueba `contact.test.ts`). |
| 2. El tratamiento y su finalidad. | art. 13 num. 2 | "Datos que recopilamos" y "Para qué usamos tus datos". Cada dato que guarda la app (inventario: tablas y columnas). |
| 3. Los derechos del titular. | art. 13 num. 3 | "Tus derechos". |
| 4. La persona o el área que atiende peticiones, consultas y reclamos. | art. 13 num. 4 | "Responsable del tratamiento" y "Consultas y reclamos". |
| 5. El procedimiento para ejercer los derechos. | art. 13 num. 5 | "Consultas y reclamos" y "Cómo eliminar tus datos". |
| 6. La fecha de entrada en vigencia de la política y el período de vigencia de la base de datos. | art. 13 num. 6 | ¿Solo dice "Última actualización"? (`LEGAL_UPDATED_AT`). |
| Los cambios sustanciales se comunican antes de que rijan. | art. 13 | `PRIVACY_VERSION`: si se sube, se pide de nuevo la autorización. ¿Y un cambio sustancial que no cambie la finalidad (el responsable)? |
| Aviso de privacidad cuando no se pueda poner la política a disposición: responsable y contacto, tratamiento y finalidad, derechos, cómo conocer la política; si hay datos sensibles, que responder es opcional. | Decreto 1377, arts. 14 y 15 | `/autorizacion` (hace de aviso); el bot no lo tiene: ¿hace falta para quien solo usa WhatsApp? |
| Conservar el modelo del aviso mientras se traten datos con él. | Decreto 1377, art. 16 | El historial de git de `/privacidad` y `/autorizacion`, con `PRIVACY_VERSION`. |

## 3. Datos sensibles

| Qué exige | Norma | Dónde mirar |
|---|---|---|
| Sensibles: los que afectan la intimidad o pueden discriminar (origen racial o étnico, política, religión, sindicatos, **salud**, vida sexual, biométricos). | Ley 1581, art. 5 | ¿Dónde puede llegar uno? Fotos de facturas (una farmacia, una clínica), descripciones libres ("cita con el psiquiatra"), categorías ("Salud"), mensajes al bot. |
| Prohibido tratarlos salvo autorización **explícita** (u otras excepciones que no aplican a la app). | Ley 1581, art. 6 | ¿La autorización del registro los cubre explícitamente? |
| Informar que, por ser sensibles, no está obligado a autorizarlos; decir cuáles son y para qué; ninguna actividad puede condicionarse a darlos. | Decreto 1377, art. 6 | `/privacidad` (Anthropic y las fotos), `/autorizacion`, la Ayuda del bot. |

## 4. Niños, niñas y adolescentes

| Qué exige | Norma | Dónde mirar |
|---|---|---|
| Prohibido tratar sus datos, salvo los públicos. | Ley 1581, art. 7 | ¿El registro pide la edad o dice que la app es para mayores de 18? ¿La política lo dice? |
| Si se tratan: interés superior del menor, sus derechos fundamentales, autorización del representante legal después de escucharlo. | Decreto 1377, art. 12 | Igual. Si la app no es para menores, decirlo y no recolectar a sabiendas. |

## 5. Los derechos y sus plazos

| Qué exige | Norma | Dónde mirar |
|---|---|---|
| Conocer, actualizar y rectificar; pedir la prueba de la autorización; saber cómo se usan; quejarse ante la SIC; revocar y pedir la supresión; acceder gratis. | Ley 1581, art. 8 | ¿Se puede corregir el nombre? ¿Descargar los datos (el CSV de Reportes)? ¿Pedir la prueba de la autorización (el historial)? |
| Consultas: respuesta en 10 días hábiles; prórroga de hasta 5 más, avisando antes. | Ley 1581, art. 14 | "Consultas y reclamos" en `/privacidad`. |
| Reclamos: identificación, hechos, dirección y documentos; si falta algo, pedirlo en 5 días; desistido a los 2 meses; "reclamo en trámite" en 2 días hábiles; respuesta en 15 días hábiles, prórroga de hasta 8. | Ley 1581, art. 15 | Igual, y lo que promete la política para borrar por correo (`legal.tsx`). |
| La queja ante la SIC, después de agotar la consulta o el reclamo. | Ley 1581, art. 16 | `/privacidad`. |

## 6. Los deberes del responsable

| Qué exige | Norma | Dónde mirar |
|---|---|---|
| Seguridad para evitar adulteración, pérdida, consulta o acceso no autorizado. | Ley 1581, art. 17 lit. d | `/auditoria-seguridad` (no se repite aquí: se cita su último informe). |
| Exigir a los encargados seguridad y privacidad. | art. 17 lit. i | Los términos o el acuerdo de tratamiento (DPA) de cada proveedor: pregunta para el abogado. |
| Un manual interno de políticas y procedimientos (consultas, reclamos, incidentes). | art. 17 lit. k | README → "Consultas, reclamos e incidentes (datos personales)" y "Borrar datos a pedido": ¿siguen al día con la política y con los comandos? |
| Informar a la autoridad las violaciones a los códigos de seguridad que pongan en riesgo los datos. | art. 17 lit. n | ¿Hay un procedimiento de incidentes? Según la Circular Única de la SIC, se reportan en el RNBD dentro de 15 días hábiles, también quien no está obligado a inscribir bases (fuentes secundarias: confirmar en la SIC). |
| Responsabilidad demostrada: poder mostrar a la SIC las medidas, proporcionales al tamaño y a los riesgos. | Decreto 1377, art. 26 | Este informe, los de seguridad y las pruebas del repo son parte de esa evidencia. |

## 7. Proveedores y datos fuera de Colombia

| Qué exige | Norma | Dónde mirar |
|---|---|---|
| **Transmisión** (a un encargado que trata los datos por cuenta del responsable) frente a **transferencia** (a otro responsable). | Decreto 1377, art. 3 | Anthropic, Meta, Vercel y Neon tratan datos por cuenta de la app: transmisión. |
| La transmisión internacional no necesita informarse ni autorizarse **si hay un contrato** con el alcance, las actividades y los deberes del encargado (tratar según los principios, seguridad, confidencialidad). | Decreto 1377, arts. 24 y 25 | ¿Los términos o el DPA de cada proveedor cumplen el art. 25? Pregunta para el abogado. Mientras tanto, la política los nombra y la autorización los cubre. |
| Transferencia a países sin nivel adecuado: prohibida, salvo autorización expresa e inequívoca u otras excepciones. | Ley 1581, art. 26 | La lista de países de la SIC (Circular Única, título V; Estados Unidos estaba desde la Circular 005 de 2017, ligado a marcos que cambiaron — fuentes secundarias: confirmar el estado vigente). |
| Cada servicio que recibe datos de las personas, nombrado en la política. | Ley 1581, art. 12; Decreto 1377, art. 13 | Inventario: "Servicios externos". |

## 8. Retención y supresión

| Qué exige | Norma | Dónde mirar |
|---|---|---|
| Solo el tiempo razonable y necesario para la finalidad; después, suprimir (salvo una obligación legal o contractual). Documentar los procedimientos de conservación y supresión. | Decreto 1377, art. 11 | `RETENTION_DAYS` y `runDailyCleanup` (`src/modules/account/retention.ts`) frente a la política (inventario: "Retención"). |
| Al eliminar la cuenta se borra todo lo de la persona. | (lo promete la política) | `deleteAccountData` (`src/modules/account/delete-account.ts`) y las claves foráneas en cascada; `delete-account.int.test.ts`. |
| Lo que sobrevive al borrado: copias de seguridad y registros. | Decreto 1377, art. 11 | Las copias de Neon (su retención), `scripts/db-backup.ts` (copias locales), los logs de Vercel. ¿La política lo dice? |

## 9. El Registro Nacional de Bases de Datos (RNBD)

| Qué exige | Norma | Dónde mirar |
|---|---|---|
| Inscribir las bases ante la SIC. | Ley 1581, art. 25 | Solo están obligadas las sociedades y entidades sin ánimo de lucro con activos de más de 100.000 UVT y las personas jurídicas de naturaleza pública (Decreto 090 de 2018, que modificó el Decreto 1074 de 2015 — fuentes secundarias: confirmar). Una persona natural, como el responsable de hoy, no. Si se constituye una empresa, revisarlo. |

## 10. Otras normas (para el abogado, no para el checklist)

Fuera de la protección de datos, se anotan como preguntas, sin hallazgos:
- **Estatuto del Consumidor (Ley 1480 de 2011):** términos y condiciones, si algún día la app cobra.
- **Comercio electrónico (Ley 527 de 1999):** validez de la autorización por medios electrónicos (el Decreto 1377,
  art. 16, la menciona para acreditar el aviso).
- **Habeas data financiero (Ley 1266 de 2008):** aplica a la información de crédito que se reporta a centrales;
  la app no reporta a nadie. Confirmar que no aplica.
- **Términos de Meta (WhatsApp Business) y de Anthropic:** no son ley, pero pueden exigir cosas (una política
  publicada, avisos sobre IA).
