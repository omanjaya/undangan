import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  validateMediaReferences,
  referencedMedia,
  uploadDirectory,
} from "./media";
import { randomUUID } from "node:crypto";
import {
  authorize,
  contentSchema,
  DomainError,
  rsvpSchema,
  type Invitation,
} from "../modules/invitations/domain/invitation";
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
  return invitation?.status === "published" ? invitation.published : null;
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
      title: `${i.draft.groom} & ${i.draft.bride}`,
      ceremonyTitle: i.draft.ceremonyTitle,
      date: i.draft.date,
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
) {
  const data = rsvpSchema.parse(input);
  return mutateState((state) => {
    const i = findBySlug(state, slug);
    if (!i || i.status !== "published")
      throw new DomainError("Undangan tidak tersedia.", 404);
    const previous = state.rsvps.find(
      (r) => r.visitorId === visitorId && r.invitationId === i.id,
    );
    const rsvp = {
      id: previous?.id || randomUUID(),
      invitationId: i.id,
      visitorId,
      name: data.name,
      attendance: data.attendance,
      attendeeCount: data.attendance === "declined" ? 0 : data.attendeeCount,
      updatedAt: new Date().toISOString(),
    };
    if (previous) state.rsvps[state.rsvps.indexOf(previous)] = rsvp;
    else state.rsvps.push(rsvp);
    if (data.message)
      state.wishes.push({
        id: randomUUID(),
        invitationId: i.id,
        name: data.name,
        message: data.message,
        status: "pending",
        createdAt: rsvp.updatedAt,
      });
    return {
      id: rsvp.id,
      message:
        "Terima kasih. Konfirmasi Anda tersimpan. Ucapan akan ditampilkan setelah disetujui.",
    };
  });
}
export async function getWishes(slug: string) {
  const state = await readState();
  const invitation = findBySlug(state, slug);
  if (!invitation || invitation.status !== "published") return [];
  return state.wishes
    .filter((w) => w.invitationId === invitation.id && w.status === "approved")
    .map(({ status: _, invitationId: __, ...w }) => w);
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
    state.revisions = state.revisions.filter(
      (r) => r.invitationId !== invitation.id,
    );
    return { slug: invitation.slug, deleted: true };
  });
}
