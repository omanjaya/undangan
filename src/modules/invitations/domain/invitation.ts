import { z } from "zod";
import { youtubeId } from "./video";
import { isGoogleMapEmbedUrl } from "./maps";
const mapEmbed = z
  .string()
  .trim()
  .max(4096)
  .refine(
    (v) => !v || isGoogleMapEmbedUrl(v),
    "Gunakan URL embed Google Maps yang valid",
  )
  .default("");
const focusPoint = z
  .object({
    x: z.number().min(0).max(100).default(50),
    y: z.number().min(0).max(100).default(50),
  })
  .default({ x: 50, y: 50 });
const mediaUrl = z
  .string()
  .regex(/^$|^\/media\/[a-f0-9-]+\.(?:webp|mp4|webm|mp3|m4a|ogg|wav)$/)
  .default("");
export const contentSchema = z.object({
  theme: z
    .enum([
      "jepun-ivory",
      "puri-emerald",
      "senja-terracotta",
      "lotus-rosa",
      "samudra-biru",
      "sawah-hijau",
      "malam-keemasan",
      "pasir-putih",
    ])
    .default("jepun-ivory"),
  ornamentDensity: z.enum(["minimal", "medium", "full"]).default("medium"),
  photoMode: z.enum(["photos", "illustrated"]).default("photos"),
  illustrationSlideshow: z.boolean().default(false),
  imageFocus: z
    .object({
      heroPhoto: focusPoint,
      bridePhoto: focusPoint,
      groomPhoto: focusPoint,
      storyPhoto: focusPoint,
    })
    .default({
      heroPhoto: { x: 50, y: 50 },
      bridePhoto: { x: 50, y: 50 },
      groomPhoto: { x: 50, y: 50 },
      storyPhoto: { x: 50, y: 50 },
    }),
  mapEmbedUrl: mapEmbed,
  fontPreset: z
    .enum(["cormorant", "italiana", "cinzel", "playfair", "marcellus", "lora"])
    .default("cormorant"),
  balineseGreeting: z.string().trim().max(200).default("ᬒᬁ ᬲ᭄ᬯᬲ᭄ᬢ᭄ᬬᬲ᭄ᬢᬸ᭟"),
  vedaQuote: z.enum(["none", "rigveda-10-191-4"]).default("rigveda-10-191-4"),
  greeting: z.string().trim().max(120).default("Om Swastyastu"),
  closing: z.string().trim().max(200).default("Om Shanti Shanti Shanti Om"),
  brideParents: z.string().trim().max(300).default(""),
  groomParents: z.string().trim().max(300).default(""),
  brideAddress: z.string().trim().max(300).default(""),
  groomAddress: z.string().trim().max(300).default(""),
  ceremonyTitle: z.string().trim().max(100).default("Pawiwahan"),
  balineseDate: z.string().trim().max(200).default(""),
  dressCode: z.string().trim().max(160).default(""),
  heroPhoto: mediaUrl,
  bridePhoto: mediaUrl,
  groomPhoto: mediaUrl,
  storyPhoto: mediaUrl,
  videoUrl: mediaUrl,
  youtubeUrl: z
    .string()
    .trim()
    .max(2048)
    .refine(
      (v) => !v || youtubeId(v) !== null,
      "Masukkan tautan video YouTube HTTPS yang valid",
    )
    .default(""),
  musicUrl: mediaUrl,
  musicTitle: z.string().trim().max(150).default(""),
  galleryPhotos: z.array(mediaUrl).max(12).default([]),
  events: z
    .array(
      z
        .object({
          title: z.string().trim().min(1).max(100),
          date: z.iso.datetime({ offset: true }),
          endDate: z.iso.datetime({ offset: true }).optional(),
          venue: z.string().trim().min(1).max(180),
          address: z.string().trim().min(1).max(300),
          mapEmbedUrl: mapEmbed,
          mapUrl: z
            .url()
            .refine((v) => v.startsWith("https://"), "Gunakan tautan HTTPS"),
        })
        .refine(
          (v) => !v.endDate || Date.parse(v.endDate) > Date.parse(v.date),
          "Waktu selesai acara harus setelah waktu mulai.",
        ),
    )
    .max(4)
    .default([]),
  bride: z.string().trim().min(1).max(80),
  groom: z.string().trim().min(1).max(80),
  brideFullName: z.string().trim().min(1).max(150),
  groomFullName: z.string().trim().min(1).max(150),
  date: z.iso.datetime({ offset: true }),
  venue: z.string().trim().min(1).max(180),
  address: z.string().trim().min(1).max(300),
  story: z.string().trim().max(2000),
  opening: z.string().trim().max(1000),
  mapUrl: z
    .url()
    .refine((v) => v.startsWith("https://"), "Gunakan tautan HTTPS"),
});
export type InvitationContent = z.infer<typeof contentSchema>;
export type Invitation = {
  id: string;
  workspaceId: string;
  slug: string;
  aliases?: string[];
  status: "draft" | "published";
  lockVersion: number;
  revision: number;
  draft: InvitationContent;
  published: InvitationContent | null;
  updatedAt: string;
};
export type Rsvp = {
  id: string;
  invitationId: string;
  name: string;
  attendance: "attending" | "declined";
  attendeeCount: number;
  updatedAt: string;
};
export type Wish = {
  id: string;
  invitationId: string;
  name: string;
  message: string;
  status: "pending" | "approved" | "hidden";
  createdAt: string;
};
export const rsvpSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    attendance: z.enum(["attending", "declined"]),
    attendeeCount: z.coerce.number().int().min(0).max(5),
    message: z.string().trim().max(1000).default(""),
  })
  .superRefine((v, ctx) => {
    if (v.attendance === "attending" && v.attendeeCount < 1)
      ctx.addIssue({
        code: "custom",
        path: ["attendeeCount"],
        message: "Jumlah tamu minimal satu.",
      });
  });
export const demoContent: InvitationContent = contentSchema.parse({
  bride: "Amara",
  groom: "Raka",
  brideFullName: "Amara Putri",
  groomFullName: "Raka Pratama",
  date: "2026-09-20T16:00:00+08:00",
  venue: "Taman Bhagawan",
  address: "Jl. Pratama No. 70, Tanjung Benoa, Bali",
  story:
    "Dari sebuah pertemuan sederhana, tumbuh cerita yang ingin kami lanjutkan selamanya. Kini, dengan penuh syukur, kami memulai babak baru bersama.",
  opening:
    "Dengan penuh rasa syukur dan bahagia, kami mengundang Bapak, Ibu, dan sahabat untuk menjadi bagian dari hari istimewa kami.",
  mapUrl: "https://maps.google.com/?q=Taman+Bhagawan+Bali",
});
export const demoInvitation: Invitation = {
  id: "inv-amara-raka",
  workspaceId: "workspace-demo",
  slug: "amara-raka",
  status: "published",
  lockVersion: 1,
  revision: 1,
  draft: demoContent,
  published: demoContent,
  updatedAt: "2026-09-01T00:00:00.000Z",
};
export class DomainError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function authorize(
  actor: { workspaceId: string } | null,
  invitation: Invitation,
) {
  if (!actor) throw new DomainError("Silakan masuk terlebih dahulu.", 401);
  if (actor.workspaceId !== invitation.workspaceId)
    throw new DomainError("Akses tidak diizinkan.", 403);
}
