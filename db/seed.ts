import postgres from "postgres";
import { demoInvitation } from "../src/modules/invitations/domain/invitation";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL wajib diisi");
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  const state = {
    invitation: demoInvitation,
    rsvps: [],
    wishes: [],
    sessions: [],
    revisions: [
      {
        revision: 1,
        content: demoInvitation.draft,
        createdAt: demoInvitation.updatedAt,
      },
    ],
  };
  await sql`INSERT INTO app_state(id,payload) VALUES ('primary',${sql.json(state)}) ON CONFLICT(id) DO NOTHING`;
  console.log("Seed selesai (data yang ada dipertahankan).");
} finally {
  await sql.end();
}
