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
} from "../modules/invitations/infrastructure/store";
export type Actor = { id: string; workspaceId: string; email: string };
export function matchesSlug(invitation: Invitation, slug: string) {
  return invitation.slug === slug || !!invitation.aliases?.includes(slug);
}
export async function getInvitation(slug = "amara-raka", _preview = false) {
  const { invitation } = await readState();
  return matchesSlug(invitation, slug) ? invitation : null;
}
export async function getPublished(slug: string) {
  const invitation = await getInvitation(slug);
  return invitation?.status === "published" ? invitation.published : null;
}
export async function getDashboardData(actor: Actor | null) {
  const state = await readState();
  authorize(actor, state.invitation);
  return {
    invitation: state.invitation,
    rsvps: state.rsvps.map(({ visitorId: _, ...r }) => r),
    wishes: state.wishes,
    stats: {
      responses: state.rsvps.length,
      attending: state.rsvps.filter((r) => r.attendance === "attending").length,
      declined: state.rsvps.filter((r) => r.attendance === "declined").length,
      guests: state.rsvps.reduce((n, r) => n + r.attendeeCount, 0),
      pendingWishes: state.wishes.filter((w) => w.status === "pending").length,
    },
  };
}
export async function saveDraft(
  actor: Actor | null,
  input: { slug: string; lockVersion: number; content: unknown },
) {
  const content = contentSchema.parse(input.content);
  return mutateState((state) => {
    authorize(actor, state.invitation);
    if (state.invitation.slug !== input.slug)
      throw new DomainError("Undangan tidak ditemukan.", 404);
    if (state.invitation.lockVersion !== input.lockVersion)
      throw new DomainError(
        "Draft telah berubah. Muat ulang sebelum menyimpan.",
        409,
      );
    state.invitation.draft = content;
    state.invitation.lockVersion++;
    state.invitation.updatedAt = new Date().toISOString();
    return state.invitation;
  });
}
export async function publishInvitation(actor: Actor | null, slug: string) {
  const snapshot = await readState();
  authorize(actor, snapshot.invitation);
  validateMediaReferences(snapshot, snapshot.invitation.draft);
  for (const reference of referencedMedia(snapshot.invitation.draft)) {
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
    authorize(actor, state.invitation);
    if (state.invitation.slug !== slug)
      throw new DomainError("Undangan tidak ditemukan.", 404);
    if (snapshot.invitation.lockVersion !== state.invitation.lockVersion)
      throw new DomainError(
        "Draft telah berubah. Muat ulang sebelum menerbitkan.",
        409,
      );
    const content = contentSchema.parse(state.invitation.draft);
    validateMediaReferences(state, content);
    state.invitation.published = structuredClone(content);
    state.invitation.status = "published";
    state.invitation.revision++;
    state.invitation.updatedAt = new Date().toISOString();
    state.revisions.push({
      revision: state.invitation.revision,
      content,
      createdAt: state.invitation.updatedAt,
    });
    return state.invitation;
  });
}
export async function unpublishInvitation(actor: Actor | null, slug: string) {
  return mutateState((state) => {
    authorize(actor, state.invitation);
    if (state.invitation.slug !== slug)
      throw new DomainError("Undangan tidak ditemukan.", 404);
    state.invitation.status = "draft";
    state.invitation.updatedAt = new Date().toISOString();
    return state.invitation;
  });
}
export async function submitRsvp(
  slug: string,
  input: unknown,
  visitorId: string,
) {
  const data = rsvpSchema.parse(input);
  return mutateState((state) => {
    const i = state.invitation;
    if (!matchesSlug(i, slug) || i.status !== "published")
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
  if (
    !matchesSlug(state.invitation, slug) ||
    state.invitation.status !== "published"
  )
    return [];
  return state.wishes
    .filter((w) => w.status === "approved")
    .map(({ status: _, invitationId: __, ...w }) => w);
}
export async function moderateWish(
  actor: Actor | null,
  id: string,
  status: "approved" | "hidden",
) {
  return mutateState((state) => {
    authorize(actor, state.invitation);
    const wish = state.wishes.find(
      (w) => w.id === id && w.invitationId === state.invitation.id,
    );
    if (!wish) throw new DomainError("Ucapan tidak ditemukan.", 404);
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
    const invitation = state.invitation;
    authorize(actor, invitation);
    if (invitation.slug !== slug)
      throw new DomainError(
        "Alamat undangan telah berubah. Muat ulang halaman.",
        409,
      );
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
