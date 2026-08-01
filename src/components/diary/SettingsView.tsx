import { useState } from "react";
import { Download, Lock, Moon, RefreshCw, Shield, Sun, Upload } from "lucide-react";
import { useTheme } from "../../hooks/useTheme";
import { exportDiaryCsv, importDiaryCsv, isTauriRuntime } from "../../lib/diaryCsvIo";

type SettingsViewProps = {
  onRefreshMascot?: () => void;
  onBack: () => void;
};

export function SettingsView({ onRefreshMascot, onBack }: SettingsViewProps) {
  const { theme, toggleTheme, isDark } = useTheme();
  const [csvStatus, setCsvStatus] = useState<string | null>(null);
  const [csvBusy, setCsvBusy] = useState<"export" | "import" | null>(null);

  async function handleExportCsv() {
    setCsvBusy("export");
    setCsvStatus(null);
    try {
      const path = await exportDiaryCsv();
      const label = isTauriRuntime() ? path : `Downloaded ${path}`;
      setCsvStatus(`Exported diary CSV to ${label}`);
    } catch (error) {
      setCsvStatus(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setCsvBusy(null);
    }
  }

  async function handleImportCsv() {
    setCsvBusy("import");
    setCsvStatus(null);
    try {
      const count = await importDiaryCsv();
      if (count === 0) {
        setCsvStatus("Import cancelled.");
      } else {
        setCsvStatus(`Imported ${count} diary ${count === 1 ? "entry" : "entries"}. Open the diary to browse them.`);
      }
    } catch (error) {
      setCsvStatus(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setCsvBusy(null);
    }
  }

  return (
    <div className="diary-settings" data-interactive>
      {/* Left leaf — theme & companion */}
      <section className="diary-settings__page diary-settings__page--left">
        <p className="diary-settings__eyebrow">Control Panel</p>
        <h2 className="diary-settings__title">Settings</h2>
        <p className="diary-settings__lede">
          Theme and companion tools. The spine still binds these pages — each leaf holds its own
          section.
        </p>

        <article className="diary-settings__card">
          <h3>Theme</h3>
          <p>
            Apron keeps pages bright. Skirt dims the lights to match her charcoal gear.
          </p>
          <p className="diary-settings__meta">
            {isDark ? "Skirt" : "Apron"} · {theme}
          </p>
          <button
            type="button"
            data-interactive
            onClick={toggleTheme}
            className="btn-primary interactive"
          >
            {isDark ? (
              <>
                <Sun className="h-4 w-4" style={{ color: "var(--enerva-cyan)" }} />
                Switch to Apron
              </>
            ) : (
              <>
                <Moon className="h-4 w-4" style={{ color: "var(--enerva-cyan)" }} />
                Switch to Skirt
              </>
            )}
          </button>
          {onRefreshMascot ? (
            <button
              type="button"
              data-interactive
              onClick={onRefreshMascot}
              className="interactive surface-muted mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-theme px-3 py-2 text-sm"
            >
              <RefreshCw className="h-4 w-4" style={{ color: "var(--enerva-cyan)" }} />
              Reload Mascot
            </button>
          ) : null}
        </article>

        <button
          type="button"
          data-interactive
          className="diary-settings__back interactive"
          onClick={onBack}
        >
          Back to diary
        </button>
      </section>

      {/* Right leaf — vault / data */}
      <section className="diary-settings__page diary-settings__page--right">
        <p className="diary-settings__eyebrow">Vault</p>
        <h2 className="diary-settings__title">Privacy &amp; Data</h2>
        <p className="diary-settings__lede">
          Local diary storage, CSV backup compatible with gogh, and optional password lock in Phase
          5.
        </p>

        <article className="diary-settings__card">
          <h3>Diary CSV</h3>
          <p>
            Export or import diary pages in the same CSV format as gogh (Date, Title, Body, tasks,
            routines). Exports save to your Downloads folder.
          </p>
          <div className="diary-settings__actions">
            <button
              type="button"
              data-interactive
              disabled={csvBusy != null}
              onClick={handleExportCsv}
              className="interactive btn-primary diary-settings__action"
            >
              <Download className="h-4 w-4" style={{ color: "var(--enerva-cyan)" }} />
              {csvBusy === "export" ? "Exporting…" : "Download CSV"}
            </button>
            <button
              type="button"
              data-interactive
              disabled={csvBusy != null}
              onClick={handleImportCsv}
              className="interactive surface-muted diary-settings__action"
            >
              <Upload className="h-4 w-4" style={{ color: "var(--enerva-cyan)" }} />
              {csvBusy === "import" ? "Importing…" : "Import CSV"}
            </button>
          </div>
          {csvStatus ? <p className="diary-settings__status">{csvStatus}</p> : null}
        </article>

        <article className="diary-settings__card diary-settings__card--muted">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4" style={{ color: "var(--enerva-pink-deep)" }} />
            <h3>Encryption</h3>
          </div>
          <p>
            Entries will live in an on-device SQLite vault. Until then, theme preference and
            journals stay in local storage only.
          </p>
          <button
            type="button"
            data-interactive
            disabled
            className="interactive diary-settings__locked"
          >
            <Lock className="h-3.5 w-3.5" />
            Toggle locked until Phase 5
          </button>
        </article>

        <article className="diary-settings__card">
          <h3>Coming next</h3>
          <ul className="diary-settings__list">
            <li>Password gate on open</li>
            <li>Encrypted diary pages</li>
            <li>Diary photo attachments</li>
          </ul>
        </article>
      </section>
    </div>
  );
}
