import type { TFunction } from "i18next";

/** Translates a shared-catalog label while retaining its original text as a fallback. */
export function catalogLabel(
  t: TFunction,
  group:
    | "biomes"
    | "gridTypes"
    | "diagonalRules"
    | "lights"
    | "paths"
    | "portraitCategories"
    | "portraits"
    | "stamps"
    | "templates"
    | "tokenSizes",
  id: string,
  fallback: string,
): string {
  // Dots are path separators in i18next, so decimal sizes use an underscore in the catalogs.
  const key = group === "tokenSizes" ? id.replaceAll(".", "_") : id;
  return t(`catalog.${group}.${key}`, { defaultValue: fallback });
}

export function colorLabel(t: TFunction, color: string, fallback: string): string {
  return t(`catalog.colors.${color.replace("#", "")}`, { defaultValue: fallback });
}
