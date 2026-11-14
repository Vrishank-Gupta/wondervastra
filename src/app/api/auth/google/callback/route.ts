import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clientIp, rateLimit } from "@/lib/auth";
import { customerForGoogle, finishLogin, googleConfigured, googleProfile } from "@/lib/customer-auth";
import { safeNext, siteUrl } from "@/lib/utils";

/** Google sends the buyer back here. Checks the one-time state, then logs them into the account for their email. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const jar = await cookies();
  let saved: { state?: string; verifier?: string; next?: string } = {};
  try { saved = JSON.parse(jar.get("wv_google")?.value ?? "{}"); } catch { /* treated as missing */ }
  jar.delete({ name: "wv_google", path: "/api/auth/google" });
  const next = safeNext(saved.next ?? "/account");
  const back = (msg: string) => NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}&error=${encodeURIComponent(msg)}`, siteUrl()));

  if (params.get("error")) return back("Google sign-in was cancelled.");
  const code = params.get("code"), state = params.get("state");
  if (!googleConfigured() || !code || !state || !saved.state || state !== saved.state || !saved.verifier) return back("Google sign-in expired. Please try again.");
  if (!(await rateLimit(`google:${await clientIp()}`, 30, 15 * 60_000))) return back("Too many attempts. Please wait a few minutes.");
  try {
    const profile = await googleProfile(code, saved.verifier, siteUrl());
    const c = await customerForGoogle(profile);
    const r = await finishLogin(c, next);
    if (r.error) return back(r.error);
    return NextResponse.redirect(new URL(r.dest!, siteUrl()));
  } catch (e) {
    return back((e as Error).message || "Google sign-in didn't complete.");
  }
}
