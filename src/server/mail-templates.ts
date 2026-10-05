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
