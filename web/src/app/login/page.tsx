import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SESSION_COOKIE_NAME, getSessionUser } from "@/lib/auth/session";
import LoginForm from "./login-form";

export const instant = false;

export default async function LoginPage() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    const user = await getSessionUser(new Request("http://recallnet.local/", { headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` } })).catch(() => null);
    if (user) redirect("/");
  }
  return <main className="auth-shell"><section className="auth-aside"><Link className="brand" href="/"><span className="brand-mark">R</span><span>RecallNet<small>TRACEABILITY PLATFORM</small></span></Link><div className="hero-copy"><p className="eyebrow">SUPPLY CHAIN VISIBILITY</p><h1>Know where every batch goes.</h1><p>Trace product journeys from raw material suppliers through production, distribution and retail. Act quickly when quality matters.</p></div><span className="side-muted">RecallNet · Secure operations workspace</span></section><section className="auth-main"><LoginForm/></section></main>;
}
