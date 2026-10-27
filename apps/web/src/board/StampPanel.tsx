import { assetUrl, STAMPS } from "@scryboard/shared";
import { useId, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { catalogLabel } from "../i18n/catalog";
import { type CustomStamp, storage, subscribeGeminiKey } from "../lib/storage";
import { stampImage } from "../stamps/generate";
import { useAssetAuth } from "./assetAuth";
import { StampGenerateIcon } from "./icons";
import { StampGenerator } from "./StampGenerator";
import { type BoardStore, newItemId } from "./store";
import { useBoardUi } from "./tools";
import { uploadImage } from "./upload";
import type { Point } from "./viewport";

interface Props {
  store?: BoardStore;
  roomId?: string;
  centerWorld?: () => Point;
}

/** Timbri di scenario (solo GM): clic per piazzarne uno, trascina per spargerne tanti. */
export function StampPanel({ store, roomId, centerWorld }: Props) {
  const { t } = useTranslation();
  const { stampId, stampAssetId, stampRandom, setStamp } = useBoardUi();
  const gmToken = useAssetAuth();
  const geminiKey = useSyncExternalStore(subscribeGeminiKey, storage.getGeminiKey);
  const randomId = useId();
  const [modalOpen, setModalOpen] = useState(false);
  const [customStamps, setCustomStamps] = useState<CustomStamp[]>(() =>
    roomId ? storage.getCustomStamps(roomId) : [],
  );

  const previews = useMemo(
    () => Object.fromEntries(STAMPS.map((s) => [s.id, stampImage(s.id, 0).toDataURL()])),
    [],
  );

  async function handlePickGenerated(file: File, size: number) {
    if (!roomId) return;
    try {
      const { assetId } = await uploadImage(roomId, file, gmToken);
      storage.addGenerated(roomId, assetId);
      storage.addCustomStamp(roomId, { assetId, size });
      setCustomStamps(storage.getCustomStamps(roomId));
      setStamp({ stampAssetId: assetId, stampCustomSize: size });

      if (store && centerWorld) {
        const at = centerWorld();
        store.add([
          {
            id: newItemId(),
            layer: "map",
            x: at.x,
            y: at.y,
            rotation: 0,
            z: store.topZ("map"),
            locked: false,
            createdBy: store.userId,
            kind: "stamp",
            assetId,
            size,
            variant: 0,
          },
        ]);
      }
    } catch {
      // Ignorato: l'errore di upload è gestito o segnalato
    }
  }

  function handleRemoveCustom(assetId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!roomId) return;
    storage.removeCustomStamp(roomId, assetId);
    setCustomStamps(storage.getCustomStamps(roomId));
    if (stampAssetId === assetId) {
      setStamp({ stampAssetId: null });
    }
  }

  return (
    <>
      <div className="toolbar toolbar-style" role="toolbar" aria-label={t("tools.stamp.label")}>
        <div className="biome-palette">
          {STAMPS.map((s) => {
            const label = catalogLabel(t, "stamps", s.id, s.label);
            const isSelected = !stampAssetId && stampId === s.id;
            return (
              <button
                key={s.id}
                type="button"
                className="biome-button stamp-button"
                aria-pressed={isSelected}
                aria-label={label}
                title={label}
                style={{ backgroundImage: `url(${previews[s.id]})` }}
                onClick={() => setStamp({ stampId: s.id, stampAssetId: null })}
              />
            );
          })}
          {customStamps.map((cs) => {
            if (!roomId) return null;
            const isSelected = stampAssetId === cs.assetId;
            return (
              <div key={cs.assetId} className="stamp-custom-wrapper">
                <button
                  type="button"
                  className="biome-button stamp-button"
                  aria-pressed={isSelected}
                  aria-label={t("tools.stamp.customStamp")}
                  title={t("tools.stamp.customStampTitle", { count: cs.size })}
                  style={{ backgroundImage: `url(${assetUrl(roomId, cs.assetId)})` }}
                  onClick={() => setStamp({ stampAssetId: cs.assetId, stampCustomSize: cs.size })}
                />
                <button
                  type="button"
                  className="stamp-delete-button"
                  title={t("tools.stamp.removeCustom")}
                  aria-label={t("tools.stamp.removeCustom")}
                  onClick={(e) => handleRemoveCustom(cs.assetId, e)}
                >
                  ×
                </button>
              </div>
            );
          })}
          {geminiKey && roomId && (
            <button
              type="button"
              className="biome-button stamp-button stamp-generate-button"
              title={t("tools.stamp.generateTitle")}
              aria-label={t("tools.stamp.generateLabel")}
              onClick={() => setModalOpen(true)}
            >
              {StampGenerateIcon}
            </button>
          )}
        </div>
        <span className="toolbar-separator" />
        <label className="checkbox small" htmlFor={randomId}>
          <input
            id={randomId}
            type="checkbox"
            checked={stampRandom}
            onChange={(e) => setStamp({ stampRandom: e.target.checked })}
          />
          {t("tools.stamp.random")}
        </label>
        <span className="muted small fog-hint">{t("tools.stamp.hint")}</span>
      </div>

      {modalOpen && geminiKey && (
        <StampGenerator
          apiKey={geminiKey}
          onPick={(file, size) => void handlePickGenerated(file, size)}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
