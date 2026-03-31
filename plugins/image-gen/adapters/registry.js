const ADAPTERS = {};

export function registerAdapter(providerId, adapter) {
  ADAPTERS[providerId] = adapter;
}

export function getAdapter(providerId) {
  return ADAPTERS[providerId] || null;
}

export function listAdapters() {
  return Object.keys(ADAPTERS);
}
