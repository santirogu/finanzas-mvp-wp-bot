import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// twoFactorClient agrega authClient.twoFactor.* (configurar la verificación y escribir el código).
// El segundo paso del login lo maneja el formulario (src/app/(auth)/auth-form.tsx).
export const authClient = createAuthClient({ plugins: [twoFactorClient()] });
