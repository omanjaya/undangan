import { randomInt } from "node:crypto";

// Tanpa 0/O, 1/l/I agar mudah dibaca dan diketik dari pesan WhatsApp.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Kata sandi sementara acak (kriptografis), 12 karakter. */
export function generateTempPassword(length = 12) {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export function whatsappMessage(input: {
  name: string;
  loginUrl: string;
  email: string;
  password: string;
}) {
  return [
    `Halo ${input.name},`,
    "",
    "Akun undangan digital Anda di Temu sudah siap.",
    `Masuk di: ${input.loginUrl}`,
    `Email: ${input.email}`,
    `Kata sandi sementara: ${input.password}`,
    "",
    "Mohon ganti kata sandi setelah masuk. Terima kasih.",
  ].join("\n");
}

/** Tautan wa.me; 08xx diubah ke 628xx. Null bila nomor tidak layak. */
export function whatsappLink(phone: string | undefined, message: string) {
  let digits = (phone || "").replace(/\D/g, "");
  if (digits.startsWith("0")) digits = "62" + digits.slice(1);
  else if (digits.startsWith("8")) digits = "62" + digits;
  if (digits.length < 9) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
