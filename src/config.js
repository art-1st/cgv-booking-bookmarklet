const KEY = 'cgvSniper.config';

export function loadConfig(storage = globalThis.localStorage){
  try {
    return JSON.parse(storage.getItem(KEY)) || {};
  } catch (e) {
    return {};
  }
}

export function saveConfig(cfg, storage = globalThis.localStorage){
  storage.setItem(KEY, JSON.stringify(cfg || {}));
}
