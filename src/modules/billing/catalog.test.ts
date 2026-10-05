import { describe, expect, it } from "vitest";
import { DEFAULT_PACKAGES, formatDuration, formatRupiah } from "./catalog";

describe("formatRupiah", () => {
  it("memberi pemisah ribuan titik", () => {
    expect(formatRupiah(0)).toBe("Rp0");
    expect(formatRupiah(999)).toBe("Rp999");
    expect(formatRupiah(99_000)).toBe("Rp99.000");
    expect(formatRupiah(1_500_000)).toBe("Rp1.500.000");
  });
  it("membulatkan dan menangani angka tak wajar", () => {
    expect(formatRupiah(1999.6)).toBe("Rp2.000");
    expect(formatRupiah(Number.NaN)).toBe("Rp0");
    expect(formatRupiah(-5000)).toBe("-Rp5.000");
  });
});

describe("formatDuration", () => {
  it("mengubah hari menjadi bulan bila pas", () => {
    expect(formatDuration(365)).toBe("12 bulan");
    expect(formatDuration(730)).toBe("24 bulan");
    expect(formatDuration(30)).toBe("1 bulan");
    expect(formatDuration(14)).toBe("14 hari");
  });
});

describe("DEFAULT_PACKAGES", () => {
  it("memiliki tiga paket dengan id unik dan satu yang disorot", () => {
    expect(DEFAULT_PACKAGES).toHaveLength(3);
    expect(new Set(DEFAULT_PACKAGES.map((p) => p.id)).size).toBe(3);
    expect(DEFAULT_PACKAGES.filter((p) => p.highlighted)).toHaveLength(1);
  });
  it("harga naik per tingkat dan harga coret lebih tinggi dari harga", () => {
    const prices = DEFAULT_PACKAGES.map((p) => p.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    for (const p of DEFAULT_PACKAGES) {
      if (p.originalPrice) expect(p.originalPrice).toBeGreaterThan(p.price);
      expect(p.features.length).toBeGreaterThan(0);
      expect(p.durationDays).toBeGreaterThan(0);
    }
  });
  it("hanya paket tertinggi yang menghapus branding dan punya check-in QR", () => {
    const top = DEFAULT_PACKAGES[2];
    expect(top.flags.removeBranding).toBe(true);
    expect(top.flags.qrCheckin).toBe(true);
    expect(
      DEFAULT_PACKAGES.slice(0, 2).some((p) => p.flags.removeBranding),
    ).toBe(false);
  });
});
