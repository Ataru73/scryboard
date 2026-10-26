import type { ReactNode } from "react";

/**
 * Markdown essenziale per le note del GM: titoli (#), elenchi (-, *, 1.), paragrafi, **grassetto**,
 * *corsivo*, `codice` e link http(s). Produce elementi React, mai HTML grezzo: il testo arriva da
 * altri utenti e non deve poter iniettare markup.
 */
export function Markdown({ text }: { text: string }) {
  return <>{blocks(text)}</>;
}

type Block =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "paragraph"; lines: string[] };

export function parseBlocks(text: string): Block[] {
  const result: Block[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const last = result.at(-1);
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (!line.trim()) {
      // Una riga vuota chiude il paragrafo o l'elenco in corso.
      if (last && last.type !== "heading") result.push({ type: "paragraph", lines: [] });
    } else if (heading) {
      result.push({
        type: "heading",
        level: (heading[1] as string).length as 1 | 2 | 3,
        text: heading[2] as string,
      });
    } else if (bullet || numbered) {
      const ordered = !bullet;
      const item = ((bullet ?? numbered) as RegExpExecArray)[1] as string;
      if (last?.type === "list" && last.ordered === ordered) last.items.push(item);
      else result.push({ type: "list", ordered, items: [item] });
    } else if (last?.type === "paragraph") {
      last.lines.push(line.trim());
    } else {
      result.push({ type: "paragraph", lines: [line.trim()] });
    }
  }
  return result.filter((b) => b.type !== "paragraph" || b.lines.length > 0);
}

function blocks(text: string): ReactNode[] {
  return parseBlocks(text).map((block, i) => {
    if (block.type === "heading") {
      // Dentro il pannello i titoli partono da h3, sotto il titolo della nota.
      const Tag = block.level === 1 ? "h3" : block.level === 2 ? "h4" : "h5";
      // biome-ignore lint/suspicious/noArrayIndexKey: i blocchi non hanno id.
      return <Tag key={i}>{inline(block.text)}</Tag>;
    }
    if (block.type === "list") {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        // biome-ignore lint/suspicious/noArrayIndexKey: i blocchi non hanno id.
        <Tag key={i}>
          {block.items.map((item, j) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: le voci non hanno id.
            <li key={j}>{inline(item)}</li>
          ))}
        </Tag>
      );
    }
    return (
      // biome-ignore lint/suspicious/noArrayIndexKey: i blocchi non hanno id.
      <p key={i}>
        {block.lines.flatMap((line, j) =>
          // biome-ignore lint/suspicious/noArrayIndexKey: gli a capo non hanno id.
          j === 0 ? inline(line) : [<br key={j} />, ...inline(line)],
        )}
      </p>
    );
  });
}

const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

/** Formattazione dentro una riga. I link vanno solo a indirizzi http(s). */
export function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    const key = `${i}:${part}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.length > 2 && /^([*_]).*\1$/.test(part)) return <em key={key}>{part.slice(1, -1)}</em>;
    if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
      return <code key={key}>{part.slice(1, -1)}</code>;
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      const href = link[2] as string;
      if (!/^https?:\/\//i.test(href)) return link[1];
      return (
        <a key={key} href={href} target="_blank" rel="noopener noreferrer">
          {link[1]}
        </a>
      );
    }
    return part;
  });
}
