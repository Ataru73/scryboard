import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown, parseBlocks } from "./markdown";

const html = (text: string) => renderToStaticMarkup(createElement(Markdown, { text }));

describe("Markdown", () => {
  it("splits headings, lists and paragraphs", () => {
    expect(parseBlocks("# Cripta\nUna stanza\numida.\n\n- ossa\n- monete\n1. primo")).toEqual([
      { type: "heading", level: 1, text: "Cripta" },
      { type: "paragraph", lines: ["Una stanza", "umida."] },
      { type: "list", ordered: false, items: ["ossa", "monete"] },
      { type: "list", ordered: true, items: ["primo"] },
    ]);
  });

  it("renders inline formatting", () => {
    expect(html("**Trappola**: CD *15* su `Destrezza`")).toBe(
      "<p><strong>Trappola</strong>: CD <em>15</em> su <code>Destrezza</code></p>",
    );
    expect(html("## Tesoro\n- 30 _mo_")).toBe("<h4>Tesoro</h4><ul><li>30 <em>mo</em></li></ul>");
  });

  it("never renders raw HTML or unsafe links", () => {
    expect(html("<img src=x onerror=alert(1)>")).toBe("<p>&lt;img src=x onerror=alert(1)&gt;</p>");
    expect(html("[clic](javascript:alert(1))")).not.toContain("<a");
    expect(html("[mappa](https://example.com/a)")).toBe(
      '<p><a href="https://example.com/a" target="_blank" rel="noopener noreferrer">mappa</a></p>',
    );
  });
});
