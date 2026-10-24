import type { BoardItem, Role } from "@scryboard/shared";
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
      if (isTyping(e.target)) return;
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
        if (!e.repeat) ui.setSpacePan(true);
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
          if (editable.length > 0) {
            e.preventDefault();
            store.remove(editable);
            ui.select([]);
          }
          return;
        case "Escape":
          if (ui.tool === "calibrate") ui.setTool("select");
          else ui.select([]);
          return;
        case "]":
          store.bringToFront(editable);
          return;
        case "[":
          store.sendToBack(editable);
          return;
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
