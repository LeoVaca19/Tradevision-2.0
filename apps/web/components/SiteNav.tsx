import Link from "next/link";
import { NavLink } from "./NavLink";
import { currentUserOrNull, USING_REAL_DB } from "@/lib/data";
import { signOutAction } from "@/app/login/actions";

/**
 * Nav global — pill flotante. Server Component: resuelve el usuario de la sesión
 * (Supabase Auth) o el demo, para enlazar su Perfil Público y mostrar "Salir".
 * Sin sesión sólo muestra la marca y el enlace a /login.
 */
export async function SiteNav() {
  const user = await currentUserOrNull();

  return (
    <nav className="tv-nav" aria-label="Principal">
      <Link href="/" className="tv-nav-brand">
        TradeVision
      </Link>
      {user ? (
        <div className="tv-nav-links">
          <NavLink href="/dashboard">Panel</NavLink>
          <NavLink href="/trades">Diario</NavLink>
          <NavLink href={`/${user.handle}`}>Perfil público</NavLink>
        </div>
      ) : null}
      <div className="tv-nav-spacer" />
      {user ? (
        <>
          <Link href="/trades/new" className="tv-btn">
            + Registrar
          </Link>
          {USING_REAL_DB ? (
            <form action={signOutAction} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "var(--text-secondary)", fontSize: "var(--text-body-sm)" }}>@{user.handle}</span>
              <button type="submit" className="tv-btn tv-btn-ghost tv-btn-sm">
                Salir
              </button>
            </form>
          ) : null}
        </>
      ) : (
        <Link href="/login" className="tv-btn">
          Entrar
        </Link>
      )}
    </nav>
  );
}
