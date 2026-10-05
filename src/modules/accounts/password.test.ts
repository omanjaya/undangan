import { describe, expect, it } from "vitest";
import {
  hashPassword,
  verifyPassword,
  verifyPasswordOrDummy,
} from "./password";

describe("hash kata sandi", () => {
  it("memakai format scrypt dengan salt unik", async () => {
    const [a, b] = await Promise.all([
      hashPassword("rahasia-123"),
      hashPassword("rahasia-123"),
    ]);
    expect(a).toMatch(/^scrypt\$16384\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
    expect(a).not.toBe(b);
    expect(await verifyPassword("rahasia-123", a)).toBe(true);
    expect(await verifyPassword("rahasia-124", a)).toBe(false);
  });

  it("menolak hash yang rusak atau berparameter berbahaya", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$1$2$3$aa$bb")).toBe(false);
    expect(await verifyPassword("x", "scrypt$1073741824$8$1$aa$bb")).toBe(
      false,
    );
  });

  it("selalu menjalankan perbandingan, juga untuk akun yang tidak ada", async () => {
    expect(await verifyPasswordOrDummy("apa-saja", undefined)).toBe(false);
    const hash = await hashPassword("benar");
    expect(await verifyPasswordOrDummy("benar", hash)).toBe(true);
    expect(await verifyPasswordOrDummy("salah", hash)).toBe(false);
  });
});
