"use client";
import { Printer } from "lucide-react";

export function PrintButton() {
  return <button className="btn btn-ink btn-sm no-print" onClick={() => window.print()}><Printer size={15} aria-hidden /> Print</button>;
}
