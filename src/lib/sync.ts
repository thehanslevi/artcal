import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://djyzqifuckuwdeeltnej.supabase.co";
const SUPABASE_KEY = "sb_publishable_EIeHwihJheYgPBZbqODuAg_0oCyic99";

const PASSPHRASE_KEY = "nyc-cal:sync-passphrase:v1";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export function loadPassphrase(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(PASSPHRASE_KEY);
  } catch {
    return null;
  }
}

export function savePassphrase(passphrase: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (passphrase === null) {
      window.localStorage.removeItem(PASSPHRASE_KEY);
    } else {
      window.localStorage.setItem(PASSPHRASE_KEY, passphrase);
    }
  } catch {
    /* quota */
  }
}

/** Unguessable, retypeable token (~62 bits) used as an auto-generated passphrase. */
export function generateToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    if (i === 4 || i === 8) out += "-";
    out += chars[bytes[i]! % chars.length];
  }
  return out;
}

export async function hashPassphrase(passphrase: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(passphrase.trim());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function fetchPicks(passphrase: string): Promise<string[] | null> {
  const hash = await hashPassphrase(passphrase);
  const { data, error } = await supabase
    .from("picks")
    .select("picks")
    .eq("passphrase_hash", hash)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const picks = (data as { picks: unknown }).picks;
  if (!Array.isArray(picks)) return [];
  return picks.filter((p): p is string => typeof p === "string");
}

export async function uploadPicks(
  passphrase: string,
  picks: string[],
): Promise<void> {
  const hash = await hashPassphrase(passphrase);
  const { error } = await supabase.from("picks").upsert(
    {
      passphrase_hash: hash,
      picks,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "passphrase_hash" },
  );
  if (error) throw error;
}
