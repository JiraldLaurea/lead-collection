import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <section className="panel login-panel">
      <h1>Login</h1>
      <LoginForm />
      <p className="muted login-helper">Default development password is <code>admin</code> until `ADMIN_PASSWORD_HASH` is set.</p>
    </section>
  );
}
