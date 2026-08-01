import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { Bold, Italic, Underline as UnderlineIcon } from "lucide-react";
import { format, isAfter, isBefore, isToday, startOfDay } from "date-fns";
import type { DiaryEditMode } from "./CalendarWidget";
import {
  getDiaryEntry,
  listenDiaryEntries,
  saveDiaryEntry,
} from "../../lib/diaryEntries";

type LeftPageProps = {
  selectedDate: Date;
  editMode: DiaryEditMode;
  /** Increment to reload from storage (discard draft). */
  discardNonce?: number;
  onDirtyChange?: (dirty: boolean) => void;
};

const FUTURE_ENTRY =
  "<p>This day has not arrived yet. Come back when it does — the page will open for writing then.</p>";

const EMPTY_PAST = "<p>No diary entry was saved for this day.</p>";
const TITLE_PLACEHOLDER = "Title for today";
const BODY_PLACEHOLDER = "Write freely. This page is your journal for today.";

/** Four non-breaking spaces — survives HTML whitespace collapse. */
const INDENT = "\u00A0\u00A0\u00A0\u00A0";

const PARSE_OPTS = { preserveWhitespace: "full" as const };

function dayKind(date: Date): "today" | "past" | "future" {
  const day = startOfDay(date);
  const today = startOfDay(new Date());
  if (isToday(day)) return "today";
  if (isBefore(day, today)) return "past";
  if (isAfter(day, today)) return "future";
  return "today";
}

function isBlankHtml(html: string) {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length === 0;
}

export function LeftPage({
  selectedDate,
  editMode,
  discardNonce = 0,
  onDirtyChange,
}: LeftPageProps) {
  const kind = dayKind(selectedDate);
  const readOnly = editMode === "readonly" || kind !== "today";
  const [title, setTitle] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const [hasSaved, setHasSaved] = useState(() => getDiaryEntry(selectedDate) != null);
  const [, setToolbarTick] = useState(0);
  const baselineRef = useRef({ title: "", html: "" });
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Placeholder.configure({
        placeholder: BODY_PLACEHOLDER,
        showOnlyWhenEditable: true,
        showOnlyCurrent: false,
      }),
    ],
    content: "<p></p>",
    editable: !readOnly,
    immediatelyRender: false,
    parseOptions: PARSE_OPTS,
    editorProps: {
      attributes: {
        class: "diary-editor__prose",
        "data-interactive": "true",
      },
      handleKeyDown: (_view, event) => {
        if (event.key !== "Tab" || event.altKey || event.metaKey || event.ctrlKey) {
          return false;
        }
        event.preventDefault();
        if (event.shiftKey) {
          const { state, dispatch } = _view;
          const { from } = state.selection;
          const $from = state.selection.$from;
          const start = $from.start();
          const textBefore = state.doc.textBetween(start, from, "\n", "\n");
          if (textBefore.endsWith(INDENT)) {
            dispatch(
              state.tr.delete(from - INDENT.length, from).scrollIntoView(),
            );
            return true;
          }
          if (textBefore.endsWith("\u00A0")) {
            let i = 0;
            while (
              i < 4 &&
              from - 1 - i >= start &&
              state.doc.textBetween(from - 1 - i, from - i) === "\u00A0"
            ) {
              i += 1;
            }
            if (i > 0) {
              dispatch(state.tr.delete(from - i, from).scrollIntoView());
              return true;
            }
          }
          return true;
        }
        _view.dispatch(_view.state.tr.insertText(INDENT).scrollIntoView());
        return true;
      },
    },
  });

  const reportDirty = useCallback(
    (nextTitle: string, nextHtml: string) => {
      if (readOnly) {
        onDirtyChangeRef.current?.(false);
        return;
      }
      const dirty =
        nextTitle !== baselineRef.current.title ||
        nextHtml !== baselineRef.current.html;
      onDirtyChangeRef.current?.(dirty);
    },
    [readOnly],
  );

  const loadForDate = useCallback(() => {
    if (!editor) return;
    const nextKind = dayKind(selectedDate);
    const locked = editMode === "readonly" || nextKind !== "today";
    editor.setEditable(!locked);

    const saved = getDiaryEntry(selectedDate);
    setHasSaved(saved != null);

    let nextTitle: string;
    if (saved) {
      editor.commands.setContent(saved.html, false, PARSE_OPTS);
      nextTitle = saved.title;
    } else if (nextKind === "future") {
      editor.commands.setContent(FUTURE_ENTRY, false, PARSE_OPTS);
      nextTitle = "Not yet written";
    } else if (nextKind === "past") {
      editor.commands.setContent(EMPTY_PAST, false, PARSE_OPTS);
      nextTitle = "No entry";
    } else {
      // Empty today — placeholders show until the user types.
      editor.commands.setContent("<p></p>", false, PARSE_OPTS);
      nextTitle = "";
    }

    setTitle(nextTitle);
    baselineRef.current = { title: nextTitle, html: editor.getHTML() };
    onDirtyChangeRef.current?.(false);
  }, [editor, editMode, selectedDate]);

  useEffect(() => {
    loadForDate();
  }, [loadForDate, discardNonce]);

  useEffect(() => listenDiaryEntries(loadForDate), [loadForDate]);

  useEffect(() => {
    if (!editor) return;
    const onUpdate = () => {
      reportDirty(title, editor.getHTML());
      setToolbarTick((n) => n + 1);
    };
    const onSelection = () => setToolbarTick((n) => n + 1);
    editor.on("update", onUpdate);
    editor.on("selectionUpdate", onSelection);
    return () => {
      editor.off("update", onUpdate);
      editor.off("selectionUpdate", onSelection);
    };
  }, [editor, title, reportDirty]);

  const onTitleChange = (value: string) => {
    setTitle(value);
    if (editor) reportDirty(value, editor.getHTML());
  };

  const onTitleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      if (!readOnly) editor?.commands.focus("start");
    }
  };

  const onSave = () => {
    if (readOnly || !editor) return;
    const html = editor.getHTML();
    if (!title.trim() && isBlankHtml(html)) {
      onDirtyChangeRef.current?.(false);
      return;
    }
    const savedTitle = title.trim() || "Untitled";
    saveDiaryEntry(selectedDate, savedTitle, html);
    setTitle(savedTitle);
    setHasSaved(true);
    baselineRef.current = { title: savedTitle, html };
    onDirtyChangeRef.current?.(false);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1400);
  };

  const badgeLabel =
    kind === "future"
      ? "Upcoming"
      : kind === "past"
        ? hasSaved
          ? "Saved"
          : "No entry"
        : savedFlash
          ? "Saved"
          : "Editable";

  return (
    <section className="diary-page diary-page--left" data-interactive>
      <header className="diary-page__header">
        <input
          data-interactive
          className="diary-page__title interactive"
          value={title}
          placeholder={readOnly ? undefined : TITLE_PLACEHOLDER}
          onChange={(e) => onTitleChange(e.target.value)}
          onKeyDown={onTitleKeyDown}
          readOnly={readOnly}
          aria-label="Entry title"
          onContextMenu={(e) => e.preventDefault()}
        />
        <span
          className={`diary-page__badge${
            kind === "today" && !savedFlash ? " diary-page__badge--edit" : ""
          }`}
        >
          {badgeLabel}
        </span>
      </header>

      {!readOnly && editor ? (
        <div className="diary-toolbar" data-interactive role="toolbar" aria-label="Text formatting">
          <button
            type="button"
            data-interactive
            className={`diary-toolbar__btn interactive${editor.isActive("bold") ? " is-active" : ""}`}
            aria-label="Bold"
            aria-pressed={editor.isActive("bold")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
          <button
            type="button"
            data-interactive
            className={`diary-toolbar__btn interactive${editor.isActive("italic") ? " is-active" : ""}`}
            aria-label="Italic"
            aria-pressed={editor.isActive("italic")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
          <button
            type="button"
            data-interactive
            className={`diary-toolbar__btn interactive${editor.isActive("underline") ? " is-active" : ""}`}
            aria-label="Underline"
            aria-pressed={editor.isActive("underline")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <UnderlineIcon className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
        </div>
      ) : null}

      <div className="diary-editor" data-interactive>
        <EditorContent editor={editor} />
      </div>

      <footer className="diary-page__footer">
        <time className="diary-page__date" dateTime={format(selectedDate, "yyyy-MM-dd")}>
          {format(selectedDate, "EEEE, MMM d yyyy")}
        </time>
        <button
          type="button"
          data-interactive
          className="diary-page__save interactive"
          disabled={readOnly}
          onClick={onSave}
        >
          Save
        </button>
      </footer>
    </section>
  );
}
