import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/utils";
import { getCustomer } from "@/lib/auth";
import { googleConfigured } from "@/lib/customer-auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in", robots: { index: false } };

/** Only our own messages are shown, so a crafted link can't put words on the login page. */
const ERRORS: Record<string, string> = {
  "Google sign-in was cancelled.": "Google sign-in was cancelled.",
  "Google sign-in expired. Please try again.": "Google sign-in expired. Please try again.",
  "Google sign-in didn't complete.": "Google sign-in didn't complete. Please try again, or log in with an email code.",
  "Your Google email isn't verified yet. Please log in with an email code instead.": "Your Google email isn't verified yet. Please log in with an email code instead.",
  "This account has been disabled. Please contact us.": "This account has been disabled. Please contact us.",
  "Too many attempts. Please wait a few minutes.": "Too many attempts. Please wait a few minutes.",
  "google-off": "Google login isn't available right now. Please log in with an email code.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  if (await getCustomer()) redirect(safeNext(next));
  return <div className="container-x flex justify-center py-12"><LoginForm next={safeNext(next)} google={googleConfigured()} initialError={error ? ERRORS[error] ?? "" : ""} /></div>;
}
