import postgres from "postgres";
import { readdir, readFile } from "node:fs/promises";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL wajib diisi");
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  // Semua migrasi idempoten (IF NOT EXISTS / pembaruan bersyarat), jadi
  // dijalankan berurutan pada setiap eksekusi tanpa tabel pelacak versi.
  const directory = new URL("./migrations/", import.meta.url);
  const files = (await readdir(directory))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  for (const name of files) {
    await sql.unsafe(await readFile(new URL(name, directory), "utf8"));
    console.log(`Migrasi ${name} selesai.`);
  }
  // Migrasi data: pindahkan data single-owner lama ke ruang kerja admin.
  // Idempoten; data lama (`app_state`) dibiarkan sebagai cadangan.
  const { runBootstrap } =
    await import("../src/modules/invitations/infrastructure/bootstrap");
  const outcome = await runBootstrap({ skipWithoutCredentials: true });
  console.log(
    {
      ready: "Data multi-pelanggan sudah ada; tidak ada yang diubah.",
      migrated: "Data lama dipindahkan ke ruang kerja admin (workspace-demo).",
      seeded: "Data awal dibuat (admin dan undangan contoh).",
      skipped:
        "Migrasi data dilewati: OWNER_EMAIL/OWNER_PASSWORD belum diisi. Aplikasi akan menjalankannya saat pertama menyala.",
    }[outcome],
  );
  console.log("Migrasi selesai.");
} finally {
  await sql.end();
  const { closeStorage } =
    await import("../src/modules/invitations/infrastructure/storage");
  await closeStorage();
}
