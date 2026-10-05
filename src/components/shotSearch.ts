import { useDeferredValue, useMemo } from 'react';
import type { ShotSummary } from '../data/aggregate';

/**
 * Shots matching a search query: every word typed must appear in the shot or sequence name.
 * Shared by the shot list and the timeline, so both show the same shots for the same query.
 */
export function useShotSearch(shots: ShotSummary[], query: string) {
  // Typing stays responsive with thousands of shots; filtering catches up a frame later.
  const deferredQuery = useDeferredValue(query);
  const termsKey = deferredQuery.trim().toLowerCase().split(/[\s,]+/).filter(Boolean).join(' ');

  const filtered = useMemo(() => {
    const terms = termsKey ? termsKey.split(' ') : [];
    if (!terms.length) return shots;
    return shots.filter((shot) => {
      const text = `${shot.ref.name} ${shot.ref.detail ?? ''}`.toLowerCase();
      return terms.every((t) => text.includes(t));
    });
  }, [shots, termsKey]);

  return { filtered, searching: termsKey.length > 0, deferredQuery };
}
