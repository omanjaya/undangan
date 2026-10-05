import nodemailer from "nodemailer";

/**
 * Pengiriman email lewat SMTP (nodemailer). Dikonfigurasi lewat environment:
 * SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE, MAIL_FROM.
 *
 * Bila SMTP belum dikonfigurasi:
 *  - development: email dicatat ke konsol server (judul dan tautan) dan
 *    disimpan di memori agar tes e2e dapat membacanya (lihat `lastMailTo`);
 *  - production: peringatan dicatat dan pengiriman gagal dengan tenang
 *    (`delivered: false`), tanpa melempar galat ke pengguna.
 */
export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type MailResult =
  | { delivered: true }
  | { delivered: false; reason: "not-configured" | "failed" };

type Env = Record<string, string | undefined>;

export function smtpConfigured(env: Env = process.env) {
  return !!(env.SMTP_HOST?.trim() && env.MAIL_FROM?.trim());
}

/** Mode pengembangan lokal: bukan production dan tidak memakai PostgreSQL. */
export function isLocalDevelopment(env: Env = process.env) {
  return env.NODE_ENV !== "production" && !env.DATABASE_URL;
}

/**
 * Apakah email dapat sampai ke pengguna. Di development tanpa SMTP, email
 * "terkirim" ke konsol sehingga alur tetap dapat dicoba.
 */
export function mailAvailable(env: Env = process.env) {
  return smtpConfigured(env) || isLocalDevelopment(env);
}

// Kotak keluar development: disimpan di globalThis agar dipakai bersama oleh
// semua modul yang dimuat terpisah oleh bundler.
const OUTBOX = Symbol.for("temu.devOutbox");
type Outbox = { messages: (MailMessage & { at: number })[] };
function outbox(): Outbox {
  const holder = globalThis as unknown as Record<symbol, Outbox | undefined>;
  return (holder[OUTBOX] ??= { messages: [] });
}

/** Email terakhir ke alamat tertentu; hanya terisi saat mode lokal tanpa SMTP. */
export function lastMailTo(to: string) {
  const email = to.trim().toLowerCase();
  return (
    [...outbox().messages]
      .reverse()
      .find((m) => m.to.toLowerCase() === email) ?? null
  );
}

export function clearDevOutbox() {
  outbox().messages = [];
}

let cached:
  | { key: string; transport: ReturnType<typeof nodemailer.createTransport> }
  | undefined;
function transportFor(env: Env) {
  const port = Number(env.SMTP_PORT) || 587;
  const secure = /^(1|true|yes)$/i.test(env.SMTP_SECURE ?? "") || port === 465;
  const key = [env.SMTP_HOST, port, secure, env.SMTP_USER, env.SMTP_PASS].join(
    "|",
  );
  if (cached?.key !== key)
    cached = {
      key,
      transport: nodemailer.createTransport({
        host: env.SMTP_HOST,
        port,
        secure,
        ...(env.SMTP_USER
          ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS ?? "" } }
          : {}),
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
      }),
    };
  return cached.transport;
}

const firstLink = (text: string) => /https?:\/\/\S+/.exec(text)?.[0];

export async function sendMail(
  message: MailMessage,
  env: Env = process.env,
): Promise<MailResult> {
  if (!smtpConfigured(env)) {
    if (isLocalDevelopment(env)) {
      const box = outbox();
      box.messages.push({ ...message, at: Date.now() });
      if (box.messages.length > 50) box.messages.shift();
      console.info(
        `[mail] SMTP belum dikonfigurasi; email dicatat di konsol.\n  Kepada: ${message.to}\n  Judul: ${message.subject}\n  Tautan: ${firstLink(message.text) ?? "-"}`,
      );
    } else {
      console.warn(
        "[mail] SMTP belum dikonfigurasi (SMTP_HOST, MAIL_FROM); email tidak dikirim.",
      );
    }
    return { delivered: false, reason: "not-configured" };
  }
  try {
    await transportFor(env).sendMail({
      from: env.MAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { delivered: true };
  } catch (error) {
    console.error(
      "[mail] Pengiriman gagal:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return { delivered: false, reason: "failed" };
  }
}
