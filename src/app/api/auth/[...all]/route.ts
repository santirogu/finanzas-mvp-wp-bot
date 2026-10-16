import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { isAuthRouteAllowed } from "@/modules/auth/http-routes";

const handler = toNextJsHandler(auth);

// Solo las rutas que la app usa desde el navegador (AUTH_HTTP_ROUTES); el resto, incluidas las que
// agregue una versión nueva de Better Auth, responde 404 sin llegar a Better Auth.
function onlyAllowed(handle: (request: Request) => Promise<Response>) {
  return (request: Request) =>
    isAuthRouteAllowed(request.method, new URL(request.url).pathname)
      ? handle(request)
      : Promise.resolve(new Response("Not Found", { status: 404 }));
}

export const GET = onlyAllowed(handler.GET);
export const POST = onlyAllowed(handler.POST);
