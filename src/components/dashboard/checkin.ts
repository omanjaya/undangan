import {
  parseScannedCode,
  type GuestSummary,
  type GuestView,
} from "../../modules/invitations/domain/guests";

type Detector = {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
};
type DetectorConstructor = new (options: { formats: string[] }) => Detector;

const section = document.querySelector<HTMLElement>("#checkin");
if (section) {
  const root: HTMLElement = section;
  const slug = root.dataset.slug || "";
  const q = <T extends HTMLElement>(selector: string) =>
    root.querySelector<T>(selector)!;
  const video = q<HTMLVideoElement>("#checkin-video");
  const toggle = q<HTMLButtonElement>("#checkin-scan-toggle");
  const note = q("#checkin-scan-note");
  const form = q<HTMLFormElement>("#checkin-form");
  const input = q<HTMLInputElement>("#checkin-code");
  const result = q("#checkin-result");
  const recent = q("#checkin-recent");

  const formatTime = (iso: string) =>
    new Intl.DateTimeFormat("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "Asia/Makassar",
    }).format(new Date(iso));

  let recents: GuestView[] = [];

  function renderSummary(summary: GuestSummary) {
    const values: Record<string, string> = {
      checkedIn: `${summary.checkedIn} · ${summary.checkedInOrang} orang`,
      hadir: `${summary.hadir} · ${summary.hadirOrang} orang`,
      total: String(summary.total),
    };
    for (const [key, value] of Object.entries(values))
      root
        .querySelector(`[data-stat="${key}"]`)
        ?.replaceChildren(document.createTextNode(value));
  }

  function renderRecent() {
    recent.replaceChildren();
    const items = recents
      .filter((g) => g.checkedInAt)
      .sort((a, b) => b.checkedInAt!.localeCompare(a.checkedInAt!))
      .slice(0, 10);
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "guest-empty";
      empty.textContent = "Belum ada tamu yang check-in.";
      recent.append(empty);
      return;
    }
    for (const guest of items) {
      const row = document.createElement("article");
      row.className = "guest-row is-checked-in";
      const name = document.createElement("h4");
      name.textContent = guest.name;
      const meta = document.createElement("p");
      meta.className = "guest-meta";
      meta.textContent = [
        guest.group,
        `${guest.pax} orang`,
        formatTime(guest.checkedInAt!),
      ]
        .filter(Boolean)
        .join(" · ");
      const info = document.createElement("div");
      info.className = "guest-info";
      info.append(name, meta);
      row.append(info);
      recent.append(row);
    }
  }

  function show(
    state: "ok" | "duplicate" | "error",
    title: string,
    lines: string[],
  ) {
    result.hidden = false;
    result.dataset.state = state;
    const heading = document.createElement("h3");
    heading.textContent = title;
    result.replaceChildren(
      heading,
      ...lines.map((line) => {
        const p = document.createElement("p");
        p.textContent = line;
        return p;
      }),
    );
  }

  let busy = false;
  async function checkIn(raw: string) {
    const code = parseScannedCode(raw);
    if (!code || busy) return;
    busy = true;
    try {
      const res = await fetch("/api/guests/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        show("error", "Tidak dapat check-in", [
          data.error || "Permintaan gagal.",
        ]);
        return;
      }
      const guest = data.guest as GuestView;
      const details = [
        [guest.group, `${guest.pax} orang`].filter(Boolean).join(" · "),
      ];
      if (data.status === "duplicate") {
        details.push(
          `Sudah check-in pada ${formatTime(guest.checkedInAt!)}. Mohon pastikan ini bukan tiket yang dipakai dua kali.`,
        );
        show("duplicate", `${guest.name} sudah check-in`, details);
      } else {
        show("ok", `Selamat datang, ${guest.name}`, details);
      }
      recents = [...recents.filter((g) => g.id !== guest.id), guest];
      renderSummary(data.summary);
      renderRecent();
      input.value = "";
    } catch {
      show("error", "Tidak dapat terhubung", [
        "Periksa koneksi lalu coba lagi.",
      ]);
    } finally {
      busy = false;
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void checkIn(input.value);
  });

  // Pemindaian kamera hanya ditawarkan bila peramban punya BarcodeDetector.
  const Detector = (
    window as unknown as { BarcodeDetector?: DetectorConstructor }
  ).BarcodeDetector;
  if (!Detector || !navigator.mediaDevices?.getUserMedia) {
    note.textContent =
      "Peramban ini belum mendukung pemindaian kamera. Ketik kode tamu secara manual.";
  } else {
    toggle.hidden = false;
    let stream: MediaStream | null = null;
    let timer = 0;
    let lastValue = "";
    let lastAt = 0;
    const stop = () => {
      window.clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      video.hidden = true;
      toggle.textContent = "Mulai pindai kamera";
    };
    toggle.addEventListener("click", async () => {
      if (stream) return stop();
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
      } catch {
        note.textContent =
          "Kamera tidak dapat dibuka. Izinkan akses kamera atau ketik kode manual.";
        return;
      }
      const detector = new Detector({ formats: ["qr_code"] });
      video.srcObject = stream;
      video.hidden = false;
      await video.play().catch(() => {});
      toggle.textContent = "Hentikan kamera";
      note.textContent = "Arahkan kamera ke QR tamu.";
      timer = window.setInterval(async () => {
        if (busy || video.readyState < 2) return;
        try {
          const codes = await detector.detect(video);
          const value = codes[0]?.rawValue;
          // Kode yang sama dalam tiga detik dianggap satu pindaian.
          if (!value || (value === lastValue && Date.now() - lastAt < 3000))
            return;
          lastValue = value;
          lastAt = Date.now();
          void checkIn(value);
        } catch {
          /* bingkai yang gagal dibaca dilewati */
        }
      }, 400);
    });
    window.addEventListener("pagehide", stop);
  }

  fetch(`/api/guests?slug=${encodeURIComponent(slug)}`)
    .then((res) => res.json())
    .then((data) => {
      recents = data.guests ?? [];
      renderRecent();
    })
    .catch(() => renderRecent());

  const prefill = root.dataset.prefill;
  if (prefill) {
    input.value = prefill;
    void checkIn(prefill);
  }
}
