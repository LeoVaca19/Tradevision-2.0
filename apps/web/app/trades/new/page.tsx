import Link from "next/link";
import { NewManualTradeForm } from "@/components/trade/NewManualTradeForm";

export const dynamic = "force-dynamic";

export default function NewManualTradePage() {
  return (
    <div className="tv-container" style={{ maxWidth: 640 }}>
      <p>
        <Link href="/trades">← Volver al Diario</Link>
      </p>
      <h1>Registrar operación</h1>
      <div className="tv-card" style={{ marginTop: 24 }}>
        <NewManualTradeForm />
      </div>
    </div>
  );
}
