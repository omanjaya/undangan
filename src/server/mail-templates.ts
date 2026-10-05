import { getSiteConfig } from "../config/site";
import type { MailMessage } from "./mail";

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

/** Kerangka HTML sederhana bermerek; semua gaya inline agar aman di klien email. */
function layout(brand: string, title: string, body: string, footer: string) {
  return `<!doctype html>
<html lang="id"><body style="margin:0;padding:24px;background:#f8f6f0;font-family:Georgia,'Times New Roman',serif;color:#2b2a24">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:520px;background:#fffdf8;border:1px solid #dbd9cc;border-radius:6px" cellpadding="0" cellspacing="0"><tr><td style="padding:32px">
<p style="margin:0 0 24px;font-size:28px;letter-spacing:-1px;color:#4c593f">${escapeHtml(brand.toLowerCase())}.</p>
<h1 style="margin:0 0 16px;font-size:22px;font-weight:normal">${escapeHtml(title)}</h1>
${body}
<p style="margin:28px 0 0;font-size:12px;line-height:1.7;color:#77796e">${footer}</p>
</td></tr></table></td></tr></table></body></html>`;
}

export const RESET_LINK_MINUTES = 60;

export function passwordResetEmail(input: {
  to: string;
  name: string;
  link: string;
}): MailMessage {
  const { name: brand } = getSiteConfig();
  const subject = `Atur ulang kata sandi ${brand}`;
  const greeting = `Halo ${input.name},`;
  const lead =
    "Kami menerima permintaan untuk mengatur ulang kata sandi akun Anda.";
  const expiry = `Tautan berlaku ${RESET_LINK_MINUTES} menit dan hanya dapat dipakai sekali.`;
  const ignore =
    "Jika bukan Anda yang meminta, abaikan email ini; kata sandi Anda tidak berubah.";
  const text = [
    greeting,
    "",
    lead,
    "Buka tautan berikut untuk memilih kata sandi baru:",
    input.link,
    "",
    expiry,
    ignore,
    "",
    `— ${brand}`,
  ].join("\n");
  const href = escapeHtml(input.link);
  const html = layout(
    brand,
    "Atur ulang kata sandi",
    `<p style="margin:0 0 12px;font-size:15px;line-height:1.7">${escapeHtml(greeting)}</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.7">${lead}</p>
<p style="margin:0 0 20px"><a href="${href}" style="display:inline-block;background:#4c593f;color:#fff;text-decoration:none;padding:13px 22px;border-radius:3px;font-family:Arial,sans-serif;font-size:14px">Pilih kata sandi baru</a></p>
<p style="margin:0 0 8px;font-size:12px;line-height:1.7;color:#77796e;font-family:Arial,sans-serif">Atau salin tautan ini ke peramban:<br><a href="${href}" style="color:#4c593f;word-break:break-all">${href}</a></p>`,
    `${escapeHtml(expiry)}<br>${escapeHtml(ignore)}`,
  );
  return { to: input.to, subject, text, html };
}

const rupiah = (n: number) => "Rp" + n.toLocaleString("id-ID");

/** Email ke pelanggan setelah admin memverifikasi atau menolak pembayaran. */
export function paymentResultEmail(input: {
  to: string;
  name: string;
  number: string;
  packageName: string;
  total: number;
  result: "paid" | "rejected";
  reason?: string;
  expiresAt?: string;
  link: string;
}): MailMessage {
  const { name: brand } = getSiteConfig();
  const paid = input.result === "paid";
  const title = paid
    ? "Pembayaran diterima"
    : "Bukti transfer perlu diperbaiki";
  const subject = `${title} — ${input.number}`;
  const greeting = `Halo ${input.name},`;
  const until = input.expiresAt
    ? new Date(input.expiresAt).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Asia/Makassar",
      })
    : "";
  const lines = paid
    ? [
        `Pembayaran tagihan ${input.number} sebesar ${rupiah(input.total)} sudah kami verifikasi.`,
        `Paket ${input.packageName} kini aktif${until ? ` hingga ${until}` : ""}. Undangan Anda sudah dapat diterbitkan.`,
      ]
    : [
        `Bukti transfer untuk tagihan ${input.number} belum dapat kami verifikasi.`,
        input.reason ? `Alasan: ${input.reason}` : "",
        "Silakan unggah ulang bukti transfer dari halaman tagihan.",
      ].filter(Boolean);
  const cta = paid ? "Buka dashboard" : "Buka tagihan";
  const text = [
    greeting,
    "",
    ...lines,
    "",
    `${cta}: ${input.link}`,
    "",
    `— ${brand}`,
  ].join("\n");
  const href = escapeHtml(input.link);
  const html = layout(
    brand,
    title,
    `<p style="margin:0 0 12px;font-size:15px;line-height:1.7">${escapeHtml(greeting)}</p>
${lines.map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.7">${escapeHtml(l)}</p>`).join("\n")}
<p style="margin:20px 0 0"><a href="${href}" style="display:inline-block;background:#4c593f;color:#fff;text-decoration:none;padding:13px 22px;border-radius:3px;font-family:Arial,sans-serif;font-size:14px">${cta}</a></p>`,
    escapeHtml(`Email ini dikirim otomatis oleh ${brand}.`),
  );
  return { to: input.to, subject, text, html };
}
