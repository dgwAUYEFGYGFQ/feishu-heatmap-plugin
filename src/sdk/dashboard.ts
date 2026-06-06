import { dashboard, DashboardState, SourceType } from '@lark-base-open/js-sdk';
import type { HeatmapConfig } from '../types';

const STORAGE_KEY = 'task-load-heatmap-config';

interface DashboardConfigPayload {
  customConfig?: Record<string, unknown>;
  dataConditions?: Array<{ tableId: string; dataRange?: { type: string }; groups?: unknown[]; series?: unknown }>;
}

function canUseDashboard(): boolean {
  return typeof window !== 'undefined';
}

export function getDashboardState(): DashboardState | 'Local' {
  try {
    return dashboard.state;
  } catch {
    return 'Local';
  }
}

export function isDashboardConfigMode(): boolean {
  const state = getDashboardState();
  return state === DashboardState.Create || state === DashboardState.Config;
}

export async function loadDashboardConfig(): Promise<HeatmapConfig | null> {
  if (canUseDashboard()) {
    try {
      const config = (await dashboard.getConfig()) as DashboardConfigPayload;
      return (config.customConfig as unknown as HeatmapConfig) ?? null;
    } catch {
      // Local browser fallback below.
    }
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as HeatmapConfig) : null;
}

export function onDashboardConfigChange(callback: (config: HeatmapConfig | null) => void): () => void {
  try {
    return dashboard.onConfigChange((event) => {
      const customConfig = event.data.customConfig as unknown as HeatmapConfig | undefined;
      callback(customConfig ?? null);
    });
  } catch {
    return () => undefined;
  }
}

export async function saveDashboardConfig(config: HeatmapConfig): Promise<boolean> {
  const payload = {
    customConfig: config as unknown as Record<string, unknown>,
    dataConditions: [
      {
        tableId: config.tableId,
        dataRange: { type: SourceType.ALL },
        groups: [],
        series: 'COUNTA',
      },
    ],
  };

  try {
    return await dashboard.saveConfig(payload as never);
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    return true;
  }
}

export async function markDashboardRendered(): Promise<boolean> {
  try {
    return await dashboard.setRendered();
  } catch {
    return false;
  }
}

export async function loadDashboardTheme(): Promise<{ background: string; textColor?: string } | null> {
  try {
    const theme = await dashboard.getTheme();
    return {
      background: theme.chartBgColor,
      textColor: theme.labelColorTokenList?.[0],
    };
  } catch {
    return null;
  }
}
