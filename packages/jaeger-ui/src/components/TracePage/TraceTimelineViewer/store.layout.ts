// Copyright (c) 2026 The Jaeger Authors.
// SPDX-License-Identifier: Apache-2.0

import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';
import type { SpanDetailPanelMode } from '../../../types/config';
import getConfig from '../../../utils/config/get-config';
import storage from '../../../utils/storage';
import {
  MIN_TIMELINE_COLUMN_WIDTH,
  SIDE_PANEL_WIDTH_MAX,
  SIDE_PANEL_WIDTH_MIN,
  SPAN_NAME_COLUMN_WIDTH_MAX,
  SPAN_NAME_COLUMN_WIDTH_MIN,
} from './store.constants';

export function getMaxNameColumnWidth(opts: {
  detailPanelMode: string;
  timelineBarsVisible: boolean;
  sidePanelWidth: number;
}): number {
  if (opts.detailPanelMode !== 'sidepanel') {
    return SPAN_NAME_COLUMN_WIDTH_MAX;
  }
  const availableWidth = opts.timelineBarsVisible
    ? 1 - opts.sidePanelWidth - MIN_TIMELINE_COLUMN_WIDTH
    : 1 - SIDE_PANEL_WIDTH_MIN;
  return Math.min(SPAN_NAME_COLUMN_WIDTH_MAX, availableWidth);
}

export const STORAGE_KEY = 'jaeger.layout';
export const STORAGE_VERSION = 1;

export const LEGACY_SPAN_NAME_COLUMN_WIDTH = 'spanNameColumnWidth';
export const LEGACY_SIDE_PANEL_WIDTH = 'sidePanelWidth';
export const LEGACY_DETAIL_PANEL_MODE = 'detailPanelMode';
export const LEGACY_TIMELINE_VISIBLE = 'timelineVisible';

export type LayoutPrefs = {
  spanNameColumnWidth: number;
  sidePanelWidth: number;
  detailPanelMode: SpanDetailPanelMode;
  timelineBarsVisible: boolean;
};

export type ExplicitFields = {
  spanNameColumnWidth?: boolean;
  sidePanelWidth?: boolean;
  detailPanelMode?: boolean;
  timelineBarsVisible?: boolean;
};

export type TraceTimelineLayoutPrefsStore = LayoutPrefs & {
  explicitFields: ExplicitFields;
  setSpanNameColumnWidth: (width: number) => void;
  setSidePanelWidth: (width: number) => void;
  // Updates layout fields only; use \`setDetailPanelMode\` from \`./store\` to also sync detail panel state.
  applyDetailPanelModeToLayout: (mode: SpanDetailPanelMode) => void;
  setTimelineBarsVisible: (visible: boolean) => void;
};

export function readLegacyLayoutPrefs(): { prefs: Partial<LayoutPrefs>; explicit: ExplicitFields } | null {
  const rawSpanNameColumnWidth = storage.getItem(LEGACY_SPAN_NAME_COLUMN_WIDTH);
  const rawSidePanelWidth = storage.getItem(LEGACY_SIDE_PANEL_WIDTH);
  const rawDetailPanelMode = storage.getItem(LEGACY_DETAIL_PANEL_MODE);
  const rawTimelineVisible = storage.getItem(LEGACY_TIMELINE_VISIBLE);

  if (
    rawSpanNameColumnWidth === null &&
    rawSidePanelWidth === null &&
    rawDetailPanelMode === null &&
    rawTimelineVisible === null
  ) {
    return null;
  }

  const prefs: Partial<LayoutPrefs> = {};
  const explicit: ExplicitFields = {};

  const parsedSpanName = parseFloat(rawSpanNameColumnWidth ?? '');
  if (!Number.isNaN(parsedSpanName)) {
    prefs.spanNameColumnWidth = parsedSpanName;
    explicit.spanNameColumnWidth = true;
  }

  const parsedSidePanel = parseFloat(rawSidePanelWidth ?? '');
  if (!Number.isNaN(parsedSidePanel)) {
    prefs.sidePanelWidth = parsedSidePanel;
    explicit.sidePanelWidth = true;
  }

  if (rawDetailPanelMode === 'sidepanel' || rawDetailPanelMode === 'inline') {
    prefs.detailPanelMode = rawDetailPanelMode;
    explicit.detailPanelMode = true;
  }

  if (rawTimelineVisible !== null) {
    prefs.timelineBarsVisible = rawTimelineVisible !== 'false';
    explicit.timelineBarsVisible = true;
  }

  return { prefs, explicit };
}

export function normalizeLayoutPrefs(
  stored: Partial<LayoutPrefs>,
  explicit: ExplicitFields = {}
): LayoutPrefs {
  const { traceTimeline } = getConfig();

  let detailPanelMode: SpanDetailPanelMode = 'inline';
  if (traceTimeline?.enableSidePanel) {
    if (stored.detailPanelMode === 'sidepanel') {
      detailPanelMode = 'sidepanel';
    } else if (traceTimeline.defaultDetailPanelMode === 'sidepanel' && stored.detailPanelMode === undefined) {
      detailPanelMode = 'sidepanel';
    }
  }

  const timelineBarsVisible = stored.timelineBarsVisible ?? true;

  let spanNameColumnWidth =
    stored.spanNameColumnWidth === undefined
      ? 0.25
      : Math.min(
          Math.max(stored.spanNameColumnWidth, SPAN_NAME_COLUMN_WIDTH_MIN),
          SPAN_NAME_COLUMN_WIDTH_MAX
        );

  const sidePanelWidthExplicit = explicit.sidePanelWidth ?? stored.sidePanelWidth !== undefined;
  const rawSidePanelWidth =
    sidePanelWidthExplicit && stored.sidePanelWidth !== undefined
      ? stored.sidePanelWidth
      : (1 - spanNameColumnWidth) / 2;
  let sidePanelWidth = Math.min(Math.max(rawSidePanelWidth, SIDE_PANEL_WIDTH_MIN), SIDE_PANEL_WIDTH_MAX);

  if (sidePanelWidthExplicit && spanNameColumnWidth + sidePanelWidth >= 1) {
    sidePanelWidth = Math.min(
      Math.max((1 - spanNameColumnWidth) / 2, SIDE_PANEL_WIDTH_MIN),
      SIDE_PANEL_WIDTH_MAX
    );
    if (spanNameColumnWidth + sidePanelWidth >= 1) {
      spanNameColumnWidth = 0.25;
      sidePanelWidth = (1 - spanNameColumnWidth) / 2;
    }
  }

  if (
    detailPanelMode === 'sidepanel' &&
    spanNameColumnWidth + sidePanelWidth > 1 - MIN_TIMELINE_COLUMN_WIDTH
  ) {
    sidePanelWidth = Math.min(
      Math.max(1 - MIN_TIMELINE_COLUMN_WIDTH - spanNameColumnWidth, SIDE_PANEL_WIDTH_MIN),
      SIDE_PANEL_WIDTH_MAX
    );
    if (spanNameColumnWidth + sidePanelWidth > 1 - MIN_TIMELINE_COLUMN_WIDTH) {
      spanNameColumnWidth = 0.25;
      sidePanelWidth = (1 - MIN_TIMELINE_COLUMN_WIDTH - spanNameColumnWidth) / 2;
    }
  }

  return { spanNameColumnWidth, sidePanelWidth, detailPanelMode, timelineBarsVisible };
}

export function getInitialLayoutState(): LayoutPrefs & { explicitFields: ExplicitFields } {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as StorageValue<
        Partial<LayoutPrefs> & { explicitFields?: ExplicitFields }
      >;
      const stateObj = parsed.state ?? {};
      const explicit: ExplicitFields = stateObj.explicitFields ?? {
        spanNameColumnWidth: stateObj.spanNameColumnWidth !== undefined,
        sidePanelWidth: stateObj.sidePanelWidth !== undefined,
        detailPanelMode: stateObj.detailPanelMode !== undefined,
        timelineBarsVisible: stateObj.timelineBarsVisible !== undefined,
      };
      return { ...normalizeLayoutPrefs(stateObj, explicit), explicitFields: explicit };
    } catch {
      // Corrupted value: ignore and check legacy keys
    }
  }
  const legacy = readLegacyLayoutPrefs();
  if (legacy) {
    return { ...normalizeLayoutPrefs(legacy.prefs, legacy.explicit), explicitFields: legacy.explicit };
  }
  return { ...normalizeLayoutPrefs({}), explicitFields: {} };
}

export const layoutPrefsStorage: PersistStorage<TraceTimelineLayoutPrefsStore> = {
  getItem: name => {
    const raw = storage.getItem(name);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as StorageValue<
          Partial<LayoutPrefs> & { explicitFields?: ExplicitFields }
        >;
        const stateObj = parsed.state ?? {};
        const explicit: ExplicitFields = stateObj.explicitFields ?? {
          spanNameColumnWidth: stateObj.spanNameColumnWidth !== undefined,
          sidePanelWidth: stateObj.sidePanelWidth !== undefined,
          detailPanelMode: stateObj.detailPanelMode !== undefined,
          timelineBarsVisible: stateObj.timelineBarsVisible !== undefined,
        };
        const normalized = normalizeLayoutPrefs(stateObj, explicit);
        return {
          state: {
            ...normalized,
            explicitFields: explicit,
          } as TraceTimelineLayoutPrefsStore,
          version: parsed.version,
        };
      } catch {
        storage.removeItem(name);
      }
    }
    const legacy = readLegacyLayoutPrefs();
    if (legacy) {
      const normalized = normalizeLayoutPrefs(legacy.prefs, legacy.explicit);
      return {
        state: {
          ...normalized,
          explicitFields: legacy.explicit,
        } as TraceTimelineLayoutPrefsStore,
        version: 0,
      };
    }
    return null;
  },
  setItem: (name, value) => {
    storage.setItem(name, JSON.stringify(value));
  },
  removeItem: name => {
    storage.removeItem(name);
  },
};

export const useLayoutPrefsStore = create<TraceTimelineLayoutPrefsStore>()(
  persist(
    (set, get) => ({
      ...getInitialLayoutState(),

      setSpanNameColumnWidth: (width: number) => {
        const { detailPanelMode, sidePanelWidth, timelineBarsVisible } = get();
        const maxWidth = getMaxNameColumnWidth({ detailPanelMode, sidePanelWidth, timelineBarsVisible });
        const spanNameColumnWidth = Math.min(Math.max(width, SPAN_NAME_COLUMN_WIDTH_MIN), maxWidth);
        set(state => ({
          spanNameColumnWidth,
          explicitFields: { ...state.explicitFields, spanNameColumnWidth: true },
        }));
      },

      setSidePanelWidth: (width: number) => {
        const { timelineBarsVisible, spanNameColumnWidth } = get();
        const availableWidth = timelineBarsVisible
          ? 1 - spanNameColumnWidth - MIN_TIMELINE_COLUMN_WIDTH
          : 1 - spanNameColumnWidth;
        const maxWidth = Math.max(SIDE_PANEL_WIDTH_MIN, Math.min(SIDE_PANEL_WIDTH_MAX, availableWidth));
        const sidePanelWidth = Math.min(Math.max(width, SIDE_PANEL_WIDTH_MIN), maxWidth);
        set(state => ({
          sidePanelWidth,
          explicitFields: { ...state.explicitFields, sidePanelWidth: true },
        }));
      },

      applyDetailPanelModeToLayout: (mode: SpanDetailPanelMode) => {
        let { spanNameColumnWidth, sidePanelWidth, timelineBarsVisible } = get();
        if (mode === 'sidepanel') {
          const maxWidth = getMaxNameColumnWidth({
            detailPanelMode: mode,
            sidePanelWidth,
            timelineBarsVisible,
          });
          spanNameColumnWidth = Math.min(spanNameColumnWidth, maxWidth);
        }
        set(state => ({
          detailPanelMode: mode,
          spanNameColumnWidth,
          explicitFields: { ...state.explicitFields, detailPanelMode: true },
        }));
      },

      setTimelineBarsVisible: (visible: boolean) => {
        set(state => ({
          timelineBarsVisible: visible,
          explicitFields: { ...state.explicitFields, timelineBarsVisible: true },
        }));
      },
    }),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: layoutPrefsStorage,
      partialize: state => {
        const persisted: Partial<LayoutPrefs> & { explicitFields: ExplicitFields } = {
          explicitFields: state.explicitFields,
        };
        if (state.explicitFields?.spanNameColumnWidth) {
          persisted.spanNameColumnWidth = state.spanNameColumnWidth;
        }
        if (state.explicitFields?.sidePanelWidth) {
          persisted.sidePanelWidth = state.sidePanelWidth;
        }
        if (state.explicitFields?.detailPanelMode) {
          persisted.detailPanelMode = state.detailPanelMode;
        }
        if (state.explicitFields?.timelineBarsVisible) {
          persisted.timelineBarsVisible = state.timelineBarsVisible;
        }
        return persisted as unknown as TraceTimelineLayoutPrefsStore;
      },
    }
  )
);
