import { describe, it, expect } from "vitest";
import { parseGuestList } from "./guests-import";
import { guestsToCsv, type GuestView } from "./guests";

describe("impor daftar tamu", () => {
  it("membaca baris koma tanpa header", () => {
    const { guests, errors } = parseGuestList(
      "Bapak Made, 081234567890, Keluarga\nIbu Sari, 0812-9999-0000, Kolega\n",
    );
    expect(errors).toEqual([]);
    expect(guests).toEqual([
      {
        name: "Bapak Made",
        phone: "6281234567890",
        group: "Keluarga",
        maxPax: null,
      },
      {
        name: "Ibu Sari",
        phone: "6281299990000",
        group: "Kolega",
        maxPax: null,
      },
    ]);
  });
  it("mengenali header, urutan kolom bebas, titik koma, dan BOM", () => {
    const { guests } = parseGuestList(
      "﻿Grup;Nama;WhatsApp;Jatah orang\nKeluarga;Made;0812 3456 7890;2\n",
    );
    expect(guests).toEqual([
      { name: "Made", phone: "6281234567890", group: "Keluarga", maxPax: 2 },
    ]);
  });
  it("mendukung tab dan sel berkutip yang memuat pemisah", () => {
    expect(parseGuestList("Made\t0812345678901\tTeman").guests[0].group).toBe(
      "Teman",
    );
    const { guests } = parseGuestList(
      '"Sari, S.H.",0812345678901,"Kolega ""lama"""',
    );
    expect(guests[0]).toMatchObject({
      name: "Sari, S.H.",
      group: 'Kolega "lama"',
    });
  });
  it("baris hanya nama tetap diterima tanpa nomor", () => {
    expect(parseGuestList("Made").guests).toEqual([
      { name: "Made", phone: "", group: "", maxPax: null },
    ]);
  });
  it("melaporkan nomor dan jatah tak sah tanpa membuang tamunya", () => {
    const { guests, errors } = parseGuestList("Made, 12ab, Keluarga, 9");
    expect(guests).toEqual([
      { name: "Made", phone: "", group: "Keluarga", maxPax: null },
    ]);
    expect(errors.map((e) => e.line)).toEqual([1, 1]);
  });
  it("melewati baris tanpa nama dan baris kosong, mencatat nomor baris", () => {
    const { guests, errors } = parseGuestList("\n,0812345678901,X\nMade\n");
    expect(guests.length).toBe(1);
    expect(errors).toEqual([
      { line: 2, message: "Nama kosong, baris dilewati." },
    ]);
  });
  it("membatasi jumlah baris", () => {
    const text = Array.from({ length: 600 }, (_, i) => `Tamu ${i}`).join("\n");
    const { guests, errors } = parseGuestList(text);
    expect(guests.length).toBe(500);
    expect(errors.at(-1)?.message).toContain("500");
  });
  it("ekspor lalu impor mengembalikan tamu yang sama, termasuk rumus", () => {
    const view = {
      id: "g",
      invitationId: "i",
      code: "abcdefghjk",
      name: "=SUM(A1)",
      phone: "6281234567890",
      group: "Kantor",
      maxPax: 3,
      sentAt: null,
      firstOpenedAt: null,
      openCount: 0,
      checkedInAt: null,
      createdAt: "",
      updatedAt: "",
      rsvp: null,
      status: "belum-dikirim",
      pax: 3,
    } satisfies GuestView;
    const csv = guestsToCsv([view], () => "https://x/i/y?to=a,b&g=abcdefghjk");
    expect(parseGuestList(csv).guests).toEqual([
      { name: "=SUM(A1)", phone: "6281234567890", group: "Kantor", maxPax: 3 },
    ]);
  });
});
