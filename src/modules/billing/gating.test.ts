import { describe, expect, it } from "vitest";
import { demoInvitation } from "../invitations/domain/invitation";
import { getEntitlements } from "./entitlements";
import { gateContent, mayShowGuestQr, mayTrackGuests } from "./gating";

const content = {
  ...structuredClone(demoInvitation.draft),
  musicUrl: "/media/musik.mp3",
  musicTitle: "Lagu kami",
  videoUrl: "/media/film.mp4",
  youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
  gift: {
    ...structuredClone(demoInvitation.draft.gift),
    enabled: true,
  },
};
const all = getEntitlements({
  plan: { id: "admin", status: "active" },
}).features;

describe("gateContent", () => {
  it("tidak mengubah apa pun bila semua fitur tersedia", () => {
    expect(gateContent(content, all)).toBe(content);
  });

  it("menyembunyikan musik, video, YouTube, dan hadiah sesuai flag tanpa mengubah aslinya", () => {
    const gated = gateContent(content, {
      ...all,
      music: false,
      video: false,
      gift: false,
    });
    expect(gated.musicUrl).toBe("");
    expect(gated.musicTitle).toBe("");
    expect(gated.videoUrl).toBe("");
    expect(gated.youtubeUrl).toBe("");
    expect(gated.gift.enabled).toBe(false);
    expect(gated.groom).toBe(content.groom);
    // Data tersimpan tetap utuh agar kembali tampil saat paket ditingkatkan.
    expect(content.musicUrl).toBe("/media/musik.mp3");
    expect(content.gift.enabled).toBe(true);
  });

  it("menyaring tiap fitur secara terpisah", () => {
    const onlyMusicOff = gateContent(content, { ...all, music: false });
    expect(onlyMusicOff.musicUrl).toBe("");
    expect(onlyMusicOff.videoUrl).toBe(content.videoUrl);
    expect(onlyMusicOff.gift.enabled).toBe(true);
    const onlyVideoOff = gateContent(content, { ...all, video: false });
    expect(onlyVideoOff.videoUrl).toBe("");
    expect(onlyVideoOff.musicUrl).toBe(content.musicUrl);
  });
});

describe("pelacakan tamu dan QR", () => {
  it("kode tamu hanya dikenali bila ada daftar tamu", () => {
    expect(mayTrackGuests(all)).toBe(true);
    expect(mayTrackGuests({ ...all, guestList: false })).toBe(false);
  });

  it("QR hanya tampil bila daftar tamu dan check-in QR sama-sama ada", () => {
    expect(mayShowGuestQr(all)).toBe(true);
    expect(mayShowGuestQr({ ...all, qrCheckin: false })).toBe(false);
    expect(mayShowGuestQr({ ...all, guestList: false })).toBe(false);
  });
});
