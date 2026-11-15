"use client";
import { useState } from "react";
import { Wallet } from "lucide-react";
import { walletAction } from "@/app/admin/actions";
import { money } from "@/lib/format";

/**
 * The Delhivery wallet balance, with a warning when it's too low to book. `need` is what the next
 * shipment costs (paise), when known.
 */
export function WalletBalance({ balance: initial, need, compact }: { balance: number | null; need?: number | null; compact?: boolean }) {
  const [balance, setBalance] = useState(initial);
  const [busy, setBusy] = useState(false);
  if (balance == null && initial == null) return null;
  const low = balance != null && (need ? balance < need : balance <= 0);
  const recheck = async () => { setBusy(true); const r = await walletAction(); setBusy(false); if (r.balance != null) setBalance(r.balance); };
  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-sm ${low ? "rounded-sm bg-clay-soft p-2.5" : ""}`} data-testid="wallet" role={low ? "alert" : undefined}>
      <Wallet size={16} aria-hidden />
      <span>Delhivery wallet: <b className={low ? "text-clay" : ""}>{balance == null ? "couldn't check" : money(balance)}</b>
        {low && <>. {need ? `Not enough for this shipment (about ${money(need)}). Add money in Delhivery One, under Wallet.` : "Add money in Delhivery One, under Wallet, before booking shipments."}</>}
      </span>
      {low && <a className="btn btn-white btn-sm" href="https://one.delhivery.com/" target="_blank" rel="noopener noreferrer">Open Delhivery One</a>}
      {!compact || low ? <button type="button" disabled={busy} className="btn btn-white btn-sm" onClick={recheck}>{busy ? "Checking…" : "Check again"}</button> : null}
    </div>
  );
}
