import {
  labels,
  type LabelKey,
  type Lang,
} from "../../modules/invitations/domain/i18n";

// Modul ini dipakai bersama oleh semua skrip halaman tamu, sehingga bahasa
// aktif cukup disimpan di sini.
let current: Lang = "id";

export const currentLang = () => current;
export const setCurrentLang = (lang: Lang) => {
  current = lang;
};

/** Terjemahan label pada bahasa aktif; {n} dst. diganti nilai `vars`. */
export function tr(key: LabelKey, vars: Record<string, string | number> = {}) {
  return Object.entries(vars).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    labels[key][current] as string,
  );
}

/** Pastikan teks dinamis ikut berganti ketika tamu mengganti bahasa. */
export const onLangChange = (listener: (lang: Lang) => void) =>
  window.addEventListener("invite:lang", (event) =>
    listener((event as CustomEvent<Lang>).detail),
  );
