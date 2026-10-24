import type { BoardItem, Role } from "@scryboard/shared";
import { canModify } from "@scryboard/shared";
import { useSyncExternalStore } from "react";
import { EyeIcon, EyeOffIcon, LockIcon, TrashIcon, UnlockIcon } from "./icons";
import type { BoardStore } from "./store";
import { TokenStyleFields } from "./TokenStyleFields";
import { useBoardUi } from "./tools";

interface Props {
  store: BoardStore;
  role: Role;
  roomId: string;
}

/** Azioni sugli oggetti selezionati: proprietà del token, blocco (GM) ed eliminazione. */
export function SelectionPanel({ store, role, roomId }: Props) {
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
        </>
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
