import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { BoardItem, Role, TokenItem } from "@scryboard/shared";
import { canModify } from "@scryboard/shared";
import { useSyncExternalStore } from "react";
import { AuraFields } from "./AuraFields";
import { parentOf } from "./attach";
import { EyeIcon, EyeOffIcon, LockIcon, TrashIcon, UnlockIcon } from "./icons";
import { LightFields, VisionFields } from "./LightFields";
import { PathFields } from "./PathFields";
import type { BoardStore } from "./store";
import { TokenStyleFields } from "./TokenStyleFields";
import { useBoardUi } from "./tools";

interface Props {
  store: BoardStore;
  role: Role;
  roomId: string;
  provider: HocuspocusProvider;
}

/** Azioni sugli oggetti selezionati: proprietà del token, blocco (GM) ed eliminazione. */
export function SelectionPanel({ store, role, roomId, provider }: Props) {
  // Si aggiorna anche quando gli oggetti cambiano da remoto.
  useSyncExternalStore(store.subscribe, store.getSnapshot);
  const selectedIds = useBoardUi((s) => s.selectedIds);
  const select = useBoardUi((s) => s.select);
  const selected = selectedIds
    .map((id) => store.get(id))
    .filter((i): i is BoardItem => i !== undefined);
  if (selected.length === 0) return null;

  const single = selected.length === 1 ? selected[0] : undefined;
  const allLocked = selected.every((i) => i.locked);
  const allHidden = selected.every((i) => store.isHidden(i.id));
  const removable = selected.filter((i) => canModify(i, role));

  return (
    <div className="toolbar selection-panel" role="toolbar" aria-label="Selezione">
      {single?.kind === "token" && canModify(single, role) && (
        <>
          <TokenStyleFields
            key={single.id}
            value={single}
            roomId={roomId}
            onChange={(patch) => store.update({ [single.id]: patch })}
          />
          <span className="toolbar-separator" />
          <AuraFields token={single} store={store} />
          <AttachButton token={single} store={store} />
        </>
      )}
      {single?.kind === "token" && role === "gm" && canModify(single, role) && (
        <VisionFields token={single} store={store} provider={provider} />
      )}
      {single?.kind === "light" && canModify(single, role) && (
        <LightFields light={single} store={store} />
      )}
      {single?.kind === "path" && canModify(single, role) && (
        <PathFields path={single} store={store} cellSize={store.getGrid().size} />
      )}
      {role === "gm" && store.canHide && (
        <button
          type="button"
          className="icon-button"
          aria-pressed={allHidden}
          aria-label={allHidden ? "Rivela" : "Nascondi"}
          title={allHidden ? "Rivela ai giocatori (Shift+H)" : "Nascondi ai giocatori (Shift+H)"}
          onClick={() =>
            store.setHidden(
              selected.map((i) => i.id),
              !allHidden,
            )
          }
        >
          {allHidden ? EyeOffIcon : EyeIcon}
        </button>
      )}
      {role === "gm" && (
        <button
          type="button"
          className="icon-button"
          aria-pressed={allLocked}
          aria-label={allLocked ? "Sblocca" : "Blocca"}
          title={
            allLocked
              ? "Sblocca"
              : "Blocca: nessuno potrà spostarlo o cancellarlo finché non lo sblocchi"
          }
          onClick={() =>
            store.update(Object.fromEntries(selected.map((i) => [i.id, { locked: !allLocked }])))
          }
        >
          {allLocked ? LockIcon : UnlockIcon}
        </button>
      )}
      {removable.length > 0 && (
        <button
          type="button"
          className="icon-button"
          aria-label="Elimina"
          title="Elimina (Canc)"
          onClick={() => {
            store.remove(removable.map((i) => i.id));
            select([]);
          }}
        >
          {TrashIcon}
        </button>
      )}
    </div>
  );
}

/** «Aggancia a…»: il prossimo token cliccato diventa quello principale (cavalcatura, veicolo). */
function AttachButton({ token, store }: { token: TokenItem; store: BoardStore }) {
  const attachFrom = useBoardUi((s) => s.attachFrom);
  const parent = parentOf(store.getSnapshot(), token);
  if (parent) {
    return (
      <button
        type="button"
        title="Il token non seguirà più quello principale"
        onClick={() => store.update({ [token.id]: { attachedTo: null } })}
      >
        Sgancia da {parent.name || "token"}
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={attachFrom === token.id}
      title="Poi clicca il token principale: si muoveranno insieme"
      onClick={() => useBoardUi.getState().setAttachFrom(attachFrom === token.id ? null : token.id)}
    >
      Aggancia a…
    </button>
  );
}
