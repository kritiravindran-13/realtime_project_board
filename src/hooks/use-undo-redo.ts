"use client";

import { useCallback, useReducer } from "react";

type StackState<T> = {
  past: T[];
  present: T;
  future: T[];
};

type Action<T> =
  | { type: "push"; next: T }
  | { type: "replace"; next: T }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; initial: T };

function reducer<T>(state: StackState<T>, action: Action<T>): StackState<T> {
  switch (action.type) {
    case "push":
      return {
        past: [...state.past, state.present],
        present: action.next,
        future: [],
      };
    case "replace":
      return { ...state, present: action.next };
    case "undo":
      if (state.past.length === 0) return state;
      const prev = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        present: prev,
        future: [state.present, ...state.future],
      };
    case "redo":
      if (state.future.length === 0) return state;
      const [next, ...rest] = state.future;
      return {
        past: [...state.past, state.present],
        present: next,
        future: rest,
      };
    case "reset":
      return { past: [], present: action.initial, future: [] };
    default:
      return state;
  }
}

/**
 * Generic undo/redo for any immutable-friendly value.
 * - `push(next)` records current `present` in `past` then sets `present`.
 * - `replace(next)` updates `present` without touching stacks (e.g. sync from server).
 */
export function useUndoRedo<T>(initialPresent: T) {
  const [state, dispatch] = useReducer(reducer<T>, {
    past: [],
    present: initialPresent,
    future: [],
  } satisfies StackState<T>);

  const push = useCallback((next: T) => {
    dispatch({ type: "push", next });
  }, []);

  const replace = useCallback((next: T) => {
    dispatch({ type: "replace", next });
  }, []);

  const undo = useCallback(() => {
    dispatch({ type: "undo" });
  }, []);

  const redo = useCallback(() => {
    dispatch({ type: "redo" });
  }, []);

  const reset = useCallback((initial: T) => {
    dispatch({ type: "reset", initial });
  }, []);

  return {
    present: state.present,
    push,
    replace,
    undo,
    redo,
    reset,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
