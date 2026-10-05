/** Pembantu peramban untuk halaman paket, tagihan, dan admin penagihan. */

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function toast(message: string, error = false) {
  let node = document.querySelector<HTMLElement>("#bill-toast");
  if (!node) {
    node = document.createElement("div");
    node.id = "bill-toast";
    node.setAttribute("role", "status");
    document.body.append(node);
  }
  node.textContent = message;
  node.className = `bill-toast${error ? " is-error" : ""}`;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (node!.hidden = true), 6000);
}

/** Mengirim permintaan dan mengembalikan JSON; galat server menjadi `Error` berpesan. */
export async function send<T = Record<string, unknown>>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, { method: "POST", ...init });
  let data: Record<string, unknown> = {};
  try {
    data = await response.json();
  } catch {}
  if (!response.ok)
    throw new Error(
      typeof data.error === "string" ? data.error : "Permintaan gagal.",
    );
  return data as T;
}

export const sendJson = <T = Record<string, unknown>>(
  url: string,
  body: unknown = {},
) =>
  send<T>(url, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

/** Tombol `data-copy="teks"` menyalin teks ke papan klip. */
export function bindCopyButtons() {
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-copy]",
  ))
    button.addEventListener("click", async () => {
      const label = button.textContent;
      try {
        await navigator.clipboard.writeText(button.dataset.copy || "");
        button.textContent = "Tersalin";
      } catch {
        toast("Salin manual: " + (button.dataset.copy || ""), true);
        return;
      }
      setTimeout(() => (button.textContent = label), 1600);
    });
}

/** Mengisi `<time data-countdown="ISO">` dengan sisa waktu yang terus berjalan. */
export function bindCountdowns() {
  for (const node of document.querySelectorAll<HTMLElement>(
    "[data-countdown]",
  )) {
    const end = Date.parse(node.dataset.countdown || "");
    if (!Number.isFinite(end)) continue;
    const tick = () => {
      const left = end - Date.now();
      if (left <= 0) {
        node.textContent = "waktu habis";
        return;
      }
      const hours = Math.floor(left / 3_600_000);
      const minutes = Math.floor((left % 3_600_000) / 60_000);
      const seconds = Math.floor((left % 60_000) / 1000);
      node.textContent =
        hours >= 24
          ? `${Math.floor(hours / 24)} hari ${hours % 24} jam`
          : `${hours} jam ${minutes} menit ${seconds} detik`;
      setTimeout(tick, hours >= 24 ? 60_000 : 1000);
    };
    tick();
  }
}

/** Nilai formulir sebagai objek; kotak centang menjadi boolean. */
export function formValues(form: HTMLFormElement) {
  const values: Record<string, string | boolean> = {};
  for (const element of Array.from(form.elements)) {
    const field = element as HTMLInputElement;
    if (!field.name || field.disabled) continue;
    values[field.name] =
      field.type === "checkbox"
        ? field.checked
        : field.type === "radio" && !field.checked
          ? (values[field.name] ?? "")
          : field.value;
  }
  return values;
}

/**
 * Formulir `form[data-ajax="/api/..."]` dikirim sebagai JSON. Setelah berhasil
 * halaman dimuat ulang, atau menuju `data-redirect`; `data-confirm` meminta
 * persetujuan dulu.
 */
export function bindAjaxForms() {
  for (const form of document.querySelectorAll<HTMLFormElement>(
    "form[data-ajax]",
  ))
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (form.dataset.confirm && !confirm(form.dataset.confirm)) return;
      const submit = form.querySelector<HTMLButtonElement>(
        "button[type=submit], button:not([type])",
      );
      if (submit) submit.disabled = true;
      try {
        const result = await sendJson<{ order?: { number: string } }>(
          form.dataset.ajax!,
          formValues(form),
        );
        const target = form.dataset.redirect;
        // "order": menuju halaman pesanan yang baru dibuat atau diubah.
        if (target === "order" && result.order)
          location.href = `/admin/pesanan/${result.order.number}`;
        else if (target) location.href = target;
        else location.reload();
      } catch (error) {
        toast((error as Error).message, true);
        if (submit) submit.disabled = false;
      }
    });
}

export function bindLogout() {
  document
    .querySelector("#bill-logout")
    ?.addEventListener("click", async () => {
      try {
        await send("/api/auth/logout");
      } catch {}
      location.href = "/login";
    });
}
