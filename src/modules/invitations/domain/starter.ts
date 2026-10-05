import {
  contentSchema,
  demoContent,
  type Invitation,
  type InvitationContent,
} from "./invitation";

/**
 * Isi undangan pertama untuk pelanggan baru: struktur dan tema dari contoh,
 * tetapi nama, lokasi, dan rekening diganti isian netral agar tidak ada data
 * orang lain yang terbawa ke akun baru.
 */
export function starterContent(now = new Date()): InvitationContent {
  // Tanggal awal tiga bulan ke depan; pelanggan menggantinya di editor.
  const day = new Date(now.getTime() + 90 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return contentSchema.parse({
    ...demoContent,
    bride: "Mempelai Wanita",
    groom: "Mempelai Pria",
    brideFullName: "Nama Lengkap Mempelai Wanita",
    groomFullName: "Nama Lengkap Mempelai Pria",
    date: `${day}T16:00:00+08:00`,
    venue: "Nama Tempat Acara",
    address: "Alamat lengkap tempat acara",
    story: "",
    mapUrl: "https://maps.google.com/",
    mapEmbedUrl: "",
    events: [],
    balineseDate: "",
    gift: {
      enabled: false,
      accounts: [],
      qrisImage: "",
      shippingRecipient: "",
      shippingAddress: "",
    },
  });
}

export function starterInvitation(input: {
  id: string;
  workspaceId: string;
  slug: string;
  now?: Date;
}): Invitation {
  const now = input.now ?? new Date();
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    slug: input.slug,
    status: "draft",
    lockVersion: 1,
    revision: 0,
    draft: starterContent(now),
    published: null,
    updatedAt: now.toISOString(),
  };
}
