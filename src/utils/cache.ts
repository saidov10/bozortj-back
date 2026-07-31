// Tiny in-memory TTL cache. Reference data (categories, brands, colors) changes
// rarely but is fetched on nearly every page, so caching it removes a lot of
// repeat DB round-trips — which matters most on Render's free tier where the DB
// is a network hop away. Single-process only; that's fine for this deployment.

interface Entry {
  value: any;
  expiresAt: number;
}

const store = new Map<string, Entry>();

// Wrap an async loader with a TTL cache under `key`. On a hit within the TTL the
// cached value is returned; otherwise the loader runs and the result is cached.
export const cached = async <T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> => {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value as T;
  }
  const value = await loader();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
};

// Drop cached entries. Call after a write so the next read is fresh.
// Pass a key prefix to invalidate a family of keys (e.g. "categories").
export const invalidateCache = (prefix?: string): void => {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
};

// Common TTLs
export const TTL = {
  short: 60 * 1000, // 1 minute
  medium: 5 * 60 * 1000, // 5 minutes
  long: 30 * 60 * 1000 // 30 minutes
};
