import { useCallback, useEffect, useRef, useState } from 'react';
import * as ftrackWidget from '@ftrack/web-widget';
import { fetchProgress, type QuerySession } from './data/fetchProgress';
import type { ProgressData } from './data/types';

export type EntityRef = { id: string; type: string };

/** The entity ftrack points the widget at, following dashboard/sidebar changes. */
export function useFtrackEntity(initial?: EntityRef | null): EntityRef | null {
  const [entity, setEntity] = useState<EntityRef | null>(() => initial ?? safeGetEntity());

  useEffect(() => {
    if (initial !== undefined) return; // the dev harness drives it
    const onUpdate = (e: Event) => {
      const next = (e as CustomEvent).detail?.entity ?? safeGetEntity();
      if (next?.id) {
        setEntity((prev) => (prev?.id === next.id && prev?.type === next.type ? prev : { id: next.id, type: next.type }));
      }
    };
    window.addEventListener('ftrackWidgetLoad', onUpdate);
    window.addEventListener('ftrackWidgetUpdate', onUpdate);
    return () => {
      window.removeEventListener('ftrackWidgetLoad', onUpdate);
      window.removeEventListener('ftrackWidgetUpdate', onUpdate);
    };
  }, [initial]);

  return entity;
}

function safeGetEntity(): EntityRef | null {
  try {
    const e = ftrackWidget.getEntity();
    return e?.id ? { id: e.id, type: e.type } : null;
  } catch {
    return null;
  }
}

export type LoadState =
  | { status: 'idle' }
  | { status: 'loading'; data?: ProgressData }
  | { status: 'ready'; data: ProgressData; loadedAt: Date }
  | { status: 'error'; error: Error; data?: ProgressData };

/**
 * Loads progress data for `entity`. Keeps showing the previous result while a refresh
 * runs, and drops answers that arrive after the selection has moved on.
 */
export function useProgressData(session: QuerySession, entity: EntityRef | null) {
  const [state, setState] = useState<LoadState>({ status: 'idle' });
  const requestId = useRef(0);

  const load = useCallback(() => {
    if (!entity) {
      setState({ status: 'idle' });
      return;
    }
    const id = ++requestId.current;
    setState((prev) => ({
      status: 'loading',
      // Only keep stale data on screen if it is for the same entity.
      data: 'data' in prev && prev.data?.scope.id === entity.id ? prev.data : undefined,
    }));
    fetchProgress(session, entity).then(
      (data) => { if (id === requestId.current) setState({ status: 'ready', data, loadedAt: new Date() }); },
      (error: unknown) => {
        if (id !== requestId.current) return;
        console.error('Failed to load progress', error);
        setState((prev) => ({
          status: 'error',
          error: error instanceof Error ? error : new Error(String(error)),
          data: 'data' in prev ? prev.data : undefined,
        }));
      },
    );
  }, [session, entity]);

  useEffect(load, [load]);

  return { state, reload: load };
}

/**
 * useState that survives reloads. Storage is best-effort: in a third-party iframe with
 * site data blocked, localStorage throws, and the widget just forgets its settings.
 */
export function usePersistentState<T>(key: string, fallback: T, isValid: (v: unknown) => v is T) {
  const storageKey = `ftrack-shot-tracker:${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw !== null) {
        const parsed: unknown = JSON.parse(raw);
        if (isValid(parsed)) return parsed;
      }
    } catch { /* storage unavailable */ }
    return fallback;
  });
  useEffect(() => {
    try { window.localStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* storage unavailable */ }
  }, [storageKey, value]);
  return [value, setValue] as const;
}

export const oneOf = <T extends string>(...values: T[]) => (v: unknown): v is T => values.includes(v as T);
export const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
