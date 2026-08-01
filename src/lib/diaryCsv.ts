import { parse, format } from "date-fns";

export const GOGH_CSV_HEADER =
  "Date,Title,Body,Image file path,Time in App,Completed tasks,Routine";

export type GoghDiaryRow = {
  dateKey: string;
  title: string;
  body: string;
  imagePath: string;
  timeInApp: string;
  completedTasks: string;
  routine: string;
};

/** gogh format: `MM DD YYYY` with spaces, e.g. `06 27 2026`. */
export function goghDateToKey(goghDate: string): string | null {
  const parts = goghDate.trim().split(/\s+/);
  if (parts.length !== 3) return null;
  const [mm, dd, yyyy] = parts;
  const month = Number.parseInt(mm, 10);
  const day = Number.parseInt(dd, 10);
  const year = Number.parseInt(yyyy, 10);
  if (!month || !day || !year) return null;
  try {
    return format(new Date(year, month - 1, day), "yyyy-MM-dd");
  } catch {
    return null;
  }
}

export function keyToGoghDate(dateKey: string): string {
  const date = parse(dateKey, "yyyy-MM-dd", new Date());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  return `${mm} ${dd} ${yyyy}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function htmlToPlainText(html: string): string {
  if (!html.trim()) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent ?? "").replace(/\r\n/g, "\n");
}

export function plainTextToHtml(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "<p></p>";
  const blocks = normalized.split(/\n\n+/);
  return blocks
    .map((block) => {
      const inner = escapeHtml(block).replace(/\n/g, "<br>");
      return `<p>${inner}</p>`;
    })
    .join("");
}

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** RFC 4180-style parser (handles quoted multiline fields). */
export function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || (char === "\r" && next === "\n")) {
      if (char === "\r") i += 1;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") {
        rows.push(row);
      }
      row = [];
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

export function parseGoghDiaryCsv(content: string): GoghDiaryRow[] {
  const rows = parseCsv(content.replace(/^\uFEFF/, ""));
  if (rows.length < 2) return [];

  const header = rows[0].map((cell) => cell.trim());
  const expected = GOGH_CSV_HEADER.split(",");
  const headerOk =
    header.length >= 3 &&
    header[0] === expected[0] &&
    header[1] === expected[1] &&
    header[2] === expected[2];

  if (!headerOk) {
    throw new Error("CSV must use gogh diary headers: Date, Title, Body, …");
  }

  const result: GoghDiaryRow[] = [];

  for (let i = 1; i < rows.length; i += 1) {
    const cells = rows[i];
    if (cells.every((cell) => !cell.trim())) continue;

    const dateKey = goghDateToKey(cells[0] ?? "");
    if (!dateKey) continue;

    result.push({
      dateKey,
      title: cells[1]?.trim() || "Untitled",
      body: cells[2] ?? "",
      imagePath: cells[3]?.trim() ?? "",
      timeInApp: cells[4]?.trim() ?? "",
      completedTasks: cells[5]?.trim() ?? "",
      routine: cells[6]?.trim() ?? "",
    });
  }

  return result;
}

export function serializeGoghDiaryCsv(rows: GoghDiaryRow[]): string {
  const lines = [GOGH_CSV_HEADER];

  const sorted = [...rows].sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  for (const row of sorted) {
    lines.push(
      [
        keyToGoghDate(row.dateKey),
        row.title,
        row.body,
        row.imagePath,
        row.timeInApp,
        row.completedTasks,
        row.routine,
      ]
        .map(escapeCsvField)
        .join(","),
    );
  }

  return `${lines.join("\n")}\n`;
}

export function splitPipeList(value: string): string[] {
  if (!value.trim()) return [];
  return value
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}
