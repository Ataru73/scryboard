import { type FormEvent, useState } from "react";
import { api, describeApiError } from "../lib/api";
import { gmLink } from "../lib/links";
import { navigate } from "../lib/router";

export function HomePage() {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    let room: Awaited<ReturnType<typeof api.createRoom>>;
    try {
      room = await api.createRoom(name);
    } catch (err) {
      console.error("Creazione stanza fallita", err);
      setError(`Non è stato possibile creare la stanza. ${describeApiError(err)}`);
      setBusy(false);
      return;
    }
    navigate(gmLink("", room.id, room.gmToken));
  }

  return (
    <main className="centered">
      <div className="card">
        <h1 className="brand">Scryboard</h1>
        <p className="muted">
          La lavagna condivisa per le tue sessioni: mappe, appunti e segreti da rivelare al momento
          giusto.
        </p>
        <form onSubmit={onSubmit} className="stack">
          <label className="field">
            <span>Nome della stanza</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Es. La Miniera Perduta"
              maxLength={80}
              required
            />
          </label>
          <button type="submit" className="primary" disabled={busy || !name.trim()}>
            {busy ? "Creazione…" : "Crea stanza come GM"}
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      </div>
    </main>
  );
}
