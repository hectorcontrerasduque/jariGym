import { updateSession } from "@/lib/supabase/middleware";
import { type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // sw.js y manifest.webmanifest deben servirse SIEMPRE (también sin sesión):
    // el middleware los redirigía a /login y rompía el registro del Service
    // Worker y la instalación PWA — sin ellos no hay push en el navegador.
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js$|manifest\\.webmanifest$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
