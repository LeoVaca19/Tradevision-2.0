import Link from "next/link";

export default function NotFound() {
  return (
    <div className="tv-container" style={{ textAlign: "center", paddingTop: 96 }}>
      <p className="tv-badge" data-state="insufficient" style={{ marginBottom: 20 }}>
        <span aria-hidden>—</span> 404
      </p>
      <h1>No encontramos esta página</h1>
      <p style={{ color: "var(--text-secondary)", marginTop: 12 }}>
        Puede que la operación no exista o el enlace esté roto.
      </p>
      <p style={{ marginTop: 28 }}>
        <Link href="/" className="tv-btn">
          Volver al inicio
        </Link>
      </p>
    </div>
  );
}
