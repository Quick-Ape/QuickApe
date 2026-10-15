import { useSyncExternalStore } from 'react';
import type { Settings } from '@/lib/settings';
import type { TokenRequest } from '@/lib/types';

export interface Toast {
  id: string;
  kind: 'pending' | 'success' | 'error' | 'info';
  title: string;
  body?: string;
  link?: string;
}

export interface HoverChip {
  req: TokenRequest;
  x: number;
  y: number;
}

/**
 * Shared UI state. Used by the overlay on web pages (content script) and the popup —
 * each context has its own instance.
 */
export interface OverlayState {
  settings: Settings | null;
  /** Bumped whenever a trade completes, so the panel refreshes balances. */
  tick: number;
  /** True on web pages, where connected mode can reach Phantom / MetaMask. */
  canSignOnPage: boolean;
  /** The trading panel that's currently open. */
  panel: TokenRequest | null;
  /** Token from the page URL (e.g. gmgn.ai/sol/token/<CA>) → panel docks automatically. */
  pageToken: TokenRequest | null;
  collapsed: boolean;
  chip: HoverChip | null;
  toasts: Toast[];
}

let state: OverlayState = {
  settings: null,
  tick: 0,
  canSignOnPage: false,
  panel: null,
  pageToken: null,
  collapsed: false,
  chip: null,
  toasts: [],
};

const listeners = new Set<() => void>();

export function getState(): OverlayState {
  return state;
}

export function setState(patch: Partial<OverlayState> | ((s: OverlayState) => Partial<OverlayState>)): void {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useOverlay<T>(select: (s: OverlayState) => T): T {
  return useSyncExternalStore(subscribe, () => select(state));
}

// ---- toasts ----

export function upsertToast(t: Toast, ttlMs?: number): void {
  setState((s) => ({ toasts: [...s.toasts.filter((x) => x.id !== t.id), t].slice(-5) }));
  if (ttlMs) setTimeout(() => dismissToast(t.id), ttlMs);
}

export function dismissToast(id: string): void {
  setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
}

// ---- hover chip ----

let hideTimer: ReturnType<typeof setTimeout> | undefined;

export function showChip(chip: HoverChip): void {
  clearTimeout(hideTimer);
  setState({ chip });
}

export function scheduleHideChip(ms = 450): void {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => setState({ chip: null }), ms);
}

export function keepChip(): void {
  clearTimeout(hideTimer);
}
