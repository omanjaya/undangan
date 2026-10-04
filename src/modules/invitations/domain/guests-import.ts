import {
  GUEST_IMPORT_MAX_ROWS,
  MAX_GUEST_PAX,
  guestInputSchema,
  normalizePhone,
  type GuestInput,
} from "./guests";

export type GuestImportIssue = { line: number; message: string };
export type GuestImportResult = {
  guests: GuestInput[];
  errors: GuestImportIssue[];
};

type Field = "name" | "phone" | "group" | "maxPax";

const COLUMN_NAMES: Record<string, Field> = {
  nama: "name",
  name: "name",
  "nama tamu": "name",
  telepon: "phone",
  telp: "phone",
  hp: "phone",
  "no hp": "phone",
  "no. hp": "phone",
  "nomor hp": "phone",
  whatsapp: "phone",
  wa: "phone",
  phone: "phone",
  grup: "group",
  group: "group",
  kategori: "group",
  "jatah orang": "maxPax",
  jatah: "maxPax",
  pax: "maxPax",
  "maks orang": "maxPax",
};
/** Kolom hasil ekspor yang hanya dikenali sebagai header, tidak diimpor. */
const IGNORED_COLUMNS = new Set([
  "status",
  "jumlah hadir",
  "check-in",
  "tautan",
]);
const DEFAULT_COLUMNS: (Field | null)[] = ["name", "phone", "group", "maxPax"];

const normalize = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, " ");

/** Apostrof pengaman dari ekspor dilepas satu lapis, seperti pada impor anggaran. */
function unescapeCell(value: string) {
  return /^'(?:[=+\-@\t\r]|')/.test(value) ? value.slice(1) : value;
}

/** Pemisah dipilih dari baris pertama yang berisi data: tab, titik koma, lalu koma. */
function detectDelimiter(lines: string[]) {
  const sample = lines.find((line) => line.trim()) ?? "";
  for (const candidate of ["\t", ";", ","]) {
    if (sample.includes(candidate)) return candidate;
  }
  return ",";
}

function splitLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += char;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === delimiter) {
      cells.push(cell);
      cell = "";
    } else cell += char;
  }
  cells.push(cell);
  return cells;
}

const shorten = (value: string) => {
  const text = value.trim();
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
};

/**
 * Menerima tempelan satu tamu per baris atau berkas CSV: nama, telepon, grup
 * (dan opsional jatah orang). Header dikenali bila ada; tanpa header, urutan
 * kolomnya nama, telepon, grup. Telepon yang tidak terbaca tidak membuang
 * tamunya, hanya nomornya yang dikosongkan dan dilaporkan.
 */
export function parseGuestList(text: string): GuestImportResult {
  const guests: GuestInput[] = [];
  const errors: GuestImportIssue[] = [];
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = source.split(/\r\n|\r|\n/);
  const delimiter = detectDelimiter(lines);
  let columns = DEFAULT_COLUMNS;
  let first = true;
  let seen = 0;

  for (let index = 0; index < lines.length; index++) {
    const lineNumber = index + 1;
    if (!lines[index].trim()) continue;
    const cells = splitLine(lines[index], delimiter);
    if (cells.every((c) => !c.trim())) continue;
    if (first) {
      first = false;
      const names = cells.map((c) => normalize(unescapeCell(c)));
      if (
        names.some(
          (n) => Object.hasOwn(COLUMN_NAMES, n) || IGNORED_COLUMNS.has(n),
        )
      ) {
        columns = names.map((n) =>
          Object.hasOwn(COLUMN_NAMES, n) ? COLUMN_NAMES[n] : null,
        );
        continue;
      }
    }
    seen++;
    if (seen > GUEST_IMPORT_MAX_ROWS) {
      errors.push({
        line: lineNumber,
        message: `Hanya ${GUEST_IMPORT_MAX_ROWS} baris pertama yang diimpor, sisanya diabaikan.`,
      });
      break;
    }
    const cell = (field: Field) => {
      const at = columns.indexOf(field);
      return at < 0 ? "" : unescapeCell(cells[at] ?? "").trim();
    };
    const name = cell("name");
    if (!name) {
      errors.push({
        line: lineNumber,
        message: "Nama kosong, baris dilewati.",
      });
      continue;
    }
    const rawPhone = cell("phone");
    let phone = normalizePhone(rawPhone);
    if (phone === null) {
      errors.push({
        line: lineNumber,
        message: `Nomor "${shorten(rawPhone)}" tidak terbaca, dikosongkan.`,
      });
      phone = "";
    }
    const rawPax = cell("maxPax");
    let maxPax: number | null = null;
    if (rawPax) {
      const n = Number(rawPax);
      if (Number.isInteger(n) && n >= 1 && n <= MAX_GUEST_PAX) maxPax = n;
      else
        errors.push({
          line: lineNumber,
          message: `Jatah "${shorten(rawPax)}" tidak sah (1–${MAX_GUEST_PAX}), dikosongkan.`,
        });
    }
    const parsed = guestInputSchema.safeParse({
      name,
      phone,
      group: cell("group"),
      maxPax,
    });
    if (!parsed.success) {
      errors.push({
        line: lineNumber,
        message: `${parsed.error.issues[0]?.message ?? "Baris tidak sah."} Baris dilewati.`,
      });
      continue;
    }
    guests.push(parsed.data);
  }
  return { guests, errors };
}
