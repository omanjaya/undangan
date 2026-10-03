import { describe, it, expect } from "vitest";
import { normalizeState, type State } from "./store";
import { demoInvitation } from "../domain/invitation";

const stateDengan = (budget: unknown[]) =>
  ({
    invitations: [structuredClone(demoInvitation)],
    rsvps: [],
    wishes: [],
    revisions: [],
    budget,
    budgetSettings: { cap: 0 },
  }) as unknown as State;

describe("ketahanan state anggaran", () => {
  it("tidak melempar karena pos anggaran rusak", () => {
    // Anggaran yang rusak tidak boleh ikut menjatuhkan halaman undangan tamu.
    const hasil = normalizeState(
      stateDengan([
        { id: "a", name: "", estimate: -5, paid: "bukan angka" },
        { id: "b", name: "Banten", estimate: 1000 },
      ]),
    );
    expect(hasil.budget).toHaveLength(2);
    expect(hasil.budget?.[0].name).toBe("Pos tanpa nama");
    expect(hasil.budget?.[0].estimate).toBe(0);
    expect(hasil.budget?.[0].paid).toBe(0);
    expect(hasil.budget?.[1].estimate).toBe(1000);
  });
  it("memulihkan id dan cap waktu yang hilang", () => {
    const hasil = normalizeState(stateDengan([{ name: "Tanpa id" }]));
    const pos = hasil.budget![0];
    expect(pos.id).toMatch(/[0-9a-f-]{36}/);
    expect(pos.createdAt).toBeTruthy();
    expect(pos.updatedAt).toBe(pos.createdAt);
  });
  it("membuang entri yang bukan objek dan pagu yang tidak sah", () => {
    const hasil = normalizeState({
      ...stateDengan(["bukan objek", null, 42]),
      budgetSettings: { cap: -1 },
    } as unknown as State);
    expect(hasil.budget).toHaveLength(0);
    expect(hasil.budgetSettings).toEqual({ cap: 0 });
  });
  it("idempoten: normalisasi kedua tidak mengubah apa pun", () => {
    const sekali = normalizeState(stateDengan([{ name: "Banten", paid: 5 }]));
    const salinan = JSON.stringify(sekali.budget);
    expect(JSON.stringify(normalizeState(sekali).budget)).toBe(salinan);
  });
});
