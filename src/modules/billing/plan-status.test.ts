import { describe, expect, it } from "vitest";
import { describePlan } from "./plan-status";

const now = Date.parse("2026-10-05T00:00:00Z");
const day = 86_400_000;
const at = (days: number) => new Date(now + days * day).toISOString();
const plan = (d: number) =>
  ({ id: "premium", status: "active", expiresAt: at(d) }) as const;

describe("describePlan", () => {
  it("admin dan uji coba", () => {
    expect(describePlan({ id: "admin", status: "active" }, now).kind).toBe(
      "admin",
    );
    expect(describePlan({ id: "trial", status: "trial" }, now).kind).toBe(
      "trial",
    );
  });

  it("aktif, lalu mendekati berakhir pada 14 hari terakhir", () => {
    expect(describePlan(plan(200), now)).toMatchObject({
      kind: "active",
      daysLeft: 200,
    });
    expect(describePlan(plan(15), now).kind).toBe("active");
    expect(describePlan(plan(14), now)).toMatchObject({
      kind: "expiring",
      daysLeft: 14,
    });
    expect(describePlan(plan(1), now).kind).toBe("expiring");
  });

  it("kedaluwarsa menyertakan sisa masa tenggang", () => {
    expect(describePlan(plan(-1), now)).toMatchObject({
      kind: "expired",
      graceDaysLeft: 29,
    });
    expect(describePlan(plan(-40), now)).toMatchObject({
      kind: "expired",
      graceDaysLeft: 0,
    });
    expect(describePlan({ id: "premium", status: "expired" }, now).kind).toBe(
      "expired",
    );
  });
});
