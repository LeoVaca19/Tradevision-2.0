import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <section className="tv-hero">
        <div className="tv-hero-inner">
          <p className="tv-badge" data-state="declared" style={{ marginBottom: 20 }}>
            <span aria-hidden>○</span> nombre provisional
          </p>
          <h1 className="tv-display">TradeVision</h1>
          <p className="tv-lede">
            Diario de trading <strong>verificado</strong>, analítica forense y un Mentor IA que separa
            &laquo;el problema es la estrategia&raquo; de &laquo;el problema es la ejecución&raquo; con
            un número.
          </p>
          <p style={{ marginTop: 28, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/dashboard" className="tv-btn">
              Ver el panel de demostración
            </Link>
            <Link href="/trades" className="tv-btn tv-btn-parchment">
              Diario de operaciones
            </Link>
          </p>
        </div>
      </section>

      <div className="tv-container" style={{ paddingTop: 64 }}>
        <div className="tv-grid">
          <div className="tv-card">
            <h3 style={{ marginBottom: 8, fontSize: "var(--text-body)" }}>Libro Verificado</h3>
            <p style={{ color: "var(--text-secondary)" }}>
              Operaciones sincronizadas del bróker. Inmutables, append-only, con Sello. Ninguna cifra
              mezcla lo verificado con lo declarado sin etiquetarlo.
            </p>
          </div>
          <div className="tv-card">
            <h3 style={{ marginBottom: 8, fontSize: "var(--text-body)" }}>Libro de No Tomadas</h3>
            <p style={{ color: "var(--text-secondary)" }}>
              La fuente del contrafactual &laquo;Plan vs Ejecutado&raquo;. Si lo que no tomaste
              cumplía la checklist y llegaba a objetivo, el edge es real.
            </p>
          </div>
          <div className="tv-card">
            <h3 style={{ marginBottom: 8, fontSize: "var(--text-body)" }}>Motor de analítica</h3>
            <p style={{ color: "var(--text-secondary)" }}>
              Win Rate, Expectancy, Profit Factor, Drawdown, rachas y el Radar Score de 6 ejes.
              Determinista y versionado: cada número se abre hasta las operaciones que lo sustentan.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
