import { runBootstrap } from "../src/modules/invitations/infrastructure/bootstrap";
import { closeStorage } from "../src/modules/invitations/infrastructure/storage";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL wajib diisi");
try {
  // Membuat admin dan ruang kerja contoh hanya bila belum ada pengguna;
  // data yang ada dipertahankan.
  const outcome = await runBootstrap();
  console.log(
    outcome === "ready"
      ? "Seed selesai (data yang ada dipertahankan)."
      : `Seed selesai (${outcome}).`,
  );
} finally {
  await closeStorage();
}
