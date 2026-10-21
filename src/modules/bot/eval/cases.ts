// Set de evaluación del intérprete. Fecha fija: martes 13 de octubre de 2026.
// Cada caso lista las categorías aceptables (algunas frases admiten más de una).
// Agrega aquí los mensajes reales que el bot interprete mal.

export const EVAL_TODAY = "2026-10-13";

type Expected =
  | {
      kind: "transactions";
      items: { type: "income" | "expense"; amount: number; categories?: string[]; date?: string }[];
    }
  | { kind: "reply"; mentions?: RegExp; noQuestion?: boolean };

export type EvalCase = { text: string; expect: Expected };

const expense = (amount: number, categories?: string[], date?: string) => ({
  type: "expense" as const,
  amount,
  categories,
  date,
});
const income = (amount: number, categories?: string[], date?: string) => ({
  type: "income" as const,
  amount,
  categories,
  date,
});
const tx = (...items: Extract<Expected, { kind: "transactions" }>["items"]): Expected => ({
  kind: "transactions",
  items,
});
const reply: Expected = { kind: "reply" };
/** Una respuesta sin registrar que, además, tiene que decir algo (p. ej. cómo pedir el balance). */
const replyMentioning = (mentions: RegExp): Expected => ({ kind: "reply", mentions });
// Le falta algo para registrarlo: sin una pregunta suelta (el bot no recuerda el mensaje anterior), que pida el
// movimiento completo.
const replyAskingForTheWhole: Expected = { kind: "reply", noQuestion: true };

export const EVAL_CASES: EvalCase[] = [
  // Egresos con formato colombiano y jerga
  { text: "me compré unos zapatos que me costaron $500.000", expect: tx(expense(500000, ["Ropa"])) },
  { text: "almuerzo 25.000", expect: tx(expense(25000, ["Alimentación"])) },
  { text: "pagué el arriendo 1.200.000", expect: tx(expense(1200000, ["Vivienda"])) },
  { text: "gasté 80k en mercado", expect: tx(expense(80000, ["Mercado"])) },
  { text: "uber 18.500", expect: tx(expense(18500, ["Transporte"])) },
  { text: "pagué la luz 145.300", expect: tx(expense(145300, ["Servicios"])) },
  { text: "netflix 44.900", expect: tx(expense(44900, ["Entretenimiento", "Servicios"])) },
  { text: "cita médica 60 mil", expect: tx(expense(60000, ["Salud"])) },
  { text: "pagué la cuota de la tarjeta de crédito 350.000", expect: tx(expense(350000, ["Deudas"])) },
  { text: "matrícula de la universidad 4.500.000", expect: tx(expense(4500000, ["Educación"])) },
  { text: "café 6.500", expect: tx(expense(6500, ["Alimentación"])) },
  { text: "compré un regalo para mi novia de 150.000", expect: tx(expense(150000, ["Otros", "Entretenimiento"])) },
  { text: "$1.250.000 pagué el seguro del carro", expect: tx(expense(1250000, ["Transporte", "Otros", "Deudas"])) },
  { text: "Compré mercado en el D1 por 187.450", expect: tx(expense(187450, ["Mercado"])) },
  { text: "domicilio de rappi 35.900", expect: tx(expense(35900, ["Alimentación"])) },
  { text: "pasajes de bus 5.800", expect: tx(expense(5800, ["Transporte"])) },
  { text: "le pagué 100 mil al profe de inglés", expect: tx(expense(100000, ["Educación"])) },
  { text: "gimnasio mensualidad 120.000", expect: tx(expense(120000, ["Salud", "Entretenimiento", "Otros"])) },
  { text: "gasté 20.000", expect: tx(expense(20000)) },
  { text: "pagué 2.500.000 de la cuota del carro", expect: tx(expense(2500000, ["Deudas", "Transporte"])) },
  { text: "me cobraron 15.000 de cuota de manejo", expect: tx(expense(15000, ["Deudas", "Servicios", "Otros"])) },
  { text: "salí a comer con amigos, 95 lucas", expect: tx(expense(95000, ["Alimentación", "Entretenimiento"])) },
  { text: "Pagué la administración: $380.000", expect: tx(expense(380000, ["Vivienda"])) },
  { text: "Compre unos audifonos de 230000", expect: tx(expense(230000, ["Otros", "Entretenimiento"])) },
  { text: "gaste 1.000.000 en el veterinario", expect: tx(expense(1000000, ["Otros", "Salud"])) },
  { text: "Medicamentos 48.700 en la droguería", expect: tx(expense(48700, ["Salud"])) },
  { text: "pagué el colegio de los niños 890.000", expect: tx(expense(890000, ["Educación"])) },
  { text: "propina 10 mil", expect: tx(expense(10000, ["Alimentación", "Otros"])) },

  // Centavos: la coma los separa; solo si el usuario los escribe
  { text: "almuerzo 25.900,50", expect: tx(expense(25900.5, ["Alimentación"])) },
  { text: "pagué el gas 38.450,75", expect: tx(expense(38450.75, ["Servicios"])) },
  { text: "mercado 120.000 con 50 centavos", expect: tx(expense(120000.5, ["Mercado"])) },
  { text: "me consignaron $1.250.000,05 de un trabajo freelance", expect: tx(income(1250000.05, ["Freelance"])) },
  {
    text: "parqueadero 3.500,75 y taxi 12.000",
    expect: tx(expense(3500.75, ["Transporte"]), expense(12000, ["Transporte"])),
  },

  // Ingresos
  { text: "me pagaron la quincena 2.100.000", expect: tx(income(2100000, ["Salario"])) },
  { text: "me consignaron 300 lucas de un trabajo freelance", expect: tx(income(300000, ["Freelance"])) },
  { text: "vendí la bicicleta en 1,5 palos", expect: tx(income(1500000, ["Ventas"])) },
  { text: "recibí medio palo de regalo de mi mamá", expect: tx(income(500000, ["Regalos"])) },
  { text: "me entraron 200 mil por intereses del CDT", expect: tx(income(200000, ["Inversiones"])) },
  { text: "dividendos 85.000", expect: tx(income(85000, ["Inversiones"])) },
  { text: "me devolvieron 50.000 que le había prestado a Juan", expect: tx(income(50000, ["Otros"])) },
  { text: "Me gané 2 palos en la lotería", expect: tx(income(2000000, ["Otros", "Regalos"])) },
  { text: "vendí ropa usada por 120 mil", expect: tx(income(120000, ["Ventas"])) },
  { text: "mi cliente me transfirió 4,2 millones", expect: tx(income(4200000, ["Freelance", "Ventas"])) },

  // Fechas relativas (hoy es martes 13 de octubre de 2026)
  { text: "ayer gasté 30 mil en gasolina", expect: tx(expense(30000, ["Transporte"], "2026-10-12")) },
  { text: "el sábado fui a cine y gasté 40.000", expect: tx(expense(40000, ["Entretenimiento"], "2026-10-10")) },
  { text: "anteayer pagué el internet, 95 mil", expect: tx(expense(95000, ["Servicios"], "2026-10-11")) },
  { text: "el 5 de octubre pagué el agua 62.000", expect: tx(expense(62000, ["Servicios"], "2026-10-05")) },

  // Varios movimientos en un mensaje
  {
    text: "almuerzo 20 mil y taxi 12 mil",
    expect: tx(expense(20000, ["Alimentación"]), expense(12000, ["Transporte"])),
  },
  {
    text: "hoy me pagaron 3 millones de salario y pagué 1.200.000 de arriendo",
    expect: tx(income(3000000, ["Salario"]), expense(1200000, ["Vivienda"])),
  },

  // No se debe registrar nada
  { text: "me compré unos tenis", expect: replyAskingForTheWhole },
  { text: "voy a comprar un celular de 2 millones", expect: reply },
  { text: "mañana pago el arriendo", expect: reply },
  { text: "hola, ¿cómo estás?", expect: reply },
  { text: "¿cuál es la capital de Francia?", expect: reply },
  { text: "200.000", expect: replyAskingForTheWhole },
  // Preguntas por los totales que no reconocen los comandos: no calcula, indica cómo pedir el balance.
  { text: "¿cuánto he gastado en comida este mes?", expect: replyMentioning(/\*?balance\b/i) },
  { text: "¿me alcanzó la plata en septiembre?", expect: replyMentioning(/\*?balance\b/i) },
  { text: "quiero ver mis totales de agosto", expect: replyMentioning(/\*?balance\b/i) },
];
