import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMailSpy = vi.fn();
vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail: sendMailSpy }) },
}));

import {
  clearDevOutbox,
  isLocalDevelopment,
  lastMailTo,
  mailAvailable,
  sendMail,
  smtpConfigured,
} from "./mail";
import { passwordResetEmail } from "./mail-templates";

const message = {
  to: "Orang@Example.test",
  subject: "Judul",
  text: "Buka https://temu.test/reset-sandi?token=abc untuk lanjut",
  html: "<p>x</p>",
};

beforeEach(() => {
  clearDevOutbox();
  sendMailSpy.mockReset();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("konfigurasi email", () => {
  it("SMTP dianggap siap bila SMTP_HOST dan MAIL_FROM terisi", () => {
    expect(smtpConfigured({})).toBe(false);
    expect(smtpConfigured({ SMTP_HOST: "smtp.test" })).toBe(false);
    expect(
      smtpConfigured({ SMTP_HOST: "smtp.test", MAIL_FROM: "Temu <a@b.test>" }),
    ).toBe(true);
  });

  it("mode lokal hanya bila bukan production dan tanpa DATABASE_URL", () => {
    expect(isLocalDevelopment({ NODE_ENV: "development" })).toBe(true);
    expect(isLocalDevelopment({ NODE_ENV: "production" })).toBe(false);
    expect(
      isLocalDevelopment({
        NODE_ENV: "development",
        DATABASE_URL: "postgres://x",
      }),
    ).toBe(false);
    expect(mailAvailable({ NODE_ENV: "production" })).toBe(false);
    expect(
      mailAvailable({
        NODE_ENV: "production",
        SMTP_HOST: "h",
        MAIL_FROM: "a@b.test",
      }),
    ).toBe(true);
  });
});

describe("pengiriman email", () => {
  it("development tanpa SMTP: mencatat judul dan tautan ke konsol dan kotak keluar", async () => {
    const result = await sendMail(message, { NODE_ENV: "development" });
    expect(result).toEqual({ delivered: false, reason: "not-configured" });
    const log = String(vi.mocked(console.info).mock.calls[0][0]);
    expect(log).toContain("Judul");
    expect(log).toContain("https://temu.test/reset-sandi?token=abc");
    expect(lastMailTo("orang@example.test")?.subject).toBe("Judul");
    expect(sendMailSpy).not.toHaveBeenCalled();
  });

  it("production tanpa SMTP: gagal tenang dengan peringatan, tanpa menyimpan email", async () => {
    const result = await sendMail(message, { NODE_ENV: "production" });
    expect(result).toEqual({ delivered: false, reason: "not-configured" });
    expect(console.warn).toHaveBeenCalled();
    expect(lastMailTo(message.to)).toBeNull();
  });

  it("dengan SMTP: mengirim lewat transport dengan pengirim dari MAIL_FROM", async () => {
    sendMailSpy.mockResolvedValue({});
    const result = await sendMail(message, {
      NODE_ENV: "production",
      SMTP_HOST: "smtp.test",
      SMTP_PORT: "465",
      SMTP_USER: "u",
      SMTP_PASS: "p",
      MAIL_FROM: "Temu <halo@temu.test>",
    });
    expect(result).toEqual({ delivered: true });
    expect(sendMailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Temu <halo@temu.test>",
        to: message.to,
      }),
    );
  });

  it("galat SMTP tidak dilempar ke pemanggil", async () => {
    sendMailSpy.mockRejectedValue(new Error("koneksi ditolak"));
    const result = await sendMail(message, {
      NODE_ENV: "production",
      SMTP_HOST: "smtp.test",
      MAIL_FROM: "a@b.test",
    });
    expect(result).toEqual({ delivered: false, reason: "failed" });
  });
});

describe("templat email atur ulang", () => {
  it("memuat tautan pada teks dan HTML serta meloloskan nama berbahaya", () => {
    const mail = passwordResetEmail({
      to: "a@b.test",
      name: '<img src=x onerror="alert(1)">',
      link: "https://temu.test/reset-sandi?token=abc",
    });
    expect(mail.text).toContain("https://temu.test/reset-sandi?token=abc");
    expect(mail.html).toContain(
      'href="https://temu.test/reset-sandi?token=abc"',
    );
    expect(mail.html).not.toContain("<img");
    expect(mail.subject).toMatch(/kata sandi/i);
  });
});
