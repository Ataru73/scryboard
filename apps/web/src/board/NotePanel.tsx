import type { HocuspocusProvider } from "@hocuspocus/provider";
import { NOTE_ICONS, type NoteItem, type PresenceUser, type Role } from "@scryboard/shared";
import { useId, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { api, describeApiError } from "../lib/api";
import { useAssetAuth } from "./assetAuth";
import { Markdown } from "./markdown";
import type { BoardStore } from "./store";
import { useBoardUi } from "./tools";
import { usePlayers } from "./usePlayers";

interface Props {
  store: BoardStore;
  role: Role;
  roomId: string;
  provider: HocuspocusProvider;
}

/**
 * Nota di un pin: il GM modifica quella selezionata, i giocatori leggono quella su cui hanno
 * cliccato (solo se il GM l'ha rivelata: le altre non le ricevono).
 */
export function NotePanel({ store, role, roomId, provider }: Props) {
  useSyncExternalStore(store.subscribe, store.getSnapshot);
  const selectedIds = useBoardUi((s) => s.selectedIds);
  const openNoteId = useBoardUi((s) => s.openNoteId);
  const id = role === "gm" ? (selectedIds.length === 1 ? selectedIds[0] : null) : openNoteId;
  const note = id ? store.get(id) : undefined;
  if (note?.kind !== "note") return null;
  if (role === "gm") {
    return (
      <NoteEditor key={note.id} note={note} store={store} roomId={roomId} provider={provider} />
    );
  }
  return <NoteReader note={note} onClose={() => useBoardUi.getState().setOpenNote(null)} />;
}

function NoteReader({ note, onClose }: { note: NoteItem; onClose: () => void }) {
  const { t } = useTranslation();
  const titleId = useId();
  return (
    <section className="panel note-panel" aria-labelledby={titleId}>
      <header>
        <h2 id={titleId}>{note.title || t("effects.note.untitled")}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label={t("effects.note.close")}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div className="note-body">
        {note.text.trim() ? (
          <Markdown text={note.text} />
        ) : (
          <p className="muted">{t("effects.note.empty")}</p>
        )}
      </div>
    </section>
  );
}

function NoteEditor({
  note,
  store,
  roomId,
  provider,
}: {
  note: NoteItem;
  store: BoardStore;
  roomId: string;
  provider: HocuspocusProvider;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const iconId = useId();
  const textId = useId();
  const [title, setTitle] = useState(note.title);
  const [text, setText] = useState(note.text);
  const [preview, setPreview] = useState(false);
  const hidden = store.isHidden(note.id);
  // Ogni campo si salva quando si esce: un solo passo di annulla per modifica.
  const save = (patch: Partial<Pick<NoteItem, "title" | "text" | "icon">>) =>
    store.update({ [note.id]: patch });

  return (
    <section className="panel note-panel" aria-label={t("effects.note.label")}>
      <header>
        <h2>{t("effects.note.label")}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label={t("effects.note.close")}
          onClick={() => useBoardUi.getState().select([])}
        >
          ×
        </button>
      </header>
      <p className="muted small">
        {hidden ? t("effects.note.hiddenHint") : t("effects.note.visibleHint")}
      </p>
      <div className="note-fields">
        <label htmlFor={titleId} className="small muted">
          {t("effects.note.titleLabel")}
        </label>
        <input
          id={titleId}
          value={title}
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== note.title && save({ title: title.trim() })}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
        <label htmlFor={iconId} className="small muted">
          {t("effects.note.iconLabel")}
        </label>
        <select
          id={iconId}
          value={note.icon}
          onChange={(e) => save({ icon: e.target.value as NoteItem["icon"] })}
        >
          {NOTE_ICONS.map((icon) => (
            <option key={icon.id} value={icon.id}>
              {t(`effects.note.icons.${icon.id}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="note-tabs">
        <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)}>
          {t("effects.note.edit")}
        </button>
        <button type="button" aria-pressed={preview} onClick={() => setPreview(true)}>
          {t("effects.note.preview")}
        </button>
      </div>
      {preview ? (
        <div className="note-body">
          {text.trim() ? (
            <Markdown text={text} />
          ) : (
            <p className="muted">{t("effects.note.empty")}</p>
          )}
        </div>
      ) : (
        <>
          <label htmlFor={textId} className="visually-hidden">
            {t("effects.note.textLabel")}
          </label>
          <textarea
            id={textId}
            className="note-text"
            value={text}
            maxLength={10000}
            rows={10}
            placeholder={t("effects.note.placeholder")}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => text !== note.text && save({ text })}
          />
        </>
      )}
      <SendToPlayer note={{ title: title.trim(), text }} roomId={roomId} provider={provider} />
    </section>
  );
}

/**
 * Rivela la nota a un solo giocatore: gli arriva come messaggio privato (lo leggono solo lui e il
 * GM), mentre sulla lavagna resta nascosta agli altri.
 */
function SendToPlayer({
  note,
  roomId,
  provider,
}: {
  note: Pick<NoteItem, "title" | "text">;
  roomId: string;
  provider: HocuspocusProvider;
}) {
  const { t } = useTranslation();
  const gmToken = useAssetAuth();
  const players = usePlayers(provider);
  const selectId = useId();
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [sending, setSending] = useState(false);
  if (!gmToken) return null;

  async function send() {
    const player = players.find((p) => p.id === to);
    if (!player || !gmToken) return;
    const me = provider.awareness?.getLocalState()?.user as PresenceUser | undefined;
    const title = note.title || t("effects.note.untitled");
    setSending(true);
    setStatus(null);
    try {
      await api.sendMessage(
        roomId,
        {
          to: player.id,
          text: t("effects.note.messagePreview", { title }),
          fromName: me?.name?.trim() || "GM",
          note,
        },
        { gmToken },
      );
      setStatus({ text: t("effects.note.sent", { name: player.name }) });
    } catch (error) {
      setStatus({ text: describeApiError(error), error: true });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="note-send">
      <label htmlFor={selectId} className="small muted">
        {t("effects.note.sendLabel")}
      </label>
      <div className="note-send-row">
        <select id={selectId} value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="">
            {players.length === 0 ? t("effects.note.noPlayers") : t("effects.note.choosePlayer")}
          </option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button type="button" disabled={!to || sending} onClick={() => void send()}>
          {t("effects.note.send")}
        </button>
      </div>
      {status && (
        <p className={status.error ? "error small" : "muted small"} role="status">
          {status.text}
        </p>
      )}
    </div>
  );
}
