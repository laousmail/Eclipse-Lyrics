/** Single app state store: get / set / subscribe. */

let state = Object.freeze({});
const listeners = new Set();

export function get() {
  return state;
}

/**
 * Shallow-merge patch into state and notify subscribers.
 * @param {object|function} patchOrFn
 */
export function set(patchOrFn) {
  const patch = typeof patchOrFn === "function" ? patchOrFn(state) : patchOrFn;
  if (!patch || typeof patch !== "object") return state;
  state = Object.freeze({ ...state, ...patch });
  for (const fn of listeners) {
    try {
      fn(state, patch);
    } catch (err) {
      console.error(err);
    }
  }
  return state;
}

/**
 * @param {function} fn called with (state, patch)
 * @returns {function} unsubscribe
 */
export function subscribe(fn) {
  if (typeof fn !== "function") return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Replace entire state (boot / tests). */
export function reset(next = {}) {
  state = Object.freeze({ ...next });
  for (const fn of listeners) {
    try {
      fn(state, next);
    } catch (err) {
      console.error(err);
    }
  }
  return state;
}

export function listenerCount() {
  return listeners.size;
}
