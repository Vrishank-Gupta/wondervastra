import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/utils";
import { getCustomer } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getCustomer()) redirect(safeNext(next));
  return <div className="container-x flex justify-center py-12"><LoginForm next={safeNext(next)} /></div>;
}
