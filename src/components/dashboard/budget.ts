import {
  BUDGET_CATEGORIES,
  BUDGET_BEARERS,
  BEARER_LABELS,
  CATEGORY_LABELS,
  committedAmount,
  paymentStatus,
  type BudgetItem,
} from "../../modules/invitations/domain/budget";
import { bearerSplit, categoryBars } from "./budget-chart";

const section = document.querySelector<HTMLElement>("#budget");
if (section) {
  const list = document.querySelector<HTMLElement>("#budget-list")!;
  const form = document.querySelector<HTMLFormElement>("#budget-form")!;
  const capForm = document.querySelector<HTMLFormElement>("#budget-cap-form")!;
  const error = document.querySelector<HTMLElement>("#budget-error")!;
  const stats = document.querySelector<HTMLElement>("#budget-stats")!;
  const due = document.querySelector<HTMLElement>("#budget-due")!;
  const bearers = document.querySelector<HTMLElement>("#budget-bearers")!;
  const templateButton =
    document.querySelector<HTMLButtonElement>("#budget-template")!;
  const charts = document.querySelector<HTMLElement>("#budget-charts")!;
  const importInput =
    document.querySelector<HTMLInputElement>("#budget-import")!;
  const toast = document.querySelector<HTMLElement>("#toast");

  const rupiah = (value: number) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(value);

  const STATUS_LABEL = {
    lunas: "Lunas",
    sebagian: "Dibayar sebagian",
    belum: "Belum dibayar",
  } as const;

  function notify(message: string, isError = false) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle("is-error", isError);
    toast.hidden = false;
    window.setTimeout(() => (toast.hidden = true), 4000);
  }

  async function send(url: string, method: string, body?: unknown) {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Permintaan gagal.");
    return result;
  }

  /** Nilai angka dari form; kolom kosong dihitung nol. */
  const amount = (data: FormData, key: string) =>
    Number(String(data.get(key) ?? "").trim() || 0);

  /** Realisasi yang dibiarkan kosong berarti belum dicatat, bukan nol. */
  const optionalAmount = (data: FormData, key: string) => {
    const raw = String(data.get(key) ?? "").trim();
    return raw === "" ? null : Number(raw);
  };

  function itemPayload(data: FormData) {
    return {
      category: String(data.get("category") || "lainnya"),
      bearer: String(data.get("bearer") || "bersama"),
      name: String(data.get("name") || "").trim(),
      vendor: String(data.get("vendor") || "").trim(),
      estimate: amount(data, "estimate"),
      actual: optionalAmount(data, "actual"),
      paid: amount(data, "paid"),
      dueDate: String(data.get("dueDate") || ""),
      note: String(data.get("note") || "").trim(),
    };
  }

  function renderStats(summary: {
    estimate: number;
    committed: number;
    paid: number;
    outstanding: number;
    remainingCap: number;
    overCap: boolean;
    cap: number;
  }) {
    const cards = stats.querySelectorAll("article");
    const values = [
      summary.estimate,
      summary.committed,
      summary.paid,
      summary.outstanding,
    ];
    values.forEach((value, index) => {
      cards[index]?.querySelector("strong")?.replaceChildren(rupiah(value));
    });
    cards[3]?.classList.toggle("is-warning", summary.outstanding > 0);
    const capCard = cards[4];
    if (capCard) {
      capCard.classList.toggle("is-danger", summary.overCap);
      capCard
        .querySelector("span")
        ?.replaceChildren(summary.overCap ? "Lewat pagu" : "Sisa pagu");
      capCard
        .querySelector("strong")
        ?.replaceChildren(
          summary.cap ? rupiah(Math.abs(summary.remainingCap)) : "Belum diatur",
        );
    }
  }

  function renderBearers(
    groups: {
      label: string;
      committed: number;
      paid: number;
      outstanding: number;
    }[],
  ) {
    bearers.replaceChildren();
    if (groups.length < 2) return;
    const heading = document.createElement("h3");
    heading.textContent = "Pembagian antar keluarga";
    bearers.append(heading);
    groups.forEach((group) => {
      const card = document.createElement("article");
      const name = document.createElement("strong");
      name.textContent = group.label;
      const detail = document.createElement("span");
      detail.textContent = `${rupiah(group.committed)} · dibayar ${rupiah(
        group.paid,
      )} · sisa ${rupiah(group.outstanding)}`;
      card.append(name, detail);
      bearers.append(card);
    });
  }

  function renderDue(
    entries: {
      name: string;
      dueDate: string;
      outstanding: number;
      daysLeft: number;
    }[],
  ) {
    due.replaceChildren();
    due.hidden = entries.length === 0;
    if (!entries.length) return;
    const heading = document.createElement("h3");
    heading.textContent = "Pembayaran yang perlu diingat";
    due.append(heading);
    const list = document.createElement("ul");
    entries.forEach((entry) => {
      const li = document.createElement("li");
      const lewat = entry.daysLeft < 0;
      li.className = lewat ? "is-overdue" : "";
      const tanggal = new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(`${entry.dueDate}T00:00:00+08:00`));
      li.textContent = lewat
        ? `${entry.name} — lewat ${Math.abs(entry.daysLeft)} hari (${tanggal}), kurang ${rupiah(entry.outstanding)}`
        : `${entry.name} — ${entry.daysLeft} hari lagi (${tanggal}), kurang ${rupiah(entry.outstanding)}`;
      list.append(li);
    });
    due.append(list);
  }

  /**
   * Markup SVG berasal dari modul grafik yang sudah meloloskan label pengguna
   * lewat escapeXml, jadi aman disisipkan sebagai markup.
   */
  function renderCharts(summary: {
    byCategory: Parameters<typeof categoryBars>[0];
    byBearer: Parameters<typeof bearerSplit>[0];
  }) {
    const kategori = categoryBars(summary.byCategory, {
      title: "Komitmen dan pembayaran per kategori",
    });
    const penanggung = bearerSplit(summary.byBearer, {
      title: "Proporsi komitmen antar keluarga",
    });
    charts.innerHTML = [kategori, penanggung]
      .filter(Boolean)
      .map((svg) => `<figure class="budget-chart">${svg}</figure>`)
      .join("");
    charts.hidden = !kategori && !penanggung;
  }

  function field(
    labelText: string,
    name: string,
    value: string,
    type = "text",
  ) {
    const label = document.createElement("label");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.name = name;
    input.type = type;
    input.value = value;
    if (type === "number") {
      input.min = "0";
      input.step = "1000";
    }
    if (name === "name") input.required = true;
    label.append(input);
    return label;
  }

  function row(item: BudgetItem) {
    const article = document.createElement("article");
    const status = paymentStatus(item);
    article.className = `budget-row is-${status}`;

    const head = document.createElement("header");
    const title = document.createElement("div");
    const h4 = document.createElement("h4");
    h4.textContent = item.name;
    const meta = document.createElement("p");
    meta.className = "budget-meta";
    meta.textContent = [
      CATEGORY_LABELS[item.category],
      BEARER_LABELS[item.bearer],
      item.vendor,
      item.dueDate
        ? `Jatuh tempo ${new Intl.DateTimeFormat("id-ID", {
            day: "numeric",
            month: "short",
            year: "numeric",
          }).format(new Date(`${item.dueDate}T00:00:00+08:00`))}`
        : "",
    ]
      .filter(Boolean)
      .join(" · ");
    title.append(h4, meta);
    const badge = document.createElement("span");
    badge.className = "budget-status";
    badge.textContent = STATUS_LABEL[status];
    head.append(title, badge);

    const numbers = document.createElement("dl");
    numbers.className = "budget-numbers";
    const kurang = Math.max(committedAmount(item) - item.paid, 0);
    (
      [
        ["Estimasi", item.estimate],
        ["Realisasi", item.actual],
        ["Dibayar", item.paid],
        ["Kekurangan", kurang],
      ] as const
    ).forEach(([label, value]) => {
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value === null ? "Belum dicatat" : rupiah(value);
      numbers.append(dt, dd);
    });

    article.append(head, numbers);
    if (item.note) {
      const note = document.createElement("p");
      note.className = "budget-note";
      note.textContent = item.note;
      article.append(note);
    }

    const actions = document.createElement("div");
    actions.className = "budget-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "dash-button secondary";
    edit.textContent = "Ubah";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "subtle-button";
    remove.textContent = "Hapus";
    actions.append(edit, remove);
    article.append(actions);

    remove.addEventListener("click", async () => {
      if (!window.confirm(`Hapus pos "${item.name}"?`)) return;
      remove.disabled = true;
      try {
        await send(`/api/budget/${item.id}`, "DELETE");
        notify("Pos anggaran dihapus.");
        await load();
      } catch (e) {
        notify((e as Error).message, true);
        remove.disabled = false;
      }
    });

    edit.addEventListener("click", () => {
      if (article.querySelector(".budget-edit")) return;
      const editor = document.createElement("form");
      editor.className = "budget-edit";
      const grid = document.createElement("div");
      grid.className = "form-grid";

      const categoryLabel = document.createElement("label");
      categoryLabel.textContent = "Kategori";
      const select = document.createElement("select");
      select.name = "category";
      BUDGET_CATEGORIES.forEach((category) => {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = CATEGORY_LABELS[category];
        option.selected = category === item.category;
        select.append(option);
      });
      categoryLabel.append(select);

      const bearerLabel = document.createElement("label");
      bearerLabel.textContent = "Penanggung";
      const bearerSelect = document.createElement("select");
      bearerSelect.name = "bearer";
      BUDGET_BEARERS.forEach((bearer) => {
        const option = document.createElement("option");
        option.value = bearer;
        option.textContent = BEARER_LABELS[bearer];
        option.selected = bearer === item.bearer;
        bearerSelect.append(option);
      });
      bearerLabel.append(bearerSelect);

      grid.append(
        categoryLabel,
        bearerLabel,
        field("Nama pos", "name", item.name),
        field("Vendor / pelaksana", "vendor", item.vendor),
        field("Estimasi (Rp)", "estimate", String(item.estimate), "number"),
        field(
          "Realisasi (Rp)",
          "actual",
          item.actual === null ? "" : String(item.actual),
          "number",
        ),
        field("Sudah dibayar (Rp)", "paid", String(item.paid), "number"),
        field("Jatuh tempo", "dueDate", item.dueDate, "date"),
        field("Catatan", "note", item.note),
      );
      const save = document.createElement("button");
      save.type = "submit";
      save.className = "dash-button";
      save.textContent = "Simpan perubahan";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "subtle-button";
      cancel.textContent = "Batal";
      cancel.addEventListener("click", () => editor.remove());
      editor.append(grid, save, cancel);

      editor.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!editor.reportValidity()) return;
        save.disabled = true;
        try {
          await send(
            `/api/budget/${item.id}`,
            "POST",
            itemPayload(new FormData(editor)),
          );
          notify("Pos anggaran diperbarui.");
          await load();
        } catch (e) {
          notify((e as Error).message, true);
          save.disabled = false;
        }
      });
      article.append(editor);
    });

    return article;
  }

  async function load() {
    try {
      const data = await send("/api/budget", "GET");
      list.replaceChildren();
      if (!data.items.length) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        const heading = document.createElement("h3");
        heading.textContent = "Belum ada pos anggaran.";
        const hint = document.createElement("p");
        hint.textContent =
          "Mulai dari upakara, katering, dan busana, lalu isi realisasinya setelah pembayaran.";
        empty.append(heading, hint);
        list.append(empty);
      } else {
        data.summary.byCategory.forEach(
          (group: {
            category: string;
            label: string;
            committed: number;
            paid: number;
          }) => {
            const block = document.createElement("section");
            block.className = "budget-group";
            const heading = document.createElement("h3");
            heading.textContent = group.label;
            const total = document.createElement("span");
            total.textContent = `${rupiah(group.committed)} · dibayar ${rupiah(group.paid)}`;
            block.append(heading, total);
            data.items
              .filter((i: BudgetItem) => i.category === group.category)
              .forEach((i: BudgetItem) => block.append(row(i)));
            list.append(block);
          },
        );
      }
      renderStats(data.summary);
      renderBearers(data.summary.byBearer);
      renderDue(data.summary.dueSoon);
      renderCharts(data.summary);
    } catch (e) {
      notify((e as Error).message, true);
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const button = form.querySelector<HTMLButtonElement>(
      "button[type=submit]",
    )!;
    button.disabled = true;
    error.textContent = "";
    try {
      await send("/api/budget", "POST", itemPayload(new FormData(form)));
      form.reset();
      notify("Pos anggaran ditambahkan.");
      await load();
    } catch (e) {
      error.textContent = (e as Error).message;
    } finally {
      button.disabled = false;
    }
  });

  capForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = capForm.querySelector<HTMLButtonElement>("button")!;
    button.disabled = true;
    try {
      await send("/api/budget/settings", "POST", {
        cap: amount(new FormData(capForm), "cap"),
      });
      notify("Pagu anggaran disimpan.");
      await load();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      button.disabled = false;
    }
  });

  templateButton.addEventListener("click", async () => {
    if (
      !window.confirm(
        "Tambahkan kerangka pos pawiwahan Bali? Pos dengan nama yang sudah ada dilewati.",
      )
    )
      return;
    templateButton.disabled = true;
    try {
      const result = await send("/api/budget/template", "POST", {});
      notify(
        result.added
          ? `${result.added} pos ditambahkan.`
          : "Semua pos kerangka sudah ada.",
      );
      await load();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      templateButton.disabled = false;
    }
  });

  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    // Impor selalu menambah, jadi mengulang berkas yang sama akan menggandakan
    // daftar bila pemilik tidak diberi pilihan.
    const skipExisting = window.confirm(
      `Impor "${file.name}". Lewati pos yang namanya sudah ada?\n\nOK = lewati duplikat · Batal = tambahkan semua baris.`,
    );
    importInput.disabled = true;
    try {
      const result = await send("/api/budget/import", "POST", {
        csv: await file.text(),
        skipExisting,
      });
      const dilewati = result.skipped
        ? ` ${result.skipped} duplikat dilewati.`
        : "";
      const catatan = result.errors?.length
        ? ` ${result.errors.length} baris bermasalah.`
        : "";
      notify(
        `${result.added} pos diimpor.${dilewati}${catatan}`,
        !result.added && !result.skipped,
      );
      if (result.errors?.length)
        error.textContent = result.errors
          .slice(0, 5)
          .map((e: { line: number; message: string }) =>
            e.line ? `Baris ${e.line}: ${e.message}` : e.message,
          )
          .join(" · ");
      await load();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      importInput.disabled = false;
      importInput.value = "";
    }
  });

  void load();
}
