# Checklist de la auditoría de textos

Para cada punto: qué revisar, dónde suele estar en esta app y la fuente de la regla. Lo que el
[glosario](glosario.md) decidió manda sobre una regla general. Una marca del inventario (`textos.mjs`)
se confirma aquí; lo que no tiene regla es Sugerencia.

Dónde están los textos:
- **La web:** junto a quien los usa, con `texts({ …español }, { en: { …inglés } })` (`src/i18n/texts.ts`),
  o en un registro `{ es, en }`, o en un par de componentes (`SpanishTopics` y `EnglishTopics` en Ayuda).
- **Errores de los campos:** `src/lib/field-errors.ts`.
- **Validaciones:** `src/modules/*/validation.ts` y los `*-input.ts`.
- **Avisos de las redirecciones:** `src/lib/toasts.ts`.
- **El bot:** `src/modules/bot/replies.ts`, `help.ts` y `commands.ts` (solo los textos; los patrones
  son expresiones regulares).
- **El PDF:** `src/modules/reports/pdf/view.ts` y `document.tsx`.
- **El CSV:** `src/modules/reports/csv.ts`.
- **Las páginas legales:** `src/app/[lang]/privacidad/` y `eliminar-datos/`.
- **El historial del admin:** `event-item.tsx` y `category-input.ts`.

## Ortografía (RAE)

Fuentes: Ortografía de la lengua española (2010), el DLE y el Diccionario panhispánico de dudas.

- **Tildes diacríticas:** tú/tu, él/el, mí/mi, sí/si, té/te, dé/de, sé/se, más/mas, aún (todavía) /
  aun (incluso).
- **Interrogativos y exclamativos:** llevan tilde también en las preguntas indirectas ("elige cuántos
  días", "no sabemos qué pasó").
- **Sin tilde:** "solo" y los demostrativos ("este", "ese", "aquel"). La tilde solo se admite si hay
  una ambigüedad real, y en una interfaz casi nunca la hay.
- **Monosílabos que no llevan tilde:** guion, truhan, fie, rio, hui, lie.
- **"o" entre cifras:** va sin tilde ("1 o 2").
- **Palabras que siempre la llevan:** día, envía, también, después, código, categoría, página,
  información, contraseña, sesión, próximo, último, mínimo, máximo. El inventario busca las más
  comunes sin tilde.
- **Mayúsculas:**
  - solo la primera palabra y los nombres propios, también en títulos, botones, pestañas y
    encabezados ("Cambiar contraseña", no "Cambiar Contraseña");
  - los meses, los días y los idiomas van en minúscula ("20 de octubre", "en inglés");
  - tras los dos puntos, minúscula, salvo una cita o un nombre propio;
  - las secciones de la app se nombran como en la pantalla ("en Mi cuenta", "en Reportes"): ver el
    glosario.
- **Signos:**
  - `¿` y `¡` siempre abren su pregunta o exclamación;
  - sin punto después de `?`, `!` o `…`;
  - el punto va después de las comillas y los paréntesis de cierre ("…promedio”.");
  - sin punto final en títulos, botones, pestañas y etiquetas; con punto en las frases completas de
    párrafos, ayudas, errores y avisos.
- **Comas:**
  - nunca entre el sujeto y el verbo;
  - sí en los vocativos ("Hola, Santiago");
  - sí antes de "pero", "aunque", "así que";
  - en los incisos, a los dos lados.
- **Tipografía:**
  - los puntos suspensivos son un solo carácter (`…`), pegados a la palabra anterior;
  - la raya (`—`) va en los incisos, el guion (`-`) en las palabras compuestas y el signo menos (`−`)
    en los montos negativos (`formatMoney`);
  - las comillas son las del glosario (“ ”), nunca las rectas (`"`).
- **Números:**
  - ordinales con su letra voladita ("1.º", "1.er", "2.ª"), nunca "1ro" o "2do";
  - los años sin punto ("2026");
  - las horas con "a. m." y "p. m." (con espacio y puntos);
  - el porcentaje: la RAE lo separa con un espacio ("45 %"). Ver el glosario.
- **Abreviaturas y siglas:**
  - abreviaturas con su punto ("p. ej.", "n.º", "aprox.", "etc.");
  - las siglas no hacen plural con "s" ("los PDF", "las API") y no llevan puntos ("IP", "CSV").
- **Extranjerismos:**
  - si hay una palabra en español, va esa ("correo", "enlace", "iniciar sesión", "descargar", "en
    línea");
  - las marcas, tal cual ("WhatsApp", "Excel", "Google Authenticator");
  - las que la app usa a propósito ("app", "bot", "emoji", "admin") están en el glosario.

## Gramática

Fuentes: Nueva gramática de la lengua española y el DPD.

- **Concordancia en los textos con datos:**
  - el número va en singular con 1 ("1 movimiento", "1 día"): busca los `n === 1 ?`;
  - el género, con lo que entra (una categoría, una cuenta);
  - un artículo antes de un dato que puede ser masculino o femenino es un error esperando a pasar.
- **Imperativo de tú en las instrucciones:**
  - "escribe", "toca", "elige", "revisa"; en negativo, el subjuntivo ("no escribas");
  - nunca el infinitivo para pedirle algo a la persona ("Escribir tu correo" → "Escribe tu correo");
  - los botones van en infinitivo ("Guardar", "Eliminar mi cuenta"): ver el glosario.
- **Haber impersonal:** en singular ("había 3 errores", no "habían").
- **Dequeísmo y queísmo:** "creo que", no "creo de que"; "me acuerdo de que", "estoy seguro de que",
  "a pesar de que", "darse cuenta de que".
- **Gerundio de posterioridad:** "Se guardó, apareciendo en la lista" → "Se guardó y aparece en la
  lista".
- **"El mismo" como pronombre:** "edita el movimiento y guarda el mismo" → "edítalo y guárdalo".
- **Pronombres:** "lo" para cosas ("el movimiento: lo editas"); el leísmo de persona masculina se
  acepta, el de cosa no.
- **Parónimos y palabras juntas o separadas:**
  - sino / si no; porque / por qué / porqué / por que;
  - a ver / haber; sobre todo / sobretodo; asimismo / así mismo;
  - aparte / a parte; demás / de más; conque / con que / con qué.
- **Preposiciones:**
  - "en relación con" o "con relación a" (no "en relación a");
  - "con base en" (no "en base a");
  - "de acuerdo con" y "de acuerdo a" (las dos se aceptan);
  - "desde el punto de vista" (no "bajo").
- **Voz:** activa o pasiva con "se" ("Se eliminó la cuenta", "Registraste 3 movimientos") antes que
  la pasiva con "ser" ("La cuenta fue eliminada").
- **Tiempos:** que se correspondan en la misma frase ("si lo borras, se pierde", no "si lo borras, se
  perdería").

## Expresiones y redundancia

Fuentes: el DPD y la FundéuRAE. Las listas de `textos.mjs` (`ES_RULES`) marcan las más comunes.

- **Pleonasmos:** "volver a repetir", "subir arriba", "lapso de tiempo", "totalmente gratis",
  "previamente" (casi siempre sobra), "hace 3 meses atrás".
- **Rodeos:**
  - "debido a que" → "porque";
  - "con el fin de" → "para";
  - "en el caso de que" → "si";
  - "por medio de" → "con";
  - "a la mayor brevedad" → "lo antes posible".
- **Verbos comodín y sustantivos en vez de verbos:**
  - "realizar un pago" → "pagar";
  - "efectuar el registro" → "registrar";
  - "proceder a eliminar" → "eliminar";
  - "hacer la eliminación" → "eliminar".
- **Calcos del inglés:**
  - "aplicar" por "solicitar";
  - "remover" por "quitar";
  - "asumir" por "suponer";
  - "a nivel de", "en orden a", "es por eso que", "jugar un rol", "hacer sentido".
- **Redundancia entre textos:**
  - un título y su descripción que dicen lo mismo;
  - un botón que repite el título de su ventana sin decir la acción;
  - un `aria-label` que agrega "botón" o "imagen" (el lector ya lo dice);
  - "Error: hubo un error".
- **Muletillas y promesas:**
  - "simplemente", "fácilmente", "rápidamente", "básicamente";
  - "por favor" en cada mensaje;
  - exclamaciones que no aportan.
- **La misma palabra muy cerca:** dos veces en la misma frase suele pedir un pronombre o un sinónimo,
  salvo los nombres de las secciones, los comandos del bot y lo que se repite a propósito ("mes a
  mes").

## Longitud y claridad

Fuente: los principios de lenguaje claro (la RAE y la Red de Lenguaje Claro), y la guía de estilo de
Microsoft para las interfaces. Lo que se pase es Sugerencia, salvo que confunda.

| Tipo de texto | Hasta | Cómo |
|---|---|---|
| Botón | 1–3 palabras (5 como máximo) | Un verbo que diga qué pasa: "Eliminar movimiento", no "Aceptar" ni "Sí". |
| Título de página o de ventana | 10 palabras | Qué es o qué se hace aquí, sin punto. |
| Etiqueta de un campo | 1–4 palabras | El dato, no una instrucción. |
| Ejemplo dentro del campo (`placeholder`) | Un ejemplo | Nunca en vez de la etiqueta ni con una instrucción que desaparece al escribir. |
| Ayuda bajo un campo | 20 palabras | La regla del campo ("Al menos 8 caracteres"). |
| Error | 20 palabras | Qué pasó y cómo seguir ("Revisa el correo: debe verse como nombre@correo.com."), sin culpar. |
| Aviso emergente | 8 palabras | Lo que ya pasó ("Se eliminó el movimiento"). |
| Estado vacío | 2 frases | Qué va aquí y cómo empezar. |
| Confirmación de algo que no se deshace | 2–3 frases | Qué se pierde y que no se puede deshacer, y un botón con el verbo. |
| Párrafo (Ayuda, legal) | 60 palabras | Frases de 15 a 20 palabras en promedio; de más de 30, partirlas. |
| Mensaje del bot | Lo que se lee en el celular sin desplazar | Lo importante en la primera línea. |

- **Una idea por frase**, y lo importante primero ("Se eliminó el movimiento. Puedes deshacerlo.").
- **Segunda persona (tú) y voz activa.** La app habla con la persona, no de ella.
- **Sin jerga técnica para la persona:** token, API, endpoint, caché, sesión expirada sin
  explicación. En el admin se acepta más técnica, pero con el mismo glosario.
- **Pasos en lista**, no en un párrafo.
- **Números en cifras** ("3 días", no "tres días"), con los formatos del glosario.
- **Enlaces que dicen adónde llevan**, nunca "aquí" o "este enlace".

## Coherencia y glosario

- **Las mismas palabras para lo mismo**, en la web, el bot, el PDF, la Ayuda y la política: el
  glosario y la sección "Variantes" del inventario.
- **Los nombres de botones y secciones citados en otros textos coinciden con la pantalla.**
  - Si la Ayuda dice "toca **Registrar**", el botón dice "Registrar".
  - Revisa lo que va en negrita o entre comillas en la Ayuda, en las páginas legales y en el bot,
    frente al texto real del botón o la pestaña (`grep -rn` en `src`).
- **Textos parecidos con la misma forma:**
  - todos los avisos en pasado con "se" ("Se guardó…", "Se eliminó…"), o todos con sustantivo;
  - todos los errores con punto final;
  - todos los títulos sin punto.
- **El mismo trato y la misma persona:**
  - tú en toda la app;
  - la app en primera del plural ("te avisamos");
  - el bot en primera del singular ("si me equivoqué").
- **Lo que dice el texto es lo que hace la app:**
  - "se borra de inmediato" tiene que ser cierto;
  - "puedes deshacerlo", también;
  - un texto que promete algo que no pasa es un hallazgo de contenido.

## Inglés

Fuentes: Merriam-Webster y la Microsoft Writing Style Guide.

- **Inglés de EE. UU.** ("color", "canceled", "organize"), con las fechas y los montos de los
  formateadores (`locale = "en"`).
- **Mayúscula solo al principio de la frase** (sentence case) en títulos, botones y pestañas, como en
  español.
- **Tono:** "you", contracciones ("can't", "you'll"), voz activa y palabras simples ("use", no
  "utilize"; "to", no "in order to").
- **Que no suene traducido:**
  - orden de las palabras ("the last 12 months", no "the 12 last months");
  - falsos amigos (actual, eventual, assist, realize, sensible);
  - giros del español ("make a transaction" → "add a transaction");
  - preposiciones ("in the Overview", "on the page").
- **Que diga lo mismo que el español**, sin agregar ni quitar nada: los mismos datos, el mismo signo
  al final, las mismas negritas y emojis. La sección "Español e inglés" del inventario marca lo
  mecánico. Si el español cambió y el inglés no, el inglés quedó viejo.
- **Puntuación:**
  - sin `¿` ni `¡`;
  - comillas “ ” como en español;
  - "%" pegado a la cifra (en inglés va así: "45%");
  - la coma antes del último elemento de una lista (serial comma) como lo haga el resto de la app,
    siempre igual.
- **Plurales con datos:** "1 transaction", "2 transactions" (`n === 1 ?`).
- **Lo que queda en español a propósito** (el bot, las páginas legales, los ejemplos de mensajes para
  el bot) se dice en inglés ("This page is only available in Spanish", "For now the bot answers in
  Spanish") y va con `lang="es"`.

## Textos con datos (plantillas)

- **Armado completo:** lee la frase con datos reales, con el más corto y el más largo, con 0, 1 y
  muchos, y con los opcionales vacíos.
- **Frases partidas en varios textos** (`"¿Quisiste decir"` + enlace + `"?"`): en otro idioma el orden
  cambia y la frase se rompe. Mejor una sola plantilla con el dato dentro.
- **Mayúscula cuando el dato abre la frase:** un mes, una categoría o una descripción pueden venir en
  minúscula; si abren la frase, revisa cómo sale.
- **Espacios y signos** alrededor de cada dato, y qué queda si el dato viene vacío ("Hola, ").
- **Montos, fechas y porcentajes** siempre con sus formateadores (`formatMoney`, `formatShortDate`,
  `formatShare`), nunca escritos a mano.

## Por canal

### Web
- **Títulos de página y `metadata`:** el título de la pestaña del navegador dice dónde está la persona.
- **Formularios:**
  - etiquetas, ejemplos y ayudas según la tabla de longitud;
  - los errores debajo de su campo (`src/lib/field-errors.ts`), con qué pasó y cómo seguir.
- **Avisos** (`useToast`, `src/lib/toasts.ts`): lo que ya pasó, cortos, en pasado.
- **Estados vacíos y de carga:** qué va aquí y cómo empezar; los de carga, iguales en toda la app.
- **Accesibilidad de los textos:**
  - el `aria-label` incluye el texto visible (WCAG 2.5.3, "etiqueta en el nombre");
  - el `alt` describe para qué está la imagen, o va vacío si es decorativa;
  - una frase en otro idioma lleva su `lang`.

### Bot de WhatsApp
- **Corto:** la persona lo lee en el celular, entre otros chats. Lo importante en la primera línea.
- **Formato de WhatsApp:** `*negrita*` y `_cursiva_` cerrados, sin espacios por dentro. Los comandos
  van en negrita tal como se escriben ("escribe *deshacer*").
- **Emojis con función** (✅ registrado, 📊 balance), uno por idea, nunca en vez de una palabra.
- **El mismo glosario que la web**, y los nombres de las secciones como en la web, porque el bot
  manda a verlas ("en Reportes").

### PDF y CSV
- **Títulos, encabezados y nombres de columnas** con las palabras de la web, en el idioma de la
  descarga.

### Páginas legales
- **Lenguaje claro sin perder precisión:** qué se guarda, para qué, cuánto tiempo y cómo borrarlo,
  con frases cortas y listas.
- **Los términos del glosario y los nombres de las secciones como en la app.** Un paso que nombra un
  botón tiene que coincidir con el botón.
- **Lo que prometen tiene que ser cierto:** un cambio de contenido lo decide el dueño (regla 3 del
  skill).

### Administración
- **Más técnica se acepta, con el mismo glosario y la misma forma en textos parecidos:** las frases
  del historial ("{admin} archivó {categoría}") con la misma estructura, el mismo tiempo verbal y la
  misma puntuación.
