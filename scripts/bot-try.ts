// Prueba rápida del intérprete con un mensaje. Llama a la API de Claude.
//   pnpm bot:try "me compré unos zapatos que me costaron $500.000"
import "dotenv/config";
import { todayInTimezone } from "../src/lib/dates";
import { claudeExtractor } from "../src/modules/bot/claude-extractor";
import { interpretMessage } from "../src/modules/bot/interpret";
import { DEFAULT_CATEGORIES } from "../src/modules/transactions/default-categories";

const text = process.argv.slice(2).join(" ");
if (!text) {
  console.error('Uso: pnpm bot:try "gasté 20 mil en almuerzo"');
  process.exit(1);
}

async function main() {
  const intent = await interpretMessage(
    text,
    {
      today: todayInTimezone("America/Bogota"),
      categories: {
        expense: DEFAULT_CATEGORIES.expense.map((c) => c.name),
        income: DEFAULT_CATEGORIES.income.map((c) => c.name),
      },
    },
    claudeExtractor,
  );
  console.log(JSON.stringify(intent, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
