import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** Social account tokens are stored encrypted with a key derived from AUTH_SECRET. */
function key() {
  const secret = process.env.AUTH_SECRET ?? process.env.DATABASE_URL ?? "";
  return createHash("sha256").update(`social-token:${secret}`).digest();
}

export function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(value: string) {
  const [iv, tag, data] = value.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv!);
  decipher.setAuthTag(tag!);
  return Buffer.concat([decipher.update(data!), decipher.final()]).toString("utf8");
}
