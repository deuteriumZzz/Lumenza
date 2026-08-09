// Node 25 exposes storage globals that stay undefined unless the process is
// started with a storage file. Install an isolated Web Storage implementation
// for each jsdom worker instead of inheriting those Node placeholders.
const storageEntries = new WeakMap<Storage, Map<string, string>>();

function entriesFor(storage: Storage): Map<string, string> {
  const entries = storageEntries.get(storage);
  if (!entries) throw new TypeError("Illegal invocation");
  return entries;
}

Object.defineProperties(Storage.prototype, {
  length: {
    configurable: true,
    get(this: Storage) {
      return entriesFor(this).size;
    },
  },
  clear: {
    configurable: true,
    writable: true,
    value(this: Storage) {
      entriesFor(this).clear();
    },
  },
  getItem: {
    configurable: true,
    writable: true,
    value(this: Storage, key: string) {
      return entriesFor(this).get(String(key)) ?? null;
    },
  },
  key: {
    configurable: true,
    writable: true,
    value(this: Storage, index: number) {
      return Array.from(entriesFor(this).keys())[index] ?? null;
    },
  },
  removeItem: {
    configurable: true,
    writable: true,
    value(this: Storage, key: string) {
      entriesFor(this).delete(String(key));
    },
  },
  setItem: {
    configurable: true,
    writable: true,
    value(this: Storage, key: string, value: string) {
      entriesFor(this).set(String(key), String(value));
    },
  },
});

function createMemoryStorage(): Storage {
  const storage = Object.create(Storage.prototype) as Storage;
  storageEntries.set(storage, new Map());
  return storage;
}

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: createMemoryStorage(),
});

Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  value: createMemoryStorage(),
});
