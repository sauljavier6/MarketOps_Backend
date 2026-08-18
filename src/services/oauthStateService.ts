import crypto from "crypto";

function secret() {
  const value = process.env.OAUTH_STATE_SECRET;
  if (!value) throw new Error("OAUTH_STATE_SECRET is not configured");
  return value;
}

export function createOAuthState() {
  const payload = Buffer.from(JSON.stringify({
    nonce: crypto.randomBytes(18).toString("base64url"),
    ts: Date.now(),
  })).toString("base64url");

  const signature = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function validateOAuthState(state: string) {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return false;

  const expected = crypto.createHmac("sha256", secret()).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return false;

  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  return Date.now() - Number(parsed.ts) <= 10 * 60 * 1000;
}
