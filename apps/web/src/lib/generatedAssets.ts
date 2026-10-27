import { useEffect, useState } from "react";
import { uploadImage } from "../board/upload";

export type GeneratedAssetKind = "token" | "map" | "stamp";

export interface GeneratedAsset {
  id: string; // SHA-256 assetId
  kind: GeneratedAssetKind;
  blob: Blob;
  mimeType: string;
  prompt: string;
  createdAt: string; // ISO date string
  metadata?: {
    size?: number; // per timbri (in caselle)
    style?: string; // stile prompt
    aspectRatio?: string; // per mappe
  };
}

const DB_NAME = "scryboard:generated-assets";
const DB_VERSION = 1;
const STORE_NAME = "assets";

const listeners = new Set<() => void>();

function notifyListeners() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // Ignorato
    }
  }
}

export function subscribeGeneratedAssets(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Fallback in memoria quando IndexedDB non è disponibile (es. test unitari o navigazione privata).
let memoryStore: Map<string, GeneratedAsset> | null = null;

function getMemoryStore(): Map<string, GeneratedAsset> {
  if (!memoryStore) memoryStore = new Map();
  return memoryStore;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      return reject(new Error("IndexedDB non disponibile"));
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("by_kind", "kind", { unique: false });
        store.createIndex("by_createdAt", "createdAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Salva un asset generato nella libreria persistente del browser. */
export async function saveGeneratedAsset(asset: GeneratedAsset): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(asset);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    getMemoryStore().set(asset.id, asset);
  }
  notifyListeners();
}

/** Restituisce gli asset generati salvati, opzionalmente filtrati per tipo, dal più recente al più vecchio. */
export async function listGeneratedAssets(kind?: GeneratedAssetKind): Promise<GeneratedAsset[]> {
  let list: GeneratedAsset[];
  try {
    const db = await openDb();
    list = await new Promise<GeneratedAsset[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as GeneratedAsset[]);
      request.onerror = () => reject(request.error);
    });
  } catch {
    list = Array.from(getMemoryStore().values());
  }

  if (kind) {
    list = list.filter((a) => a.kind === kind);
  }

  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Recupera un asset generato tramite il suo id. */
export async function getGeneratedAsset(id: string): Promise<GeneratedAsset | null> {
  try {
    const db = await openDb();
    return await new Promise<GeneratedAsset | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve((request.result as GeneratedAsset) ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return getMemoryStore().get(id) ?? null;
  }
}

/** Rimuove un asset generato dalla libreria persistente. */
export async function deleteGeneratedAsset(id: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    getMemoryStore().delete(id);
  }
  notifyListeners();
}

/** Assicura che l'asset generato sia caricato nella stanza specificata, riutilizzandolo senza rigenerarlo. */
export async function ensureAssetInRoom(
  roomId: string,
  asset: GeneratedAsset,
  auth: string | null,
): Promise<string> {
  const file = new File([asset.blob], asset.id, { type: asset.mimeType });
  const { assetId } = await uploadImage(roomId, file, auth);
  return assetId;
}

/** Hook React per visualizzare e aggiornare in tempo reale la lista degli asset generati. */
export function useGeneratedAssets(kind?: GeneratedAssetKind): GeneratedAsset[] {
  const [assets, setAssets] = useState<GeneratedAsset[]>([]);

  useEffect(() => {
    const mounted = true;
    const reload = () => {
      void listGeneratedAssets(kind).then((res) => {
        if (mounted) setAssets(res);
      });
    };
    reload();
    return subscribeGeneratedAssets(reload);
  }, [kind]);

  return assets;
}
