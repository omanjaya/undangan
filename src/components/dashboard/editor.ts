import type { InvitationContent } from "../../modules/invitations/domain/invitation";
import { isGoogleMapEmbedUrl } from "../../modules/invitations/domain/maps";
import { youtubeId } from "../../modules/invitations/domain/video";
type Asset = {
  id: string;
  url: string;
  kind: "image" | "video" | "audio";
  name: string;
  bytes: number;
  mime: string;
};
type ExtraEvent = InvitationContent["events"][number];
const form = document.querySelector<HTMLFormElement>("#editor-form")!;
const original = JSON.parse(form.dataset.content!) as InvitationContent;
let dirty = false;
let editRevision = 0;
let saving = false;
let uploading = false;
let publishing = false;
let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
let saveQueued = false;
let conflicted = false;
let assets: Asset[] = [];
let gallery: string[] = [...(original.galleryPhotos || [])];
let events: ExtraEvent[] = [...(original.events || [])];
const toast = document.querySelector<HTMLElement>("#toast")!;
const state = document.querySelector<HTMLElement>("#save-state")!;
let timer: ReturnType<typeof setTimeout>;
function notify(message: string, error = false) {
  toast.textContent = message;
  toast.hidden = false;
  toast.classList.toggle("error", error);
  clearTimeout(timer);
  timer = setTimeout(() => (toast.hidden = true), 6500);
}
function markDirty() {
  editRevision++;
  dirty = true;
  state.textContent = "Perubahan menunggu disimpan…";
  updateChecklist();
  clearTimeout(autosaveTimer);
  if (!publishing) autosaveTimer = setTimeout(() => void autosave(), 1200);
}
async function autosave() {
  if (!dirty || uploading || publishing || conflicted) return;
  if (saving) {
    saveQueued = true;
    return;
  }
  try {
    state.textContent = "Menyimpan otomatis…";
    await saveDraft(false);
  } catch (error) {
    if (conflicted) return;
    state.textContent = (error as Error).message.includes("versi")
      ? "Konflik versi — muat ulang sebelum melanjutkan"
      : "Penyimpanan otomatis gagal — perubahan tetap di halaman";
  }
}
async function post(url: string, data: unknown = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await res.json();
  if (!res.ok) {
    const error = new Error(result.error || "Permintaan gagal.") as Error & {
      status?: number;
    };
    error.status = res.status;
    throw error;
  }
  return result;
}
function markContentChange(event: Event) {
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    (target.id === "recipient-name" || target.id === "media-upload")
  )
    return;
  markDirty();
}
form.addEventListener("input", markContentChange);
form.addEventListener("change", markContentChange);
const illustrationOptions = document.querySelector<HTMLElement>(
  "#illustration-options",
)!;
function updatePhotoModeControls() {
  const photoMode = form.querySelector<HTMLInputElement>(
    'input[name="photoMode"]:checked',
  )?.value;
  illustrationOptions.hidden = photoMode !== "illustrated";
}
form
  .querySelectorAll<HTMLInputElement>('input[name="photoMode"]')
  .forEach((input) =>
    input.addEventListener("change", updatePhotoModeControls),
  );
updatePhotoModeControls();
window.addEventListener("beforeunload", (e) => {
  if (dirty || uploading) e.preventDefault();
});
const localDate = (value: string) =>
  new Date(new Date(value).getTime() + 8 * 3600000).toISOString().slice(0, 16);
function renderEvents() {
  const container = document.querySelector<HTMLElement>("#extra-events")!;
  container.replaceChildren();
  events.forEach((event, index) => {
    const row = document.createElement("fieldset");
    row.className = "event-editor";
    const legend = document.createElement("legend");
    legend.textContent = `Acara tambahan ${index + 1}`;
    row.append(legend);
    const grid = document.createElement("div");
    grid.className = "form-grid";
    const fields: [keyof ExtraEvent, string, string][] = [
      ["title", "Nama acara", "text"],
      ["date", "Tanggal & waktu mulai (WITA)", "datetime-local"],
      ["endDate", "Waktu selesai (opsional, WITA)", "datetime-local"],
      ["venue", "Tempat", "text"],
      ["address", "Alamat", "text"],
      ["mapUrl", "Tautan peta HTTPS", "url"],
      ["mapEmbedUrl", "Tautan embed Google Maps (opsional)", "url"],
    ];
    fields.forEach(([key, title, type]) => {
      const label = document.createElement("label");
      label.textContent = title;
      const input = document.createElement("input");
      input.type = type;
      const isDateField = key === "date" || key === "endDate";
      input.value = isDateField
        ? event[key]
          ? localDate(event[key] as string)
          : ""
        : (event[key] as string);
      input.required = key !== "mapEmbedUrl" && key !== "endDate";
      if (!isDateField)
        input.maxLength =
          key === "mapUrl"
            ? 2000
            : key === "mapEmbedUrl"
              ? 4096
              : key === "address"
                ? 300
                : key === "venue"
                  ? 180
                  : 100;
      input.addEventListener("input", () => {
        if (key === "endDate") {
          event.endDate = input.value
            ? new Date(input.value + ":00+08:00").toISOString()
            : undefined;
        } else {
          event[key] =
            key === "date" && input.value
              ? new Date(input.value + ":00+08:00").toISOString()
              : input.value;
        }
        if (key === "mapEmbedUrl")
          input.setCustomValidity(
            input.value && !isGoogleMapEmbedUrl(input.value)
              ? "Gunakan tautan dari Google Maps > Bagikan > Sematkan peta."
              : "",
          );
      });
      if (key === "mapEmbedUrl" && input.value)
        input.setCustomValidity(
          isGoogleMapEmbedUrl(input.value)
            ? ""
            : "Gunakan tautan dari Google Maps > Bagikan > Sematkan peta.",
        );
      label.append(input);
      if (key === "mapEmbedUrl") {
        attachEmbedPaste(input);
        const help = document.createElement("small");
        help.textContent =
          "Google Maps → Bagikan → Sematkan peta; tempel URL src atau kode iframe lengkap.";
        label.append(help);
      }
      grid.append(label);
    });
    row.append(grid);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "subtle-button";
    remove.textContent = "Hapus acara ini";
    remove.addEventListener("click", () => {
      events.splice(index, 1);
      renderEvents();
      markDirty();
    });
    row.append(remove);
    container.append(row);
  });
  document.querySelector<HTMLButtonElement>("#add-event")!.disabled =
    events.length >= 4;
}
document.querySelector("#add-event")!.addEventListener("click", () => {
  if (events.length >= 4) return;
  events.push({
    title: "Resepsi",
    date: original.date,
    venue: "",
    address: "",
    mapUrl: "",
    mapEmbedUrl: "",
  });
  renderEvents();
  markDirty();
});
renderEvents();
const mainEmbed = form.querySelector<HTMLInputElement>('[name="mapEmbedUrl"]');
if (mainEmbed?.value && !isGoogleMapEmbedUrl(mainEmbed.value))
  mainEmbed.setCustomValidity(
    "Gunakan tautan dari Google Maps > Bagikan > Sematkan peta.",
  );
mainEmbed?.addEventListener("input", () =>
  mainEmbed.setCustomValidity(
    mainEmbed.value && !isGoogleMapEmbedUrl(mainEmbed.value)
      ? "Gunakan tautan dari Google Maps > Bagikan > Sematkan peta."
      : "",
  ),
);
if (mainEmbed) attachEmbedPaste(mainEmbed);

function attachEmbedPaste(input: HTMLInputElement) {
  input.addEventListener("paste", (event) => {
    const pasted = event.clipboardData?.getData("text/plain").trim() || "";
    if (!pasted.startsWith("<")) return;
    const document = new DOMParser().parseFromString(pasted, "text/html");
    const source = document
      .querySelector("iframe")
      ?.getAttribute("src")
      ?.trim();
    event.preventDefault();
    if (!source || !isGoogleMapEmbedUrl(source)) {
      input.setCustomValidity(
        "Kode iframe tidak memuat URL embed Google Maps yang valid.",
      );
      input.reportValidity();
      return;
    }
    input.value = source;
    input.setCustomValidity("");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function preview(url: string, kind: string, alt: string) {
  if (kind === "image") {
    const img = document.createElement("img");
    img.src = url;
    img.alt = alt;
    img.loading = "lazy";
    return img;
  }
  const media = document.createElement(kind === "video" ? "video" : "audio");
  media.src = url;
  media.controls = true;
  media.preload = "metadata";
  if (media instanceof HTMLVideoElement) media.playsInline = true;
  return media;
}
function renderSlots() {
  document.querySelectorAll<HTMLElement>("[data-slot]").forEach((slot) => {
    const url = slot.querySelector<HTMLInputElement>("input")!.value;
    const box = slot.querySelector<HTMLElement>(".slot-preview")!;
    box.replaceChildren();
    if (url)
      box.append(
        preview(
          url,
          slot.dataset.kind!,
          slot.querySelector("h4")!.textContent!,
        ),
      );
    else {
      const p = document.createElement("p");
      p.textContent = "Belum dipilih";
      box.append(p);
    }
    slot.querySelector<HTMLButtonElement>("[data-clear-media]")!.disabled =
      !url;
    if (slot.dataset.kind === "image") {
      let controls = slot.querySelector<HTMLElement>(".focus-controls");
      if (!controls) {
        controls = document.createElement("div");
        controls.className = "focus-controls";
        controls.innerHTML = `<strong>Titik fokus</strong><label>Horizontal <input type="range" min="0" max="100"></label><label>Vertikal <input type="range" min="0" max="100"></label>`;
        slot.querySelector(".slot-actions")!.before(controls);
        controls
          .querySelectorAll<HTMLInputElement>("input")
          .forEach((input, axis) => {
            input.addEventListener("input", () => {
              const key = slot.dataset
                .slot as keyof InvitationContent["imageFocus"];
              original.imageFocus[key][axis === 0 ? "x" : "y"] = Number(
                input.value,
              );
              const image = box.querySelector<HTMLImageElement>("img");
              if (image)
                image.style.objectPosition = `${original.imageFocus[key].x}% ${original.imageFocus[key].y}%`;
              markDirty();
            });
          });
      }
      const key = slot.dataset.slot as keyof InvitationContent["imageFocus"];
      const focus = original.imageFocus?.[key] || { x: 50, y: 50 };
      const ranges = controls.querySelectorAll<HTMLInputElement>("input");
      ranges[0].value = String(focus.x);
      ranges[1].value = String(focus.y);
      const image = box.querySelector<HTMLImageElement>("img");
      if (image) image.style.objectPosition = `${focus.x}% ${focus.y}%`;
      controls.hidden = !url;
    }
  });
}
document
  .querySelectorAll<HTMLButtonElement>("[data-clear-media]")
  .forEach((button) =>
    button.addEventListener("click", () => {
      form.querySelector<HTMLInputElement>(
        `input[name="${button.dataset.clearMedia}"]`,
      )!.value = "";
      renderSlots();
      markDirty();
    }),
  );
function renderGallery() {
  const container = document.querySelector<HTMLElement>("#gallery-items")!;
  container.replaceChildren();
  document.querySelector("#gallery-count")!.textContent =
    `${gallery.length}/12`;
  gallery.forEach((url, index) => {
    const card = document.createElement("div");
    card.className = "gallery-item";
    card.draggable = true;
    card.dataset.index = String(index);
    card.addEventListener("dragstart", (event) => {
      event.dataTransfer?.setData("text/plain", String(index));
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
    card.addEventListener("dragover", (event) => event.preventDefault());
    card.addEventListener("drop", (event) => {
      event.preventDefault();
      const value = event.dataTransfer?.getData("text/plain") ?? "";
      if (!/^\d+$/.test(value)) return;
      const from = Number(value);
      if (from < 0 || from >= gallery.length || from === index) return;
      const [moved] = gallery.splice(from, 1);
      gallery.splice(index, 0, moved);
      renderGallery();
      markDirty();
    });
    card.append(preview(url, "image", `Foto galeri ${index + 1}`));
    const actions = document.createElement("div");
    [
      ["Lebih awal", -1],
      ["Lebih akhir", 1],
      ["Hapus", 0],
    ].forEach(([label, move]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = String(label);
      button.setAttribute("aria-label", `${label} foto ${index + 1}`);
      button.disabled =
        (move === -1 && index === 0) ||
        (move === 1 && index === gallery.length - 1);
      button.addEventListener("click", () => {
        if (move === 0) gallery.splice(index, 1);
        else {
          const next = index + Number(move);
          [gallery[index], gallery[next]] = [gallery[next], gallery[index]];
        }
        renderGallery();
        markDirty();
      });
      actions.append(button);
    });
    card.append(actions);
    container.append(card);
  });
  form.querySelector<HTMLButtonElement>(
    '[data-select-media="galleryPhotos"]',
  )!.disabled = gallery.length >= 12;
}
renderSlots();
renderGallery();
const dialog = document.querySelector<HTMLDialogElement>("#media-dialog")!;
let targetSlot = "";
async function loadLibrary() {
  const container = document.querySelector<HTMLElement>("#media-library")!;
  const status = document.querySelector<HTMLElement>("#media-library-status")!;
  container.replaceChildren();
  status.textContent = "Memuat pustaka…";
  try {
    const res = await fetch("/api/media");
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Pustaka tidak dapat dimuat.");
    assets = result.assets;
    const kind =
      targetSlot === "galleryPhotos"
        ? "image"
        : form.querySelector<HTMLElement>(`[data-slot="${targetSlot}"]`)!
            .dataset.kind;
    const filtered = assets.filter((a) => a.kind === kind);
    status.textContent = filtered.length
      ? `${filtered.length} berkas tersedia di pustaka`
      : "Pustaka masih kosong untuk bagian ini. Unggah berkas di atas.";
    filtered.forEach((asset) => {
      const card = document.createElement("article");
      const usage = mediaUsage(asset.url);
      card.append(preview(asset.url, asset.kind, asset.name));
      const title = document.createElement("p");
      title.textContent = asset.name;
      card.append(title);
      const meta = document.createElement("small");
      meta.className = "media-meta";
      meta.textContent = `${formatBytes(asset.bytes)}${usage ? ` · Dipakai di draft: ${usage}` : ""}`;
      card.append(meta);
      const choose = document.createElement("button");
      choose.type = "button";
      choose.className = "dash-button";
      choose.textContent = "Gunakan";
      choose.disabled =
        targetSlot === "galleryPhotos" && gallery.includes(asset.url);
      choose.addEventListener("click", () => {
        if (!applyToTarget(asset.url)) return;
        dialog.close();
      });
      card.append(choose);
      if (asset.kind === "image") {
        const crop = document.createElement("button");
        crop.type = "button";
        crop.className = "dash-button secondary";
        crop.textContent = "Potong & fokus";
        crop.addEventListener("click", () => openCrop(asset));
        card.append(crop);
      }
      container.append(card);
    });
  } catch (e) {
    status.textContent = (e as Error).message;
  }
}
function formatBytes(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function mediaUsage(url: string) {
  const labels: string[] = [];
  document.querySelectorAll<HTMLElement>("[data-slot]").forEach((slot) => {
    if (slot.querySelector<HTMLInputElement>("input")?.value === url)
      labels.push(slot.querySelector("h4")?.textContent || "bagian undangan");
  });
  if (gallery.includes(url)) labels.push("galeri");
  return labels.join(", ");
}
const ACCEPT: Record<string, string> = {
  image: "image/jpeg,image/png,image/webp",
  video: "video/mp4,video/webm",
  audio: "audio/mpeg,audio/mp4,audio/ogg,audio/wav",
};
function targetKind() {
  return targetSlot === "galleryPhotos"
    ? "image"
    : form.querySelector<HTMLElement>(`[data-slot="${targetSlot}"]`)!.dataset
        .kind!;
}
/** Pasang berkas ke slot yang sedang dibuka, atau tambahkan ke galeri. */
function applyToTarget(url: string) {
  if (targetSlot === "galleryPhotos") {
    if (gallery.length >= 12 || gallery.includes(url)) return false;
    gallery.push(url);
    renderGallery();
  } else {
    form.querySelector<HTMLInputElement>(`input[name="${targetSlot}"]`)!.value =
      url;
    renderSlots();
  }
  markDirty();
  return true;
}
document
  .querySelectorAll<HTMLButtonElement>("[data-select-media]")
  .forEach((button) =>
    button.addEventListener("click", () => {
      targetSlot = button.dataset.selectMedia!;
      const kind = targetKind();
      dialogUpload.accept = ACCEPT[kind];
      dialogUpload.multiple = targetSlot === "galleryPhotos";
      dialogUploadHint.textContent =
        targetSlot === "galleryPhotos"
          ? "Foto yang diunggah langsung masuk galeri."
          : "Berkas langsung dipasang setelah unggahan selesai.";
      dialog.showModal();
      void loadLibrary();
    }),
  );
const dialogUpload =
  document.querySelector<HTMLInputElement>("#dialog-upload")!;
const dialogUploadHint = document.querySelector<HTMLElement>(
  "#dialog-upload-hint",
)!;
const dialogProgress = document.querySelector<HTMLProgressElement>(
  "#dialog-upload-progress",
)!;
dialogUpload.addEventListener("change", async () => {
  const files = [...(dialogUpload.files || [])];
  if (!files.length) return;
  if (uploading) {
    notify("Unggahan lain masih berjalan. Tunggu hingga selesai.", true);
    return;
  }
  uploading = true;
  dialogUpload.disabled = true;
  dialogProgress.hidden = false;
  const status = document.querySelector<HTMLElement>("#media-library-status")!;
  let dipasang = 0;
  const errors: string[] = [];
  for (const file of files) {
    status.textContent = `Mengunggah ${file.name}…`;
    dialogProgress.value = 0;
    try {
      const asset = await uploadFile(file, (n) => (dialogProgress.value = n));
      assets.push(asset);
      if (applyToTarget(asset.url)) dipasang++;
    } catch (e) {
      errors.push(`${file.name}: ${(e as Error).message}`);
    }
  }
  uploading = false;
  dialogUpload.disabled = false;
  dialogUpload.value = "";
  dialogProgress.hidden = true;
  if (errors.length) {
    status.textContent = errors.join(" ");
    notify("Sebagian berkas gagal diunggah.", true);
    void loadLibrary();
    return;
  }
  notify(`${dipasang} berkas dipasang.`);
  dialog.close();
});
document
  .querySelector("#close-media")!
  .addEventListener("click", () => dialog.close());
function uploadFile(
  file: File,
  onProgress: (value: number) => void,
): Promise<Asset> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/media");
    xhr.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream",
    );
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const result = JSON.parse(xhr.responseText);
        if (xhr.status < 200 || xhr.status >= 300)
          reject(new Error(result.error || "Unggahan gagal."));
        else resolve(result.asset);
      } catch {
        reject(new Error("Unggahan gagal. Periksa ukuran dan format berkas."));
      }
    };
    xhr.onerror = () =>
      reject(new Error("Koneksi terputus saat mengunggah. Silakan coba lagi."));
    xhr.timeout = 180000;
    xhr.ontimeout = () =>
      reject(new Error("Unggahan melewati batas waktu. Silakan coba lagi."));
    xhr.send(file);
  });
}
const upload = document.querySelector<HTMLInputElement>("#media-upload")!;
async function uploadFiles(files: File[]) {
  if (!files.length) return;
  if (uploading) {
    notify("Unggahan lain masih berjalan. Tunggu hingga selesai.", true);
    return;
  }
  uploading = true;
  upload.disabled = true;
  const progress =
    document.querySelector<HTMLProgressElement>("#upload-progress")!;
  const status = document.querySelector<HTMLElement>("#upload-status")!;
  progress.hidden = false;
  let success = 0;
  const uploaded: Asset[] = [];
  const errors: string[] = [];
  for (const file of files) {
    status.textContent = `Mengunggah ${file.name}…`;
    progress.value = 0;
    try {
      const asset = await uploadFile(file, (n) => (progress.value = n));
      assets.push(asset);
      uploaded.push(asset);
      success++;
    } catch (e) {
      errors.push(`${file.name}: ${(e as Error).message}`);
    }
  }
  uploading = false;
  upload.disabled = false;
  upload.value = "";
  progress.hidden = true;
  const dipasang = autoAssignSingleSlots(uploaded);
  status.textContent = `${success} berkas tersimpan di pustaka.${
    dipasang.length ? ` Langsung dipasang ke ${dipasang.join(" dan ")}.` : ""
  }${
    dipasang.length < success
      ? " Untuk foto, buka Pilih media pada bagian yang dituju."
      : ""
  }${errors.length ? " " + errors.join(" ") : ""}`;
  notify(
    errors.length
      ? "Beberapa berkas gagal diunggah. Lihat keterangan unggahan."
      : dipasang.length
        ? `Media dipasang ke ${dipasang.join(" dan ")}.`
        : "Media siap dipilih untuk undangan.",
    errors.length > 0,
  );
  if (dirty) void autosave();
}
/**
 * Musik dan film hanya punya satu slot, jadi berkas yang baru diunggah langsung
 * dipasang bila slotnya masih kosong. Foto tetap dipilih manual karena ada
 * beberapa slot dan galeri.
 */
function autoAssignSingleSlots(uploaded: Asset[]) {
  const dipasang: string[] = [];
  for (const kind of ["audio", "video"] as const) {
    const asset = uploaded.find((a) => a.kind === kind);
    if (!asset) continue;
    const slot = form.querySelector<HTMLElement>(
      `[data-slot][data-kind="${kind}"]`,
    );
    const input = slot?.querySelector<HTMLInputElement>("input");
    if (!slot || !input || input.value) continue;
    input.value = asset.url;
    dipasang.push(slot.querySelector("h4")?.textContent?.trim() || kind);
  }
  if (dipasang.length) {
    renderSlots();
    markDirty();
  }
  return dipasang;
}
upload.addEventListener(
  "change",
  () => void uploadFiles([...(upload.files || [])]),
);
const uploadZone = document.querySelector<HTMLElement>("#upload-zone")!;
for (const eventName of ["dragenter", "dragover"])
  uploadZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadZone.classList.add("drag-over");
  });
for (const eventName of ["dragleave", "drop"])
  uploadZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadZone.classList.remove("drag-over");
  });
uploadZone.addEventListener(
  "drop",
  (event) => void uploadFiles([...(event.dataTransfer?.files || [])]),
);

const cropDialog = document.querySelector<HTMLDialogElement>("#crop-dialog")!;
const cropCanvas = document.querySelector<HTMLCanvasElement>("#crop-canvas")!;
const cropContext = cropCanvas.getContext("2d")!;
let cropImage: HTMLImageElement | null = null;
let cropAsset: Asset | null = null;
function openCrop(asset: Asset) {
  cropAsset = asset;
  cropImage = new Image();
  cropImage.onload = () => {
    drawCrop();
    cropDialog.showModal();
  };
  cropImage.onerror = () =>
    notify("Foto tidak dapat dibuka untuk dipotong.", true);
  cropImage.src = asset.url;
}
function drawCrop() {
  if (!cropImage) return;
  const ratio = Number(
    document.querySelector<HTMLSelectElement>("#crop-ratio")!.value,
  );
  cropCanvas.width = 1200;
  cropCanvas.height = Math.round(1200 / ratio);
  const zoom = Number(
    document.querySelector<HTMLInputElement>("#crop-zoom")!.value,
  );
  const x =
    Number(document.querySelector<HTMLInputElement>("#crop-x")!.value) / 100;
  const y =
    Number(document.querySelector<HTMLInputElement>("#crop-y")!.value) / 100;
  const base = Math.max(
    cropCanvas.width / cropImage.naturalWidth,
    cropCanvas.height / cropImage.naturalHeight,
  );
  const width = cropImage.naturalWidth * base * zoom;
  const height = cropImage.naturalHeight * base * zoom;
  const left = (cropCanvas.width - width) * x;
  const top = (cropCanvas.height - height) * y;
  cropContext.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
  cropContext.drawImage(cropImage, left, top, width, height);
}
document
  .querySelector("#close-crop")!
  .addEventListener("click", () => cropDialog.close());
document
  .querySelectorAll("#crop-dialog input, #crop-dialog select")
  .forEach((control) => control.addEventListener("input", drawCrop));
document.querySelector("#save-crop")!.addEventListener("click", async () => {
  if (!cropAsset) return;
  const button = document.querySelector<HTMLButtonElement>("#save-crop")!;
  if (uploading) {
    notify("Tunggu unggahan lain selesai terlebih dahulu.", true);
    return;
  }
  uploading = true;
  button.disabled = true;
  try {
    const blob = await new Promise<Blob>((resolve, reject) =>
      cropCanvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error("Foto gagal diproses.")),
        "image/webp",
        0.9,
      ),
    );
    const name = `${cropAsset.name.replace(/\.[^.]+$/, "")}-crop.webp`;
    const asset = await uploadFile(
      new File([blob], name, { type: "image/webp" }),
      () => {},
    );
    assets.push(asset);
    cropDialog.close();
    await loadLibrary();
    notify("Foto hasil potongan tersimpan dan siap digunakan.");
  } catch (error) {
    notify((error as Error).message, true);
  } finally {
    uploading = false;
    button.disabled = false;
    if (dirty) void autosave();
  }
});

const previewFrame =
  document.querySelector<HTMLIFrameElement>("#draft-preview")!;
const previewViewport = document.querySelector<HTMLElement>(
  ".live-preview-frame",
)!;
function sizePreview() {
  if (previewViewport.dataset.size === "mobile") {
    previewViewport.style.removeProperty("--preview-scale");
    previewViewport.style.height = "680px";
    return;
  }
  const scale = Math.min(1, previewViewport.clientWidth / 1200);
  previewViewport.style.setProperty("--preview-scale", String(scale));
  previewViewport.style.height = `${Math.round(850 * scale)}px`;
}
new ResizeObserver(sizePreview).observe(previewViewport);
function refreshPreview() {
  const url = new URL(previewFrame.src);
  url.searchParams.set("updated", String(Date.now()));
  previewFrame.src = url.toString();
}
document
  .querySelectorAll<HTMLButtonElement>("[data-preview-size]")
  .forEach((button) =>
    button.addEventListener("click", () => {
      document
        .querySelectorAll<HTMLButtonElement>("[data-preview-size]")
        .forEach((item) => {
          item.classList.remove("active");
          item.setAttribute("aria-pressed", "false");
        });
      button.classList.add("active");
      button.setAttribute("aria-pressed", "true");
      previewViewport.dataset.size = button.dataset.previewSize;
      sizePreview();
    }),
  );
document
  .querySelector<HTMLButtonElement>('[data-preview-size="desktop"]')!
  .setAttribute("aria-pressed", "true");
sizePreview();

function updateChecklist() {
  const fields = Object.fromEntries(new FormData(form));
  const checks: Array<readonly [string, boolean]> = [
    [
      "Nama kedua mempelai lengkap",
      Boolean(
        fields.bride &&
        fields.groom &&
        fields.brideFullName &&
        fields.groomFullName,
      ),
    ],
    [
      "Tanggal, tempat, alamat, dan peta terisi",
      Boolean(fields.date && fields.venue && fields.address && fields.mapUrl),
    ],
    [
      "Kalimat undangan sudah terisi",
      Boolean(String(fields.opening || "").trim()),
    ],
    ["Semua perubahan sudah tersimpan", !dirty && !saving && !uploading],
    [
      fields.youtubeUrl
        ? "Format tautan YouTube valid — cek video di pratinjau"
        : "YouTube tidak digunakan (opsional)",
      !fields.youtubeUrl || youtubeId(String(fields.youtubeUrl)) !== null,
    ],
    [
      fields.videoUrl
        ? "Format video unggahan valid — cek video di pratinjau"
        : "Video unggahan tidak digunakan (opsional)",
      !fields.videoUrl || String(fields.videoUrl).startsWith("/media/"),
    ],
    [
      "Pin peta tepat sudah disematkan (disarankan)",
      Boolean(
        fields.mapEmbedUrl && isGoogleMapEmbedUrl(String(fields.mapEmbedUrl)),
      ),
    ],
  ];
  if (fields.photoMode !== "illustrated")
    checks.splice(2, 0, [
      "Foto sampul sudah dipilih (disarankan)",
      Boolean(fields.heroPhoto),
    ]);
  const list = document.querySelector<HTMLUListElement>("#checklist")!;
  list.replaceChildren(
    ...checks.map(([label, complete]) => {
      const item = document.createElement("li");
      item.className = complete ? "complete" : "";
      item.textContent = `${complete ? "✓" : "○"} ${label}`;
      return item;
    }),
  );
  const complete = checks.filter(([, ok]) => ok).length;
  document.querySelector("#checklist-summary")!.textContent =
    complete === checks.length
      ? "Siap diterbitkan. Periksa pratinjau terakhir kali."
      : `${complete}/${checks.length} pemeriksaan selesai.`;
}
updateChecklist();
document.querySelector("#reload-conflict")!.addEventListener("click", () => {
  location.reload();
});
const recipientName =
  document.querySelector<HTMLInputElement>("#recipient-name")!;
const recipientLink =
  document.querySelector<HTMLOutputElement>("#recipient-link")!;
function updateRecipientLink() {
  const url = new URL(`/i/${form.dataset.slug}`, location.origin);
  const name = recipientName.value.trim();
  if (name) url.searchParams.set("to", name);
  recipientLink.value = name
    ? url.toString()
    : "Masukkan nama penerima untuk membuat tautan.";
}
recipientName.addEventListener("input", updateRecipientLink);
document
  .querySelector("#copy-recipient-link")!
  .addEventListener("click", async () => {
    const name = recipientName.value.trim();
    if (!name) {
      recipientName.focus();
      notify("Masukkan nama penerima terlebih dahulu.", true);
      return;
    }
    updateRecipientLink();
    try {
      await navigator.clipboard.writeText(recipientLink.value);
      notify(`Tautan untuk ${name} disalin.`);
    } catch {
      notify(recipientLink.value);
    }
  });
updateRecipientLink();

async function saveDraft(validate = true) {
  if (uploading) throw new Error("Tunggu unggahan selesai terlebih dahulu.");
  if (conflicted)
    throw new Error("Draft berubah di tempat lain. Muat ulang draft terbaru.");
  if (saving) throw new Error("Penyimpanan masih berjalan.");
  if (validate && !form.reportValidity())
    throw new Error("Lengkapi kolom yang ditandai terlebih dahulu.");
  saving = true;
  const revision = editRevision;
  const button = form.querySelector<HTMLButtonElement>(
    'button[type="submit"]',
  )!;
  const publishButton = document.querySelector<HTMLButtonElement>("#publish");
  button.disabled = true;
  if (publishButton) publishButton.disabled = true;
  try {
    const fields = Object.fromEntries(new FormData(form));
    const content: InvitationContent = {
      ...original,
      ...fields,
      illustrationSlideshow: fields.illustrationSlideshow === "true",
      date: new Date(String(fields.date) + ":00+08:00").toISOString(),
      galleryPhotos: [...gallery],
      events: structuredClone(events),
      imageFocus: original.imageFocus,
    };
    const saved = await post(`/api/invitations/${form.dataset.slug}/draft`, {
      lockVersion: Number(form.dataset.version),
      content,
    });
    form.dataset.version = String(saved.lockVersion);
    Object.assign(original, content);
    dirty = editRevision !== revision;
    state.textContent = dirty
      ? "Ada perubahan baru yang belum disimpan"
      : `Tersimpan · draft versi ${saved.lockVersion}`;
    if (!dirty) refreshPreview();
    updateChecklist();
    return saved;
  } catch (e) {
    if ((e as Error & { status?: number }).status === 409) {
      conflicted = true;
      clearTimeout(autosaveTimer);
      state.textContent = "Konflik versi — draft berubah di tempat lain";
      document.querySelector<HTMLButtonElement>("#reload-conflict")!.hidden =
        false;
    } else state.textContent = "Belum tersimpan";
    throw e;
  } finally {
    saving = false;
    button.disabled = false;
    if (publishButton && !publishing) publishButton.disabled = false;
    if (saveQueued) {
      saveQueued = false;
      if (dirty && !publishing) void autosave();
    }
    updateChecklist();
  }
}
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await saveDraft();
    notify("Draft tersimpan. Pratinjau atau terbitkan saat siap.");
  } catch (e) {
    notify((e as Error).message, true);
  }
});
document
  .querySelectorAll<HTMLAnchorElement>('a[href*="?preview=1"]')
  .forEach((link) =>
    link.addEventListener("click", (e) => {
      if (dirty || uploading) {
        e.preventDefault();
        notify(
          "Simpan perubahan dan selesaikan unggahan sebelum membuka pratinjau draft.",
          true,
        );
        document
          .querySelector("#save-state")!
          .scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }),
  );
let publishControlStates: Array<
  [
    (
      | HTMLInputElement
      | HTMLButtonElement
      | HTMLSelectElement
      | HTMLTextAreaElement
    ),
    boolean,
  ]
> = [];
for (const action of ["publish", "unpublish"])
  document
    .querySelector<HTMLButtonElement>(`#${action}`)
    ?.addEventListener("click", async (e) => {
      const button = e.currentTarget as HTMLButtonElement;
      button.disabled = true;
      try {
        if (action === "publish") {
          publishing = true;
          clearTimeout(autosaveTimer);
          await saveDraft();
          if (dirty)
            throw new Error(
              "Ada perubahan baru saat menyimpan. Klik terbitkan kembali.",
            );
          publishControlStates = [
            ...form.querySelectorAll<
              | HTMLInputElement
              | HTMLButtonElement
              | HTMLSelectElement
              | HTMLTextAreaElement
            >("input, button, select, textarea"),
          ].map((control) => [control, control.disabled]);
          publishControlStates.forEach(
            ([control]) => (control.disabled = true),
          );
        } else if (dirty)
          throw new Error("Simpan perubahan sebelum menarik undangan.");
        await post(`/api/invitations/${button.dataset.slug}/${action}`);
        location.reload();
      } catch (e) {
        notify((e as Error).message, true);
        button.disabled = false;
        publishing = false;
        publishControlStates.forEach(
          ([control, wasDisabled]) => (control.disabled = wasDisabled),
        );
        publishControlStates = [];
      }
    });
document.querySelector("#logout")?.addEventListener("click", async () => {
  if (dirty) {
    notify("Simpan perubahan sebelum keluar.", true);
    return;
  }
  try {
    await post("/api/auth/logout");
    location.href = "/login";
  } catch (e) {
    notify((e as Error).message, true);
  }
});
document.querySelector("#copy-link")?.addEventListener("click", async () => {
  const url = `${location.origin}/i/${form.dataset.slug}`;
  try {
    await navigator.clipboard.writeText(url);
    notify("Tautan undangan disalin.");
  } catch {
    notify(`Tautan undangan: ${url}`);
  }
});
document.querySelectorAll<HTMLButtonElement>(".moderate").forEach((button) =>
  button.addEventListener("click", async () => {
    if (dirty) {
      notify("Simpan perubahan sebelum memoderasi ucapan.", true);
      return;
    }
    button.disabled = true;
    try {
      await post("/api/wishes", {
        id: button.dataset.id,
        status: button.dataset.status,
      });
      location.reload();
    } catch (e) {
      notify((e as Error).message, true);
      button.disabled = false;
    }
  }),
);

const slugForm = document.querySelector<HTMLFormElement>("#slug-form")!;
slugForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (dirty || uploading || saving) {
    notify(
      "Simpan perubahan dan selesaikan unggahan sebelum mengubah tautan.",
      true,
    );
    return;
  }
  if (!slugForm.reportValidity()) return;
  const button = slugForm.querySelector<HTMLButtonElement>("button")!;
  button.disabled = true;
  try {
    const newSlug = String(new FormData(slugForm).get("newSlug"));
    await post(`/api/invitations/${form.dataset.slug}/slug`, { newSlug });
    location.href = `/dashboard?undangan=${encodeURIComponent(newSlug)}`;
  } catch (error) {
    notify((error as Error).message, true);
    button.disabled = false;
  }
});

// Membuat undangan baru dari salinan undangan yang sedang dibuka.
const createForm =
  document.querySelector<HTMLFormElement>("#create-invitation");
createForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (dirty || uploading || saving) {
    notify("Simpan perubahan dulu sebelum membuat undangan baru.", true);
    return;
  }
  if (!createForm.reportValidity()) return;
  const button = createForm.querySelector<HTMLButtonElement>("button")!;
  const error = document.querySelector<HTMLElement>(
    "#create-invitation-error",
  )!;
  button.disabled = true;
  error.textContent = "";
  try {
    const slug = String(new FormData(createForm).get("slug"));
    await post("/api/invitations", {
      slug,
      copyFromSlug: form.dataset.slug,
    });
    location.href = `/dashboard?undangan=${encodeURIComponent(slug)}`;
  } catch (e) {
    error.textContent = (e as Error).message;
    button.disabled = false;
  }
});
