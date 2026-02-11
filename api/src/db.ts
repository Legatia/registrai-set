// D1 is accessed via env bindings — no initialization needed.
// This file provides shared helpers for crypto ID generation (Web Crypto compatible).

export function generateId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

export function generateApiKey(): string {
  return "kya_" + base64url(new Uint8Array(24).map(() => Math.floor(Math.random() * 256)));
}

export function generateSecret(): string {
  return "whsec_" + base64url(new Uint8Array(24).map(() => Math.floor(Math.random() * 256)));
}

function base64url(bytes: Uint8Array): string {
  const binStr = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(binStr).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export async function hmacSign(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
