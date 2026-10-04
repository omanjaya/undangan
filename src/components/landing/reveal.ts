/**
 * Memunculkan bagian halaman saat tergulir ke layar.
 *
 * Penanda `js-reveal` baru dipasang di sini, bukan di markup, supaya halaman
 * tetap terbaca penuh ketika skrip gagal dimuat: tanpa penanda itu, aturan
 * yang menyembunyikan konten tidak pernah berlaku.
 */
const kurangiGerak = window.matchMedia("(prefers-reduced-motion: reduce)");

function aktifkan() {
  const targets = document.querySelectorAll<HTMLElement>(
    "[data-reveal], [data-reveal-stagger]",
  );
  if (!targets.length) return;

  // IntersectionObserver absen pada peramban lama; di sana konten langsung tampil.
  if (!("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("is-revealed"));
    return;
  }

  document.documentElement.classList.add("js-reveal");

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-revealed");
        // Sekali muncul, biarkan tampil: menyembunyikannya lagi saat digulir
        // ke atas membuat halaman terasa goyah.
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
  );

  targets.forEach((el) => {
    // Bagian yang sudah terlihat saat halaman dibuka tidak perlu menunggu gulir.
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9)
      el.classList.add("is-revealed");
    else observer.observe(el);
  });
}

/** Mematikan animasi dan menampilkan semua yang sempat disembunyikan. */
function matikan() {
  document.documentElement.classList.remove("js-reveal");
  document
    .querySelectorAll("[data-reveal], [data-reveal-stagger]")
    .forEach((el) => el.classList.add("is-revealed"));
}

if (!kurangiGerak.matches) aktifkan();

// Pengguna dapat mengubah preferensi gerak selagi halaman terbuka.
kurangiGerak.addEventListener("change", (event) =>
  event.matches ? matikan() : aktifkan(),
);
