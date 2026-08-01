import { downloadDir, join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { format } from "date-fns";
import {
  htmlToPlainText,
  parseGoghDiaryCsv,
  plainTextToHtml,
  serializeGoghDiaryCsv,
  splitPipeList,
  type GoghDiaryRow,
} from "./diaryCsv";
import { getAllDiaryEntries, importDiaryEntries } from "./diaryEntries";
import { getRoutineChecklistForDate, importCompletedRoutinesForDate } from "./routineStore";
import { getTasksForDate, importCompletedTasksForDate } from "./taskStore";

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function exportFilename() {
  const stamp = format(new Date(), "yyyyMMddHHmmss");
  return `enerva_diary_${stamp}.csv`;
}

function buildExportRows(): GoghDiaryRow[] {
  const entries = getAllDiaryEntries();
  return Object.entries(entries).map(([dateKey, entry]) => {
    const date = new Date(`${dateKey}T12:00:00`);
    const tasks = getTasksForDate(date)
      .filter((task) => task.done)
      .map((task) => task.label)
      .join(" | ");
    const routines = getRoutineChecklistForDate(date)
      .filter((item) => item.done)
      .map((item) => item.label)
      .join(" | ");

    return {
      dateKey,
      title: entry.title,
      body: htmlToPlainText(entry.html),
      imagePath: "",
      timeInApp: "",
      completedTasks: tasks,
      routine: routines,
    };
  });
}

function triggerBrowserDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function exportDiaryCsv(): Promise<string> {
  const rows = buildExportRows();
  const csv = serializeGoghDiaryCsv(rows);
  const filename = exportFilename();

  if (isTauriRuntime()) {
    const downloads = await downloadDir();
    if (!downloads) {
      throw new Error("Could not resolve your Downloads folder.");
    }
    const path = await join(downloads, filename);
    await writeTextFile(path, csv);
    return path;
  }

  triggerBrowserDownload(csv, filename);
  return filename;
}

function applyImportedRows(rows: GoghDiaryRow[]): number {
  const entries: Record<
    string,
    { title: string; html: string; savedAt: number }
  > = {};

  for (const row of rows) {
    entries[row.dateKey] = {
      title: row.title.trim() || "Untitled",
      html: plainTextToHtml(row.body),
      savedAt: Date.now(),
    };

    const date = new Date(`${row.dateKey}T12:00:00`);
    const taskLabels = splitPipeList(row.completedTasks);
    if (taskLabels.length > 0) {
      importCompletedTasksForDate(date, taskLabels);
    }
    const routineLabels = splitPipeList(row.routine);
    if (routineLabels.length > 0) {
      importCompletedRoutinesForDate(date, routineLabels);
    }
  }

  return importDiaryEntries(entries, true);
}

export async function importDiaryCsvFromText(content: string): Promise<number> {
  const rows = parseGoghDiaryCsv(content);
  if (rows.length === 0) {
    throw new Error("No diary rows found in the CSV file.");
  }
  return applyImportedRows(rows);
}

export async function importDiaryCsv(): Promise<number> {
  if (isTauriRuntime()) {
    const selected = await open({
      multiple: false,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (!selected || Array.isArray(selected)) {
      return 0;
    }
    const content = await readTextFile(selected);
    return importDiaryCsvFromText(content);
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(0);
        return;
      }
      try {
        const content = await file.text();
        resolve(await importDiaryCsvFromText(content));
      } catch (error) {
        reject(error);
      }
    };
    input.click();
  });
}
