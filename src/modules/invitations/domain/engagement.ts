import { z } from "zod";
import { csvCell } from "./budget";
import type { Rsvp, Wish } from "./invitation";

/** Balasan kosong berarti menghapus balasan yang ada. */
export const replySchema = z
  .string()
  .trim()
  .max(500, "Balasan maksimal 500 karakter.");

const ATTENDANCE_LABELS: Record<Rsvp["attendance"], string> = {
  attending: "Hadir",
  declined: "Tidak hadir",
};
const WISH_STATUS_LABELS: Record<Wish["status"], string> = {
  approved: "Ditampilkan",
  hidden: "Disembunyikan",
  pending: "Menunggu tinjauan",
};

function toCsv(headers: string[], rows: (string | number)[][]) {
  // BOM agar Excel membaca karakter Indonesia dengan benar.
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function rsvpsToCsv(
  rsvps: Pick<Rsvp, "name" | "attendance" | "attendeeCount" | "updatedAt">[],
) {
  return toCsv(
    ["Nama", "Kehadiran", "Jumlah orang", "Waktu"],
    rsvps.map((r) => [
      r.name,
      ATTENDANCE_LABELS[r.attendance],
      r.attendeeCount,
      r.updatedAt,
    ]),
  );
}

export function wishesToCsv(wishes: Wish[]) {
  return toCsv(
    ["Nama", "Ucapan", "Status", "Balasan", "Waktu"],
    wishes.map((w) => [
      w.name,
      w.message,
      WISH_STATUS_LABELS[w.status],
      w.reply ?? "",
      w.createdAt,
    ]),
  );
}
