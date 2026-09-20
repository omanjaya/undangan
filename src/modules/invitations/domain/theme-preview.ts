import {
  contentSchema,
  demoContent,
  type InvitationContent,
} from "./invitation";

// Foto contoh untuk halaman /themes. Berkasnya statis di public/media/ dan
// tidak lewat serveMedia, karena preview tema tidak terikat workspace mana pun.
// Nama berkas harus heksadesimal supaya lolos pola mediaUrl di contentSchema.
//
//   0de00001  berhadapan di taman, cahaya pagi (hero Jepun Ivory)
//   0de00002  joglo beratap piramid (hero Puri Emerald)
//   0de00003  tangga rumah adat bertabur marigold (hero Senja Terracotta)
//   0de00004  potret pengantin perempuan
//   0de00005  potret pengantin pria
//   0de00006  keduanya tertawa (cerita)
//   0de00011  lumbung padi  0de00012  potret berdua dekat
//   0de00013  pengantin perempuan  0de00014  detail cincin
//   0de00015  kening bersentuhan   0de00016  joglo & bangku
//   0de00017  duduk berdua         0de00018  pohon besar & langit
//   0de00019  bergandengan tangan  0de0001a  dibingkai dedaunan
//   0de0001b  payung tradisional   0de0001c  jendela beton bundar
const heroPhotoByTheme: Record<
  InvitationContent["theme"],
  { photo: string; focusY: number }
> = {
  "jepun-ivory": { photo: "/media/0de00001.webp", focusY: 62 },
  "puri-emerald": { photo: "/media/0de00002.webp", focusY: 84 },
  "senja-terracotta": { photo: "/media/0de00003.webp", focusY: 64 },
  "lotus-rosa": { photo: "/media/0de00012.webp", focusY: 50 },
  "samudra-biru": { photo: "/media/0de00018.webp", focusY: 55 },
  "sawah-hijau": { photo: "/media/0de00016.webp", focusY: 60 },
  "malam-keemasan": { photo: "/media/0de0001b.webp", focusY: 50 },
  "pasir-putih": { photo: "/media/0de0001c.webp", focusY: 50 },
  "elegansi-monokrom": { photo: "/media/0de00015.webp", focusY: 45 },
};

// Font bawaan tiap tema — menentukan karakter tipografinya.
const fontByTheme: Record<
  InvitationContent["theme"],
  InvitationContent["fontPreset"]
> = {
  "jepun-ivory": "cormorant",
  "puri-emerald": "cinzel",
  "senja-terracotta": "cormorant",
  "lotus-rosa": "playfair",
  "samudra-biru": "marcellus",
  "sawah-hijau": "lora",
  "malam-keemasan": "cinzel",
  "pasir-putih": "italiana",
  "elegansi-monokrom": "garamond",
};

const galleryPhotos = [
  "0de00011",
  "0de00012",
  "0de00013",
  "0de00014",
  "0de00015",
  "0de00016",
  "0de00017",
  "0de00018",
  "0de00019",
  "0de0001a",
  "0de0001b",
  "0de0001c",
].map((name) => `/media/${name}.webp`);

export function themePreviewContent(
  themeId: InvitationContent["theme"],
  mode: InvitationContent["photoMode"] = "photos",
) {
  const withPhotos = mode === "photos";
  const hero = heroPhotoByTheme[themeId];
  return contentSchema.parse({
    ...demoContent,
    theme: themeId,
    fontPreset: fontByTheme[themeId],
    bride: "Ayu",
    groom: "Wira",
    brideFullName: "Ni Putu Ayu Pradnyani",
    groomFullName: "I Made Wira Pratama",
    brideParents: "Putri dari Bapak I Wayan Pradnyana & Ibu Ni Made Sari",
    groomParents: "Putra dari Bapak I Ketut Dharma & Ibu Ni Nyoman Dewi",
    brideAddress: "Denpasar, Bali",
    groomAddress: "Gianyar, Bali",
    opening:
      "Dengan memohon restu Ida Sang Hyang Widhi Wasa, kami mengundang Bapak, Ibu, dan Saudara untuk hadir memberikan doa restu dalam perayaan Pawiwahan kami.",
    photoMode: mode,
    illustrationSlideshow: mode === "illustrated",
    heroPhoto: withPhotos ? hero.photo : "",
    galleryPhotos: withPhotos ? galleryPhotos : [],
    storyPhoto: withPhotos ? "/media/0de00006.webp" : "",
    bridePhoto: withPhotos ? "/media/0de00004.webp" : "",
    groomPhoto: withPhotos ? "/media/0de00005.webp" : "",
    imageFocus: {
      heroPhoto: { x: 50, y: hero.focusY },
      bridePhoto: { x: 50, y: 40 },
      groomPhoto: { x: 50, y: 40 },
      storyPhoto: { x: 50, y: 38 },
    },
    musicUrl: "",
    videoUrl: "",
  });
}
