/**
 * Notifikasi ke pemilik undangan. Saluran lain (misalnya email) cukup
 * ditambahkan sebagai pengirim baru di `senders`.
 */
export type GuestActivity = {
  invitationTitle: string;
  guestName: string;
  attendance: "attending" | "declined";
  attendeeCount: number;
  wish?: string;
};

export function formatNotification(a: GuestActivity) {
  const lines = [
    `Tanggapan baru untuk undangan ${a.invitationTitle}`,
    `Tamu: ${a.guestName}`,
    a.attendance === "attending"
      ? `Kehadiran: Hadir (${a.attendeeCount} orang)`
      : "Kehadiran: Tidak hadir",
  ];
  if (a.wish) lines.push("", `Ucapan: ${a.wish}`);
  return lines.join("\n");
}

async function sendTelegram(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    // Teks biasa tanpa parse_mode, sehingga isi ucapan tidak perlu di-escape.
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: text.slice(0, 4000),
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok)
      console.error("Notifikasi Telegram gagal: HTTP", response.status);
  } catch (e) {
    // Pesan galat fetch dapat memuat URL berisi token, jadi hanya nama galat dicatat.
    console.error(
      "Notifikasi Telegram gagal:",
      e instanceof Error ? e.name : "Unknown error",
    );
  }
}

const senders: ((text: string) => Promise<void>)[] = [sendTelegram];

/** Fire-and-forget: tidak pernah menunda maupun menggagalkan pemanggil. */
export function notifyOwner(activity: GuestActivity) {
  const text = formatNotification(activity);
  for (const send of senders) void send(text).catch(() => {});
}
