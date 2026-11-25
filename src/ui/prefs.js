// Interface preferences that belong to this device rather than to the captain's save: where the windows sit and
// how big they are, the ticker's size. A phone and a desktop playing the same captain want different ones.
const KEY = 'velscour.ui';
let cache = null;

export function prefs() {
  if (!cache) { try { cache = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { cache = {}; } }
  return cache;
}
export function savePrefs() { try { localStorage.setItem(KEY, JSON.stringify(prefs())); } catch (e) { /* storage unavailable */ } }
