import { createContext, useContext } from "react";

/**
 * Token del GM con cui scaricare le immagini private (quelle degli oggetti nascosti).
 * null per i giocatori.
 */
export const AssetAuthContext = createContext<string | null>(null);

export const useAssetAuth = () => useContext(AssetAuthContext);
