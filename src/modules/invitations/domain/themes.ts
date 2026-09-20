export const themes = [
  {
    id: "jepun-ivory",
    art: "ivory",
    mood: "Lembut & abadi",
    name: "Jepun Ivory",
    description: "Jepun putih, kertas ivory, dan emas lembut.",
    palette: ["#f8f3e8", "#706f4a", "#b69965"],
  },
  {
    id: "puri-emerald",
    art: "emerald",
    mood: "Anggun & megah",
    name: "Puri Emerald",
    description: "Hijau zamrud, emas, dan keanggunan arsitektur Bali.",
    palette: ["#123e36", "#dfc58d", "#f6f0e2"],
  },
  {
    id: "senja-terracotta",
    art: "terracotta",
    mood: "Hangat & intim",
    name: "Senja Terracotta",
    description: "Warna tanah hangat dan bunga tropis dalam cahaya senja.",
    palette: ["#b66b50", "#f6e4d2", "#694f3b"],
  },
  {
    id: "lotus-rosa",
    art: "rosa",
    mood: "Romantis & manis",
    name: "Lotus Rosa",
    description:
      "Merah muda lembut, teratai, dan tipografi Playfair yang romantis.",
    palette: ["#faf0f0", "#8c4a52", "#c9a06a"],
  },
  {
    id: "samudra-biru",
    art: "biru",
    mood: "Tenang & dalam",
    name: "Samudra Biru",
    description:
      "Biru laut dalam, buih putih, dan huruf Marcellus yang tenang.",
    palette: ["#122c3d", "#e8eef0", "#c2a878"],
  },
  {
    id: "sawah-hijau",
    art: "hijau",
    mood: "Segar & ceria",
    name: "Sawah Hijau",
    description: "Hijau padi segar dengan huruf Lora yang hangat dan ceria.",
    palette: ["#f3f7ec", "#3f6135", "#a8873f"],
  },
  {
    id: "malam-keemasan",
    art: "keemasan",
    mood: "Megah & dramatis",
    name: "Malam Keemasan",
    description: "Hitam arang, kilau emas, dan Cinzel yang megah.",
    palette: ["#191613", "#e9dcbf", "#c9a45c"],
  },
  {
    id: "pasir-putih",
    art: "pasir",
    mood: "Minimal & modern",
    name: "Pasir Putih",
    description:
      "Putih pasir minimalis dengan Italiana yang ringan dan modern.",
    palette: ["#fbfaf6", "#5a564c", "#b3a284"],
  },
] as const;
export type ThemeId = (typeof themes)[number]["id"];
