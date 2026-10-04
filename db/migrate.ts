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
  console.log("Migrasi selesai.");
} finally {
  await sql.end();
}
