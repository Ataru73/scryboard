import type { TextItem } from "@scryboard/shared";
import { useEffect, useRef, useState } from "react";
import { FONT_FAMILY, LINE_HEIGHT } from "./ItemNode";
import { type Viewport, worldToScreen } from "./viewport";

interface Props {
  item: TextItem;
  viewport: Viewport;
  onCommit: (text: string) => void;
}

/** Textarea sovrapposta al canvas, allineata al testo che si sta modificando. */
export function TextEditor({ item, viewport, onCommit }: Props) {
  const [text, setText] = useState(item.text);
  const ref = useRef<HTMLTextAreaElement>(null);
  const committed = useRef(false);

  useEffect(() => {
    // Al frame successivo, quando il clic che ha aperto l'editor è concluso.
    const frame = requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  function commit() {
    if (committed.current) return;
    committed.current = true;
    onCommit(text);
  }

  const position = worldToScreen(viewport, item);
  const lines = text.split("\n");
  const longest = Math.max(4, ...lines.map((l) => l.length + 1));

  return (
    <textarea
      ref={ref}
      className="text-editor"
      value={text}
      aria-label="Modifica testo"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
          e.preventDefault();
          commit();
        }
      }}
      rows={lines.length}
      style={{
        left: position.x,
        top: position.y,
        width: item.width ? item.width * viewport.scale : `${longest}ch`,
        fontSize: item.fontSize * viewport.scale,
        fontFamily: FONT_FAMILY,
        lineHeight: LINE_HEIGHT,
        color: item.color,
        transform: `rotate(${item.rotation}deg)`,
      }}
    />
  );
}
