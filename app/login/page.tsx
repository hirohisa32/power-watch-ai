import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "ログイン" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/projects");
  return (
    <main className="login-page">
      <section className="login-visual">
        <div className="watch-ring" aria-hidden="true" />
        <div className="login-caption">
          <p className="eyebrow">Cinematic watch stories</p>
          <h1>
            Time, told
            <br />
            beautifully.
          </h1>
          <p className="lead">一本の時計に宿る時間を、映像の物語へ。</p>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-box">
          <div className="brand">
            <span>POWER</span> WATCH
          </div>
          <h2>Studio Login</h2>
          <p className="lead">管理者アカウントでログインしてください。</p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
