// Categorías globales por defecto. Las usa el seed y, como contexto, el bot de WhatsApp.
export const DEFAULT_CATEGORIES = {
  expense: [
    { name: "Alimentación", emoji: "🍽️" },
    { name: "Mercado", emoji: "🛒" },
    { name: "Transporte", emoji: "🚌" },
    { name: "Vivienda", emoji: "🏠" },
    { name: "Servicios", emoji: "💡" },
    { name: "Salud", emoji: "🩺" },
    { name: "Ropa", emoji: "👟" },
    { name: "Entretenimiento", emoji: "🎬" },
    { name: "Educación", emoji: "📚" },
    { name: "Deudas", emoji: "💳" },
    { name: "Otros", emoji: "📦" },
  ],
  income: [
    { name: "Salario", emoji: "💼" },
    { name: "Freelance", emoji: "💻" },
    { name: "Ventas", emoji: "🏷️" },
    { name: "Inversiones", emoji: "📈" },
    { name: "Regalos", emoji: "🎁" },
    { name: "Otros", emoji: "📦" },
  ],
} as const;
