import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Hash kata sandi dengan scrypt dan salt unik per pengguna. Format simpan:
 * `scrypt$N$r$p$salt$hash` (salt dan hash heksadesimal). Parameter ikut
 * tersimpan supaya biaya dapat dinaikkan kelak tanpa memutus hash lama.
 */
const COST = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

function derive(
  password: string,
  salt: Buffer,
  n: number,
  r: number,
  p: number,
  length: number,
) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password.normalize("NFKC"),
      salt,
      length,
      { N: n, r, p, maxmem: 256 * n * r },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}

export async function hashPassword(password: string) {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, COST.N, COST.r, COST.p, KEY_LENGTH);
  return `scrypt$${COST.N}$${COST.r}$${COST.p}$${salt.toString("hex")}$${key.toString("hex")}`;
}

function parse(stored: string) {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return null;
  const params = { N: Number(n), r: Number(r), p: Number(p) };
  // Parameter dibatasi agar hash yang rusak tidak bisa memakan memori besar.
  if (
    !Number.isInteger(params.N) ||
    params.N < 1024 ||
    params.N > 1 << 17 ||
    (params.N & (params.N - 1)) !== 0 ||
    !Number.isInteger(params.r) ||
    params.r < 1 ||
    params.r > 16 ||
    !Number.isInteger(params.p) ||
    params.p < 1 ||
    params.p > 4 ||
    !/^[a-f0-9]+$/.test(salt) ||
    !/^[a-f0-9]+$/.test(hash)
  )
    return null;
  return {
    ...params,
    salt: Buffer.from(salt, "hex"),
    hash: Buffer.from(hash, "hex"),
  };
}

export async function verifyPassword(password: string, stored: string) {
  const parsed = parse(stored);
  if (!parsed) return false;
  const key = await derive(
    password,
    parsed.salt,
    parsed.N,
    parsed.r,
    parsed.p,
    parsed.hash.length,
  );
  return key.length === parsed.hash.length && timingSafeEqual(key, parsed.hash);
}

let dummyHash: Promise<string> | null = null;

/**
 * Selalu menjalankan satu perbandingan scrypt, juga saat email tidak dikenal,
 * sehingga waktu respons tidak membedakan akun yang ada dari yang tidak ada.
 */
export async function verifyPasswordOrDummy(
  password: string,
  stored: string | undefined,
) {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  const ok = await verifyPassword(password, stored ?? (await dummyHash));
  return stored !== undefined && ok;
}
