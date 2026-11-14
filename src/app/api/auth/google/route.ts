import { NextResponse } from "next/server";
import { googleConfigured, googleStart } from "@/lib/customer-auth";
import { safeNext, siteUrl } from "@/lib/utils";

/** "Continue with Google": sends the buyer to Google, remembering where to bring them back. */
export async function GET(req: Request) {
  const next = safeNext(new URL(req.url).searchParams.get("next") ?? "/account");
  if (!googleConfigured()) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}&error=google-off`, siteUrl()));
  const { url, state, verifier } = googleStart(siteUrl());
  const res = NextResponse.redirect(url);
  res.cookies.set("wv_google", JSON.stringify({ state, verifier, next }), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/auth/google", maxAge: 600,
  });
  return res;
}
