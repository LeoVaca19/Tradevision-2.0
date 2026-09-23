import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refresca la sesión de Supabase en cada request y protege las rutas de
 * escritura/lectura privadas. Públicas: `/`, `/login`, `/[handle]`.
 * `/api/*` no redirige (responde 401 por sí mismo).
 *
 * Sin `DATABASE_URL` (modo demo) o sin claves de Supabase no hace nada.
 */

const PROTECTED = ["/dashboard", "/trades"];

export async function middleware(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!process.env.DATABASE_URL || !url || !anonKey) return NextResponse.next();

  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) req.cookies.set(name, value);
        res = NextResponse.next({ request: req });
        for (const { name, value, options } of list) res.cookies.set(name, value, options);
      },
    },
  });

  // getUser() valida el JWT contra Supabase (getSession() no).
  const { data } = await supabase.auth.getUser();
  const path = req.nextUrl.pathname;
  const isProtected = PROTECTED.some((p) => path === p || path.startsWith(`${p}/`));

  const redirect = (to: string) => {
    const r = NextResponse.redirect(new URL(to, req.url));
    for (const c of res.cookies.getAll()) r.cookies.set(c);
    return r;
  };

  if (!data.user && isProtected) return redirect("/login");
  if (data.user && path === "/login") return redirect("/dashboard");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
