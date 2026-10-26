import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { BoardItem, Role, TokenItem } from "@scryboard/shared";
import { canModify } from "@scryboard/shared";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { AuraFields } from "./AuraFields";
import { parentOf } from "./attach";
import { ElevationField } from "./ElevationField";
import { CopyIcon, EyeIcon, EyeOffIcon, LockIcon, TrashIcon, UnlockIcon } from "./icons";
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
  const { t } = useTranslation();
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
  const tokens = selected.filter((i): i is TokenItem => i.kind === "token");
  const allObscured = tokens.length > 0 && tokens.every((i) => i.obscured);
  const removable = selected.filter((i) => canModify(i, role));

  return (
    <div className="toolbar selection-panel" role="toolbar" aria-label={t("core.selection.label")}>
      {single?.kind === "token" && canModify(single, role) && (
        <>
          {/* Nome e aspetto di un token in incognito li conosce solo il GM. */}
          {(role === "gm" || !single.obscured) && (
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
          <AuraFields token={single} store={store} />
          <ElevationField token={single} store={store} />
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
          aria-label={allHidden ? t("core.selection.reveal") : t("core.selection.hide")}
          title={allHidden ? t("core.selection.revealTitle") : t("core.selection.hideTitle")}
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
      {role === "gm" && store.canHide && tokens.length > 0 && (
        <button
          type="button"
          className="icon-button obscure-button"
          aria-pressed={allObscured}
          aria-label={allObscured ? t("core.selection.unmask") : t("core.selection.obscure")}
          title={allObscured ? t("core.selection.unmaskTitle") : t("core.selection.obscureTitle")}
          onClick={() =>
            store.setObscured(
              tokens.map((i) => i.id),
              !allObscured,
            )
          }
        >
          ?
        </button>
      )}
      {role === "gm" && (
        <button
          type="button"
          className="icon-button"
          aria-pressed={allLocked}
          aria-label={allLocked ? t("core.selection.unlock") : t("core.selection.lock")}
          title={allLocked ? t("core.selection.unlock") : t("core.selection.lockTitle")}
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
          aria-label={t("core.selection.duplicate")}
          title={t("core.selection.duplicateTitle")}
          onClick={() => {
            const copies = store.duplicate(
              removable.map((i) => i.id),
              { asPlayer: role !== "gm" },
            );
            if (copies.length > 0) select(copies);
          }}
        >
          {CopyIcon}
        </button>
      )}
      {removable.length > 0 && (
        <button
          type="button"
          className="icon-button"
          aria-label={t("core.selection.delete")}
          title={t("core.selection.deleteTitle")}
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
  const { t } = useTranslation();
  const attachFrom = useBoardUi((s) => s.attachFrom);
  const parent = parentOf(store.getSnapshot(), token);
  if (parent) {
    return (
      <button
        type="button"
        title={t("core.selection.detachTitle")}
        onClick={() => store.update({ [token.id]: { attachedTo: null } })}
      >
        {t("core.selection.detachFrom", { name: parent.name || t("core.selection.token") })}
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={attachFrom === token.id}
      title={t("core.selection.attachTitle")}
      onClick={() => useBoardUi.getState().setAttachFrom(attachFrom === token.id ? null : token.id)}
    >
      {t("core.selection.attachTo")}
    </button>
  );
}
