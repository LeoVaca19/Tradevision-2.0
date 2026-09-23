import { LoginForm } from "@/components/auth/LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="tv-container" style={{ maxWidth: 420 }}>
      <h1>Entrar a TradeVision</h1>
      <div className="tv-card" style={{ marginTop: 24 }}>
        <LoginForm />
      </div>
    </div>
  );
}
