import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { ConfigPanel } from './components/ConfigPanel';
import { DetailDrawer } from './components/DetailDrawer';
import { Heatmap } from './components/Heatmap';
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

const defaultColorStops = [
  { min: 0.01, max: 2, color: '#d9f99d' },
  { min: 2.01, max: 5, color: '#86efac' },
  { min: 5.01, max: 10, color: '#22c55e' },
  { min: 10.01, max: 9999, color: '#15803d' },
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
    statusFilters: [],
    ownerFilters: [],
    groupFilters: [],
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
  summary: { totalRecords: 0, calculatedRecords: 0, exceptionRecords: [] },
  filterOptions: { statuses: [], owners: [], groups: [] },
};

export function App() {
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [fields, setFields] = useState<FieldMeta[]>([]);
  const [records, setRecords] = useState<SourceRecord[]>([]);
  const [draftConfig, setDraftConfig] = useState<HeatmapConfig>(() => createInitialConfig());
  const [appliedConfig, setAppliedConfig] = useState<HeatmapConfig>(() => createInitialConfig());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showConfigPanel, setShowConfigPanel] = useState(() => isDashboardConfigMode());
  const [shellStyle, setShellStyle] = useState<CSSProperties>({});
  const [selectedBucket, setSelectedBucket] = useState<HeatmapBucket | undefined>();
  const [showExceptions, setShowExceptions] = useState(false);

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
      const nextConfig = savedConfig?.tableId ? savedConfig : fallbackConfig;
      setDraftConfig(nextConfig);
      setAppliedConfig(nextConfig);
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
    return onDashboardConfigChange((config) => {
      if (!config?.tableId) return;
      setDraftConfig(config);
      setAppliedConfig(config);
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
      setAppliedConfig((current) => (current.tableId === tableId ? inferConfig(loadedFields, current) : inferred));
      setLoading(false);
    }
    void loadTableData();
    return () => {
      cancelled = true;
    };
  }, [draftConfig.tableId]);

  const result = useMemo(() => {
    if (!appliedConfig.startDateFieldId || !appliedConfig.endDateFieldId || !appliedConfig.valueFieldId) {
      return emptyResult;
    }
    return calculateHeatmap(records, appliedConfig);
  }, [records, appliedConfig]);

  const draftFilterOptions = useMemo(
    () => getFilterOptions(records, draftConfig),
    [records, draftConfig.statusFieldId, draftConfig.ownerFieldId, draftConfig.groupFieldId],
  );

  const changeDraft = (patch: Partial<HeatmapConfig>) => {
    setDraftConfig((current) => {
      if (patch.tableId && patch.tableId !== current.tableId) {
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

  const applyAndSave = async () => {
    setSaving(true);
    setAppliedConfig(draftConfig);
    await saveDashboardConfig(draftConfig);
    setShowConfigPanel(false);
    setSaving(false);
  };

  useEffect(() => {
    if (!loading && !showConfigPanel && appliedConfig.tableId && result.buckets.length) {
      const timer = window.setTimeout(() => {
        void markDashboardRendered();
      }, 800);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [loading, showConfigPanel, appliedConfig.tableId, result.buckets.length]);

  return (
    <div className={`app-shell ${showConfigPanel ? '' : 'config-collapsed'}`} style={shellStyle}>
      <main className="main-panel">
        <header className="app-header">
          <div>
            <h1>任务负荷热力图</h1>
            <p>按任务周期分摊数值，查看每日或每周负荷峰值。</p>
          </div>
          <div className="header-actions">
            <SummaryBar
              summary={result.summary}
              onShowExceptions={() => {
                setShowExceptions(true);
                setSelectedBucket(undefined);
              }}
            />
          </div>
        </header>

        <section className="heatmap-card">
          {loading ? (
            <div className="empty">正在读取多维表格数据...</div>
          ) : result.buckets.length ? (
            <Heatmap
              buckets={result.buckets}
              config={appliedConfig}
              onSelect={(bucket) => {
                setSelectedBucket(bucket);
                setShowExceptions(false);
              }}
            />
          ) : (
            <div className="empty">请选择数据表、开始日期、结束日期和计算字段。</div>
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
