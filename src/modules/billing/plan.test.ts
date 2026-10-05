import { describe, expect, it } from "vitest";
import { activatePlan, recordAudit } from "./plan";
import {
  emptyGlobal,
  type Workspace,
} from "../invitations/infrastructure/global-state";

const workspace = (plan: Workspace["plan"]): Workspace => ({
  id: "w1",
  name: "W",
  ownerUserId: "u1",
  createdAt: new Date(0).toISOString(),
  plan,
});
const now = Date.parse("2026-10-05T00:00:00Z");
const day = 86_400_000;

describe("activatePlan", () => {
  it("mengaktifkan dari hari ini untuk ruang kerja uji coba", () => {
    const w = workspace({ id: "trial", status: "trial" });
    activatePlan(w, "premium", 365, now);
    expect(w.plan).toEqual({
      id: "premium",
      status: "active",
      expiresAt: new Date(now + 365 * day).toISOString(),
    });
  });
  it("memperpanjang dari tanggal berakhir bila paket sama masih aktif", () => {
    const end = now + 10 * day;
    const w = workspace({
      id: "premium",
      status: "active",
      expiresAt: new Date(end).toISOString(),
    });
    activatePlan(w, "premium", 30, now);
    expect(w.plan.expiresAt).toBe(new Date(end + 30 * day).toISOString());
  });
  it("mulai dari hari ini saat berganti paket atau paket lama habis", () => {
    const w = workspace({
      id: "esensial",
      status: "active",
      expiresAt: new Date(now + 5 * day).toISOString(),
    });
    activatePlan(w, "premium", 30, now);
    expect(w.plan.expiresAt).toBe(new Date(now + 30 * day).toISOString());
  });
});

describe("recordAudit", () => {
  it("menambah entri dan memangkas log lama", () => {
    const g = emptyGlobal();
    for (let i = 0; i < 2005; i++)
      recordAudit(g, {
        actorUserId: "admin",
        action: "test",
        targetType: "user",
        targetId: String(i),
      });
    expect(g.auditLog).toHaveLength(2000);
    expect(g.auditLog.at(-1)?.targetId).toBe("2004");
  });
});
