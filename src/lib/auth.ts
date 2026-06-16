// Sessão assinada via HMAC com Web Crypto — compatível com Edge/middleware.
// IMPORTANTE: este módulo NÃO pode importar `node:*` (roda no edge).
// O hash de senha (Node) fica em ./password.ts.

export const SESSION_COOKIE = "icv_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 horas

// ------------------------ Sessão (Web Crypto / Edge) ------------------------

interface SessionPayload {
  sub: string; // id do usuário
  email: string;
  exp: number; // epoch (segundos)
}

function b64urlEncode(data: Uint8Array): string {
  let str = "";
  for (const byte of data) str += String.fromCharCode(byte);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Garante um ArrayBuffer concreto (evita o tipo ArrayBufferLike/SharedArrayBuffer
// rejeitado por BufferSource na tipagem estrita do TS).
function buf(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength
  ) as ArrayBuffer;
}

function enc(text: string): ArrayBuffer {
  return buf(new TextEncoder().encode(text));
}

async function hmacKey(): Promise<CryptoKey> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET não configurado.");
  return crypto.subtle.importKey(
    "raw",
    enc(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function createSession(user: {
  id: string;
  email: string;
}): Promise<string> {
  const payload: SessionPayload = {
    sub: user.id,
    email: user.email,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await hmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, enc(body));
  return `${body}.${b64urlEncode(new Uint8Array(sig))}`;
}

export async function verifySession(
  token: string | undefined
): Promise<SessionPayload | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const key = await hmacKey();
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      buf(b64urlDecode(sig)),
      enc(body)
    );
    if (!valid) return null;
    const payload = JSON.parse(
      new TextDecoder().decode(b64urlDecode(body))
    ) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE = SESSION_TTL_SECONDS;
