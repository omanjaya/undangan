import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve("src/styles/landing.css"), "utf8");
const skrip = readFileSync(resolve("src/components/landing/reveal.ts"), "utf8");

describe("animasi munculnya bagian landing", () => {
  it("tidak pernah menyembunyikan konten tanpa penanda dari skrip", () => {
    // Regresi paling berbahaya: aturan penyembunyi yang berlaku walau skrip
    // gagal dimuat akan membuat halaman tampak kosong bagi pengunjung.
    const tanpaKomentar = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const penyembunyi = tanpaKomentar
      .split("}")
      .filter((blok) => /opacity:\s*0\s*;/.test(blok))
      .map((blok) => blok.split("{")[0].trim())
      .filter((selector) => /data-reveal/.test(selector));
    expect(penyembunyi.length).toBeGreaterThan(0);
    for (const selector of penyembunyi) {
      expect(selector.startsWith(".js-reveal")).toBe(true);
    }
  });
  it("menandai dokumen hanya setelah skrip berjalan", () => {
    expect(skrip).toContain('classList.add("js-reveal")');
    expect(css).not.toMatch(/^\s*\[data-reveal\]\s*\{/m);
  });
  it("menghormati permintaan pengurangan gerak", () => {
    expect(skrip).toContain("prefers-reduced-motion");
    // Preferensi dapat berubah selagi halaman terbuka.
    expect(skrip).toContain('addEventListener("change"');
    expect(skrip).toContain("matikan");
  });
  it("menampilkan konten pada peramban tanpa IntersectionObserver", () => {
    expect(skrip).toContain('"IntersectionObserver" in window');
    expect(skrip).toMatch(/classList\.add\("is-revealed"\)/);
  });
  it("tidak menyembunyikan ulang bagian yang sudah tampil", () => {
    expect(skrip).toContain("unobserve");
  });
});
