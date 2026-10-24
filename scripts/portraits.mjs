// Genera apps/web/src/board/portraits.gen.ts dalle SVG in assets/portraits/.
// Uso: pnpm portraits [--check]   (con --check non scrive: esce con errore se il file è vecchio)
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PORTRAITS } from "../packages/shared/src/portraits.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "assets/portraits");
const target = join(root, "apps/web/src/board/portraits.gen.ts");

/** Arrotonda a un decimale i numeri frazionari, senza cambiare il modo in cui sono separati. */
function simplify(d) {
  const out = d.replace(/-?\d*\.\d+/g, (num, offset) => {
    const n = Number.parseFloat(Number.parseFloat(num).toFixed(1));
    let s = String(n === 0 ? 0 : n).replace(/^(-?)0\./, "$1.");
    if (!s.includes(".") && d[offset + num.length] === ".") s += " ";
    if (/\d/.test(d[offset - 1] ?? "") && !/^[-.]/.test(s)) s = ` ${s}`;
    return s;
  });
  const count = (s) => (s.match(/-?\d*\.?\d+/g) ?? []).length;
  if (count(out) !== count(d)) throw new Error("l'arrotondamento ha alterato il tracciato");
  return out;
}

/** Tracciato della sagoma: tutti i `path` dell'SVG tranne il fondo nero a tutta pagina. */
function glyph(id) {
  const svg = readFileSync(join(dir, `${id}.svg`), "utf8");
  if (!svg.includes('viewBox="0 0 512 512"')) throw new Error(`${id}: viewBox diverso da 512×512`);
  const paths = [...svg.matchAll(/<path\b[^>]*?\sd="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((d) => d !== "M0 0h512v512H0z");
  if (paths.length === 0) throw new Error(`${id}: nessun tracciato`);
  return simplify(paths.join(""));
}

const ids = new Set(PORTRAITS.map((p) => p.id));
for (const file of readdirSync(dir)) {
  if (file.endsWith(".svg") && !ids.has(file.slice(0, -4))) {
    throw new Error(`${file}: non è nel catalogo (packages/shared/src/portraits.ts)`);
  }
}
for (const id of ids) {
  if (!existsSync(join(dir, `${id}.svg`)))
    throw new Error(`${id}: manca assets/portraits/${id}.svg`);
}

const body = PORTRAITS.map(
  (p) => `  ${JSON.stringify(p.id)}: ${JSON.stringify(glyph(p.id))},`,
).join("\n");
const content = `// Generato da scripts/portraits.mjs (pnpm portraits): non modificare a mano.
// Sagome di game-icons.net (CC BY 3.0), viewBox 512×512; vedi assets/portraits/LICENSE.md.
export const PORTRAIT_PATHS: Record<string, string> = {
${body}
};
`;

if (process.argv.includes("--check")) {
  const current = existsSync(target) ? readFileSync(target, "utf8") : "";
  if (current !== content) {
    console.error("portraits.gen.ts non è aggiornato: esegui `pnpm portraits`.");
    process.exit(1);
  }
} else {
  writeFileSync(target, content);
  console.log(`${PORTRAITS.length} sagome scritte in ${target}`);
}
