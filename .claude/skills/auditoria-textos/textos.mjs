#!/usr/bin/env node
// Inventario automático de la auditoría de textos (SKILL.md, paso 2): junta los textos que ve la persona
// (pantallas, botones, avisos, errores, aria-label y alt, el bot, el PDF, las páginas legales) con su
// archivo:línea y su idioma, y marca lo mecánico. Solo lee archivos (y git, en el modo cambios); no cambia
// nada.
//
// Uso (desde la raíz del repo):
//   node .claude/skills/auditoria-textos/textos.mjs                    todo src/
//   node .claude/skills/auditoria-textos/textos.mjs cambios            solo lo que cambió frente a origin/main
//   … --salida reports/textos/<carpeta>   además, escribe ahí marcas.md (lo que muestra la consola) y
//                                          textos-es.md y textos-en.md (todos los textos, por archivo)
//
// Una marca no es todavía un hallazgo: se verifica (SKILL.md, paso 4). Si cambia una convención de los
// textos (dónde van, una palabra del glosario, una regla de la casa), actualiza este script en el mismo PR.

import { execFileSync } from "node:child_process";
import { globSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const mode = args.includes("cambios") ? "cambios" : "completa";
const outDir = args.includes("--salida") ? args[args.indexOf("--salida") + 1] : null;

// Fuera de la auditoría:
// - lo que lee Claude y no la persona (el prompt, la herramienta, las evaluaciones): cambiarlo cambia lo que
//   entiende el bot (pide `pnpm bot:eval`);
// - lo que leen otros programas o quien desarrolla: el esquema, las rutas de API (Meta, el cron), las
//   cabeceras, los logs y las notas de las rutas de Better Auth.
const OUT_OF_SCOPE = [
  /^src\/modules\/bot\/(prompt|claude-extractor)\.ts$/,
  /^src\/modules\/bot\/eval\//,
  /^src\/db\//,
  /^src\/app\/api\//,
  /^src\/lib\/(security-headers|cron-auth|safe-log)\.ts$/,
  /^src\/modules\/auth\/http-routes\.ts$/,
];
// Lo que está solo en español por decisión (README → Idiomas): el bot, las páginas legales, el simulador (solo
// en desarrollo) y los nombres de las categorías por defecto (el inglés lo pone el admin en Categorías).
const SPANISH_ONLY = [
  /^src\/modules\/(bot|whatsapp)\//,
  /^src\/app\/\[lang\]\/(privacidad|eliminar-datos)\//,
  /^src\/app\/\[lang\]\/\(app\)\/simulador\//,
  /^src\/modules\/transactions\/default-categories\.ts$/,
];

function changedFiles() {
  const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
  return new Set([...git("diff", "--name-only", "origin/main...HEAD"), ...git("diff", "--name-only"), ...git("ls-files", "--others", "--exclude-standard")]);
}
const changed = mode === "cambios" ? changedFiles() : null;

const files = globSync("src/**/*.{ts,tsx}", { cwd: ROOT })
  .sort()
  .filter((file) => !/\.(test|int\.test|spec)\.tsx?$/.test(file) && !file.endsWith(".d.ts"))
  .filter((file) => !OUT_OF_SCOPE.some((re) => re.test(file)))
  .filter((file) => !changed || changed.has(file));

// ---------------------------------------------------------------------------------------------------
// Extracción

// Atributos de JSX que nunca son texto para leer.
const CODE_ATTRS = /^(className|class|href|src|srcSet|id|htmlFor|type|name|role|key|method|action|autoComplete|inputMode|enterKeyHint|lang|rel|target|sizes|pattern|accept|d|viewBox|fill|stroke|xmlns|style|encType|dir|as|form|step|min|max|media|crossOrigin|referrerPolicy|data-.*|aria-(labelledby|describedby|controls|current|live|hidden|haspopup|expanded|owns|activedescendant|errormessage))$/;
// Atributos que son texto aunque tengan una sola palabra en minúscula.
const TEXT_ATTRS = /^(aria-label|aria-description|aria-roledescription|aria-valuetext|alt|title|placeholder|label|summary)$/;
// Las etiquetas que van dentro de una frase: su texto se junta con el de la frase.
const INLINE_TAGS = new Set(["a", "abbr", "b", "br", "code", "em", "i", "kbd", "Link", "mark", "s", "small", "span", "strong", "sub", "sup", "time", "u"]);
// Qué tan largo puede ser cada tipo de texto (en palabras) antes de marcarlo.
const KIND_LIMITS = { título: 10, botón: 5, atributo: 15, texto: 60 };

const calleeName = (call) => call.expression.getText().replace(/\s+/g, "");
const isCodeCall = (name) =>
  /^(console\.\w+|require|import|sql(\.\w+)?|like|ilike|eq|fetch|redirect|permanentRedirect|notFound|revalidatePath|revalidateTag|updateTag|cacheTag|cacheLife|cn|clsx|cva|twMerge)$/.test(name) ||
  /\.(get|set|has|append|delete|getAll|includes|indexOf|test|exec|search|startsWith|endsWith|split|replace|replaceAll|match|matchAll|padStart|padEnd|toLocaleString|localeCompare)$/.test(name);

/** Si el nodo está en un lugar que nunca muestra texto (un import, un log, un error interno, una clase, un tipo). */
function isCodeContext(node) {
  for (let child = node, p = node.parent; p && !ts.isSourceFile(p); child = p, p = p.parent) {
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isLiteralTypeNode(p) || ts.isExternalModuleReference(p)) return true;
    if (ts.isTaggedTemplateExpression(p)) return true;
    if (ts.isNewExpression(p) && /(Error|RegExp|URL|URLSearchParams|Response|Headers)$/.test(p.expression.getText())) return true;
    if (ts.isCallExpression(p) && p.expression !== child && isCodeCall(calleeName(p))) return true;
    if (ts.isJsxAttribute(p) && CODE_ATTRS.test(p.name.getText())) return true;
    if (ts.isPropertyAssignment(p) && p.name === child) return true;
    if (ts.isPropertyAssignment(p) && /^(className|href|id|key|type|role|pattern|path|paths|tone)$/.test(p.name.getText())) return true;
    if (ts.isVariableDeclaration(p) && /class(Name|es)?$/i.test(p.name.getText())) return true;
    if (ts.isElementAccessExpression(p) && p.argumentExpression === child) return true;
    if (ts.isBinaryExpression(p) && /^(===|!==|==|!=|in)$/.test(p.operatorToken.getText())) return true;
    if (ts.isCaseClause(p) && p.expression === child) return true;
    if (ts.isExpressionStatement(p) && child === p.expression) return true; // "use client", "use server"
  }
  return false;
}

/**
 * El idioma de un texto por dónde está: `texts(es, { en })`, un registro `{ es: …, en: … }` o una función o
 * constante en inglés (`EnglishTopics`, `ROLE_LABELS_EN`). Null si no hay cómo saberlo.
 */
function declaredLocale(node) {
  for (let child = node, p = node.parent; p && !ts.isSourceFile(p); child = p, p = p.parent) {
    if (ts.isCallExpression(p) && p.expression.getText() === "texts") {
      if (p.arguments[0] === child) return "es";
      if (p.arguments[1] === child && ts.isObjectLiteralExpression(child)) {
        return child.properties.find((pr) => pr.pos <= node.pos && node.end <= pr.end)?.name?.getText() ?? "en";
      }
    }
    if (ts.isPropertyAssignment(p) && /^(es|en)$/.test(p.name.getText()) && p.initializer === child) return p.name.getText();
    if (ts.isConditionalExpression(p) && p.condition !== child) {
      const m = p.condition.getText().match(/\b(?:locale|lang)\w*\s*(===|!==)\s*"(es|en)"/);
      if (m) return (child === p.whenTrue) === (m[1] === "===") ? m[2] : m[2] === "es" ? "en" : "es";
    }
    if ((ts.isFunctionDeclaration(p) || ts.isVariableDeclaration(p)) && p.name) {
      const name = p.name.getText();
      if (/(English|_EN$|En$)/.test(name)) return "en";
      if (/(Spanish|_ES$|Es$)/.test(name)) return "es";
    }
  }
  return null;
}

const ES_WORDS = new Set("de la que el en y los las del se por un una para con no tu tus es al lo más ya te hay está aún puedes este esta mes cuenta".split(" "));
const EN_WORDS = new Set("the to of and a in your you is for on with it this that are be can not no was we our yet there month changed has have had an all from by at as or if will their account out".split(" "));
function guessLocale(text) {
  if (/[ñ¿¡áéíóú]/i.test(text)) return "es";
  if (/\p{L}'(s|t|re|ll|ve|d)\b/u.test(text)) return "en";
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  const es = words.filter((w) => ES_WORDS.has(w)).length;
  const en = words.filter((w) => EN_WORDS.has(w)).length;
  return en > es ? "en" : "es";
}

/** Si un texto parece para leer (y no un identificador, una clase de CSS, código, una expresión regular o una ruta). */
function looksHuman(text, { localized, textAttr }) {
  const bare = text.replace(/\{[^}]*\}/g, " ").trim();
  if (!/\p{L}/u.test(bare)) return false;
  if (/^(https?:|mailto:|\/|#|@|\.)/.test(bare) || /^[\w.+-]+@[\w-]+\.\w/.test(bare)) return false;
  if (/^(attachment|inline);|=>|\bfunction\s*\(|\b(const|let|var) \w+ =|\(\?[:=!]|\\[bdswpu]|\[\^|%\w+:?%/.test(bare)) return false;
  const tokens = bare.split(/\s+/);
  const classLike = tokens.every((t) => /^[a-z0-9!\-:[\]/.%&_>()#=,'*~@]+$/.test(t)) && tokens.filter((t) => /[-:[/]/.test(t)).length * 2 >= tokens.length;
  if (classLike) return false;
  if (localized || textAttr) return true;
  if (tokens.length > 1 && tokens.some((t) => /^\p{L}{2,}[.,;:!?…]?$/u.test(t))) return true;
  return /^\p{Lu}\p{Ll}+$/u.test(bare) || /[ñáéíóú¿¡]/i.test(bare);
}

const ENTITIES = { apos: "'", quot: '"', amp: "&", lt: "<", gt: ">", nbsp: " " };
const decode = (s) => s.replace(/&(#x?[\da-f]+|\w+);/gi, (m, e) => (e[0] === "#" ? String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e] ?? m)));

/** Una expresión dentro de un texto: su nombre si es corto y simple (`{name}`), o `{…}`. */
const hole = (expr) => {
  const code = expr.getText();
  return /^[\w.$?!()[\], ]+$/.test(code) && code.length <= 30 ? `{${code}}` : "{…}";
};

/** El texto de un template literal, con cada `${…}` como `{expresión}`. */
function templateText(node) {
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return node.head.text + node.templateSpans.map((span) => hole(span.expression) + span.literal.text).join("");
}

/** Cómo junta JSX el texto de varias líneas: recorta cada línea por dentro, descarta las vacías y las une con un espacio. */
function jsxTextValue(raw) {
  const lines = raw.split(/\r?\n/);
  return decode(
    lines
      .map((line, i) => {
        let l = line.replace(/\t/g, " ");
        if (i > 0) l = l.replace(/^ +/, "");
        if (i < lines.length - 1) l = l.replace(/ +$/, "");
        return l;
      })
      .filter((l) => l !== "")
      .join(" "),
  );
}

const tagOf = (el) => (ts.isJsxElement(el) ? el.openingElement.tagName.getText() : ts.isJsxSelfClosingElement(el) ? el.tagName.getText() : "");
const hasOwnText = (el) => (el.children ?? []).some((c) => ts.isJsxText(c) && /\p{L}/u.test(c.text));
/** Si un elemento va dentro de la frase de su padre: las etiquetas de texto, y un componente rodeado de texto (`<A href>Ingresos</A>`). */
function isInline(el) {
  const tag = tagOf(el);
  if (INLINE_TAGS.has(tag)) return true;
  return /^[A-Z]/.test(tag) && !!el.parent && ts.isJsxElement(el.parent) && hasOwnText(el.parent);
}

/** El texto completo de un elemento, con lo de dentro de la frase y sin los bloques hijos (que van aparte). */
function flattenJsx(node) {
  let out = "";
  for (const child of node.children ?? []) {
    if (ts.isJsxText(child)) out += jsxTextValue(child.getFullText());
    else if (ts.isJsxExpression(child)) {
      const e = child.expression;
      if (!e) continue;
      out += ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) ? e.text : hole(e);
    } else if (ts.isJsxElement(child) && isInline(child)) out += flattenJsx(child);
    else if (ts.isJsxSelfClosingElement(child)) out += child.tagName.getText() === "br" ? " " : `{${child.tagName.getText()}}`;
    else out += " ";
  }
  return out.replace(/\s+/g, " ").trim();
}

function blockOf(jsxText) {
  let p = jsxText.parent;
  while (p && ts.isJsxElement(p) && isInline(p) && p.parent && (ts.isJsxElement(p.parent) || ts.isJsxFragment(p.parent))) p = p.parent;
  return p;
}

function kindOf(node, tag) {
  if (/^(h[1-6]|legend|th|dt|caption|summary|title)$/.test(tag)) return "título";
  if (/^(button|\w*Button)$/.test(tag)) return "botón";
  for (let p = node.parent; p && !ts.isSourceFile(p); p = p.parent) {
    if (ts.isJsxAttribute(p)) return TEXT_ATTRS.test(p.name.getText()) ? (p.name.getText() === "title" && !/^aria/.test(p.name.getText()) ? "título" : "atributo") : "texto";
    if (ts.isPropertyAssignment(p) && !/^(es|en)$/.test(p.name.getText())) {
      const key = p.name.getText();
      if (/(^|[a-z])(title|heading|Title|Heading)$/.test(key)) return "título";
      if (/(button|Button|submit|Submit|cta|Cta)$/.test(key)) return "botón";
      if (/(label|Label|placeholder|Placeholder|alt)$/.test(key)) return "atributo";
      return "texto";
    }
    if (ts.isJsxElement(p)) {
      const t = tagOf(p);
      if (/^(h[1-6]|legend|th|dt|caption|summary)$/.test(t)) return "título";
      if (/^(button|\w*Button)$/.test(t)) return "botón";
    }
  }
  return "texto";
}

const texts = []; // { file, line, locale, localized, kind, text, node }
for (const file of files) {
  const source = readFileSync(join(ROOT, file), "utf8");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const seenBlocks = new Set();
  const add = (node, text, kind) => {
    const declared = declaredLocale(node);
    const textAttr = !!node.parent && ts.isJsxAttribute(node.parent) && TEXT_ATTRS.test(node.parent.name.getText());
    if (!looksHuman(text, { localized: !!declared, textAttr })) return;
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    texts.push({ file, line, locale: declared ?? guessLocale(text), localized: !!declared, kind, text: text.replace(/\s+/g, " ").trim(), node });
  };
  const visit = (node) => {
    if (ts.isJsxText(node) && /\p{L}/u.test(node.text)) {
      const block = blockOf(node);
      if (!seenBlocks.has(block)) {
        seenBlocks.add(block);
        if (!isCodeContext(block)) add(block, ts.isJsxElement(block) || ts.isJsxFragment(block) ? flattenJsx(block) : jsxTextValue(node.getFullText()), kindOf(block, tagOf(block)));
      }
      return;
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) && !isCodeContext(node)) {
      // Un literal suelto entre etiquetas (`{" "}`, `{"texto"}`) ya va en el texto de su bloque.
      const container = node.parent;
      const inBlockText = ts.isJsxExpression(container) && container.parent && (ts.isJsxElement(container.parent) || ts.isJsxFragment(container.parent));
      if (!inBlockText) add(node, ts.isStringLiteral(node) ? node.text : templateText(node), kindOf(node, ""));
      if (ts.isTemplateExpression(node)) node.templateSpans.forEach((span) => visit(span.expression));
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

// ---------------------------------------------------------------------------------------------------
// Revisiones mecánicas

const sentences = (text) => text.split(/(?<=[.!?…])\s+(?=[¿¡"“«(]?\p{Lu})|\n+/u).filter((s) => /\p{L}/u.test(s));
const wordCount = (text) => (text.replace(/\{[^}]*\}/g, " x ").match(/[\p{L}\p{N}]+/gu) ?? []).length;

// Palabras que siempre llevan tilde (sin ella no existen o casi nunca son lo que se quiso decir).
const UNACCENT = Object.fromEntries(
  "aquí ahí allí allá acá también después además así jamás quizás teléfono código códigos categoría categorías página páginas información contraseña configuración sesión último última últimos últimas período sábado miércoles términos búsqueda fácil rápido rápida válido válida inválido inválida envía guía día días todavía país según acción opción notificación transacción conexión versión descripción dirección sección función razón menú atrás detrás débito crédito método métodos automático automática mínimo máximo próximo próxima próximos próximas móvil gráfico gráfica análisis"
    .split(" ")
    .map((w) => [w.normalize("NFD").replace(/\p{M}/gu, ""), w]),
);

// Nombres propios y de secciones de la app: no cuentan para las mayúsculas ni para las repeticiones.
const PROPER = new Set(
  "whatsapp claude anthropic google authenticator excel sheets finanzas vercel meta speed insights analytics web api pdf csv ip ipv6 https qr mvp geist resumen reportes ingresos egresos fijos ayuda notificaciones seguridad usuarios categorías historial inicio simulador overview reports income expenses bills help notifications security users categories history home account".split(" "),
);

// [expresión, por qué, categoría]. Las expresiones son pistas para el criterio, no errores seguros.
const ES_RULES = [
  [/\bsólo\b/iu, "«solo» va sin tilde (RAE, 2010)", "ortografía"],
  [/\b(éste|ésta|éstos|éstas|ése|ésa|ésos|ésas|aquél|aquélla|aquéllos|aquéllas)\b/iu, "los demostrativos van sin tilde (RAE, 2010)", "ortografía"],
  [/\b(guión|guiónes|truhán|rió|lió|fié|guié|crié|frió|huí)\b/iu, "monosílabo a efectos ortográficos: sin tilde", "ortografía"],
  [/\d\s+ó\s+\d/u, "«o» entre cifras va sin tilde", "ortografía"],
  [/¿\s*(que|como|cuando|donde|cuanto|cuanta|cuantos|cuantas|cual|cuales|quien|quienes)\b/iu, "interrogativo sin tilde", "ortografía"],
  [/(\d|\})%/u, "el signo % va separado de la cifra (RAE: «45 %»)", "ortografía"],
  [/\b(am|pm|a\.m\.|p\.m\.)(?=[\s.,;)]|$)/iu, "«a. m.», «p. m.» (con espacio)", "ortografía"],
  [/(\bNo\.\s?\d|Nº|\bnro\.?|\bnúm\.)/u, "«n.º»", "ortografía"],
  [/(\bEj\.?:|\bej:|\bEj\.)/u, "«p. ej.» o «por ejemplo»", "ortografía"],
  [/\b\d+(ro|do|er|ra|da|vo|to|mo|no)\b/u, "ordinal: «1.º», «2.º», «1.er»", "ortografía"],
  [/(?<=\p{Ll}[,;]?\s|\bde\s)(Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Setiembre|Octubre|Noviembre|Diciembre|Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo)\b/u, "los meses y los días van en minúscula", "ortografía"],
  [/\b[A-Z]{2,}s\b/u, "las siglas no hacen plural con «s» («los PDF»)", "ortografía"],
  [/\betc\s*(\.\.\.|…)/iu, "«etc.» ya cierra la enumeración: sin puntos suspensivos", "ortografía"],
  [/\ben base a\b/iu, "«en base a» → «con base en», «a partir de», «según»", "expresión"],
  [/\ba nivel de\b/iu, "«a nivel de» → «en», «en cuanto a» (salvo un nivel de verdad)", "expresión"],
  [/\bde cara a\b/iu, "«de cara a» → «para», «ante»", "expresión"],
  [/\ben orden a\b/iu, "«en orden a» → «para»", "expresión"],
  [/\ben relación a\b/iu, "«en relación a» → «en relación con», «con relación a»", "expresión"],
  [/\bbajo el punto de vista\b/iu, "«bajo el punto de vista» → «desde el punto de vista»", "expresión"],
  [/\ba la mayor brevedad\b/iu, "«a la mayor brevedad» → «lo antes posible»", "expresión"],
  [/\by\/o\b/iu, "«y/o» → «y» u «o» (la «o» ya incluye las dos)", "expresión"],
  [/\b(volver a repetir|subir arriba|bajar abajo|entrar adentro|salir afuera|lapso de tiempo|totalmente gratis|completamente gratis|mas sin embargo|años atrás|previamente)\b/iu, "pleonasmo o redundancia", "expresión"],
  [/\b(el|la|los|las) mism[oa]s?(?=\s*[.,;:)]|$)/iu, "«el mismo» como pronombre → «él», «este», «lo»", "expresión"],
  [/\b(pienso|piensa|creo|cree|opino|considero|supongo|imagino|parece|resulta|significa|dijo|dice|es posible|es probable|es necesario|es importante) de que\b/iu, "dequeísmo", "expresión"],
  [/\b(me acuerdo|te acuerdas|se acuerda|a pesar|en caso|a fin|(te das|se da|darte|me di|se dio|te diste) cuenta|est[aá]s? segur[oa]) que\b/iu, "queísmo: falta «de»", "expresión"],
  [/\b(debido a que|con el fin de|con el objetivo de|con el propósito de|en el caso de que|por medio de)\b/iu, "rodeo: «porque», «para», «si», «con»", "expresión"],
  [/\b(realizar|realiza|realizó|realizado|realizada|efectuar|efectúa|efectuado|llevar a cabo|procede a|proceder a)\b/iu, "verbo comodín: el verbo de la acción («realizar un pago» → «pagar»)", "expresión"],
  [/\b(es por eso que|es por esto que|es por ello que|fue entonces que|es aquí donde|es así que)\b/iu, "galicismo: «por eso», «entonces»", "expresión"],
  [/\b(habían|hubieron|habrán|hayan) (muchos|muchas|varios|varias|algunos|algunas|\d+)\b/iu, "«haber» impersonal va en singular («había muchos»)", "expresión"],
  [/\b(usted|ustedes)\b/iu, "la app tutea (glosario)", "glosario"],
  [/\b(ingrese|seleccione|haga|elija|toque|presione|introduzca|verifique|intente|confirme|revise)\b/iu, "¿imperativo de «usted»? La app tutea", "glosario"],
  [/\b(e-?mails?|click|clickea|cliquea|links?|login|logout|loguea\w*|setear|resetear|customizar|chequear|checkear|password|feedback|dashboard|online|upload|download)\b/iu, "anglicismo (glosario)", "glosario"],
];
const EN_RULES = [
  [/[¿¡]/u, "Spanish punctuation in English", "puntuación"],
  [/\bcan not\b/iu, "«cannot»", "ortografía"],
  [/\be-mail\b/iu, "«email» (glosario)", "glosario"],
  [/\b(log ?in|log ?out)\b/iu, "la app dice «sign in» / «sign out» (glosario)", "glosario"],
  [/\b(utilize|utilise|in order to|prior to|commence|in the event that|due to the fact that)\b/iu, "plain English: «use», «to», «before», «start», «if», «because»", "expresión"],
];

// Palabras gramaticales del inglés que se repiten sin que sea redundancia.
const EN_FUNCTION_WORDS = new Set("their there again without which about would could should these those where other after before being".split(" "));

/** Palabras iguales a pocas palabras de distancia (sin nombres propios, comandos del bot ni «mes a mes»). */
function nearRepeats(sentence) {
  const words = (sentence.replace(/\*[^*]+\*|“[^”]+”|«[^»]+»|\{[^}]*\}/g, " ").toLowerCase().match(/\p{L}+/gu) ?? []);
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.length < 5 || PROPER.has(w) || EN_FUNCTION_WORDS.has(w)) continue;
    const j = words.indexOf(w, i + 1);
    const idiom = j - i === 2 && ["a", "by", "to", "tras", "por", "after"].includes(words[i + 1]);
    if (j !== -1 && j - i <= 8 && !idiom) return w;
  }
  return null;
}

function checks(entry) {
  const { text, locale, kind } = entry;
  const out = [];
  const plain = text.replace(/\{[^}]*\}/g, "{}");
  if (/\S {2,}\S/.test(plain)) out.push(["espacios", "dos espacios seguidos"]);
  if (/\p{L} [,.;:!?)](?=\s|$)/u.test(plain)) out.push(["espacios", "espacio antes de un signo"]);
  if (/[,;](?=\p{L})/u.test(plain)) out.push(["espacios", "falta un espacio después de la coma o el punto y coma"]);
  if (/\.\.\./.test(plain)) out.push(["puntuación", "«...» → «…»"]);
  if (/"/.test(plain) || (locale === "es" && /(^|\s)'[^']+'(?=[\s.,;:]|$)/.test(plain))) out.push(["puntuación", "comillas rectas: la app usa “ ”"]);
  const repeated = plain.match(/(?<!\p{L})(\p{L}{2,})\s+\1(?!\p{L})/iu);
  if (repeated) out.push(["repetición", `palabra repetida seguida: «${repeated[0]}»`]);
  for (const s of sentences(plain)) {
    const n = wordCount(s);
    if (n > 30) out.push(["largo", `frase de ${n} palabras: «${s.slice(0, 50)}…»`]);
    const near = nearRepeats(s);
    if (near) out.push(["repetición", `«${near}» dos veces en pocas palabras`]);
  }
  const n = wordCount(plain);
  if (n > KIND_LIMITS[kind]) out.push(["largo", `${kind} de ${n} palabras (más de ${KIND_LIMITS[kind]})`]);
  if (kind === "título" && /[^.]\.$/.test(plain)) out.push(["puntuación", "título con punto final"]);
  const rest = (plain.match(/\p{L}{4,}/gu) ?? []).slice(1).filter((w) => !PROPER.has(w.toLowerCase()));
  if (rest.length >= 2 && rest.every((w) => /^\p{Lu}\p{Ll}/u.test(w))) out.push(["mayúsculas", "mayúscula en cada palabra (estilo de título en inglés): solo la primera y los nombres propios"]);
  if (locale === "es") {
    const count = (re) => (plain.match(re) ?? []).length;
    if (count(/¿/g) !== count(/\?(?!\w+=)/g)) out.push(["puntuación", "«¿» y «?» no van en pareja (¿la frase está partida en dos textos?)"]);
    if (count(/¡/g) !== count(/!/g)) out.push(["puntuación", "«¡» y «!» no van en pareja"]);
    for (const [re, why, category] of ES_RULES) {
      const m = plain.match(re);
      if (m) out.push([category, `${why} («${m[0]}»)`]);
    }
    for (const word of plain.toLowerCase().match(/\p{L}+/gu) ?? []) {
      if (UNACCENT[word] && UNACCENT[word] !== word) out.push(["ortografía", `«${word}» → «${UNACCENT[word]}»`]);
    }
  } else {
    const unquoted = plain.replace(/“[^”]*”|«[^»]*»|\*[^*]+\*/g, " ");
    const esWords = (unquoted.toLowerCase().match(/\p{L}+/gu) ?? []).filter((w) => ["de", "la", "que", "el", "los", "las", "del", "para", "con", "una", "tu", "tus", "más", "está"].includes(w));
    if (entry.localized && (/[ñáéíóú]/i.test(unquoted) || esWords.length > 0)) out.push(["traducción", "¿español en el texto en inglés?"]);
    for (const [re, why, category] of EN_RULES) {
      const m = plain.match(re);
      if (m) out.push([category, `${why} («${m[0]}»)`]);
    }
  }
  return out;
}

// El español y el inglés de cada clave de `texts()`: que digan lo mismo con las mismas piezas.
function parityChecks() {
  const out = [];
  const leaves = (obj, prefix = "") => {
    const map = new Map();
    if (!obj || !ts.isObjectLiteralExpression(obj)) return map;
    for (const prop of obj.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const key = `${prefix}${prop.name.getText()}`;
      let value = prop.initializer;
      if (ts.isArrowFunction(value) && !ts.isBlock(value.body)) value = value.body;
      while (ts.isParenthesizedExpression(value)) value = value.expression;
      if (ts.isObjectLiteralExpression(value)) for (const [k, v] of leaves(value, `${key}.`)) map.set(k, v);
      else if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value) || ts.isTemplateExpression(value)) map.set(key, value);
    }
    return map;
  };
  const calls = new Set();
  for (const t of texts) {
    for (let p = t.node.parent; p; p = p.parent) if (ts.isCallExpression(p) && p.expression.getText() === "texts") calls.add(p);
  }
  const holes = (s) => (s.match(/\{[^}]*\}/g) ?? []).length;
  const end = (s) => (s.trim().match(/[.?!:…]$/) ?? [""])[0];
  const stars = (s) => (s.match(/\*/g) ?? []).length;
  const emoji = (s) => (s.match(/\p{Extended_Pictographic}/gu) ?? []).join("");
  for (const call of calls) {
    const sf = call.getSourceFile();
    const es = leaves(call.arguments[0]);
    const others = call.arguments[1];
    if (!others || !ts.isObjectLiteralExpression(others)) continue;
    for (const prop of others.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const en = leaves(prop.initializer);
      for (const [key, esNode] of es) {
        const enNode = en.get(key);
        if (!enNode) continue;
        const a = ts.isStringLiteral(esNode) ? esNode.text : templateText(esNode);
        const b = ts.isStringLiteral(enNode) ? enNode.text : templateText(enNode);
        const where = `${sf.fileName}:${sf.getLineAndCharacterOfPosition(enNode.getStart(sf)).line + 1}`;
        if (holes(a) !== holes(b)) out.push([where, key, `datos distintos: ${holes(a)} en español, ${holes(b)} en inglés`]);
        if (end(a) !== end(b)) out.push([where, key, `cierra distinto: «${end(a) || "sin signo"}» en español, «${end(b) || "sin signo"}» en inglés`]);
        if (stars(a) !== stars(b)) out.push([where, key, "negritas (*) distintas"]);
        if (emoji(a) !== emoji(b)) out.push([where, key, `emojis distintos: «${emoji(a)}» y «${emoji(b)}»`]);
        if (a === b && wordCount(a.replace(/\{[^}]*\}/g, "")) >= 2) out.push([where, key, `igual en los dos idiomas: «${a.slice(0, 50)}»`]);
      }
    }
  }
  return out;
}

// Las variantes de una misma palabra: glosario.md dice cuál usa la app y cuándo.
const VARIANTS = {
  es: [
    ["eliminar", "borrar", "suprimir"],
    ["iniciar sesión", "entrar", "ingresar", "acceder"],
    ["cerrar sesión", "salir"],
    ["correo", "email", "e-mail", "correo electrónico"],
    ["contraseña", "clave"],
    ["celular", "teléfono", "móvil"],
    ["toca", "haz clic", "da clic", "pulsa", "presiona", "selecciona", "elige"],
    ["movimiento", "transacción"],
    ["egreso", "gasto"],
    ["desvincular", "desconectar"],
    ["persona", "usuario", "usuaria"],
  ],
  en: [
    ["delete", "remove", "erase"],
    ["sign in", "log in", "login"],
    ["sign out", "log out"],
    ["sign up", "register", "create an account"],
    ["email", "e-mail"],
    ["tap", "click", "press", "select", "choose"],
    ["transaction", "movement", "entry"],
    ["expense", "spending", "outflow"],
    ["unlink", "disconnect"],
  ],
};
function variantReport(locale) {
  const lines = [];
  const pool = texts.filter((t) => t.locale === locale);
  for (const group of VARIANTS[locale]) {
    const counts = group.map((v) => {
      const re = new RegExp(`(?<!\\p{L})${v}(s|es)?(?!\\p{L})`, "iu");
      return { v, hits: pool.filter((t) => re.test(t.text)) };
    });
    if (counts.filter((c) => c.hits.length > 0).length < 2) continue;
    lines.push(`- ${counts.map((c) => `${c.v}: ${c.hits.length}`).join(" · ")}`);
    const max = Math.max(...counts.map((c) => c.hits.length));
    for (const c of counts) {
      if (c.hits.length > 0 && c.hits.length < max) lines.push(`  - «${c.v}» en ${c.hits.slice(0, 5).map((h) => `${h.file}:${h.line}`).join(", ")}${c.hits.length > 5 ? ` y ${c.hits.length - 5} más` : ""}`);
    }
  }
  return lines;
}

// ---------------------------------------------------------------------------------------------------
// Informe

const short = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const marks = new Map(); // categoría → líneas
for (const t of texts) {
  for (const [category, detail] of checks(t)) {
    if (!marks.has(category)) marks.set(category, []);
    marks.get(category).push(`${t.file}:${t.line} [${t.locale}] ${detail} — «${short(t.text, 70)}»`);
  }
}

const out = [];
const byLocale = (l) => texts.filter((t) => t.locale === l).length;
out.push(`# Inventario de textos (${mode})`, "");
out.push(`${plural(texts.length, "texto", "textos")} en ${plural(new Set(texts.map((t) => t.file)).size, "archivo", "archivos")}: ${byLocale("es")} en español y ${byLocale("en")} en inglés.`, "");

const ORDER = [
  ["ortografía", "Según la RAE: tildes, mayúsculas, el % y los ordinales, abreviaturas."],
  ["puntuación", "¿? y ¡! en pareja, «…», comillas, títulos con punto."],
  ["espacios", "Espacios de más o de menos."],
  ["expresión", "Expresiones censuradas por el DPD o la FundéuRAE, rodeos y verbos comodín. Son pistas: decide el criterio."],
  ["glosario", "Anglicismos y trato (tú o usted) frente al glosario."],
  ["repetición", "La misma palabra seguida (casi siempre un error) o a pocas palabras (redundancia para revisar)."],
  ["largo", `Frases de más de 30 palabras y textos más largos que su tipo (${Object.entries(KIND_LIMITS).map(([k, v]) => `${k} ${v}`).join(", ")}).`],
  ["mayúsculas", "Mayúscula en cada palabra, al estilo de los títulos en inglés."],
  ["traducción", "Textos del inglés que parecen en español."],
];
for (const [category, what] of ORDER) {
  const lines = marks.get(category) ?? [];
  out.push(`## ${category[0].toUpperCase()}${category.slice(1)} (${lines.length})`, "", what, "");
  out.push(...(lines.length ? lines.map((l) => `- ${l}`) : ["Nada que revisar."]), "");
}

const parity = parityChecks();
out.push(`## Español e inglés (${parity.length})`, "", "Cada clave de texts(): los mismos datos, el mismo signo al final, las mismas negritas y emojis, y traducida.", "");
out.push(...(parity.length ? parity.map(([where, key, why]) => `- ${where} \`${key}\`: ${why}`) : ["Nada que revisar."]), "");

const outside = new Map();
for (const t of texts) {
  if (t.localized || t.locale !== "es" || SPANISH_ONLY.some((re) => re.test(t.file))) continue;
  if ((t.text.replace(/\{[^}]*\}/g, "").match(/\p{L}+/gu) ?? []).every((w) => /^\p{Lu}/u.test(w))) continue; // nombres: «Finanzas MVP», «Firefox»
  outside.set(t.file, [...(outside.get(t.file) ?? []), t]);
}
out.push(
  `## Español sin su inglés (${plural(outside.size, "archivo", "archivos")})`,
  "",
  "Fuera de texts() y de un registro { es, en }: en las páginas que tienen inglés, salen en español también en inglés (CLAUDE.md → Idiomas). Muchos tienen su inglés en otra función o son nombres: se verifica.",
  "",
);
for (const [file, list] of outside) out.push(`- ${file}: ${list.slice(0, 4).map((t) => `${t.line} «${short(t.text, 40)}»`).join(" · ")}${list.length > 4 ? ` y ${list.length - 4} más` : ""}`);
if (outside.size === 0) out.push("Nada que revisar.");
out.push("");

out.push("## Variantes de las palabras del glosario", "", "Cuántos textos usan cada variante (y dónde, las de la minoría). glosario.md dice cuál es la de la app.", "");
for (const locale of ["es", "en"]) out.push(`### ${locale === "es" ? "Español" : "Inglés"}`, "", ...variantReport(locale), "");

const report = out.join("\n");
console.log(report);

if (outDir) {
  mkdirSync(resolve(ROOT, outDir), { recursive: true });
  writeFileSync(resolve(ROOT, outDir, "marcas.md"), report);
  for (const locale of ["es", "en"]) {
    const list = texts.filter((t) => t.locale === locale);
    const lines = [`# Textos en ${locale === "es" ? "español" : "inglés"} (${list.length})`];
    let current = "";
    for (const t of list) {
      if (t.file !== current) lines.push("", `## ${(current = t.file)}`, "");
      lines.push(`- ${t.line} [${t.kind}${t.localized ? "" : ", idioma deducido"}] ${t.text}`);
    }
    writeFileSync(resolve(ROOT, outDir, `textos-${locale}.md`), `${lines.join("\n")}\n`);
  }
  console.error(`\nEscrito en ${outDir}: marcas.md, textos-es.md y textos-en.md`);
}
