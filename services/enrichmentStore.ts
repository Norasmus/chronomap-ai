// IndexedDB service for storing enriched place data
// This persists enrichments across browser sessions

const DB_NAME = 'chronomap-enrichment';
const DB_VERSION = 1;
const STORE_NAME = 'places';

export interface EnrichedPlace {
  placeId: string;
  name: string;
  address?: string;
  city?: string;
  enrichedAt: number;
}

let dbInstance: IDBDatabase | null = null;

// Initialize the database
export async function initDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Failed to open IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Create the places store with placeId as key
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'placeId' });
        store.createIndex('enrichedAt', 'enrichedAt', { unique: false });
      }
    };
  });
}

// Save a single enriched place
export async function saveEnrichedPlace(place: EnrichedPlace): Promise<void> {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(place);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Save multiple enriched places in a batch
export async function saveEnrichedPlaces(places: EnrichedPlace[]): Promise<void> {
  if (places.length === 0) return;
  
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();

    for (const place of places) {
      store.put(place);
    }
  });
}

// Get a single enriched place by ID
export async function getEnrichedPlace(placeId: string): Promise<EnrichedPlace | null> {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(placeId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
}

// Get all enriched places
export async function getAllEnrichedPlaces(): Promise<EnrichedPlace[]> {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  });
}

// Get enriched places as a Map for quick lookup
export async function getEnrichmentMap(): Promise<Map<string, EnrichedPlace>> {
  const places = await getAllEnrichedPlaces();
  const map = new Map<string, EnrichedPlace>();
  
  for (const place of places) {
    map.set(place.placeId, place);
  }
  
  return map;
}

// Get count of enriched places
export async function getEnrichedCount(): Promise<number> {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.count();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

// Clear all enriched data
export async function clearAllEnrichments(): Promise<void> {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Export all enrichments as JSON (for backup)
export async function exportEnrichments(): Promise<string> {
  const places = await getAllEnrichedPlaces();
  return JSON.stringify({
    version: 1,
    exportedAt: Date.now(),
    places
  }, null, 2);
}

// Import enrichments from JSON backup
export async function importEnrichments(jsonString: string): Promise<number> {
  const data = JSON.parse(jsonString);
  
  if (!data.places || !Array.isArray(data.places)) {
    throw new Error('Invalid enrichment data format');
  }
  
  await saveEnrichedPlaces(data.places);
  return data.places.length;
}
