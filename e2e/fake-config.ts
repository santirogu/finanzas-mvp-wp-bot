// Compartido por playwright.config.ts y las pruebas del bot: dónde corren los servidores falsos
// de WhatsApp y Claude (e2e/fake-services.mjs) y con qué clave se firman los mensajes del
// webhook, como lo hace Meta. Son valores solo para pruebas.
export const FAKE_SERVICES_URL = "http://localhost:3101";
export const E2E_WHATSAPP_APP_SECRET = "e2e-app-secret-solo-para-pruebas";
export const E2E_CRON_SECRET = "e2e-cron-secret-solo-para-pruebas";
