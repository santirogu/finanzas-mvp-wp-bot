import { expect } from "@playwright/test";
import { E2E_CRON_SECRET } from "./fake-config";
import { test } from "./helpers";

// Contra el build de producción: la limpieza diaria (vercel.json → crons) solo responde a Vercel
// Cron, que manda el secreto CRON_SECRET.
test("la limpieza diaria solo responde con el secreto de Vercel Cron", async ({ request }) => {
  const wrong: Record<string, string>[] = [{}, { authorization: "Bearer otro-secreto" }, { authorization: E2E_CRON_SECRET }];
  for (const headers of wrong) {
    const response = await request.get("/api/cron/limpieza", { headers });
    expect(response.status(), JSON.stringify(headers)).toBe(401);
  }

  const response = await request.get("/api/cron/limpieza", { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({
    ok: true,
    messages: expect.any(Number),
    events: expect.any(Number),
    transactions: expect.any(Number),
  });
});
