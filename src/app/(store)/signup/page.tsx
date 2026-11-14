import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/utils";
import { getCustomer } from "@/lib/auth";
import { googleConfigured } from "@/lib/customer-auth";
import { SignupForm } from "../login/login-form";

export const metadata: Metadata = { title: "Create an account", robots: { index: false } };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getCustomer()) redirect(safeNext(next ?? "/account"));
  return <div className="container-x flex justify-center py-12"><SignupForm next={safeNext(next ?? "/account")} google={googleConfigured()} /></div>;
}
