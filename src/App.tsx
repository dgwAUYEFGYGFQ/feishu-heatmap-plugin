import dayjs from 'dayjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ConfigPanel } from './components/ConfigPanel';
import { DetailDrawer } from './components/DetailDrawer';
import { Heatmap } from './components/Heatmap';
import { QuickFilterBar } from './components/QuickFilterBar';
import { SummaryBar } from './components/SummaryBar';
import { loadFields, loadRecords, loadTables } from './sdk/bitable';
import {
  isDashboardConfigMode,
  loadDashboardConfig,
  loadDashboardTheme,
  markDashboardRendered,
  onDashboardConfigChange,
  saveDashboardConfig,
} from './sdk/dashboard';
import type { CalculationResult, FieldMeta, HeatmapBucket, HeatmapConfig, SourceRecord, TableMeta } from './types';
import { calculateHeatmap, getFilterOptions } from './utils/heatmap';
import type { QuickFilters } from './utils/quickFilters';
import { filterRecordsByQuickFilters } from './utils/quickFilters';

const defaultColorStops = [
  { min: 0.01, max: 1, color: '#E6F7F1' },
  { min: 1.01, max: 2, color: '#BFEBDD' },
  { min: 2.01, max: 5, color: '#7DD3B0' },
  { min: 5.01, max: 10, color: '#35B27C' },
  { min: 10.01, max: 9999, color: '#127A52' },
];

function createInitialConfig(tableId = ''): HeatmapConfig {
  const startMonth = dayjs().format('YYYY-MM');
  return {
    tableId,
    startDateFieldId: '',
    endDateFieldId: '',
    valueFieldId: '',
    titleFieldId: undefined,
    statusFieldId: undefined,
    ownerFieldId: undefined,
    groupFieldId: undefined,
    statisticMode: 'calendar',
    granularity: 'day',
    rangeMode: 'month',
    startMonth,
    monthCount: 3,
    customStartDate: dayjs().startOf('month').format('YYYY-MM-DD'),
    customEndDate: dayjs().add(3, 'month').endOf('month').format('YYYY-MM-DD'),
    colorStops: defaultColorStops,
    showLegend: true,
    showCellValue: false,
    showQuickFilters: false,
    statusFilters: [],
    ownerFilters: [],
    groupFilters: [],
  };
}

function normalizeConfig(config: HeatmapConfig): HeatmapConfig {
  return {
    ...config,
    colorStops: config.colorStops?.length >= 5 ? config.colorStops : defaultColorStops,
    showCellValue: config.showCellValue ?? false,
    showQuickFilters: config.showQuickFilters ?? false,
    statusFilters: config.statusFilters ?? [],
    ownerFilters: config.ownerFilters ?? [],
    groupFilters: config.groupFilters ?? [],
  };
}

function inferConfig(fields: FieldMeta[], current: HeatmapConfig): HeatmapConfig {
  const dateFields = fields.filter((field) => field.kind === 'date');
  const numberField = fields.find((field) => field.kind === 'number');
  const findByName = (pattern: RegExp) => fields.find((field) => pattern.test(field.name))?.id;
  const keepIfExists = (fieldId?: string) => (fieldId && fields.some((field) => field.id === fieldId) ? fieldId : undefined);
  return {
    ...current,
    startDateFieldId: keepIfExists(current.startDateFieldId) || findByName(/开始|start/i) || dateFields[0]?.id || '',
    endDateFieldId: keepIfExists(current.endDateFieldId) || findByName(/结束|截止|end/i) || dateFields[1]?.id || dateFields[0]?.id || '',
    valueFieldId: keepIfExists(current.valueFieldId) || findByName(/人天|工时|负荷|数值|value/i) || numberField?.id || '',
    titleFieldId: keepIfExists(current.titleFieldId) || findByName(/标题|任务|名称|title/i),
    statusFieldId: keepIfExists(current.statusFieldId) || findByName(/状态|status/i),
    ownerFieldId: keepIfExists(current.ownerFieldId) || findByName(/负责人|owner|user/i),
    groupFieldId: keepIfExists(current.groupFieldId) || findByName(/分组|项目|group/i),
  };
}

function resetFieldsForTable(config: HeatmapConfig, tableId: string): HeatmapConfig {
  return {
    ...config,
    tableId,
    startDateFieldId: '',
    endDateFieldId: '',
    valueFieldId: '',
    titleFieldId: undefined,
    statusFieldId: undefined,
    ownerFieldId: undefined,
    groupFieldId: undefined,
    statusFilters: [],
    ownerFilters: [],
    groupFilters: [],
  };
}

const emptyResult: CalculationResult = {
  buckets: [],
  summary: { totalRecords: 0, totalLoad: 0, calculatedRecords: 0, exceptionRecords: [] },
  filterOptions: { statuses: [], owners: [], groups: [] },
};

export function App() {
  const shellRef = useRef<HTMLDivElement>(null);
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [fields, setFields] = useState<FieldMeta[]>([]);
  const [records, setRecords] = useState<SourceRecord[]>([]);
  const [draftConfig, setDraftConfig] = useState<HeatmapConfig>(() => createInitialConfig());
  const [savedConfig, setSavedConfig] = useState<HeatmapConfig>(() => createInitialConfig());
  const [quickFilters, setQuickFilters] = useState<QuickFilters>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showConfigPanel, setShowConfigPanel] = useState(() => isDashboardConfigMode());
  const [shellStyle, setShellStyle] = useState<CSSProperties>({});
  const [shellSize, setShellSize] = useState({ width: 0, height: 0 });
  const [selectedBucket, setSelectedBucket] = useState<HeatmapBucket | undefined>();
  const [showExceptions, setShowExceptions] = useState(false);
  const [tooltipResetSignal, setTooltipResetSignal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      setLoading(true);
      const [loadedTables, savedConfig, theme] = await Promise.all([
        loadTables(),
        loadDashboardConfig(),
        loadDashboardTheme(),
      ]);
      if (cancelled) return;
      setTables(loadedTables);
      const fallbackConfig = createInitialConfig(loadedTables[0]?.id ?? '');
      const nextConfig = normalizeConfig(savedConfig?.tableId ? savedConfig : fallbackConfig);
      setDraftConfig(nextConfig);
      setSavedConfig(nextConfig);
      setShowConfigPanel(isDashboardConfigMode() || !savedConfig);
      if (theme) {
        setShellStyle({
          backgroundColor: theme.background,
          color: theme.textColor,
        });
      }
      setLoading(false);
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const element = shellRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setShellSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return onDashboardConfigChange((config) => {
      if (!config?.tableId) return;
      const nextConfig = normalizeConfig(config);
      setDraftConfig(nextConfig);
      setSavedConfig(nextConfig);
      setShowConfigPanel(isDashboardConfigMode());
    });
  }, []);

  useEffect(() => {
    if (!draftConfig.tableId) return;
    let cancelled = false;
    const tableId = draftConfig.tableId;
    async function loadTableData() {
      setLoading(true);
      setFields([]);
      setRecords([]);
      const loadedFields = await loadFields(tableId);
      if (cancelled) return;
      const inferred = inferConfig(loadedFields, draftConfig);
      const loadedRecords = await loadRecords(tableId, loadedFields);
      if (cancelled) return;
      setFields(loadedFields);
      setRecords(loadedRecords);
      setDraftConfig(inferred);
      setLoading(false);
    }
    void loadTableData();
    return () => {
      cancelled = true;
    };
  }, [draftConfig.tableId]);

  const changeDraft = (patch: Partial<HeatmapConfig>) => {
    setTooltipResetSignal((value) => value + 1);
    setSelectedBucket(undefined);
    setShowExceptions(false);
    setDraftConfig((current) => {
      if (patch.tableId && patch.tableId !== current.tableId) {
        setQuickFilters({});
        return resetFieldsForTable(current, patch.tableId);
      }
      const statusFieldChanged = Object.prototype.hasOwnProperty.call(patch, 'statusFieldId');
      const ownerFieldChanged = Object.prototype.hasOwnProperty.call(patch, 'ownerFieldId');
      const groupFieldChanged = Object.prototype.hasOwnProperty.call(patch, 'groupFieldId');
      return {
        ...current,
        ...patch,
        statusFilters: statusFieldChanged ? [] : patch.statusFilters ?? current.statusFilters,
        ownerFilters: ownerFieldChanged ? [] : patch.ownerFilters ?? current.ownerFilters,
        groupFilters: groupFieldChanged ? [] : patch.groupFilters ?? current.groupFilters,
      };
    });
  };

  useEffect(() => {
    const activeFieldIds = new Set(
      [draftConfig.statusFieldId, draftConfig.ownerFieldId, draftConfig.groupFieldId].filter(Boolean) as string[],
    );
    setQuickFilters((current) =>
      Object.fromEntries(Object.entries(current).filter(([fieldId]) => activeFieldIds.has(fieldId))),
    );
  }, [draftConfig.statusFieldId, draftConfig.ownerFieldId, draftConfig.groupFieldId]);

  const quickFilteredRecords = useMemo(
    () => filterRecordsByQuickFilters(records, quickFilters),
    [records, quickFilters],
  );

  const previewRecords = draftConfig.showQuickFilters ? quickFilteredRecords : records;

  const result = useMemo(() => {
    if (!draftConfig.tableId || !draftConfig.startDateFieldId || !draftConfig.endDateFieldId || !draftConfig.valueFieldId) {
      return emptyResult;
    }
    return calculateHeatmap(previewRecords, draftConfig);
  }, [previewRecords, draftConfig]);

  const draftFilterOptions = useMemo(
    () => getFilterOptions(records, draftConfig),
    [records, draftConfig.statusFieldId, draftConfig.ownerFieldId, draftConfig.groupFieldId],
  );

  const applyAndSave = async () => {
    setSaving(true);
    await saveDashboardConfig(draftConfig);
    setSavedConfig(draftConfig);
    setShowConfigPanel(false);
    setSaving(false);
  };

  useEffect(() => {
    if (!loading && !showConfigPanel && savedConfig.tableId && result.buckets.length) {
      const timer = window.setTimeout(() => {
        void markDashboardRendered();
      }, 800);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [loading, showConfigPanel, savedConfig.tableId, result.buckets.length]);

  const densityClass = !showConfigPanel && shellSize.height < 270 ? 'micro' : !showConfigPanel && shellSize.height < 390 ? 'compact' : '';

  return (
    <div
      className={`plugin-root app-shell ${showConfigPanel ? '' : 'config-collapsed'} ${densityClass}`}
      style={shellStyle}
      ref={shellRef}
    >
      <main className="plugin-card main-panel">
        <header className="plugin-header app-header">
          <div>
            <h1>任务负荷热力图</h1>
            <p>按任务周期分摊数值，查看每日或每周负荷峰值。</p>
          </div>
          <div className="header-actions">
            <SummaryBar
              summary={result.summary}
              onShowExceptions={() => {
                setTooltipResetSignal((value) => value + 1);
                setShowExceptions(true);
                setSelectedBucket(undefined);
              }}
            />
          </div>
        </header>

        <QuickFilterBar
          fields={fields}
          records={records}
          config={draftConfig}
          quickFilters={quickFilters}
          onChange={(fieldId, values) => {
            setTooltipResetSignal((value) => value + 1);
            setSelectedBucket(undefined);
            setShowExceptions(false);
            setQuickFilters((current) => ({ ...current, [fieldId]: values }));
          }}
          onClear={() => {
            setTooltipResetSignal((value) => value + 1);
            setSelectedBucket(undefined);
            setShowExceptions(false);
            setQuickFilters({});
          }}
        />

        <section className="plugin-body heatmap-card">
          {loading ? (
            <div className="empty">正在读取多维表格数据...</div>
          ) : result.buckets.length ? (
            <Heatmap
              buckets={result.buckets}
              config={draftConfig}
              resetSignal={tooltipResetSignal}
              detailOpen={Boolean(selectedBucket || showExceptions)}
              onSelect={(bucket) => {
                setTooltipResetSignal((value) => value + 1);
                setSelectedBucket(bucket);
                setShowExceptions(false);
              }}
            />
          ) : (
            <div className="empty">请选择数据表、开始日期字段、结束日期字段和计算字段后生成热力图</div>
          )}
        </section>
      </main>

      {showConfigPanel && (
        <ConfigPanel
          tables={tables}
          fields={fields}
          draftConfig={draftConfig}
          filterOptions={draftFilterOptions}
          saving={saving}
          onChange={changeDraft}
          onApply={applyAndSave}
        />
      )}

      {selectedBucket && <DetailDrawer bucket={selectedBucket} onClose={() => setSelectedBucket(undefined)} />}
      {showExceptions && (
        <DetailDrawer exceptions={result.summary.exceptionRecords} onClose={() => setShowExceptions(false)} />
      )}
    </div>
  );
}
