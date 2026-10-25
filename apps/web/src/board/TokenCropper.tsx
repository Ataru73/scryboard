import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type Crop,
  clampCrop,
  cropRegion,
  initialCrop,
  MAX_ZOOM,
  panCrop,
  renderCrop,
  zoomCrop,
} from "./crop";

const PREVIEW = 320;
/** Spostamento con le frecce, in pixel dell'anteprima. */
const KEY_STEP = 16;

interface Props {
  file: File;
  onConfirm: (cropped: File) => void;
  onCancel: () => void;
}

/** Mini editor: trascina per spostare, zoom per stringere, e si tiene l'area dentro il cerchio. */
export function TokenCropper({ file, onConfirm, onCancel }: Props) {
  const { t } = useTranslation();
  const titleId = useId();
  const zoomId = useId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [crop, setCrop] = useState<Crop | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let loaded: ImageBitmap | null = null;
    createImageBitmap(file).then(
      (b) => {
        if (cancelled) return b.close();
        loaded = b;
        setBitmap(b);
        setCrop(initialCrop(b.width, b.height));
      },
      () => !cancelled && setError(t("assets.cropper.invalidImage", { name: file.name })),
    );
    return () => {
      cancelled = true;
      loaded?.close();
    };
  }, [file, t]);

  // L'anteprima mostra il ritaglio, con l'esterno del cerchio scurito.
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !bitmap || !crop) return;
    const { x, y, side } = cropRegion(bitmap.width, bitmap.height, crop);
    ctx.clearRect(0, 0, PREVIEW, PREVIEW);
    ctx.drawImage(bitmap, x, y, side, side, 0, 0, PREVIEW, PREVIEW);
    ctx.fillStyle = "rgb(0 0 0 / 0.55)";
    ctx.beginPath();
    ctx.rect(0, 0, PREVIEW, PREVIEW);
    ctx.arc(PREVIEW / 2, PREVIEW / 2, PREVIEW / 2 - 2, 0, Math.PI * 2, true);
    ctx.fill("evenodd");
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(PREVIEW / 2, PREVIEW / 2, PREVIEW / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
  }, [bitmap, crop]);

  const pan = (dx: number, dy: number) =>
    bitmap && setCrop((c) => c && panCrop(bitmap.width, bitmap.height, c, dx, dy, PREVIEW));
  const zoomTo = (zoom: number, anchor?: { x: number; y: number }) =>
    bitmap && setCrop((c) => c && zoomCrop(bitmap.width, bitmap.height, c, zoom, anchor));

  async function confirm() {
    if (!bitmap || !crop) return;
    setBusy(true);
    try {
      onConfirm(await renderCrop(bitmap, clampCrop(bitmap.width, bitmap.height, crop)));
    } catch {
      setError(t("assets.cropper.cropFailed"));
      setBusy(false);
    }
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc chiude nativamente <dialog>.
    <dialog
      ref={(el) => {
        if (el && !el.open) el.showModal();
      }}
      className="card stack modal"
      aria-labelledby={titleId}
      onClose={onCancel}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <h2 id={titleId}>{t("assets.cropper.title")}</h2>
      <p className="muted small">{t("assets.cropper.help")}</p>
      <canvas
        ref={canvasRef}
        className="cropper-canvas"
        width={PREVIEW}
        height={PREVIEW}
        tabIndex={0}
        role="img"
        aria-label={t("assets.cropper.canvas")}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          // Il canvas può essere ridimensionato via CSS: si converte in pixel dell'anteprima.
          const k = PREVIEW / e.currentTarget.getBoundingClientRect().width;
          pan((e.clientX - drag.current.x) * k, (e.clientY - drag.current.y) * k);
          drag.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onWheel={(e) => {
          if (!crop) return;
          const r = e.currentTarget.getBoundingClientRect();
          zoomTo(crop.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), {
            x: (e.clientX - r.left) / r.width,
            y: (e.clientY - r.top) / r.height,
          });
        }}
        onKeyDown={(e) => {
          const step: Record<string, [number, number]> = {
            ArrowLeft: [KEY_STEP, 0],
            ArrowRight: [-KEY_STEP, 0],
            ArrowUp: [0, KEY_STEP],
            ArrowDown: [0, -KEY_STEP],
          };
          const delta = step[e.key];
          if (!delta) return;
          e.preventDefault();
          pan(...delta);
        }}
      />
      <label className="field" htmlFor={zoomId}>
        <span>{t("assets.cropper.zoom")}</span>
        <input
          id={zoomId}
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.05}
          value={crop?.zoom ?? 1}
          disabled={!crop}
          onChange={(e) => zoomTo(Number(e.target.value))}
        />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="modal-actions">
        <button type="button" onClick={onCancel}>
          {t("assets.cropper.cancel")}
        </button>
        <button
          type="button"
          className="primary"
          disabled={!crop || busy}
          onClick={() => void confirm()}
        >
          {t("assets.cropper.use")}
        </button>
      </div>
    </dialog>
  );
}
