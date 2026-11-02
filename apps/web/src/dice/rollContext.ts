import type { Roll } from "@scryboard/shared";
import { createContext, useContext } from "react";

/**
 * Tira una formula sul server a nome di chi guarda, nel registro pubblico. null dove non si
 * tira (lo schermo al tavolo).
 */
export const RollContext = createContext<((formula: string) => Promise<Roll>) | null>(null);

export const useRoll = () => useContext(RollContext);
