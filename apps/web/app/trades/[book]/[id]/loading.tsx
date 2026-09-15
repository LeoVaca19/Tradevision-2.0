export default function TradeRecordLoading() {
  return (
    <div className="tv-container">
      <div className="tv-skeleton-line" style={{ width: "20%" }} />
      <div className="tv-skeleton-h1" />
      <div className="tv-workspace">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="tv-card">
            <div className="tv-skeleton-line" style={{ width: "30%", height: 18 }} />
            <div className="tv-skeleton-line" />
            <div className="tv-skeleton-line" style={{ width: "80%" }} />
          </div>
        ))}
      </div>
      <p className="tv-sample" style={{ marginTop: 16 }}>
        Cargando el registro…
      </p>
    </div>
  );
}
