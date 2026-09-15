export default function TradesLoading() {
  return (
    <div className="tv-container">
      <div className="tv-skeleton-h1" />
      <div className="tv-skeleton-line" style={{ width: "60%" }} />
      <div className="tv-summary" style={{ marginTop: 32 }}>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="tv-card">
            <div className="tv-skeleton-line" style={{ width: "50%" }} />
            <div className="tv-skeleton-line" style={{ width: "70%", height: 20 }} />
          </div>
        ))}
      </div>
      <p className="tv-sample" style={{ marginTop: 24 }}>
        Cargando el Diario…
      </p>
    </div>
  );
}
