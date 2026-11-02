/**
 * Nome del file di esportazione: il nome della stanza senza caratteri vietati nei nomi di file,
 * con la data locale, così i salvataggi di sessioni diverse non si sovrascrivono.
 */
export function exportFileName(roomName: string, date: Date): string {
  const safe = roomName.replace(/[\\/:*?"<>|]+/g, "_").trim() || "scryboard";
  const day = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  return `${safe} ${day}.scryboard`;
}
