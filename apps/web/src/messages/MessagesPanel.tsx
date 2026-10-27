import type { HocuspocusProvider } from "@hocuspocus/provider";
import { GM_MAILBOX, MAX_MESSAGE_LENGTH, type Message, type PresenceUser } from "@scryboard/shared";
import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Markdown } from "../board/markdown";
import { RollPanel } from "../dice/RollPanel";
import { rollFormula } from "../dice/rolls";
import { api, describeApiError } from "../lib/api";
import { groupConversations } from "./conversations";
import { useLastRead, useMailbox } from "./useMailbox";

interface Props {
  roomId: string;
  /** "gm" o l'id del profilo del giocatore. */
  me: string;
  myName: string;
  mailProvider: HocuspocusProvider | null;
  /** Documento pubblico: contiene il registro dei tiri. */
  provider: HocuspocusProvider | null;
  /** Utenti connessi (presenza), per scegliere a chi scrivere. */
  users: (PresenceUser & { clientId: number })[];
  auth: { gmToken: string } | { credentials: string };
}

/**
 * Messaggi privati nella barra laterale. I giocatori scrivono al GM o tra loro; il GM scrive a
 * chiunque e legge anche le conversazioni tra giocatori (in sola lettura).
 */
export function MessagesPanel({ roomId, me, myName, mailProvider, provider, users, auth }: Props) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage;
  const [tab, setTab] = useState<"messages" | "dice">("messages");
  const messages = useMailbox(mailProvider);
  const { lastRead, markRead } = useLastRead(`scryboard:read:${roomId}:${me}`);
  // I nomi dei giocatori connessi valgono più di quelli salvati (chi non ha mai scritto non ne ha).
  const knownNames = useMemo(
    () =>
      new Map(
        users.flatMap((u) =>
          u.id && u.role === "player" && !u.projector ? [[u.id, u.name] as const] : [],
        ),
      ),
    [users],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: la lingua aggiorna anche i titoli di riserva.
  const conversations = useMemo(
    () => groupConversations(messages, me, lastRead, knownNames),
    [messages, me, lastRead, knownNames, language],
  );
  const [openKey, setOpenKey] = useState<string | null>(null);
  const unread = conversations.reduce((n, c) => n + c.unread, 0);
  const isGm = me === GM_MAILBOX;
  const recipientId = useId();

  // Possibili destinatari: il GM (per i giocatori), chi è connesso e chi ha già scritto.
  const recipients = useMemo(() => {
    const map = new Map<string, string>();
    if (!isGm) map.set(GM_MAILBOX, "GM");
    // Lo schermo condiviso non riceve messaggi.
    for (const u of users) {
      if (u.id && u.role === "player" && !u.projector && u.id !== me) map.set(u.id, u.name);
    }
    for (const c of conversations)
      if (c.partner && !map.has(c.partner)) map.set(c.partner, c.title);
    return [...map.entries()];
  }, [users, conversations, isGm, me]);

  const open = openKey ? conversations.find((c) => c.key === openKey) : undefined;
  const openTitle = open?.title ?? recipients.find(([id]) => id === openKey)?.[1] ?? "";
  const openPartner = open ? open.partner : openKey;

  // Una conversazione aperta si considera letta, anche quando arrivano messaggi nuovi.
  useEffect(() => {
    const last = open?.messages.at(-1);
    if (open && last) markRead(open.key, last.at);
  }, [open, markRead]);

  return (
    <section
      className="messages"
      aria-label={t(tab === "dice" ? "social.dice.title" : "social.messages.title")}
    >
      <div className="tabs">
        <button type="button" aria-pressed={tab === "messages"} onClick={() => setTab("messages")}>
          {t("social.messages.title")}
          {unread > 0 && <span className="badge unread-badge">{unread}</span>}
        </button>
        <button type="button" aria-pressed={tab === "dice"} onClick={() => setTab("dice")}>
          {t("social.dice.title")}
        </button>
      </div>
      {tab === "dice" ? (
        <RollPanel roomId={roomId} provider={provider} myName={myName} auth={auth} />
      ) : openKey ? (
        <Thread
          title={openTitle}
          me={me}
          messages={open?.messages ?? []}
          readOnly={openPartner === null}
          onBack={() => setOpenKey(null)}
          onSend={(text) => {
            // «/r 2d6+1» in qualunque conversazione tira i dadi per tutto il tavolo.
            const dice = /^\/r\s+(.+)$/i.exec(text);
            if (dice)
              return rollFormula(roomId, dice[1] as string, myName, auth).then(() => undefined);
            return api
              .sendMessage(roomId, { to: openPartner as string, text, fromName: myName }, auth)
              .then(() => undefined);
          }}
        />
      ) : (
        <>
          {!isGm && <p className="muted small">{t("social.messages.gmNotice")}</p>}
          <label htmlFor={recipientId} className="visually-hidden">
            {t("social.messages.writeTo")}
          </label>
          <select
            id={recipientId}
            value=""
            onChange={(e) => e.target.value && setOpenKey(e.target.value)}
          >
            <option value="">{t("social.messages.writeToPlaceholder")}</option>
            {recipients.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <ul className="conversations">
            {conversations.map((c) => (
              <li key={c.key}>
                <button type="button" className="conversation" onClick={() => setOpenKey(c.key)}>
                  <span className="conversation-title">
                    {c.title}
                    {c.partner === null && (
                      <span className="muted small"> {t("social.messages.betweenPlayers")}</span>
                    )}
                  </span>
                  <span className="muted small conversation-preview">
                    {c.messages.at(-1)?.text}
                  </span>
                  {c.unread > 0 && <span className="badge unread-badge">{c.unread}</span>}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Thread({
  title,
  me,
  messages,
  readOnly,
  onBack,
  onSend,
}: {
  title: string;
  me: string;
  messages: Message[];
  readOnly: boolean;
  onBack: () => void;
  onSend: (text: string) => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const timeLocale = i18n.resolvedLanguage?.startsWith("en") ? "en-US" : "it-IT";
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  const inputId = useId();

  // biome-ignore lint/correctness/useExhaustiveDependencies: si scorre in fondo a ogni nuovo messaggio.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(body);
      setText("");
    } catch (e) {
      setError(describeApiError(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="thread">
      <header className="thread-header">
        <button
          type="button"
          className="icon-button"
          aria-label={t("social.messages.back")}
          onClick={onBack}
        >
          ‹
        </button>
        <span className="thread-title">{title}</span>
      </header>
      <ol
        className="thread-messages"
        ref={listRef}
        aria-label={t("social.messages.conversationWith", { title })}
      >
        {messages.map((m) => (
          <li key={m.id} className={m.from === me ? "bubble mine" : "bubble"}>
            {m.from !== me && (
              <span className="bubble-author">
                {m.fromName} {m.from === "gm" && <span className="badge role-badge">GM</span>}
              </span>
            )}
            {m.note ? (
              <div className="bubble-note">
                <strong>{m.note.title || t("effects.note.untitled")}</strong>
                <div className="note-body">
                  <Markdown text={m.note.text} />
                </div>
              </div>
            ) : (
              <span className="bubble-text">{m.text}</span>
            )}
            <time className="bubble-time" dateTime={m.at}>
              {new Date(m.at).toLocaleTimeString(timeLocale, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          </li>
        ))}
        {messages.length === 0 && <li className="muted small">{t("social.messages.empty")}</li>}
      </ol>
      {readOnly ? (
        <p className="muted small">{t("social.messages.readOnly")}</p>
      ) : (
        <form className="composer" onSubmit={submit}>
          <label htmlFor={inputId} className="visually-hidden">
            {t("social.messages.inputLabel")}
          </label>
          <textarea
            id={inputId}
            value={text}
            maxLength={MAX_MESSAGE_LENGTH}
            rows={2}
            placeholder={t("social.messages.placeholder")}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Invio spedisce, Maiusc+Invio va a capo.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <button type="submit" className="primary" disabled={sending || !text.trim()}>
            {t("social.messages.send")}
          </button>
          {error && <p className="error small">{error}</p>}
        </form>
      )}
    </div>
  );
}
