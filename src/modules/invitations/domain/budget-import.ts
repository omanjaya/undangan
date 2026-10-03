import {
  BEARER_LABELS,
  BUDGET_BEARERS,
  BUDGET_CATEGORIES,
  CATEGORY_LABELS,
  budgetItemInputSchema,
  type BudgetItemInput,
} from "./budget";

/** Impor dari spreadsheet dibatasi agar satu berkas salah tempel tidak membanjiri anggaran. */
export const BUDGET_IMPORT_MAX_ROWS = 500;

export type BudgetImportIssue = { line: number; message: string };

export type BudgetImportResult = {
  items: BudgetItemInput[];
  errors: BudgetImportIssue[];
};

type Category = (typeof BUDGET_CATEGORIES)[number];
type Bearer = (typeof BUDGET_BEARERS)[number];

type Field =
  | "category"
  | "name"
  | "bearer"
  | "vendor"
  | "estimate"
  | "actual"
  | "paid"
  | "dueDate"
  | "note";

const COLUMN_NAMES: Record<string, Field> = {
  kategori: "category",
  pos: "name",
  nama: "name",
  "nama pos": "name",
  penanggung: "bearer",
  vendor: "vendor",
  estimasi: "estimate",
  realisasi: "actual",
  dibayar: "paid",
  "jatuh tempo": "dueDate",
  catatan: "note",
};

/** Kekurangan dan Status hasil hitungan, jadi hanya dipakai untuk mengenali header. */
const COMPUTED_COLUMNS = new Set(["kekurangan", "status"]);

/** Urutan kolom berkas ekspor, dipakai bila berkas datang tanpa header. */
const DEFAULT_COLUMNS: (Field | null)[] = [
  "category",
  "name",
  "bearer",
  "vendor",
  "estimate",
  "actual",
  "paid",
  null,
  null,
  "dueDate",
  "note",
];

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

const CATEGORY_BY_NAME = new Map<string, Category>(
  BUDGET_CATEGORIES.flatMap((category) => [
    [category, category] as const,
    [normalize(CATEGORY_LABELS[category]), category] as const,
  ]),
);

const BEARER_BY_NAME = new Map<string, Bearer>(
  BUDGET_BEARERS.flatMap((bearer) => [
    [bearer, bearer] as const,
    [normalize(BEARER_LABELS[bearer]), bearer] as const,
  ]),
);

type Row = { line: number; cells: string[] };

/**
 * Ekspor menyisipkan apostrof di depan nilai berawalan tanda rumus agar aman
 * dibuka di spreadsheet; apostrof itu dilepas kembali supaya hasil ekspor
 * sendiri bisa diimpor utuh.
 */
function unescapeCell(value: string) {
  return /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value;
}

function parseRows(text: string): Row[] {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: Row[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let filled = false;
  let line = 1;
  let rowLine = 1;

  const flush = () => {
    if (filled || cells.length > 0) {
      cells.push(cell);
      rows.push({ line: rowLine, cells });
    }
    cells = [];
    cell = "";
    filled = false;
    rowLine = line;
  };

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
        continue;
      }
      if (char === "\r") {
        // Newline di dalam kutip dinormalkan ke LF agar nilainya tidak bergantung platform.
        if (source[i + 1] === "\n") i += 1;
        cell += "\n";
        line += 1;
        continue;
      }
      if (char === "\n") line += 1;
      cell += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
      filled = true;
      continue;
    }
    if (char === ",") {
      cells.push(cell);
      cell = "";
      filled = true;
      continue;
    }
    if (char === "\r" || char === "\n") {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      line += 1;
      flush();
      continue;
    }
    cell += char;
    filled = true;
  }
  flush();
  return rows;
}

function isHeader(cells: string[]) {
  const known = cells.filter((value) => {
    const name = normalize(unescapeCell(value));
    return name in COLUMN_NAMES || COMPUTED_COLUMNS.has(name);
  });
  return known.length >= 2;
}

function columnsFromHeader(cells: string[]): (Field | null)[] {
  return cells.map(
    (value) => COLUMN_NAMES[normalize(unescapeCell(value))] ?? null,
  );
}

/** Terima "18000000", "18.000.000", "Rp 18.000.000", dan sel kosong sebagai nol. */
function parseRupiah(raw: string): number | null {
  const text = raw.trim();
  if (!text) return 0;
  const digits = text
    .replace(/^rp\.?/i, "")
    .replace(/[\s .]/g, "")
    .replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(digits)) return null;
  return Math.round(Number(digits));
}

/** Spreadsheet Indonesia sering menulis tanggal sebagai hari dulu. */
function parseDueDate(raw: string): string | null {
  const text = raw.trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const local = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (local) {
    const [, day, month, year] = local;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return null;
}

export function parseBudgetCsv(text: string): BudgetImportResult {
  const items: BudgetItemInput[] = [];
  const errors: BudgetImportIssue[] = [];
  const rows = parseRows(text);
  let columns = DEFAULT_COLUMNS;
  let first = true;
  let seen = 0;

  for (const row of rows) {
    if (row.cells.every((value) => value.trim() === "")) continue;
    if (first) {
      first = false;
      if (isHeader(row.cells)) {
        columns = columnsFromHeader(row.cells);
        continue;
      }
    }
    seen += 1;
    if (seen > BUDGET_IMPORT_MAX_ROWS) {
      errors.push({
        line: row.line,
        message: `Hanya ${BUDGET_IMPORT_MAX_ROWS} baris pertama yang diimpor, sisanya diabaikan.`,
      });
      break;
    }

    const cell = (field: Field) => {
      const index = columns.indexOf(field);
      return index < 0 ? "" : unescapeCell(row.cells[index] ?? "").trim();
    };

    const name = cell("name");
    if (!name) {
      errors.push({
        line: row.line,
        message: "Nama pos kosong, baris dilewati.",
      });
      continue;
    }

    const rawCategory = cell("category");
    const category = rawCategory
      ? CATEGORY_BY_NAME.get(normalize(rawCategory))
      : "lainnya";
    if (rawCategory && !category) {
      errors.push({
        line: row.line,
        message: `Kategori "${rawCategory}" tidak dikenali, dipakai "${CATEGORY_LABELS.lainnya}".`,
      });
    }

    const rawBearer = cell("bearer");
    const bearer = rawBearer
      ? BEARER_BY_NAME.get(normalize(rawBearer))
      : "bersama";
    if (rawBearer && !bearer) {
      errors.push({
        line: row.line,
        message: `Penanggung "${rawBearer}" tidak dikenali, dipakai "${BEARER_LABELS.bersama}".`,
      });
    }

    const amounts: Partial<Record<"estimate" | "actual" | "paid", number>> = {};
    const labels = {
      estimate: "Estimasi",
      actual: "Realisasi",
      paid: "Dibayar",
    } as const;
    let broken = false;
    for (const field of ["estimate", "actual", "paid"] as const) {
      const raw = cell(field);
      const value = parseRupiah(raw);
      if (value === null) {
        errors.push({
          line: row.line,
          message: `${labels[field]} "${raw}" bukan nilai rupiah yang sah, baris dilewati.`,
        });
        broken = true;
        break;
      }
      amounts[field] = value;
    }
    if (broken) continue;

    const rawDueDate = cell("dueDate");
    const dueDate = parseDueDate(rawDueDate);
    if (dueDate === null) {
      errors.push({
        line: row.line,
        message: `Jatuh tempo "${rawDueDate}" tidak terbaca, dikosongkan.`,
      });
    }

    const parsed = budgetItemInputSchema.safeParse({
      category: category ?? "lainnya",
      bearer: bearer ?? "bersama",
      name,
      vendor: cell("vendor"),
      estimate: amounts.estimate,
      actual: amounts.actual,
      paid: amounts.paid,
      dueDate: dueDate ?? "",
      note: cell("note"),
    });
    if (!parsed.success) {
      errors.push({
        line: row.line,
        message: `${parsed.error.issues[0]?.message ?? "Baris tidak sah."} Baris dilewati.`,
      });
      continue;
    }
    items.push(parsed.data);
  }

  return { items, errors };
}
