import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { formatNotification, notifyOwner } from "./notify";

const activity = {
  invitationTitle: "Raka & Amara",
  guestName: "Sari",
  attendance: "attending" as const,
  attendeeCount: 2,
  wish: "Selamat <b>menempuh</b> hidup baru",
};
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
});
afterEach(() => vi.unstubAllGlobals());

describe("notifyOwner", () => {
  it("tidak melakukan apa pun tanpa env", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    notifyOwner(activity);
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tidak mengirim bila hanya salah satu env terisi", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "123:abc";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    notifyOwner(activity);
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("mengirim teks biasa ke Telegram bila terkonfigurasi", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "123:abc";
    process.env.TELEGRAM_CHAT_ID = "999";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    notifyOwner(activity);
    await flush();
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/bot123:abc/sendMessage");
    const body = JSON.parse(init.body);
    expect(body.chat_id).toBe("999");
    expect(body.parse_mode).toBeUndefined();
    expect(body.text).toContain("Raka & Amara");
    expect(body.text).toContain("Sari");
    expect(body.text).toContain("Hadir (2 orang)");
    expect(body.text).toContain("Selamat <b>menempuh</b> hidup baru");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("tidak melempar galat dan tidak membocorkan token ke log", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "123:secret";
    process.env.TELEGRAM_CHAT_ID = "999";
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValue(
          new TypeError(
            "fetch failed https://api.telegram.org/bot123:secret/x",
          ),
        ),
    );
    expect(() => notifyOwner(activity)).not.toThrow();
    await flush();
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
    log.mockRestore();
  });
});

describe("formatNotification", () => {
  it("menulis tidak hadir tanpa jumlah dan tanpa ucapan", () => {
    const text = formatNotification({
      ...activity,
      attendance: "declined",
      attendeeCount: 0,
      wish: undefined,
    });
    expect(text).toContain("Tidak hadir");
    expect(text).not.toContain("Ucapan");
  });
});
