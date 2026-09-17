import postgres from "postgres";
import { readFile } from "node:fs/promises";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL wajib diisi");
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  await sql.unsafe(
    await readFile(
      new URL("./migrations/0001_initial.sql", import.meta.url),
      "utf8",
    ),
  );
  console.log("Migrasi selesai.");
} finally {
  await sql.end();
}
