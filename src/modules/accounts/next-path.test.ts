import { describe, expect, it } from "vitest";
import { safeNextPath } from "./next-path";

describe("safeNextPath", () => {
  it("menerima jalur relatif satu origin beserta query", () => {
    expect(safeNextPath("/admin")).toBe("/admin");
    expect(safeNextPath("/dashboard/akun")).toBe("/dashboard/akun");
    expect(safeNextPath("/dashboard?undangan=abc#guests")).toBe(
      "/dashboard?undangan=abc#guests",
    );
  });

  it("menolak URL absolut, protocol-relative, dan skema lain", () => {
    for (const value of [
      "https://evil.test",
      "http://evil.test/x",
      "//evil.test",
      "///evil.test",
      "javascript:alert(1)",
      "data:text/html,x",
      "evil.test",
      "dashboard",
    ])
      expect(safeNextPath(value), value).toBe("/dashboard");
  });

  it("menolak backslash dan karakter kontrol yang ditafsirkan peramban sebagai //", () => {
    for (const value of [
      "/\\evil.test",
      "\\\\evil.test",
      "/\t/evil.test",
      "/\n/evil.test",
      "/%5Cevil.test".replace("%5C", "\\"),
      "/a\u0000b",
    ])
      expect(safeNextPath(value), JSON.stringify(value)).toBe("/dashboard");
  });

  it("menolak tipe bukan string, kosong, dan terlalu panjang", () => {
    for (const value of [undefined, null, 42, {}, [], "", "   "])
      expect(safeNextPath(value)).toBe("/dashboard");
    expect(safeNextPath("/" + "a".repeat(600))).toBe("/dashboard");
  });

  it("tidak mengembalikan ke /login atau /daftar dan memakai fallback sendiri", () => {
    expect(safeNextPath("/login?next=/admin")).toBe("/dashboard");
    expect(safeNextPath("/daftar")).toBe("/dashboard");
    expect(safeNextPath("//x", "/admin")).toBe("/admin");
  });
});
