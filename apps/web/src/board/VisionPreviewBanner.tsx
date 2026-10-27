import type { HocuspocusProvider } from "@hocuspocus/provider";
import { useEffect, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import type { BoardStore } from "./store";
import { useBoardUi } from "./tools";
import { usePlayers } from "./usePlayers";

/**
 * Solo GM: finché guarda con gli occhi di un giocatore o di un token, un avviso dice di chi e
 * riporta alla vista completa, qualunque strumento sia attivo.
 */
export function VisionPreviewBanner({
  store,
  provider,
}: {
  store: BoardStore;
  provider: HocuspocusProvider;
}) {
  const { t } = useTranslation();
  const { visionPreview, setVisionPreview } = useBoardUi();
  useSyncExternalStore(store.subscribe, store.getSnapshot);
  const lighting = useSyncExternalStore(store.subscribe, store.getLighting);
  const players = usePlayers(provider);
  const token = visionPreview?.kind === "token" ? store.get(visionPreview.id) : undefined;
  // Token cancellato o rimasto in un'altra scena: non c'è più nessuno da cui guardare.
  const lost = visionPreview?.kind === "token" && token?.kind !== "token";
  useEffect(() => {
    if (lost) setVisionPreview(null);
  }, [lost, setVisionPreview]);
  if (!visionPreview || lost) return null;
  const name =
    visionPreview.kind === "party"
      ? t("effects.lighting.party")
      : visionPreview.kind === "player"
        ? (players.find((p) => p.id === visionPreview.id)?.name ??
          t("effects.lighting.disconnectedPlayer"))
        : (token?.kind === "token" && token.name) || t("core.tokenList.unnamed");
  return (
    <div className="board-notice vision-preview-banner" role="status">
      <span>
        {t("effects.lighting.previewing", { name })}
        {!lighting.enabled && ` ${t("effects.lighting.previewNeedsVision")}`}
      </span>
      <button type="button" onClick={() => setVisionPreview(null)}>
        {t("effects.lighting.backToGmView")}
      </button>
    </div>
  );
}
