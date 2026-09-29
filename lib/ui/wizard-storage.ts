import "client-only";

const DB_NAME = "power-watch-studio";
const STORE_NAME = "new-video-draft";
const FILE_KEY = "watch-files";

export type StoredWatchFile = { file: File; label: string };

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME))
        request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(database.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function loadWizardFiles() {
  if (typeof indexedDB === "undefined") return [];
  return (await transact<StoredWatchFile[] | undefined>("readonly", (store) => store.get(FILE_KEY))) ?? [];
}

export async function saveWizardFiles(files: StoredWatchFile[]) {
  if (typeof indexedDB === "undefined") return;
  await transact("readwrite", (store) => store.put(files, FILE_KEY));
}

export async function clearWizardFiles() {
  if (typeof indexedDB === "undefined") return;
  await transact("readwrite", (store) => store.delete(FILE_KEY));
}
