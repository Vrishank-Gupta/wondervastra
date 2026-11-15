/**
 * The Delhivery One prepaid wallet balance. Delhivery's shipping API (the token) can't see the wallet,
 * so this signs in to the Delhivery One account with its service login and asks the same service the
 * Delhivery One dashboard uses. Server-only; the login secret never reaches the browser.
 */
const AUTH = "https://ucp-auth.delhivery.com/holyknight/realms";
const SERVICE = () => process.env.DELHIVERY_ONE_URL || "https://mcp-client.delhivery.com/mcp";

export function walletConfigured() {
  return Boolean(process.env.DELHIVERY_ONE_CLIENT_SECRET && process.env.DELHIVERY_ONE_REALM);
}

let token: { value: string; until: number } | null = null;
async function signIn() {
  if (token && Date.now() < token.until) return token.value;
  const res = await fetch(`${AUTH}/${process.env.DELHIVERY_ONE_REALM}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: process.env.DELHIVERY_ONE_CLIENT_ID || "ucp-service-cli", client_secret: process.env.DELHIVERY_ONE_CLIENT_SECRET ?? "" }),
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
  if (!res.ok || !json?.access_token) throw new Error("Couldn't sign in to Delhivery One.");
  token = { value: json.access_token, until: Date.now() + Math.max(60, (json.expires_in ?? 300) - 60) * 1000 };
  return token.value;
}

/** Calls one Delhivery One service tool and returns its JSON answer. */
async function tool(name: string, headers: Record<string, string> = {}) {
  const res = await fetch(SERVICE(), {
    method: "POST",
    headers: { Authorization: `Bearer ${await signIn()}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: {} } }),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  // The answer comes either as plain JSON or as a one-message event stream ("data: {...}").
  const raw = text.trim().startsWith("{") ? text : text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5)).pop() ?? "";
  const msg = JSON.parse(raw) as { result?: { content?: { text?: string }[]; isError?: boolean } };
  const out = msg.result?.content?.[0]?.text ?? "";
  if (msg.result?.isError) throw new Error(out || `Delhivery One ${name} failed`);
  return JSON.parse(out) as Record<string, unknown>;
}

let account: string | null = null;
async function accountId() {
  if (process.env.DELHIVERY_ONE_HQ_CLIENT_ID) return process.env.DELHIVERY_ONE_HQ_CLIENT_ID;
  if (account) return account;
  const r = (await tool("list-client-mappings")) as { results?: { service_type?: string; hq_client_id?: string }[] };
  const row = r.results?.find((x) => x.service_type === "DOMESTIC" && x.hq_client_id) ?? r.results?.find((x) => x.hq_client_id);
  if (!row?.hq_client_id) throw new Error("No Delhivery One account found.");
  return (account = row.hq_client_id);
}

export type Wallet = { balance: number; active: boolean; at: number };
let cached: Wallet | null = null;
/** Balance in paise, cached for a minute. Null when it can't be read; never throws. */
export async function walletBalance({ fresh = false } = {}): Promise<Wallet | null> {
  if (!walletConfigured()) return null;
  if (!fresh && cached && Date.now() - cached.at < 60_000) return cached;
  try {
    const w = await tool("get-wallet-details", { "x-hq-client-id": await accountId() });
    if (typeof w.current_balance !== "number") return null;
    return (cached = { balance: Math.round(w.current_balance * 100), active: w.is_active !== false, at: Date.now() });
  } catch (e) {
    console.error("[delhivery-wallet]", e instanceof Error ? e.message : e);
    return null;
  }
}

export const WALLET_RECHARGE_URL = "https://one.delhivery.com/";
