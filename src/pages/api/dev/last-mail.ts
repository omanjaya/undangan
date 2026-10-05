import type { APIRoute } from "astro";
import { isLocalDevelopment, lastMailTo } from "../../../server/mail";

/**
 * HANYA UNTUK PENGUJIAN. Mengembalikan email terakhir yang "dikirim" ke
 * sebuah alamat saat SMTP belum dikonfigurasi, supaya tes e2e dapat membaca
 * tautan atur ulang kata sandi. Endpoint ini tidak ada (404) bila
 * NODE_ENV=production atau DATABASE_URL terisi, dan kotak keluarnya hanya
 * terisi selama SMTP belum dikonfigurasi.
 */
export const GET: APIRoute = ({ url }) => {
  if (!isLocalDevelopment()) return new Response("Not found", { status: 404 });
  const mail = lastMailTo(url.searchParams.get("to") || "");
  return new Response(JSON.stringify({ mail }), {
    status: mail ? 200 : 404,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
};
