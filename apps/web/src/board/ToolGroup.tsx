import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TOOL_ICONS } from "./icons";
import type { Tool } from "./tools";

export type GroupItem =
  | { kind: "tool"; tool: Tool; key: string }
  /** Un comando che non è uno strumento (caricare un'immagine, generare una mappa). */
  | { kind: "action"; id: string; label: string; title?: string; icon: ReactNode; run: () => void };

interface Props {
  label: string;
  items: GroupItem[];
  /** Strumento attivo della barra. */
  tool: Tool;
  setTool: (tool: Tool) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Gruppo di strumenti nella barra verticale: un solo pulsante con l'icona dell'ultimo strumento
 * usato del gruppo. Il clic lo attiva e apre di lato la fila con gli altri; le scorciatoie da
 * tastiera continuano a funzionare anche a gruppo chiuso.
 */
export function ToolGroup({ label, items, tool, setTool, open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const tools = items.flatMap((i) => (i.kind === "tool" ? [i] : []));
  const [last, setLast] = useState(tools[0]?.tool);
  const active = tools.find((i) => i.tool === tool);
  // Ricorda l'ultimo strumento del gruppo, anche se scelto con la tastiera.
  useEffect(() => {
    if (active) setLast(active.tool);
  }, [active]);
  const shown = active ?? tools.find((i) => i.tool === last) ?? tools[0];
  const buttonRef = useRef<HTMLButtonElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const flyoutId = useId();
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  // La funzione cambia a ogni render della barra: gli effetti leggono sempre l'ultima.
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  // La fila si apre accanto al pulsante, prima di essere disegnata.
  useLayoutEffect(() => {
    const rect = open ? buttonRef.current?.getBoundingClientRect() : undefined;
    setPosition(rect ? { top: rect.top, left: rect.right + 8 } : null);
  }, [open]);

  // Si chiude cliccando altrove, con Esc o se la barra scorre.
  useEffect(() => {
    if (!open) return;
    const close = () => onOpenChangeRef.current(false);
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || flyoutRef.current?.contains(target)) return;
      close();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      close();
      buttonRef.current?.focus();
    }
    const bar = buttonRef.current?.closest(".toolbar-tools");
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    bar?.addEventListener("scroll", close);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
      bar?.removeEventListener("scroll", close);
    };
  }, [open]);

  if (!shown) return null;
  const shownLabel = t(`tools.toolbar.tools.${shown.tool}`);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="icon-button tool-group-button"
        aria-pressed={!!active}
        aria-expanded={open}
        aria-controls={open ? flyoutId : undefined}
        aria-label={t("tools.toolbar.groupLabel", { group: label, tool: shownLabel })}
        title={t("tools.toolbar.groupTitle", { group: label, tool: shownLabel, key: shown.key })}
        onClick={() => {
          setTool(shown.tool);
          onOpenChange(!open);
        }}
      >
        {TOOL_ICONS[shown.tool]}
      </button>
      {open && position && (
        <div
          ref={flyoutRef}
          id={flyoutId}
          className="toolbar tool-flyout"
          role="toolbar"
          aria-label={label}
          style={{ top: position.top, left: position.left }}
        >
          {items.map((item) => {
            if (item.kind === "action") {
              return (
                <button
                  key={item.id}
                  type="button"
                  className="icon-button"
                  aria-label={item.label}
                  title={item.title ?? item.label}
                  onClick={() => {
                    onOpenChange(false);
                    item.run();
                  }}
                >
                  {item.icon}
                </button>
              );
            }
            const itemLabel = t(`tools.toolbar.tools.${item.tool}`);
            return (
              <button
                key={item.tool}
                type="button"
                className="icon-button"
                aria-pressed={tool === item.tool}
                aria-label={itemLabel}
                title={t("tools.toolbar.toolTitle", { label: itemLabel, key: item.key })}
                onClick={() => {
                  setTool(item.tool);
                  onOpenChange(false);
                }}
              >
                {TOOL_ICONS[item.tool]}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
