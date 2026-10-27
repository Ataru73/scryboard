import { useEffect, useState } from "react";
import { useBoardUi } from "./tools";

export type DevicePosture = "continuous" | "folded";
export type FoldType = "none" | "tabletop" | "book";

export interface DevicePostureInfo {
  /** Postura corrente: piegato a metà o continuo/piatto. */
  posture: DevicePosture;
  /** Vero se il dispositivo è piegato (sensore hardware o forzato manualmente). */
  isFolded: boolean;
  /** Tipo di piegatura: "tabletop" (cerniera orizzontale) o "book" (cerniera verticale). */
  foldType: FoldType;
  /** Vero se la modalità è stata attivata manualmente tramite pulsante. */
  manualFlexMode: boolean;
  /** Alterna la modalità Flex Mode / Tabletop manualmente. */
  toggleManualFlexMode: () => void;
  /** Imposta la modalità Flex Mode manualmente. */
  setManualFlexMode: (on: boolean) => void;
}

export function useDevicePosture(): DevicePostureInfo {
  const manualFlexMode = useBoardUi((s) => s.manualFlexMode);
  const setManualFlexMode = useBoardUi((s) => s.setManualFlexMode);
  const toggleManualFlexMode = useBoardUi((s) => s.toggleManualFlexMode);

  const [hardwareFolded, setHardwareFolded] = useState<boolean>(() => {
    if (typeof navigator !== "undefined" && "devicePosture" in navigator) {
      // W3C Device Posture API: type "folded" | "continuous"
      return (
        (navigator as unknown as { devicePosture?: { type?: string } }).devicePosture?.type ===
        "folded"
      );
    }
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(device-posture: folded)").matches;
    }
    return false;
  });

  const [isLandscape, setIsLandscape] = useState<boolean>(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(orientation: landscape)").matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkPosture = () => {
      let folded = false;
      if ("devicePosture" in navigator) {
        const dp = (navigator as unknown as { devicePosture?: { type?: string } }).devicePosture;
        folded = dp?.type === "folded";
      }
      if (!folded && window.matchMedia) {
        folded = window.matchMedia("(device-posture: folded)").matches;
      }
      setHardwareFolded(folded);
    };

    if ("devicePosture" in navigator) {
      const dp = (navigator as unknown as { devicePosture?: EventTarget }).devicePosture;
      dp?.addEventListener?.("change", checkPosture);
    }

    const postureMql = window.matchMedia?.("(device-posture: folded)");
    postureMql?.addEventListener?.("change", checkPosture);

    const orientationMql = window.matchMedia?.("(orientation: landscape)");
    const onOrientation = (e: MediaQueryListEvent) => setIsLandscape(e.matches);
    orientationMql?.addEventListener?.("change", onOrientation);

    return () => {
      if ("devicePosture" in navigator) {
        const dp = (navigator as unknown as { devicePosture?: EventTarget }).devicePosture;
        dp?.removeEventListener?.("change", checkPosture);
      }
      postureMql?.removeEventListener?.("change", checkPosture);
      orientationMql?.removeEventListener?.("change", onOrientation);
    };
  }, []);

  const isFolded = hardwareFolded || manualFlexMode;
  let foldType: FoldType = "none";
  if (isFolded) {
    // In orizzontale o se forzato manualmente è Tabletop (mappa sopra, console sotto).
    // In verticale con sensore hardware è Book (console a sinistra, mappa a destra).
    foldType = manualFlexMode || isLandscape ? "tabletop" : "book";
  }

  // Sincronizza attributi su html per consentire a stili globali/portali di adattarsi
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.setAttribute("data-posture", isFolded ? "folded" : "continuous");
    root.setAttribute("data-fold-type", isFolded ? foldType : "none");
  }, [isFolded, foldType]);

  return {
    posture: isFolded ? "folded" : "continuous",
    isFolded,
    foldType,
    manualFlexMode,
    toggleManualFlexMode,
    setManualFlexMode,
  };
}
