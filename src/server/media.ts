import { randomUUID } from "node:crypto";
import { mkdir, open, rename, unlink, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { resolve } from "node:path";
import sharp from "sharp";
import { fileTypeFromFile } from "file-type";
import {
  DomainError,
  type InvitationContent,
} from "../modules/invitations/domain/invitation";
import {
  mutateWorkspace,
  readWorkspace,
  tryReadWorkspace,
  type MediaAsset,
  type State,
} from "../modules/invitations/infrastructure/store";
import {
  assetKey,
  mediaOwner,
  mutateGlobal,
  readGlobal,
} from "../modules/invitations/infrastructure/global-store";
import type { Actor } from "./services";
import { loadEntitlements, requireActor } from "./tenant";
export const uploadDirectory = () =>
  resolve(process.env.UPLOAD_DIR || ".data/uploads");
const formats: Record<
  string,
  { kind: MediaAsset["kind"]; extension: string; max: number }
> = {
  "image/jpeg": { kind: "image", extension: "webp", max: 10 },
  "image/png": { kind: "image", extension: "webp", max: 10 },
  "image/webp": { kind: "image", extension: "webp", max: 10 },
  "video/mp4": { kind: "video", extension: "mp4", max: 80 },
  "video/webm": { kind: "video", extension: "webm", max: 80 },
  "audio/mpeg": { kind: "audio", extension: "mp3", max: 20 },
  "audio/mp4": { kind: "audio", extension: "m4a", max: 20 },
  "audio/x-m4a": { kind: "audio", extension: "m4a", max: 20 },
  "audio/ogg": { kind: "audio", extension: "ogg", max: 20 },
  "audio/wav": { kind: "audio", extension: "wav", max: 20 },
  "audio/x-wav": { kind: "audio", extension: "wav", max: 20 },
};
export function referencedMedia(content: InvitationContent) {
  return [
    content.heroPhoto,
    content.bridePhoto,
    content.groomPhoto,
    content.storyPhoto,
    content.gift?.qrisImage,
    ...content.galleryPhotos,
  ]
    .filter(Boolean)
    .map((url) => ({ url, kind: "image" }))
    .concat(
      content.videoUrl ? [{ url: content.videoUrl, kind: "video" }] : [],
      content.musicUrl ? [{ url: content.musicUrl, kind: "audio" }] : [],
    );
}
export function validateMediaReferences(
  state: State,
  content: InvitationContent,
  workspaceId: string,
) {
  for (const reference of referencedMedia(content)) {
    if (
      !state.assets?.some(
        (a) =>
          !a.purpose &&
          a.url === reference.url &&
          a.kind === reference.kind &&
          a.workspaceId === workspaceId,
      )
    )
      throw new DomainError(
        "Media tidak tersedia atau jenis media tidak sesuai. Unggah ulang sebelum menerbitkan.",
      );
  }
}
export function canReadAsset(
  state: State,
  asset: MediaAsset,
  actor: Actor | null,
) {
  if (actor?.workspaceId === asset.workspaceId) return true;
  // Bukti transfer: hanya pemilik ruang kerja dan admin, tidak pernah publik.
  if (asset.purpose) return actor?.role === "admin";
  // Publik hanya boleh membaca media yang dipakai salah satu undangan terbit.
  return state.invitations.some(
    (invitation) =>
      invitation.status === "published" &&
      !!invitation.published &&
      referencedMedia(invitation.published).some((r) => r.url === asset.url),
  );
}
export async function listMedia(actor: Actor | null) {
  const { workspaceId } = requireActor(actor);
  const state = await readWorkspace(workspaceId);
  return (state.assets || [])
    .filter((a) => a.workspaceId === workspaceId && !a.purpose)
    .map(({ workspaceId: _, filename: __, ...asset }) => asset);
}
// Unggahan diserialkan per ruang kerja agar pemeriksaan kuota tidak saling menyalip.
const uploadQueues = new Map<string, Promise<unknown>>();
/** Pengaturan unggahan khusus; tanpa ini berlaku aturan pustaka media biasa. */
export type UploadOptions = {
  purpose?: MediaAsset["purpose"];
  /** Batas ukuran berkas dalam MB, menggantikan batas per jenis. */
  maxMB?: number;
  imagesOnly?: boolean;
};

export async function uploadMedia(
  actor: Actor | null,
  request: Request,
  options: UploadOptions = {},
) {
  const { workspaceId } = requireActor(actor);
  const operation = (uploadQueues.get(workspaceId) ?? Promise.resolve()).then(
    () => performUpload(actor, request, options),
  );
  const tail = operation.catch(() => {});
  uploadQueues.set(workspaceId, tail);
  void tail.then(() => {
    if (uploadQueues.get(workspaceId) === tail)
      uploadQueues.delete(workspaceId);
  });
  return operation;
}
async function performUpload(
  actor: Actor | null,
  request: Request,
  options: UploadOptions,
) {
  const { workspaceId } = requireActor(actor);
  const state = await readWorkspace(workspaceId);
  const entitlements = await loadEntitlements(workspaceId);
  const mime = request.headers.get("content-type")?.split(";")[0].trim() || "";
  const format = formats[mime];
  if (!format) throw new DomainError("Format media tidak didukung.", 415);
  if (options.imagesOnly && format.kind !== "image")
    throw new DomainError("Unggah berkas gambar (JPG, PNG, atau WebP).", 415);
  const maxMB = Math.min(options.maxMB ?? format.max, format.max);
  const maximum = maxMB * 1024 * 1024;
  if (Number(request.headers.get("content-length") || 0) > maximum)
    throw new DomainError(`Ukuran maksimum ${maxMB} MB.`, 413);
  // UPLOAD_STORAGE_MB menjadi batas atas per ruang kerja; paket bisa lebih kecil.
  const configured =
    Number(process.env.UPLOAD_STORAGE_MB || 1024) * 1024 * 1024;
  if (!Number.isFinite(configured) || configured <= 0)
    throw new DomainError(
      "Kapasitas media belum dikonfigurasi dengan benar.",
      503,
    );
  // Bukti transfer tidak dibatasi kuota agar pembayaran tak pernah terhalang.
  const storageLimit = options.purpose
    ? Number.POSITIVE_INFINITY
    : Math.min(configured, entitlements.maxMediaBytes);
  const counted = (assets: MediaAsset[] = []) =>
    assets.filter((a) => !a.purpose).reduce((n, a) => n + a.bytes, 0);
  const used = counted(state.assets);
  if (used >= storageLimit)
    throw new DomainError(
      storageLimit < configured
        ? "Penyimpanan media paket Anda penuh. Hapus media yang tidak dipakai atau pilih paket yang lebih besar."
        : "Penyimpanan media penuh.",
      413,
    );
  let name: string;
  try {
    name = decodeURIComponent(request.headers.get("x-file-name") || "media")
      .replace(/[\x00-\x1f/\\]/g, "")
      .slice(0, 160);
  } catch {
    throw new DomainError("Nama berkas tidak valid.");
  }
  const id = randomUUID(),
    filename = `${id}.${format.extension}`;
  await mkdir(uploadDirectory(), { recursive: true, mode: 0o700 });
  const temp = resolve(uploadDirectory(), `${id}.upload`),
    destination = resolve(uploadDirectory(), filename);
  const reader = request.body?.getReader();
  if (!reader) throw new DomainError("Media kosong.");
  let bytes = 0;
  let indexed = false;
  let dimensions: { width?: number; height?: number } = {};
  try {
    const handle = await open(temp, "wx", 0o600);
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maximum || bytes + used > storageLimit) {
          await reader.cancel();
          throw new DomainError(
            "Ukuran media atau kapasitas penyimpanan terlampaui.",
            413,
          );
        }
        await handle.writeFile(value);
      }
    } finally {
      await handle.close();
      reader.releaseLock();
    }
    if (!bytes) throw new DomainError("Media kosong.");
    const detected = await fileTypeFromFile(temp);
    const actual = detected && formats[detected.mime];
    // M4A is detected as audio/x-m4a; Ogg may use audio/opus for Opus streams.
    const opus = detected?.mime === "audio/opus" && mime === "audio/ogg";
    if (
      (!actual ||
        actual.kind !== format.kind ||
        actual.extension !== format.extension) &&
      !opus
    )
      throw new DomainError("Isi berkas tidak sesuai format media.", 415);
    if (format.kind === "image") {
      try {
        const result = await sharp(temp, {
          limitInputPixels: 40000000,
          animated: false,
        })
          .rotate()
          .resize({
            width: 2000,
            height: 2400,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 84 })
          .toFile(destination);
        bytes = result.size;
        dimensions = { width: result.width, height: result.height };
      } catch {
        throw new DomainError("Gambar rusak atau resolusi terlalu besar.", 415);
      }
      await unlink(temp);
    } else await rename(temp, destination);
    const asset: MediaAsset = {
      id,
      workspaceId,
      url: `/media/${filename}`,
      filename,
      kind: format.kind,
      name,
      bytes,
      mime:
        format.kind === "image"
          ? "image/webp"
          : format.extension === "m4a"
            ? "audio/mp4"
            : format.extension === "wav"
              ? "audio/wav"
              : mime,
      createdAt: new Date().toISOString(),
      ...dimensions,
      ...(options.purpose ? { purpose: options.purpose } : {}),
    };
    // Indeks dulu, baru aset: indeks yatim tidak berbahaya, sedangkan aset
    // tanpa indeks tidak akan pernah bisa disajikan.
    await mutateGlobal((global) => {
      global.mediaIndex[assetKey(filename)] = workspaceId;
    });
    indexed = true;
    await mutateWorkspace(workspaceId, (current) => {
      const size = counted(current.assets);
      if (size + bytes > storageLimit)
        throw new DomainError("Penyimpanan media penuh.", 413);
      (current.assets ??= []).push(asset);
    });
    const { workspaceId: _, filename: __, ...publicAsset } = asset;
    return publicAsset;
  } catch (error) {
    await Promise.all([
      unlink(temp).catch(() => {}),
      unlink(destination).catch(() => {}),
      indexed
        ? mutateGlobal((global) => {
            delete global.mediaIndex[assetKey(filename)];
          }).catch(() => {})
        : Promise.resolve(),
    ]);
    throw error;
  }
}
export function parseRange(
  value: string | null,
  size: number,
): { start: number; end: number } | null {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2]))
    throw new DomainError("Rentang tidak valid.", 416);
  const start = match[1]
    ? Number(match[1])
    : Math.max(0, size - Number(match[2]));
  const end = match[1]
    ? match[2]
      ? Math.min(Number(match[2]), size - 1)
      : size - 1
    : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  )
    throw new DomainError("Rentang tidak valid.", 416);
  return { start, end };
}
export async function serveMedia(
  filename: string,
  request: Request,
  actor: Actor | null,
) {
  if (!/^[a-f0-9-]+\.(webp|mp4|webm|mp3|m4a|ogg|wav)$/.test(filename))
    throw new DomainError("Media tidak ditemukan.", 404);
  // Indeks global menunjuk ruang kerja pemilik berkas tanpa memindai semuanya.
  const owner = mediaOwner(await readGlobal(), assetKey(filename));
  const state = owner ? await tryReadWorkspace(owner) : null,
    asset = state?.assets?.find((a) => a.filename === filename);
  if (!state || !asset || !canReadAsset(state, asset, actor))
    throw new DomainError("Media tidak ditemukan.", 404);
  const path = resolve(uploadDirectory(), filename);
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    throw new DomainError("Media tidak ditemukan.", 404);
  }
  const headers: Record<string, string> = {
    "Content-Type": asset.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline",
  };
  let range: ReturnType<typeof parseRange>;
  try {
    range = parseRange(request.headers.get("range"), size);
  } catch {
    return new Response(null, {
      status: 416,
      headers: { ...headers, "Content-Range": `bytes */${size}` },
    });
  }
  headers["Content-Length"] = String(
    range ? range.end - range.start + 1 : size,
  );
  if (range)
    headers["Content-Range"] = `bytes ${range.start}-${range.end}/${size}`;
  return new Response(
    request.method === "HEAD"
      ? null
      : (Readable.toWeb(
          createReadStream(path, range || undefined),
        ) as ReadableStream),
    { status: range ? 206 : 200, headers },
  );
}
