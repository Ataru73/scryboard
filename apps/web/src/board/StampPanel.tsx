import { STAMPS } from "@scryboard/shared";
import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { catalogLabel } from "../i18n/catalog";
import {
  deleteGeneratedAsset,
  ensureAssetInRoom,
  type GeneratedAsset,
  saveGeneratedAsset,
  useGeneratedAssets,
} from "../lib/generatedAssets";
import { storage, subscribeGeminiKey } from "../lib/storage";
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

function CustomStampItem({
  asset,
  isSelected,
  onSelect,
  onRemove,
  title,
  ariaLabel,
  removeTitle,
}: {
  asset: GeneratedAsset;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: (e: React.MouseEvent) => void;
  title: string;
  ariaLabel: string;
  removeTitle: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(asset.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [asset.blob]);

  return (
    <div className="stamp-custom-wrapper">
      <button
        type="button"
        className="biome-button stamp-button"
        aria-pressed={isSelected}
        aria-label={ariaLabel}
        title={title}
        style={url ? { backgroundImage: `url(${url})` } : undefined}
        onClick={onSelect}
      />
      <button
        type="button"
        className="stamp-delete-button"
        title={removeTitle}
        aria-label={removeTitle}
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  );
}

/** Timbri di scenario (solo GM): clic per piazzarne uno, trascina per spargerne tanti. */
export function StampPanel({ store, roomId, centerWorld }: Props) {
  const { t } = useTranslation();
  const { stampId, stampAssetId, stampRandom, setStamp } = useBoardUi();
  const gmToken = useAssetAuth();
  const geminiKey = useSyncExternalStore(subscribeGeminiKey, storage.getGeminiKey);
  const randomId = useId();
  const [modalOpen, setModalOpen] = useState(false);
  const savedStamps = useGeneratedAssets("stamp");

  const previews = useMemo(
    () => Object.fromEntries(STAMPS.map((s) => [s.id, stampImage(s.id, 0).toDataURL()])),
    [],
  );

  async function handlePickGenerated(file: File, size: number, prompt: string) {
    if (!roomId) return;
    try {
      const { assetId } = await uploadImage(roomId, file, gmToken);
      await saveGeneratedAsset({
        id: assetId,
        kind: "stamp",
        blob: file,
        mimeType: file.type,
        prompt,
        createdAt: new Date().toISOString(),
        metadata: { size },
      });
      storage.addGenerated(roomId, assetId);
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

  function handleSelectCustom(asset: GeneratedAsset) {
    const size = asset.metadata?.size ?? 1;
    setStamp({ stampAssetId: asset.id, stampCustomSize: size });
    if (roomId) {
      void ensureAssetInRoom(roomId, asset, gmToken).catch(() => {});
    }
  }

  async function handleRemoveCustom(assetId: string, e: React.MouseEvent) {
    e.stopPropagation();
    await deleteGeneratedAsset(assetId);
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
          {savedStamps.map((cs) => {
            const isSelected = stampAssetId === cs.id;
            const size = cs.metadata?.size ?? 1;
            return (
              <CustomStampItem
                key={cs.id}
                asset={cs}
                isSelected={isSelected}
                ariaLabel={cs.prompt || t("tools.stamp.customStamp")}
                title={
                  cs.prompt
                    ? `${cs.prompt} (${size} ${t("assets.stampGenerator.cells", { count: size })})`
                    : t("tools.stamp.customStampTitle", { count: size })
                }
                removeTitle={t("tools.stamp.removeCustom")}
                onSelect={() => handleSelectCustom(cs)}
                onRemove={(e) => void handleRemoveCustom(cs.id, e)}
              />
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
          onPick={(file, size, prompt) => void handlePickGenerated(file, size, prompt)}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
