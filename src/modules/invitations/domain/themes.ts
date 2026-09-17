export const themes = [
  {
    id: "jepun-ivory",
    name: "Jepun Ivory",
    description: "Jepun putih, kertas ivory, dan emas lembut.",
    palette: ["#f8f3e8", "#706f4a", "#b69965"],
  },
  {
    id: "puri-emerald",
    name: "Puri Emerald",
    description: "Hijau zamrud, emas, dan keanggunan arsitektur Bali.",
    palette: ["#123e36", "#dfc58d", "#f6f0e2"],
  },
  {
    id: "senja-terracotta",
    name: "Senja Terracotta",
    description: "Warna tanah hangat dan bunga tropis dalam cahaya senja.",
    palette: ["#b66b50", "#f6e4d2", "#694f3b"],
  },
] as const;
export type ThemeId = (typeof themes)[number]["id"];
