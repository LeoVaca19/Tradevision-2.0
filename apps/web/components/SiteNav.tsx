import Link from "next/link";
import { NavLink } from "./NavLink";
import { currentUser } from "@/lib/data";

/**
 * Nav global — pill flotante. Server Component: resuelve el usuario dev/demo
 * actual sólo para enlazar su Perfil Público; sin lógica de sesión real
 * (auth queda pospuesta, ver MIGRATION_PLAN.md §3.1).
 */
export async function SiteNav() {
  const user = await currentUser();

  return (
    <nav className="tv-nav" aria-label="Principal">
      <Link href="/" className="tv-nav-brand">
        TradeVision
      </Link>
      <div className="tv-nav-links">
        <NavLink href="/dashboard">Panel</NavLink>
        <NavLink href="/trades">Diario</NavLink>
        <NavLink href={`/${user.handle}`}>Perfil público</NavLink>
      </div>
      <div className="tv-nav-spacer" />
      <Link href="/trades/new" className="tv-btn">
        + Registrar
      </Link>
    </nav>
  );
}
