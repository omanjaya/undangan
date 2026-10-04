import {
  GUEST_STATUS_LABELS,
  guestLink,
  renderWaMessage,
  waUrl,
  type GuestSummary,
  type GuestView,
} from "../../modules/invitations/domain/guests";

const section = document.querySelector<HTMLElement>("#guests");
if (section) {
  const root: HTMLElement = section;
  const slug = root.dataset.slug || "";
  const q = <T extends HTMLElement>(selector: string) =>
    root.querySelector<T>(selector)!;
  const list = q("#guest-list");
  const form = q<HTMLFormElement>("#guest-form");
  const error = q("#guest-error");
  const search = q<HTMLInputElement>("#guest-search");
  const statusFilter = q<HTMLSelectElement>("#guest-status-filter");
  const groupFilter = q<HTMLSelectElement>("#guest-group-filter");
  const importText = q<HTMLTextAreaElement>("#guest-import-text");
  const importFile = q<HTMLInputElement>("#guest-import-file");
  const importResult = q("#guest-import-result");
  const templateInput = q<HTMLTextAreaElement>("#guest-template");
  const toast = document.querySelector<HTMLElement>("#toast");

  let guests: GuestView[] = [];
  let template = "";
  let defaultTemplate = "";
  let editingId: string | null = null;

  function notify(message: string, isError = false) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle("is-error", isError);
    toast.hidden = false;
    window.setTimeout(() => (toast.hidden = true), 4000);
  }

  async function send(url: string, body?: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Permintaan gagal.");
    return result;
  }

  const origin = () => location.origin;
  const linkFor = (guest: GuestView) => guestLink(origin(), slug, guest);

  function renderSummary(summary: GuestSummary) {
    const values: Record<string, string> = {
      total: String(summary.total),
      belumDikirim: String(summary.belumDikirim),
      terkirim: String(summary.terkirim),
      dibuka: String(summary.dibuka),
      hadir: `${summary.hadir} · ${summary.hadirOrang} orang`,
      tidakHadir: String(summary.tidakHadir),
      checkedIn: `${summary.checkedIn} · ${summary.checkedInOrang} orang`,
    };
    for (const [key, value] of Object.entries(values))
      root
        .querySelector(`[data-stat="${key}"]`)
        ?.replaceChildren(document.createTextNode(value));
    document
      .querySelector("[data-guest-nav-count]")
      ?.replaceChildren(document.createTextNode(String(summary.total)));
    root
      .querySelector("#guest-count")
      ?.replaceChildren(document.createTextNode(`${summary.total} tamu`));
  }

  function summarize(): GuestSummary {
    const s: GuestSummary = {
      total: guests.length,
      belumDikirim: 0,
      terkirim: 0,
      dibuka: 0,
      hadir: 0,
      hadirOrang: 0,
      tidakHadir: 0,
      belumRespons: 0,
      checkedIn: 0,
      checkedInOrang: 0,
    };
    for (const g of guests) {
      if (g.status === "belum-dikirim") s.belumDikirim++;
      else if (g.status === "terkirim") s.terkirim++;
      else if (g.status === "dibuka") s.dibuka++;
      else if (g.status === "hadir") {
        s.hadir++;
        s.hadirOrang += g.pax;
      } else s.tidakHadir++;
      if (!g.rsvp) s.belumRespons++;
      if (g.checkedInAt) {
        s.checkedIn++;
        s.checkedInOrang += g.pax;
      }
    }
    return s;
  }

  function refreshGroups() {
    const current = groupFilter.value;
    const groups = [
      ...new Set(guests.map((g) => g.group).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b, "id"));
    groupFilter.replaceChildren(new Option("Semua grup", ""));
    for (const group of groups) groupFilter.append(new Option(group, group));
    groupFilter.value = groups.includes(current) ? current : "";
    const datalist = document.querySelector("#guest-groups");
    datalist?.replaceChildren(
      ...groups.map((group) => {
        const option = document.createElement("option");
        option.value = group;
        return option;
      }),
    );
  }

  function matches(guest: GuestView) {
    const text = search.value.trim().toLowerCase();
    if (
      text &&
      !`${guest.name} ${guest.phone} ${guest.group}`
        .toLowerCase()
        .includes(text)
    )
      return false;
    if (groupFilter.value && guest.group !== groupFilter.value) return false;
    const status = statusFilter.value;
    if (status === "checkin") return !!guest.checkedInAt;
    if (status === "belum-checkin")
      return guest.status === "hadir" && !guest.checkedInAt;
    if (status && guest.status !== status) return false;
    return true;
  }

  const formatTime = (iso: string) =>
    new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Makassar",
    }).format(new Date(iso));

  function button(label: string, onClick: () => void, secondary = true) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = secondary ? "guest-action secondary" : "guest-action";
    el.textContent = label;
    el.addEventListener("click", onClick);
    return el;
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify("Tautan tamu disalin.");
    } catch {
      window.prompt("Salin tautan ini:", text);
    }
  }

  function applyUpdate(updated: GuestView) {
    guests = guests.map((g) => (g.id === updated.id ? updated : g));
    render();
  }

  async function sendWhatsApp(guest: GuestView) {
    const message = renderWaMessage(template, guest.name, linkFor(guest));
    // Dibuka sebelum await agar tidak diblokir sebagai popup.
    window.open(waUrl(guest.phone, message), "_blank", "noopener");
    try {
      applyUpdate(await send(`/api/guests/${guest.id}/sent`, { sent: true }));
    } catch (e) {
      notify((e as Error).message, true);
    }
  }

  function startEdit(guest: GuestView) {
    editingId = guest.id;
    (form.elements.namedItem("name") as HTMLInputElement).value = guest.name;
    (form.elements.namedItem("phone") as HTMLInputElement).value = guest.phone;
    (form.elements.namedItem("group") as HTMLInputElement).value = guest.group;
    (form.elements.namedItem("maxPax") as HTMLInputElement).value = guest.maxPax
      ? String(guest.maxPax)
      : "";
    q("#guest-form-title").textContent = `Ubah tamu: ${guest.name}`;
    q("#guest-submit").textContent = "Simpan perubahan";
    q("#guest-cancel").hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function resetForm() {
    editingId = null;
    form.reset();
    q("#guest-form-title").textContent = "Tambah tamu";
    q("#guest-submit").textContent = "Tambah tamu";
    q("#guest-cancel").hidden = true;
    error.textContent = "";
  }

  function row(guest: GuestView) {
    const article = document.createElement("article");
    article.className = "guest-row";
    if (guest.checkedInAt) article.classList.add("is-checked-in");

    const info = document.createElement("div");
    info.className = "guest-info";
    const name = document.createElement("h4");
    name.textContent = guest.name;
    const meta = document.createElement("p");
    meta.className = "guest-meta";
    const parts = [
      guest.group,
      guest.phone ? `+${guest.phone}` : "Tanpa nomor",
      guest.maxPax ? `jatah ${guest.maxPax} orang` : "",
    ].filter(Boolean);
    meta.textContent = parts.join(" · ");
    const trail = document.createElement("p");
    trail.className = "guest-meta";
    const trailParts: string[] = [];
    if (guest.sentAt) trailParts.push(`terkirim ${formatTime(guest.sentAt)}`);
    if (guest.firstOpenedAt)
      trailParts.push(
        `dibuka ${formatTime(guest.firstOpenedAt)} (${guest.openCount}×)`,
      );
    if (guest.checkedInAt)
      trailParts.push(`check-in ${formatTime(guest.checkedInAt)}`);
    trail.textContent = trailParts.join(" · ");
    info.append(name, meta);
    if (trailParts.length) info.append(trail);

    const status = document.createElement("span");
    status.className = "guest-status";
    status.dataset.status = guest.status;
    status.textContent =
      guest.status === "hadir"
        ? `${GUEST_STATUS_LABELS.hadir} (${guest.pax} orang)`
        : GUEST_STATUS_LABELS[guest.status];
    const badges = document.createElement("div");
    badges.className = "guest-badges";
    badges.append(status);
    if (guest.checkedInAt) {
      const badge = document.createElement("span");
      badge.className = "guest-status";
      badge.dataset.status = "checkin";
      badge.textContent = "Sudah check-in";
      badges.append(badge);
    }

    const actions = document.createElement("div");
    actions.className = "guest-actions";
    actions.append(
      button("Salin tautan", () => void copy(linkFor(guest))),
      button(
        guest.sentAt ? "Kirim ulang via WA" : "Kirim via WA",
        () => void sendWhatsApp(guest),
        false,
      ),
      button("Ubah", () => startEdit(guest)),
    );
    if (guest.sentAt)
      actions.append(
        button("Batal terkirim", async () => {
          try {
            applyUpdate(
              await send(`/api/guests/${guest.id}/sent`, { sent: false }),
            );
          } catch (e) {
            notify((e as Error).message, true);
          }
        }),
      );
    if (guest.checkedInAt)
      actions.append(
        button("Batalkan check-in", async () => {
          try {
            applyUpdate(await send(`/api/guests/${guest.id}/uncheckin`));
          } catch (e) {
            notify((e as Error).message, true);
          }
        }),
      );
    actions.append(
      button("Hapus", async () => {
        if (!window.confirm(`Hapus ${guest.name} dari daftar tamu?`)) return;
        try {
          await send(`/api/guests/${guest.id}/delete`);
          guests = guests.filter((g) => g.id !== guest.id);
          if (editingId === guest.id) resetForm();
          refreshGroups();
          render();
        } catch (e) {
          notify((e as Error).message, true);
        }
      }),
    );

    article.append(info, badges, actions);
    return article;
  }

  function render() {
    renderSummary(summarize());
    const visible = guests.filter(matches);
    list.replaceChildren();
    if (!guests.length) {
      const empty = document.createElement("p");
      empty.className = "guest-empty";
      empty.textContent =
        "Belum ada tamu. Tambahkan satu per satu atau tempel daftar di bagian impor.";
      list.append(empty);
      return;
    }
    if (!visible.length) {
      const empty = document.createElement("p");
      empty.className = "guest-empty";
      empty.textContent = "Tidak ada tamu yang cocok dengan penyaring.";
      list.append(empty);
      return;
    }
    list.append(...visible.map(row));
  }

  async function load() {
    const res = await fetch(`/api/guests?slug=${encodeURIComponent(slug)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Daftar tamu gagal dimuat.");
    guests = data.guests;
    template = data.template;
    defaultTemplate = data.defaultTemplate;
    templateInput.value = template;
    refreshGroups();
    render();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    const data = new FormData(form);
    const payload = {
      slug,
      name: String(data.get("name") || "").trim(),
      phone: String(data.get("phone") || "").trim(),
      group: String(data.get("group") || "").trim(),
      maxPax: String(data.get("maxPax") || "").trim() || null,
    };
    try {
      if (editingId) {
        applyUpdate(await send(`/api/guests/${editingId}`, payload));
        notify("Tamu diperbarui.");
      } else {
        const added = await send("/api/guests", payload);
        guests = [...guests, added];
        notify("Tamu ditambahkan.");
      }
      resetForm();
      refreshGroups();
      render();
    } catch (e) {
      error.textContent = (e as Error).message;
    }
  });
  q("#guest-cancel").addEventListener("click", resetForm);
  for (const el of [search, statusFilter, groupFilter])
    el.addEventListener("input", render);

  async function runImport(text: string) {
    importResult.textContent = "";
    try {
      const result = await send("/api/guests/import", { slug, text });
      const lines = [
        `${result.added} tamu ditambahkan${result.skipped ? `, ${result.skipped} sudah ada dan dilewati` : ""}.`,
        ...result.errors
          .slice(0, 8)
          .map(
            (issue: { line: number; message: string }) =>
              `${issue.line ? `Baris ${issue.line}: ` : ""}${issue.message}`,
          ),
      ];
      if (result.errors.length > 8)
        lines.push(`…dan ${result.errors.length - 8} catatan lain.`);
      importResult.textContent = lines.join("\n");
      importText.value = "";
      await load();
    } catch (e) {
      importResult.textContent = (e as Error).message;
    }
  }
  q("#guest-import-submit").addEventListener("click", () => {
    if (importText.value.trim()) void runImport(importText.value);
    else importResult.textContent = "Tempel daftar tamu terlebih dahulu.";
  });
  importFile.addEventListener("change", async () => {
    const file = importFile.files?.[0];
    importFile.value = "";
    if (file) void runImport(await file.text());
  });

  q("#guest-template-save").addEventListener("click", async () => {
    try {
      const result = await send("/api/guests/template", {
        slug,
        template: templateInput.value,
      });
      template = result.template;
      templateInput.value = template;
      notify("Pesan WhatsApp disimpan.");
    } catch (e) {
      notify((e as Error).message, true);
    }
  });
  q("#guest-template-reset").addEventListener("click", () => {
    templateInput.value = defaultTemplate;
  });

  load().catch((e: Error) => {
    list.textContent = e.message;
  });
}
