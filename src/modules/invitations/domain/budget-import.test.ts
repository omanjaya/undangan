import { describe, it, expect } from "vitest";
import { budgetToCsv, type BudgetItem } from "./budget";
import { BUDGET_IMPORT_MAX_ROWS, parseBudgetCsv } from "./budget-import";

const item = (over: Partial<BudgetItem>): BudgetItem => ({
  id: over.id || "x",
  category: "lainnya",
  bearer: "bersama",
  name: "Pos",
  vendor: "",
  estimate: 0,
  actual: null,
  paid: 0,
  dueDate: "",
  note: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

const HEADER =
  "Kategori,Pos,Penanggung,Vendor,Estimasi,Realisasi,Dibayar,Kekurangan,Status,Jatuh tempo,Catatan";

describe("impor anggaran dari CSV", () => {
  it("mengembalikan pos yang sama dengan hasil ekspor", () => {
    const items = [
      item({
        category: "upakara",
        bearer: "pria",
        name: "Banten pawiwahan",
        vendor: "Griya Sari",
        estimate: 18000000,
        actual: 17500000,
        paid: 5000000,
        dueDate: "2026-09-28",
        note: "Sudah DP",
      }),
      item({
        category: "katering",
        bearer: "wanita",
        name: "Prasmanan tamu",
        estimate: 42000000,
      }),
    ];
    const { items: parsed, errors } = parseBudgetCsv(budgetToCsv(items));
    expect(errors).toEqual([]);
    expect(parsed).toEqual(
      items.map(({ id, createdAt, updatedAt, ...input }) => input),
    );
  });

  it("melepas apostrof pengaman pada nilai berawalan tanda rumus", () => {
    const csv = budgetToCsv([item({ name: "Pos", note: "=1+1 catatan" })]);
    expect(parseBudgetCsv(csv).items[0]?.note).toBe("=1+1 catatan");
  });

  it("membaca field berkutip yang memuat koma dan baris baru", () => {
    const csv = `${HEADER}\n"katering","Prasmanan, tumpeng","bersama","Dapur Bali",1000,0,0,1000,belum,,"Catatan baris satu\nbaris dua"\n`;
    const { items: parsed, errors } = parseBudgetCsv(csv);
    expect(errors).toEqual([]);
    expect(parsed[0]?.name).toBe("Prasmanan, tumpeng");
    expect(parsed[0]?.note).toBe("Catatan baris satu\nbaris dua");
  });

  it("melewati BOM dan akhir baris CRLF", () => {
    const csv = `﻿${HEADER}\r\nupakara,Banten,pria,,1000,0,0,1000,belum,,\r\ntempat,Penjor,wanita,,2000,0,0,2000,belum,,\r\n`;
    const { items: parsed, errors } = parseBudgetCsv(csv);
    expect(errors).toEqual([]);
    expect(parsed.map((i) => i.name)).toEqual(["Banten", "Penjor"]);
    expect(parsed[0]?.category).toBe("upakara");
  });

  it("menerima label Indonesia maupun kunci enum", () => {
    const csv = `${HEADER}\n"Upakara & Banten",Banten,Keluarga mempelai pria,,0,0,0,0,belum,,\nhiburan,Gamelan,wanita,,0,0,0,0,belum,,\n`;
    const { items: parsed } = parseBudgetCsv(csv);
    expect(parsed[0]).toMatchObject({ category: "upakara", bearer: "pria" });
    expect(parsed[1]).toMatchObject({ category: "hiburan", bearer: "wanita" });
  });

  it("memakai nilai bawaan dan memperingatkan kategori atau penanggung asing", () => {
    const csv = `${HEADER}\nKatring,Nasi kotak,Paman,,0,0,0,0,belum,,\n`;
    const { items: parsed, errors } = parseBudgetCsv(csv);
    expect(parsed[0]).toMatchObject({ category: "lainnya", bearer: "bersama" });
    expect(errors).toHaveLength(2);
    expect(errors.every((e) => e.line === 2)).toBe(true);
  });

  it("membaca rupiah bertitik dan berawalan Rp, sel kosong jadi nol", () => {
    const csv = `${HEADER}\nupakara,Banten,bersama,,"Rp 18.000.000","18.500.000",,0,belum,,\n`;
    const { items: parsed, errors } = parseBudgetCsv(csv);
    expect(errors).toEqual([]);
    expect(parsed[0]).toMatchObject({
      estimate: 18000000,
      actual: 18500000,
      paid: 0,
    });
  });

  it("melewati baris rusak tanpa menggagalkan baris lain", () => {
    const csv = [
      HEADER,
      "upakara,Banten,bersama,,1000,0,0,1000,belum,,",
      "upakara,,bersama,,1000,0,0,1000,belum,,",
      "upakara,Penjor,bersama,,-5000,0,0,0,belum,,",
      "upakara,Gamelan,bersama,,seribu,0,0,0,belum,,",
      "katering,Prasmanan,bersama,,2000,0,0,2000,belum,,",
    ].join("\n");
    const { items: parsed, errors } = parseBudgetCsv(csv);
    expect(parsed.map((i) => i.name)).toEqual(["Banten", "Prasmanan"]);
    expect(errors.map((e) => e.line)).toEqual([3, 4, 5]);
    expect(errors[0]?.message).toContain("Nama pos kosong");
  });

  it("mengosongkan jatuh tempo yang tidak terbaca dan menerima format harian", () => {
    const csv = `${HEADER}\nupakara,Banten,bersama,,0,0,0,0,belum,28/09/2026,\nupakara,Penjor,bersama,,0,0,0,0,belum,28 Sep 2026,\n`;
    const { items: parsed, errors } = parseBudgetCsv(csv);
    expect(parsed[0]?.dueDate).toBe("2026-09-28");
    expect(parsed[1]?.dueDate).toBe("");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("Jatuh tempo");
  });

  it("membaca berkas tanpa baris header memakai urutan kolom ekspor", () => {
    const { items: parsed, errors } = parseBudgetCsv(
      "upakara,Banten,pria,Griya Sari,1000,0,0,1000,belum,,\n",
    );
    expect(errors).toEqual([]);
    expect(parsed[0]).toMatchObject({
      category: "upakara",
      name: "Banten",
      bearer: "pria",
      vendor: "Griya Sari",
    });
  });

  it("mengabaikan baris di atas batas dengan satu pesan", () => {
    const rows = Array.from(
      { length: BUDGET_IMPORT_MAX_ROWS + 5 },
      (_, i) => `upakara,Pos ${i + 1},bersama,,1000,0,0,1000,belum,,`,
    );
    const { items: parsed, errors } = parseBudgetCsv(
      [HEADER, ...rows].join("\r\n"),
    );
    expect(parsed).toHaveLength(BUDGET_IMPORT_MAX_ROWS);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain(String(BUDGET_IMPORT_MAX_ROWS));
  });
});
describe("perbaikan hasil audit", () => {
  const head =
    "Kategori,Pos,Penanggung,Vendor,Estimasi,Realisasi,Dibayar,Kekurangan,Status,Jatuh tempo,Catatan";
  // Nilai dikutip karena pemisah ribuan koma sendiri adalah pemisah kolom CSV.
  const estimasi = (nilai: string) =>
    parseBudgetCsv(`${head}\nkatering,Pos,bersama,,"${nilai}",,0,0,belum,,`);

  it("membedakan pemisah ribuan dari titik desimal", () => {
    // Spreadsheet berlokal Inggris menulis "1500.00"; dulu terbaca 150000.
    expect(estimasi("1500.00").items[0].estimate).toBe(1500);
    expect(estimasi("0.5").items[0].estimate).toBe(1);
    expect(estimasi("18.000.000").items[0].estimate).toBe(18000000);
    expect(estimasi("18,000,000").items[0].estimate).toBe(18000000);
    expect(estimasi("1,500.75").items[0].estimate).toBe(1501);
    expect(estimasi("Rp 2.500.000").items[0].estimate).toBe(2500000);
  });
  it("menolak nilai yang bukan angka", () => {
    expect(estimasi("abc").items).toHaveLength(0);
    expect(estimasi("5e3").items).toHaveLength(0);
  });
  it("tidak memasukkan baris header asing sebagai pos", () => {
    const hasil = parseBudgetCsv("Nama,Jumlah\nBanten,5000");
    expect(hasil.items.map((i) => i.name)).not.toContain("Jumlah");
    expect(hasil.items.map((i) => i.name)).not.toContain("5000");
  });
  it("tidak terpancing nama milik prototipe objek", () => {
    const hasil = parseBudgetCsv("constructor,__proto__\nBanten,5000");
    expect(hasil.items.every((i) => typeof i.name === "string")).toBe(true);
    expect(Object.hasOwn({}, "polusi")).toBe(false);
  });
  it("memulihkan apostrof pengguna lewat ekspor lalu impor", () => {
    const hasil = parseBudgetCsv(
      budgetToCsv([item({ name: "'catatan manual" })]),
    );
    expect(hasil.items[0].name).toBe("'catatan manual");
  });
});
