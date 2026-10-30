import { randomBytes, scrypt, timingSafeEqual, type BinaryLike, type ScryptOptions } from "node:crypto";

const KEY_LENGTH = 64;
const OPTIONS = { N: 16384, r: 8, p: 1 };

function derive(password: BinaryLike, salt: BinaryLike, options: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, KEY_LENGTH, options, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** "scrypt$N$r$p$<salt>$<hash>", so the cost can be raised later without breaking old hashes. */
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, OPTIONS);
  return ["scrypt", OPTIONS.N, OPTIONS.r, OPTIONS.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, N, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const key = await derive(password, Buffer.from(salt, "base64url"), { N: Number(N), r: Number(r), p: Number(p) });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Spends the same time as a real check, so a wrong email can't be told apart from a wrong password. */
const DUMMY_HASH = hashPassword(randomBytes(16).toString("hex"));
export async function burnPasswordCheck(password: string) {
  await verifyPassword(password, await DUMMY_HASH);
}
