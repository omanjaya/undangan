import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  validateMediaReferences,
  referencedMedia,
  uploadDirectory,
} from "./media";
import { randomUUID } from "node:crypto";
import {
  replySchema,
  rsvpsToCsv,
  wishesToCsv,
} from "../modules/invitations/domain/engagement";
import { notifyOwner, type GuestActivity } from "./notify";
import {
  authorize,
  contentSchema,
  DomainError,
  rsvpSchema,
  type Invitation,
} from "../modules/invitations/domain/invitation";
import { findGuestByCode } from "../modules/invitations/domain/guests";
import {
  readState,
  mutateState,
  type State,
} from "../modules/invitations/infrastructure/store";
export type Actor = { id: string; workspaceId: string; email: string };
export function matchesSlug(invitation: Invitation, slug: string) {
  return invitation.slug === slug || !!invitation.aliases?.includes(slug);
}
/** Cari undangan berdasarkan slug aktif maupun alamat lamanya. */
export function findBySlug(state: State, slug: string) {
  return state.invitations.find((i) => matchesSlug(i, slug)) || null;
}
function requireBySlug(state: State, slug: string) {
  const invitation = findBySlug(state, slug);
  if (!invitation) throw new DomainError("Undangan tidak ditemukan.", 404);
  return invitation;
}
export async function getInvitation(slug = "amara-raka", _preview = false) {
  return findBySlug(await readState(), slug);
}
export async function getPublished(slug: string) {
  const invitation = await getInvitation(slug);
  if (invitation?.status !== "published" || !invitation.published) return null;
  // Isi yang tidak lolos skema tidak disajikan ke tamu, tetapi kegagalannya
  // dibatasi pada undangan ini saja.
  const content = contentSchema.safeParse(invitation.published);
  return content.success ? content.data : null;
}
export async function getDashboardData(actor: Actor | null, slug?: string) {
  const state = await readState();
  if (!state.invitations.length)
    throw new DomainError("Belum ada undangan.", 404);
  const invitation = slug ? requireBySlug(state, slug) : state.invitations[0];
  authorize(actor, invitation);
  const rsvps = state.rsvps.filter((r) => r.invitationId === invitation.id);
  const wishes = state.wishes.filter((w) => w.invitationId === invitation.id);
  return {
    invitation,
    invitations: state.invitations.map((i) => ({
      id: i.id,
      slug: i.slug,
      status: i.status,
      title: `${i.draft?.groom ?? ""} & ${i.draft?.bride ?? ""}`.trim(),
      ceremonyTitle: i.draft?.ceremonyTitle ?? "",
      date: i.draft?.date ?? "",
    })),
    rsvps: rsvps.map(({ visitorId: _, ...r }) => r),
    wishes,
    stats: {
      responses: rsvps.length,
      attending: rsvps.filter((r) => r.attendance === "attending").length,
      declined: rsvps.filter((r) => r.attendance === "declined").length,
      guests: rsvps.reduce((n, r) => n + r.attendeeCount, 0),
      pendingWishes: wishes.filter((w) => w.status === "pending").length,
    },
  };
}
export async function saveDraft(
  actor: Actor | null,
  input: { slug: string; lockVersion: number; content: unknown },
) {
  const content = contentSchema.parse(input.content);
  return mutateState((state) => {
    const invitation = requireBySlug(state, input.slug);
    authorize(actor, invitation);
    if (invitation.lockVersion !== input.lockVersion)
      throw new DomainError(
        "Draft telah berubah. Muat ulang sebelum menyimpan.",
        409,
      );
    invitation.draft = content;
    invitation.lockVersion++;
    invitation.updatedAt = new Date().toISOString();
    return invitation;
  });
}
export async function publishInvitation(actor: Actor | null, slug: string) {
  const snapshot = await readState();
  const current = requireBySlug(snapshot, slug);
  authorize(actor, current);
  validateMediaReferences(snapshot, current.draft);
  for (const reference of referencedMedia(current.draft)) {
    const asset = snapshot.assets!.find((a) => a.url === reference.url)!;
    try {
      await stat(resolve(uploadDirectory(), asset.filename));
    } catch {
      throw new DomainError(
        "Berkas media hilang. Unggah ulang sebelum menerbitkan.",
      );
    }
  }
  return mutateState((state) => {
    const invitation = requireBySlug(state, slug);
    authorize(actor, invitation);
    if (current.lockVersion !== invitation.lockVersion)
      throw new DomainError(
        "Draft telah berubah. Muat ulang sebelum menerbitkan.",
        409,
      );
    const content = contentSchema.parse(invitation.draft);
    validateMediaReferences(state, content);
    invitation.published = structuredClone(content);
    invitation.status = "published";
    invitation.revision++;
    invitation.updatedAt = new Date().toISOString();
    state.revisions.push({
      invitationId: invitation.id,
      revision: invitation.revision,
      content,
      createdAt: invitation.updatedAt,
    });
    return invitation;
  });
}
export async function unpublishInvitation(actor: Actor | null, slug: string) {
  return mutateState((state) => {
    const invitation = requireBySlug(state, slug);
    authorize(actor, invitation);
    invitation.status = "draft";
    invitation.updatedAt = new Date().toISOString();
    return invitation;
  });
}
export async function submitRsvp(
  slug: string,
  input: unknown,
  visitorId: string,
  guestCode?: unknown,
) {
  const data = rsvpSchema.parse(input);
  let activity: GuestActivity | null = null;
  const result = await mutateState((state) => {
    const i = findBySlug(state, slug);
    if (!i || i.status !== "published")
      throw new DomainError("Undangan tidak tersedia.", 404);
    // Kode tamu yang tidak dikenal diabaikan: RSVP tetap diterima seperti
    // biasa, hanya tidak tertaut ke daftar tamu.
    const guest = findGuestByCode(state.guests, i.id, guestCode);
    if (
      guest?.maxPax &&
      data.attendance === "attending" &&
      data.attendeeCount > guest.maxPax
    )
      throw new DomainError(
        `Jatah undangan ini maksimal ${guest.maxPax} orang.`,
      );
    // Satu perangkat bisa dipakai beberapa tamu, jadi RSVP bertaut tamu dicari
    // lewat tamunya dulu; cookie hanya menyambung RSVP yang belum bertaut ke
    // tamu lain.
    const previous = guest
      ? (state.rsvps.find(
          (r) => r.guestId === guest.id && r.invitationId === i.id,
        ) ??
        state.rsvps.find(
          (r) =>
            r.visitorId === visitorId && r.invitationId === i.id && !r.guestId,
        ))
      : state.rsvps.find(
          (r) => r.visitorId === visitorId && r.invitationId === i.id,
        );
    const guestId = guest?.id ?? previous?.guestId;
    const rsvp = {
      id: previous?.id || randomUUID(),
      invitationId: i.id,
      visitorId,
      name: data.name,
      attendance: data.attendance,
      attendeeCount: data.attendance === "declined" ? 0 : data.attendeeCount,
      ...(guestId ? { guestId } : {}),
      updatedAt: new Date().toISOString(),
    };
    if (previous) state.rsvps[state.rsvps.indexOf(previous)] = rsvp;
    else state.rsvps.push(rsvp);
    // Tamu yang memperbarui kehadirannya biasanya mengirim ulang ucapan yang
    // sama; jangan sampai muncul ganda di antrean moderasi.
    const duplicateWish = state.wishes.some(
      (w) =>
        w.invitationId === i.id &&
        w.name === data.name &&
        w.message === data.message,
    );
    if (data.message && !duplicateWish)
      state.wishes.push({
        id: randomUUID(),
        invitationId: i.id,
        name: data.name,
        message: data.message,
        status: "pending",
        createdAt: rsvp.updatedAt,
      });
    activity = {
      invitationTitle:
        `${i.draft?.groom ?? ""} & ${i.draft?.bride ?? ""}`.trim(),
      guestName: rsvp.name,
      attendance: rsvp.attendance,
      attendeeCount: rsvp.attendeeCount,
      wish: data.message || undefined,
    };
    return {
      id: rsvp.id,
      message:
        "Terima kasih. Konfirmasi Anda tersimpan. Ucapan akan ditampilkan setelah disetujui.",
    };
  });
  // Setelah data tersimpan dan tanpa ditunggu, agar tamu tidak ikut terhambat.
  if (activity) notifyOwner(activity);
  return result;
}
export async function getWishes(slug: string) {
  const state = await readState();
  const invitation = findBySlug(state, slug);
  if (!invitation || invitation.status !== "published") return [];
  return state.wishes
    .filter((w) => w.invitationId === invitation.id && w.status === "approved")
    .map((w) => ({
      id: w.id,
      name: w.name,
      message: w.message,
      createdAt: w.createdAt,
      ...(w.reply ? { reply: w.reply } : {}),
    }));
}
export async function moderateWish(
  actor: Actor | null,
  id: string,
  status: "approved" | "hidden",
) {
  return mutateState((state) => {
    const wish = state.wishes.find((w) => w.id === id);
    const invitation = state.invitations.find(
      (i) => i.id === wish?.invitationId,
    );
    if (!wish || !invitation)
      throw new DomainError("Ucapan tidak ditemukan.", 404);
    authorize(actor, invitation);
    wish.status = status;
    return wish;
  });
}

function findWish(state: State, id: string) {
  const wish = state.wishes.find((w) => w.id === id);
  const invitation = state.invitations.find((i) => i.id === wish?.invitationId);
  if (!wish || !invitation)
    throw new DomainError("Ucapan tidak ditemukan.", 404);
  return { wish, invitation };
}

export async function deleteWish(actor: Actor | null, id: string) {
  return mutateState((state) => {
    const { wish, invitation } = findWish(state, id);
    authorize(actor, invitation);
    state.wishes = state.wishes.filter((w) => w !== wish);
    return { id: wish.id, deleted: true };
  });
}

/** Balasan kosong menghapus balasan yang ada. */
export async function replyToWish(
  actor: Actor | null,
  id: string,
  reply: unknown,
) {
  const text = replySchema.parse(reply ?? "");
  return mutateState((state) => {
    const { wish, invitation } = findWish(state, id);
    authorize(actor, invitation);
    if (text) {
      wish.reply = text;
      wish.repliedAt = new Date().toISOString();
    } else {
      delete wish.reply;
      delete wish.repliedAt;
    }
    return wish;
  });
}

export async function exportRsvpCsv(actor: Actor | null, slug: string) {
  const state = await readState();
  const invitation = requireBySlug(state, slug);
  authorize(actor, invitation);
  const rows = state.rsvps.filter((r) => r.invitationId === invitation.id);
  return { slug: invitation.slug, csv: rsvpsToCsv(rows) };
}

export async function exportWishesCsv(actor: Actor | null, slug: string) {
  const state = await readState();
  const invitation = requireBySlug(state, slug);
  authorize(actor, invitation);
  const rows = state.wishes.filter((w) => w.invitationId === invitation.id);
  return { slug: invitation.slug, csv: wishesToCsv(rows) };
}

export async function renameInvitation(
  actor: Actor | null,
  slug: string,
  newSlug: unknown,
) {
  return mutateState((state) => {
    const invitation = requireBySlug(state, slug);
    authorize(actor, invitation);
    if (invitation.slug !== slug)
      throw new DomainError(
        "Alamat undangan telah berubah. Muat ulang halaman.",
        409,
      );
    if (
      state.invitations.some(
        (i) => i !== invitation && matchesSlug(i, newSlug as string),
      )
    )
      throw new DomainError("Alamat itu sudah dipakai undangan lain.", 409);
    if (
      typeof newSlug !== "string" ||
      newSlug.length < 3 ||
      newSlug.length > 80 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(newSlug) ||
      [
        "api",
        "media",
        "dashboard",
        "login",
        "admin",
        "preview",
        "templates",
        "themes",
      ].includes(newSlug)
    )
      throw new DomainError(
        "Gunakan 3–80 huruf kecil, angka, dan tanda hubung untuk alamat undangan.",
      );
    if (newSlug === invitation.slug) return invitation;
    const aliases = (invitation.aliases || []).filter(
      (alias) => alias !== newSlug,
    );
    if (aliases.length >= 20)
      throw new DomainError(
        "Batas perubahan alamat tercapai. Alamat sebelumnya tetap dipertahankan.",
      );
    invitation.aliases = [...aliases, invitation.slug];
    invitation.slug = newSlug;
    invitation.lockVersion++;
    invitation.updatedAt = new Date().toISOString();
    return invitation;
  });
}

const SLUG_RESERVED = [
  "api",
  "media",
  "dashboard",
  "login",
  "admin",
  "preview",
  "templates",
  "themes",
];
function assertSlug(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length < 3 ||
    value.length > 80 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ||
    SLUG_RESERVED.includes(value)
  )
    throw new DomainError(
      "Gunakan 3\u201380 huruf kecil, angka, dan tanda hubung untuk alamat undangan.",
    );
}

/** Undangan baru memakai isi undangan yang sedang dibuka sebagai titik awal. */
export async function createInvitation(
  actor: Actor | null,
  input: { slug: unknown; copyFromSlug?: string },
) {
  assertSlug(input.slug);
  const slug = input.slug;
  return mutateState((state) => {
    const reference = state.invitations[0];
    if (!reference) throw new DomainError("Belum ada undangan.", 404);
    authorize(actor, reference);
    if (state.invitations.length >= 20)
      throw new DomainError("Batas 20 undangan per ruang kerja tercapai.");
    if (state.invitations.some((i) => matchesSlug(i, slug)))
      throw new DomainError("Alamat itu sudah dipakai undangan lain.", 409);
    const source = input.copyFromSlug
      ? requireBySlug(state, input.copyFromSlug)
      : reference;
    const now = new Date().toISOString();
    const invitation: Invitation = {
      id: randomUUID(),
      workspaceId: reference.workspaceId,
      slug,
      status: "draft",
      lockVersion: 1,
      revision: 0,
      draft: structuredClone(source.draft),
      published: null,
      updatedAt: now,
    };
    state.invitations.push(invitation);
    return invitation;
  });
}

export async function deleteInvitation(actor: Actor | null, slug: string) {
  return mutateState((state) => {
    const invitation = requireBySlug(state, slug);
    authorize(actor, invitation);
    if (state.invitations.length <= 1)
      throw new DomainError("Undangan terakhir tidak dapat dihapus.");
    state.invitations = state.invitations.filter((i) => i !== invitation);
    state.rsvps = state.rsvps.filter((r) => r.invitationId !== invitation.id);
    state.wishes = state.wishes.filter((w) => w.invitationId !== invitation.id);
    state.guests = (state.guests ?? []).filter(
      (g) => g.invitationId !== invitation.id,
    );
    delete state.guestTemplates?.[invitation.id];
    state.revisions = state.revisions.filter(
      (r) => r.invitationId !== invitation.id,
    );
    return { slug: invitation.slug, deleted: true };
  });
}
