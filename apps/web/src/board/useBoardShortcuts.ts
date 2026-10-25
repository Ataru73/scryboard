import { type BoardItem, PATH_STYLES, type Role, STAMPS } from "@scryboard/shared";
import { useEffect } from "react";
import type { BoardStore } from "./store";
import { GM_TOOLS, TOOL_SHORTCUTS, useBoardUi } from "./tools";
import { zoomAt } from "./viewport";

interface Options {
  store: BoardStore;
  role: Role;
  canEdit: (item: BoardItem | undefined) => boolean;
  fitToContent: () => void;
  viewportSize: { width: number; height: number };
}

const NON_TEXT_INPUTS = new Set([
  "checkbox",
  "radio",
  "button",
  "submit",
  "reset",
  "color",
  "range",
  "file",
]);

/** Le scorciatoie si disattivano solo mentre si scrive, non con il focus su una checkbox o un bottone. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(target.type);
  return target.closest("textarea, select, [contenteditable]") !== null;
}

export function useBoardShortcuts({ store, role, canEdit, fitToContent, viewportSize }: Options) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTyping(e.target) || document.querySelector("dialog[open]")) return;
      const ui = useBoardUi.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        store.redo();
        return;
      }
      if (mod || e.altKey) return;

      if (e.code === "Space") {
        e.preventDefault();
        // Durante una misura Spazio aggiunge una tappa (lo gestisce la lavagna), non muove la vista.
        if (!e.repeat && !ui.measuring) ui.setSpacePan(true);
        return;
      }
      if (e.shiftKey && e.code === "Digit1") {
        fitToContent();
        return;
      }
      if (e.shiftKey && e.code === "Digit0") {
        const center = { x: viewportSize.width / 2, y: viewportSize.height / 2 };
        ui.setViewport(zoomAt(ui.viewport, center, 1 / ui.viewport.scale));
        return;
      }

      const editable = ui.selectedIds.filter((id) => canEdit(store.get(id)));
      if (e.shiftKey && key === "h" && role === "gm" && ui.selectedIds.length > 0) {
        // Shift+H: nasconde la selezione, o la rivela se è già tutta nascosta.
        const allHidden = ui.selectedIds.every((id) => store.isHidden(id));
        store.setHidden(ui.selectedIds, !allHidden);
        return;
      }
      switch (e.key) {
        case "Delete":
        case "Backspace":
          if (ui.selectedWallId && role === "gm") {
            e.preventDefault();
            store.removeWalls([ui.selectedWallId]);
            ui.selectWall(null);
          } else if (editable.length > 0) {
            e.preventDefault();
            store.remove(editable);
            ui.select([]);
          }
          return;
        case "Escape":
          // Durante una misura Esc la annulla (lo gestisce la lavagna) e basta.
          if (ui.measuring) return;
          if (ui.tool === "calibrate" || ui.tool === "ruler") ui.setTool("select");
          else ui.selectWall(null);
          return;
        case "n":
        case "N":
          // Turno successivo: solo il GM, e solo se c'è un ordine.
          if (role === "gm") store.advanceTurn(1);
          return;
        case "]":
          store.bringToFront(editable);
          return;
        case "[":
          store.sendToBack(editable);
          return;
      }
      // Tavolozza rapida: i numeri scelgono biomi recenti, stili di percorso o timbri.
      if (/^[0-9]$/.test(e.key) && !e.shiftKey && role === "gm") {
        const n = Number(e.key);
        if (ui.tool === "terrain" && n >= 1) {
          const biome = ui.recentBiomes[n - 1];
          if (biome) {
            const keepMode = !["erase", "copy", "paste"].includes(ui.terrainMode);
            ui.setTerrain({
              terrainBiome: biome,
              terrainMode: keepMode ? ui.terrainMode : "brush",
            });
          }
          return;
        }
        if (ui.tool === "path" && n >= 1) {
          const style = PATH_STYLES[n - 1];
          if (style) ui.setPathStyle(style.id);
          return;
        }
        if (ui.tool === "stamp") {
          const stamp = STAMPS[n === 0 ? 9 : n - 1];
          if (stamp) ui.setStamp({ stampId: stamp.id });
          return;
        }
      }

      const tool = TOOL_SHORTCUTS[key];
      if (tool && !e.shiftKey && (role === "gm" || !GM_TOOLS.includes(tool))) ui.setTool(tool);
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "Space") useBoardUi.getState().setSpacePan(false);
    }

    // Se la finestra perde il focus con lo spazio premuto, il keyup non arriva.
    function onBlur() {
      useBoardUi.getState().setSpacePan(false);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [store, role, canEdit, fitToContent, viewportSize]);
}
