import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="font-display text-8xl text-ink-soft">404</p>
      <h1 className="text-3xl">We couldn&apos;t find that page</h1>
      <p className="text-ink-soft">The page you&apos;re after isn&apos;t here.</p>
      <Link href="/shop" className="btn btn-primary">Back to the shop</Link>
    </div>
  );
}
