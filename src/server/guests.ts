import { randomBytes, randomUUID } from "node:crypto";
import {
  authorize,
  DomainError,
  type Invitation,
} from "../modules/invitations/domain/invitation";
import {
  DEFAULT_WA_TEMPLATE,
  MAX_GUESTS_PER_INVITATION,
  expectedPax,
  findGuestByCode,
  generateGuestCode,
  guestInputSchema,
  guestLink,
  guestStatus,
  guestsToCsv,
  normalizePhone,
  parseScannedCode,
  summarizeGuests,
  waTemplateSchema,
  type Guest,
  type GuestRsvp,
  type GuestView,
} from "../modules/invitations/domain/guests";
import {
  parseGuestList,
  type GuestImportIssue,
} from "../modules/invitations/domain/guests-import";
import {
  readWorkspace,
  mutateWorkspace,
  type State,
} from "../modules/invitations/infrastructure/store";
import { findBySlug, matchesSlug, resolvePublic, type Actor } from "./services";
import { loadEntitlements, requireActor, requireFeature } from "./tenant";

const readOwn = (actor: Actor | null) =>
  readWorkspace(requireActor(actor).workspaceId);
const mutateOwn = <T>(actor: Actor | null, fn: (state: State) => T) =>
  mutateWorkspace(requireActor(actor).workspaceId, fn);

/** Daftar tamu hanya ada di paket yang memilikinya; selain itu 403 dengan pesan jelas. */
async function requireGuestList(actor: Actor | null) {
  requireFeature(
    await loadEntitlements(requireActor(actor).workspaceId),
    "guestList",
    "daftar tamu",
  );
}

/** Batas tamu per undangan: yang lebih kecil antara batas sistem dan paket. */
async function guestLimit(actor: Actor | null) {
  const entitlements = await loadEntitlements(requireActor(actor).workspaceId);
  requireFeature(entitlements, "guestList", "daftar tamu");
  return {
    limit: Math.min(MAX_GUESTS_PER_INVITATION, entitlements.maxGuests),
    byPlan: entitlements.maxGuests < MAX_GUESTS_PER_INVITATION,
  };
}
const limitMessage = (limit: number, byPlan: boolean) =>
  byPlan
    ? `Paket Anda dibatasi ${limit} tamu per undangan. Pilih paket yang lebih besar untuk menambah tamu.`
    : `Batas ${limit} tamu per undangan tercapai.`;

function requireInvitation(state: State, actor: Actor | null, slug: string) {
  const invitation = findBySlug(state, slug);
  if (!invitation) throw new DomainError("Undangan tidak ditemukan.", 404);
  authorize(actor, invitation);
  return invitation;
}

/** Tamu dicari lewat id, lalu undangannya dipakai untuk memeriksa hak akses. */
function requireGuest(state: State, actor: Actor | null, id: string) {
  const guest = (state.guests ?? []).find((g) => g.id === id);
  const invitation = state.invitations.find(
    (i) => i.id === guest?.invitationId,
  );
  if (!guest || !invitation)
    throw new DomainError("Tamu tidak ditemukan.", 404);
  authorize(actor, invitation);
  return { guest, invitation };
}

function rsvpOf(state: State, guest: Guest): GuestRsvp {
  const rsvp = state.rsvps.find(
    (r) => r.guestId === guest.id && r.invitationId === guest.invitationId,
  );
  return rsvp
    ? { attendance: rsvp.attendance, attendeeCount: rsvp.attendeeCount }
    : null;
}

function toView(state: State, guest: Guest): GuestView {
  const rsvp = rsvpOf(state, guest);
  return {
    ...guest,
    rsvp,
    status: guestStatus(guest, rsvp),
    pax: expectedPax(guest, rsvp),
  };
}

function viewsFor(state: State, invitation: Invitation) {
  return (state.guests ?? [])
    .filter((g) => g.invitationId === invitation.id)
    .sort((a, b) => a.name.localeCompare(b.name, "id"))
    .map((g) => toView(state, g));
}

function takenCodes(state: State) {
  return new Set((state.guests ?? []).map((g) => g.code));
}

function newCode(state: State) {
  return generateGuestCode((n) => randomBytes(n), takenCodes(state));
}

function parsePhone(raw: string) {
  const phone = normalizePhone(raw);
  if (phone === null)
    throw new DomainError(
      "Nomor telepon tidak terbaca. Contoh: 0812 3456 7890.",
    );
  return phone;
}

export async function getGuests(actor: Actor | null, slug: string) {
  await requireGuestList(actor);
  const state = await readOwn(actor);
  const invitation = requireInvitation(state, actor, slug);
  const guests = viewsFor(state, invitation);
  return {
    guests,
    summary: summarizeGuests(guests),
    template: state.guestTemplates?.[invitation.id] ?? DEFAULT_WA_TEMPLATE,
    defaultTemplate: DEFAULT_WA_TEMPLATE,
  };
}

export async function addGuest(
  actor: Actor | null,
  slug: string,
  input: unknown,
) {
  const data = guestInputSchema.parse(input);
  const phone = parsePhone(data.phone);
  const { limit, byPlan } = await guestLimit(actor);
  return mutateOwn(actor, (state) => {
    const invitation = requireInvitation(state, actor, slug);
    state.guests ??= [];
    if (
      state.guests.filter((g) => g.invitationId === invitation.id).length >=
      limit
    )
      throw new DomainError(limitMessage(limit, byPlan), 403);
    const now = new Date().toISOString();
    const guest: Guest = {
      ...data,
      phone,
      id: randomUUID(),
      invitationId: invitation.id,
      code: newCode(state),
      sentAt: null,
      firstOpenedAt: null,
      openCount: 0,
      checkedInAt: null,
      createdAt: now,
      updatedAt: now,
    };
    state.guests.push(guest);
    return toView(state, guest);
  });
}

export async function updateGuest(
  actor: Actor | null,
  id: string,
  input: unknown,
) {
  await requireGuestList(actor);
  const data = guestInputSchema.parse(input);
  const phone = parsePhone(data.phone);
  return mutateOwn(actor, (state) => {
    const { guest } = requireGuest(state, actor, id);
    Object.assign(guest, data, { phone, updatedAt: new Date().toISOString() });
    return toView(state, guest);
  });
}

export async function removeGuest(actor: Actor | null, id: string) {
  await requireGuestList(actor);
  return mutateOwn(actor, (state) => {
    const { guest } = requireGuest(state, actor, id);
    state.guests = (state.guests ?? []).filter((g) => g !== guest);
    // RSVP tetap tersimpan sebagai tanggapan biasa; hanya tautannya dilepas.
    for (const rsvp of state.rsvps)
      if (rsvp.guestId === guest.id) delete rsvp.guestId;
    return { id, deleted: true };
  });
}

/** Ditandai terkirim saat pemilik menekan tombol WhatsApp; bisa dibatalkan. */
export async function markGuestSent(
  actor: Actor | null,
  id: string,
  sent = true,
) {
  await requireGuestList(actor);
  return mutateOwn(actor, (state) => {
    const { guest } = requireGuest(state, actor, id);
    const now = new Date().toISOString();
    guest.sentAt = sent ? (guest.sentAt ?? now) : null;
    guest.updatedAt = now;
    return toView(state, guest);
  });
}

export async function saveWaTemplate(
  actor: Actor | null,
  slug: string,
  template: unknown,
) {
  await requireGuestList(actor);
  const text = waTemplateSchema.parse(template);
  return mutateOwn(actor, (state) => {
    const invitation = requireInvitation(state, actor, slug);
    state.guestTemplates ??= {};
    state.guestTemplates[invitation.id] = text;
    return { template: text };
  });
}

/**
 * Impor menambah tamu baru. Baris dengan nama dan nomor yang sama dengan tamu
 * yang sudah ada dilewati, sehingga menempel ulang daftar yang sama aman.
 */
export async function importGuests(
  actor: Actor | null,
  slug: string,
  text: unknown,
) {
  if (typeof text !== "string" || !text.trim())
    throw new DomainError("Daftar tamu kosong.");
  const parsed = parseGuestList(text);
  const { limit, byPlan } = await guestLimit(actor);
  return mutateOwn(actor, (state) => {
    const invitation = requireInvitation(state, actor, slug);
    state.guests ??= [];
    const own = state.guests.filter((g) => g.invitationId === invitation.id);
    const key = (name: string, phone: string) =>
      `${name.trim().toLowerCase()}|${phone}`;
    const existing = new Set(own.map((g) => key(g.name, g.phone)));
    const errors: GuestImportIssue[] = [...parsed.errors];
    const now = new Date().toISOString();
    const codes = takenCodes(state);
    let added = 0;
    let skipped = 0;
    let count = own.length;
    for (const entry of parsed.guests) {
      const k = key(entry.name, entry.phone);
      if (existing.has(k)) {
        skipped++;
        continue;
      }
      if (count >= limit) {
        errors.push({
          line: 0,
          message: byPlan
            ? `Batas ${limit} tamu pada paket Anda tercapai; sisa baris diabaikan.`
            : `Batas ${limit} tamu tercapai; sisa baris diabaikan.`,
        });
        break;
      }
      const code = generateGuestCode((n) => randomBytes(n), codes);
      codes.add(code);
      state.guests.push({
        ...entry,
        id: randomUUID(),
        invitationId: invitation.id,
        code,
        sentAt: null,
        firstOpenedAt: null,
        openCount: 0,
        checkedInAt: null,
        createdAt: now,
        updatedAt: now,
      });
      existing.add(k);
      count++;
      added++;
    }
    return { added, skipped, total: count, errors };
  });
}

export async function exportGuestsCsv(
  actor: Actor | null,
  slug: string,
  origin: string,
) {
  await requireGuestList(actor);
  const state = await readOwn(actor);
  const invitation = requireInvitation(state, actor, slug);
  return guestsToCsv(viewsFor(state, invitation), (g) =>
    guestLink(origin, invitation.slug, g),
  );
}

/**
 * Dipanggil dari halaman tamu tanpa sesi. Hasilnya hanya "tercatat atau tidak"
 * dan undangan harus terbit, sehingga endpoint ini tidak membocorkan isi daftar.
 */
export async function recordGuestOpen(slug: string, code: unknown) {
  // Kode asal-asalan tidak boleh memicu penulisan state.
  const known = await resolvePublic(slug);
  if (!known || !findGuestByCode(known.state.guests, known.invitation.id, code))
    return false;
  // Paket tanpa daftar tamu tidak melacak pembukaan undangan.
  if (!(await loadEntitlements(known.workspaceId)).features.guestList)
    return false;
  return mutateWorkspace(known.workspaceId, (state) => {
    const invitation = state.invitations.find(
      (i) => i.id === known.invitation.id && matchesSlug(i, slug),
    );
    if (!invitation || invitation.status !== "published") return false;
    const guest = findGuestByCode(state.guests, invitation.id, code);
    if (!guest) return false;
    const now = new Date().toISOString();
    guest.firstOpenedAt ??= now;
    guest.openCount++;
    return true;
  });
}

/** Data minimum untuk halaman tamu: nama sapaan dan apakah QR boleh tampil. */
export async function getGuestForPage(slug: string, code: unknown) {
  if (typeof code !== "string") return null;
  const found = await resolvePublic(slug);
  if (!found) return null;
  const { state, invitation } = found;
  const guest = findGuestByCode(state.guests, invitation.id, code);
  if (!guest) return null;
  const rsvp = rsvpOf(state, guest);
  return {
    code: guest.code,
    name: guest.name,
    group: guest.group,
    maxPax: guest.maxPax,
    attendance: rsvp?.attendance ?? null,
    attendeeCount: rsvp?.attendeeCount ?? null,
  };
}

/**
 * Check-in di pintu masuk. Check-in kedua tidak mengubah waktu pertama dan
 * dilaporkan sebagai duplikat agar petugas bisa menanyakannya.
 */
export async function checkInGuest(
  actor: Actor | null,
  slug: string,
  rawCode: unknown,
) {
  const code = parseScannedCode(typeof rawCode === "string" ? rawCode : "");
  if (!code) throw new DomainError("Kode tamu kosong.");
  requireFeature(
    await loadEntitlements(requireActor(actor).workspaceId),
    "qrCheckin",
    "check-in QR",
  );
  return mutateOwn(actor, (state) => {
    const invitation = requireInvitation(state, actor, slug);
    const guest = findGuestByCode(state.guests, invitation.id, code);
    if (!guest) {
      const other = (state.guests ?? []).some((g) => g.code === code);
      throw new DomainError(
        other
          ? "Kode ini milik undangan lain. Pilih undangan yang sesuai."
          : "Kode tamu tidak dikenal.",
        404,
      );
    }
    const duplicate = !!guest.checkedInAt;
    if (!duplicate) {
      guest.checkedInAt = new Date().toISOString();
      guest.updatedAt = guest.checkedInAt;
    }
    return {
      status: duplicate ? ("duplicate" as const) : ("ok" as const),
      guest: toView(state, guest),
      summary: summarizeGuests(viewsFor(state, invitation)),
    };
  });
}

export async function undoCheckIn(actor: Actor | null, id: string) {
  requireFeature(
    await loadEntitlements(requireActor(actor).workspaceId),
    "qrCheckin",
    "check-in QR",
  );
  return mutateOwn(actor, (state) => {
    const { guest } = requireGuest(state, actor, id);
    guest.checkedInAt = null;
    guest.updatedAt = new Date().toISOString();
    return toView(state, guest);
  });
}
