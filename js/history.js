/** Undo/redo command stack. Commands: { do(), undo(), label }. */

const MAX = 100;

let undoStack = [];
let redoStack = [];
const listeners = new Set();

function notify() {
  const snap = { canUndo: canUndo(), canRedo: canRedo(), label: peekLabel() };
  for (const fn of listeners) {
    try {
      fn(snap);
    } catch (err) {
      console.error(err);
    }
  }
}

export function subscribe(fn) {
  if (typeof fn !== "function") return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function canUndo() {
  return undoStack.length > 0;
}

export function canRedo() {
  return redoStack.length > 0;
}

export function peekLabel() {
  return undoStack.at(-1)?.label || "";
}

/**
 * Run command.do(), push to undo stack, clear redo.
 * @param {{ do: Function, undo: Function, label?: string }} command
 */
export function push(command) {
  if (!command || typeof command.do !== "function" || typeof command.undo !== "function") {
    throw new Error("Command requires do() and undo()");
  }
  command.do();
  undoStack.push(command);
  if (undoStack.length > MAX) undoStack.shift();
  redoStack = [];
  notify();
  return command;
}

export function undo() {
  const cmd = undoStack.pop();
  if (!cmd) return null;
  cmd.undo();
  redoStack.push(cmd);
  notify();
  return cmd;
}

export function redo() {
  const cmd = redoStack.pop();
  if (!cmd) return null;
  cmd.do();
  undoStack.push(cmd);
  notify();
  return cmd;
}

export function clear() {
  undoStack = [];
  redoStack = [];
  notify();
}

/** Test helper */
export function _stacks() {
  return { undo: undoStack.slice(), redo: redoStack.slice() };
}
