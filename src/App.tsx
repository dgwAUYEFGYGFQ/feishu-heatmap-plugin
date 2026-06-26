import dayjs from 'dayjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ConfigPanel } from './components/ConfigPanel';
import { DetailDrawer } from './components/DetailDrawer';
import { Heatmap } from './components/Heatmap';
import { MatrixHeatmap } from './components/MatrixHeatmap';
import { QuickFilterBar } from './components/QuickFilterBar';
import { SummaryBar } from './components/SummaryBar';
import { loadFields, loadRecords, loadRecordsWithOptions, loadTables } from './sdk/bitable';
import {
  isDashboardConfigMode,
  loadDashboardConfig,
  loadDashboardTheme,
  markDashboardRendered,
  onDashboardConfigChange,
  saveDashboardConfig,
} from './sdk/dashboard';
import type { CalculationResult, FieldMeta, HeatmapBucket, HeatmapConfig, MatrixCell, MatrixDetailFieldConfig, MatrixHeatmapData, SourceRecord, TableMeta } from './types';
import { calculateHeatmap, getFilterOptions } from './utils/heatmap';
import {
  buildMatrixHeatmapDataFromNormalized,
  filterNormalizedMatrixRecords,
  getMatrixFilterOptionsFromNormalized,
  normalizeMatrixRecords,
} from './utils/matrixHeatmap';
import type { QuickFilters } from './utils/quickFilters';
import { filterRecordsByQuickFilters } from './utils/quickFilters';
import { getFieldDisplayValues } from './utils/value';

const defaultColorStops = [
  { min: 0.01, max: 1, color: '#E6F7F1' },
  { min: 1.01, max: 2, color: '#BFEBDD' },
  { min: 2.01, max: 5, color: '#7DD3B0' },
  { min: 5.01, max: 10, color: '#35B27C' },
  { min: 10.01, max: 9999, color: '#127A52' },
];

const DEBUG = false;

function createInitialConfig(tableId = ''): HeatmapConfig {
  const startMonth = dayjs().format('YYYY-MM');
  return {
    heatmapType: 'time',
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
    timeFilterFieldIds: [],
    matrixRowGroupFieldId: undefined,
    matrixRowNameFieldId: undefined,
    matrixColumnFieldId: undefined,
    matrixDelayedStatusValues: [],
    matrixStartDateFieldId: undefined,
    matrixEndDateFieldId: undefined,
    matrixDetailFields: [],
    matrixShowEmptyCells: true,
    matrixShowCellCount: true,
    statusFilters: [],
    ownerFilters: [],
    groupFilters: [],
  };
}

function normalizeConfig(config: HeatmapConfig): HeatmapConfig {
  return {
    ...config,
    heatmapType: config.heatmapType ?? 'time',
    colorStops: config.colorStops?.length >= 5 ? config.colorStops : defaultColorStops,
    showCellValue: config.showCellValue ?? false,
    showQuickFilters: config.showQuickFilters ?? false,
    timeFilterFieldIds: config.timeFilterFieldIds ?? [],
    matrixDelayedStatusValues: config.matrixDelayedStatusValues ?? [],
    matrixDetailFields: config.matrixDetailFields ?? [],
    matrixShowEmptyCells: config.matrixShowEmptyCells ?? true,
    matrixShowCellCount: config.matrixShowCellCount ?? true,
    statusFilters: config.statusFilters ?? [],
    ownerFilters: config.ownerFilters ?? [],
    groupFilters: config.groupFilters ?? [],
  };
}

function uniqueDetailFields(items: Array<MatrixDetailFieldConfig | undefined>): MatrixDetailFieldConfig[] {
  const seen = new Set<string>();
  const result: MatrixDetailFieldConfig[] = [];
  for (const item of items) {
    if (!item?.fieldId || seen.has(item.fieldId)) continue;
    seen.add(item.fieldId);
    result.push(item);
  }
  return result;
}

function isPotentialNumericField(field: FieldMeta): boolean {
  if (field.kind === 'number') return true;
  if (field.kind === 'formula' || field.kind === 'other') {
    return /人天|工时|负荷|数值|金额|数量|总计|合计|预估|估算|value|number|count|sum/i.test(field.name);
  }
  return /人天|工时|负荷|数值|金额|数量|总计|合计|预估|估算|value|number|count|sum/i.test(field.name);
}

function isPotentialDateField(field: FieldMeta): boolean {
  if (field.kind === 'date') return true;
  const rawMetaText = JSON.stringify({
    type: field.type,
    property: field.property,
    rawMeta: field.rawMeta,
  }).toLowerCase();
  const hasDateFormatMeta = /date|datetime|timestamp|yyyy|month|day/.test(rawMetaText);
  const hasDateName = /日期|时间|开始|结束|截止|月底|月末|计划|start|end|date|time/i.test(field.name);
  return (field.kind === 'formula' || field.kind === 'other') && (hasDateFormatMeta || hasDateName);
}

function inferConfig(fields: FieldMeta[], current: HeatmapConfig): HeatmapConfig {
  const dateFields = fields.filter(isPotentialDateField);
  const numericFields = fields.filter(isPotentialNumericField);
  const preferredNumberField =
    numericFields.find((field) => /总.*人天|人天.*预估|预估.*人天|总人天/i.test(field.name)) ??
    numericFields.find((field) => /人天|工时|负荷|数值|value/i.test(field.name));
  const findByName = (pattern: RegExp) => fields.find((field) => pattern.test(field.name))?.id;
  const keepIfExists = (fieldId?: string) => (fieldId && fields.some((field) => field.id === fieldId) ? fieldId : undefined);
  const startDateFieldId = keepIfExists(current.startDateFieldId) || findByName(/开始|start/i) || dateFields[0]?.id || '';
  const endDateFieldId = keepIfExists(current.endDateFieldId) || findByName(/结束|截止|end/i) || dateFields[1]?.id || dateFields[0]?.id || '';
  const titleFieldId = keepIfExists(current.titleFieldId) || findByName(/改造任务|标题|任务|名称|title/i);
  const statusFieldId = keepIfExists(current.statusFieldId) || findByName(/进度|状态|status/i);
  const ownerFieldId = keepIfExists(current.ownerFieldId) || findByName(/ITPB|ITBP|负责人|owner|user/i);
  const matrixStartDateFieldId = keepIfExists(current.matrixStartDateFieldId) || findByName(/计划开始|开始|start/i);
  const matrixEndDateFieldId = keepIfExists(current.matrixEndDateFieldId) || findByName(/计划结束|结束|截止|end/i);
  const existingMatrixDetailFields = uniqueDetailFields(
    (current.matrixDetailFields ?? [])
      .filter((item) => keepIfExists(item.fieldId))
      .map((item) => ({ ...item, fieldId: item.fieldId })),
  );
  const defaultMatrixDetailFields = uniqueDetailFields([
    titleFieldId ? { fieldId: titleFieldId, showInDetail: true, enableFilter: false } : undefined,
    statusFieldId ? { fieldId: statusFieldId, showInDetail: true, enableFilter: true } : undefined,
    ownerFieldId ? { fieldId: ownerFieldId, showInDetail: true, enableFilter: true } : undefined,
    matrixStartDateFieldId ? { fieldId: matrixStartDateFieldId, showInDetail: true, enableFilter: false } : undefined,
    matrixEndDateFieldId ? { fieldId: matrixEndDateFieldId, showInDetail: true, enableFilter: false } : undefined,
  ]);
  const existingTimeFilterFieldIds = (current.timeFilterFieldIds ?? []).filter((fieldId) => keepIfExists(fieldId));
  const defaultTimeFilterFieldIds = [statusFieldId, ownerFieldId, keepIfExists(current.groupFieldId) || findByName(/分组|阶段|项目|group/i)]
    .filter(Boolean) as string[];
  return {
    ...current,
    startDateFieldId,
    endDateFieldId,
    valueFieldId: keepIfExists(current.valueFieldId) || preferredNumberField?.id || findByName(/人天|工时|负荷|数值|value/i) || '',
    titleFieldId,
    statusFieldId,
    ownerFieldId,
    groupFieldId: keepIfExists(current.groupFieldId) || findByName(/分组|项目|group/i),
    timeFilterFieldIds: existingTimeFilterFieldIds.length ? existingTimeFilterFieldIds : Array.from(new Set(defaultTimeFilterFieldIds)),
    matrixRowGroupFieldId: keepIfExists(current.matrixRowGroupFieldId),
    matrixRowNameFieldId: keepIfExists(current.matrixRowNameFieldId) || findByName(/议题|专题|名称|title/i),
    matrixColumnFieldId: keepIfExists(current.matrixColumnFieldId) || findByName(/系统|列|system/i),
    matrixStartDateFieldId,
    matrixEndDateFieldId,
    matrixDetailFields: existingMatrixDetailFields.length ? existingMatrixDetailFields : defaultMatrixDetailFields,
  };
}

function resetFieldsForTable(config: HeatmapConfig, tableId: string): HeatmapConfig {
  if (config.heatmapType === 'time') {
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
      timeFilterFieldIds: [],
      statusFilters: [],
      ownerFilters: [],
      groupFilters: [],
    };
  }

  return {
    ...config,
    tableId,
    matrixRowGroupFieldId: undefined,
    matrixRowNameFieldId: undefined,
    matrixColumnFieldId: undefined,
    matrixDelayedStatusValues: [],
    matrixStartDateFieldId: undefined,
    matrixEndDateFieldId: undefined,
    matrixDetailFields: [],
    statusFilters: [],
    ownerFilters: [],
    groupFilters: [],
  };
}

function hasField(fields: FieldMeta[], fieldId?: string): boolean {
  return Boolean(fieldId && fields.some((field) => field.id === fieldId));
}

function hasRequiredTimeFields(fields: FieldMeta[], config: HeatmapConfig): boolean {
  return hasField(fields, config.startDateFieldId) && hasField(fields, config.endDateFieldId) && hasField(fields, config.valueFieldId);
}

function sanitizeConfigForFields(fields: FieldMeta[], config: HeatmapConfig): HeatmapConfig {
  if (!fields.length) return config;
  const inferred = inferConfig(fields, config);
  if (isSameConfig(config, inferred)) return config;
  if (config.heatmapType === 'time') {
    console.log('[任务负荷热力图][DEBUG] 字段配置已按当前数据表校正', {
      tableId: config.tableId,
      before: {
        startDateFieldId: config.startDateFieldId,
        endDateFieldId: config.endDateFieldId,
        valueFieldId: config.valueFieldId,
        titleFieldId: config.titleFieldId,
        statusFieldId: config.statusFieldId,
        ownerFieldId: config.ownerFieldId,
        groupFieldId: config.groupFieldId,
        timeFilterFieldIds: config.timeFilterFieldIds,
      },
      after: {
        startDateFieldId: inferred.startDateFieldId,
        endDateFieldId: inferred.endDateFieldId,
        valueFieldId: inferred.valueFieldId,
        titleFieldId: inferred.titleFieldId,
        statusFieldId: inferred.statusFieldId,
        ownerFieldId: inferred.ownerFieldId,
        groupFieldId: inferred.groupFieldId,
        timeFilterFieldIds: inferred.timeFilterFieldIds,
      },
    });
  }
  return inferred;
}

function getRecordFieldsForConfig(fields: FieldMeta[], config: HeatmapConfig): FieldMeta[] {
  if (config.heatmapType !== 'matrix') return fields;
  const fieldIds = new Set(
    [
      config.matrixRowGroupFieldId,
      config.matrixRowNameFieldId,
      config.matrixColumnFieldId,
      config.statusFieldId,
      config.ownerFieldId,
      config.matrixStartDateFieldId,
      config.matrixEndDateFieldId,
      ...(config.matrixDetailFields ?? []).map((item) => item.fieldId),
    ].filter(Boolean) as string[],
  );
  return fields.filter((field) => fieldIds.has(field.id));
}

function mergeRecords(existing: SourceRecord[], incoming: SourceRecord[]): SourceRecord[] {
  const map = new Map(existing.map((record) => [record.id, record]));
  for (const record of incoming) {
    const current = map.get(record.id);
    map.set(record.id, {
      ...current,
      ...record,
      fields: {
        ...(current?.fields ?? {}),
        ...record.fields,
      },
      displayFields: {
        ...(current?.displayFields ?? {}),
        ...(record.displayFields ?? {}),
      },
    });
  }
  return Array.from(map.values());
}

const emptyResult: CalculationResult = {
  buckets: [],
  summary: { totalRecords: 0, totalLoad: 0, calculatedRecords: 0, exceptionRecords: [] },
  filterOptions: { statuses: [], owners: [], groups: [] },
};

const emptyMatrixData: MatrixHeatmapData = {
  rows: [],
  columns: [],
  cells: [],
  summary: { totalTasks: 0, delayedTasks: 0, activeCells: 0 },
};

function isRawValuePresent(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function containsInternalId(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return /^(opt|rec|fld)[A-Za-z0-9_-]+$/.test(value);
  if (Array.isArray(value)) return value.some(containsInternalId);
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some(containsInternalId);
  return false;
}

function isFallbackDisplayValue(value: string, field?: FieldMeta): boolean {
  if (/^(opt|rec|fld)[A-Za-z0-9_-]+$/.test(value)) return true;
  if (!field?.name) return false;
  const escapedFieldName = field.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escapedFieldName}\\s+[A-Za-z0-9_-]{4}$`).test(value);
}

function getFieldDebugInfo(field: FieldMeta) {
  const rawMeta = field.rawMeta ?? {};
  return {
    fieldId: field.id,
    fieldName: field.name,
    fieldType: field.type,
    property: field.property ?? rawMeta.property,
    options: field.options,
    uiType: rawMeta.uiType ?? rawMeta.ui_type,
    description: rawMeta.description,
  };
}

function getSelectedFieldDebugSamples(field: FieldMeta, records: SourceRecord[]) {
  return records.slice(0, 5).map((record) => {
    const rawValue = record.fields[field.id];
    const displayValues = getFieldDisplayValues(record, field);
    return {
      recordId: record.id,
      rawValue,
      displayValues,
      cellString: record.displayFields?.[field.id],
    };
  });
}

function isSameConfig(a: HeatmapConfig, b: HeatmapConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    if (delay <= 0) {
      setDebounced(value);
      return undefined;
    }
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

export function App() {
  const shellRef = useRef<HTMLDivElement>(null);
  const tablesCacheRef = useRef<TableMeta[] | null>(null);
  const fieldsCacheRef = useRef(new Map<string, FieldMeta[]>());
  const recordsCacheRef = useRef(new Map<string, SourceRecord[]>());
  const loadedRecordFieldIdsRef = useRef(new Map<string, Set<string>>());
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
  const [selectedMatrixCell, setSelectedMatrixCell] = useState<MatrixCell | undefined>();
  const [showExceptions, setShowExceptions] = useState(false);
  const [tooltipResetSignal, setTooltipResetSignal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      setLoading(true);
      const [loadedTables, savedConfig, theme] = await Promise.all([
        tablesCacheRef.current ? Promise.resolve(tablesCacheRef.current) : loadTables(),
        loadDashboardConfig(),
        loadDashboardTheme(),
      ]);
      if (cancelled) return;
      tablesCacheRef.current = loadedTables;
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
      setDraftConfig((current) => (isSameConfig(current, nextConfig) ? current : nextConfig));
      setSavedConfig((current) => (isSameConfig(current, nextConfig) ? current : nextConfig));
      setShowConfigPanel(isDashboardConfigMode());
    });
  }, []);

  useEffect(() => {
    if (!draftConfig.tableId) return;
    let cancelled = false;
    const tableId = draftConfig.tableId;
    async function loadTableData() {
      const cachedFields = fieldsCacheRef.current.get(tableId);
      const cachedRecords = recordsCacheRef.current.get(tableId);
      if (cachedFields && cachedRecords) {
        setFields(cachedFields);
        setRecords(cachedRecords);
        setDraftConfig((current) => {
          if (current.tableId !== tableId) return current;
          const inferred = sanitizeConfigForFields(cachedFields, current);
          return isSameConfig(current, inferred) ? current : inferred;
        });
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const loadedFields = await loadFields(tableId);
        if (cancelled) return;
        const inferred = sanitizeConfigForFields(loadedFields, draftConfig);
        const recordFields = getRecordFieldsForConfig(loadedFields, inferred);
        const loadedRecords = recordFields.length
          ? await loadRecordsWithOptions(tableId, recordFields, { preferCellString: inferred.heatmapType === 'matrix', skipPageRecordList: inferred.heatmapType === 'matrix' })
          : [];
        if (cancelled) return;
        fieldsCacheRef.current.set(tableId, loadedFields);
        recordsCacheRef.current.set(tableId, loadedRecords);
        loadedRecordFieldIdsRef.current.set(tableId, new Set(recordFields.map((field) => field.id)));
        setFields(loadedFields);
        setRecords(loadedRecords);
        setDraftConfig((current) => {
          if (current.tableId !== tableId) return current;
          return isSameConfig(current, inferred) ? current : inferred;
        });
      } catch (error) {
        console.error('Failed to load table data', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadTableData();
    return () => {
      cancelled = true;
    };
  }, [draftConfig.tableId]);

  useEffect(() => {
    if (draftConfig.heatmapType !== 'matrix' || !draftConfig.tableId || !fields.length) return;
    const tableId = draftConfig.tableId;
    const neededFields = getRecordFieldsForConfig(fields, draftConfig);
    const loadedFieldIds = loadedRecordFieldIdsRef.current.get(tableId) ?? new Set<string>();
    const missingFields = neededFields.filter((field) => !loadedFieldIds.has(field.id));
    if (!missingFields.length) return;

    let cancelled = false;
    async function loadMissingMatrixFields() {
      try {
        const start = performance.now();
        const partialRecords = await loadRecordsWithOptions(tableId, missingFields, { preferCellString: true, skipPageRecordList: true });
        if (cancelled) return;
        const currentRecords = recordsCacheRef.current.get(tableId) ?? records;
        const merged = mergeRecords(currentRecords, partialRecords);
        recordsCacheRef.current.set(tableId, merged);
        const nextLoadedFieldIds = new Set(loadedRecordFieldIdsRef.current.get(tableId) ?? []);
        missingFields.forEach((field) => nextLoadedFieldIds.add(field.id));
        loadedRecordFieldIdsRef.current.set(tableId, nextLoadedFieldIds);
        setRecords(merged);
        console.log('[矩阵热力图性能]', {
          loadMissingFieldsMs: Math.round(performance.now() - start),
          missingFieldCount: missingFields.length,
          recordsCount: merged.length,
        });
      } catch (error) {
        console.error('Failed to load matrix fields', error);
      }
    }

    void loadMissingMatrixFields();
    return () => {
      cancelled = true;
    };
  }, [
    draftConfig.heatmapType,
    draftConfig.tableId,
    draftConfig.matrixRowGroupFieldId,
    draftConfig.matrixRowNameFieldId,
    draftConfig.matrixColumnFieldId,
    draftConfig.statusFieldId,
    draftConfig.titleFieldId,
    draftConfig.ownerFieldId,
    draftConfig.matrixStartDateFieldId,
    draftConfig.matrixEndDateFieldId,
    draftConfig.matrixDetailFields,
    fields,
    records,
  ]);

  useEffect(() => {
    if (!fields.length) return;
    setDraftConfig((current) => {
      if (!current.tableId) return current;
      const inferred = sanitizeConfigForFields(fields, current);
      return isSameConfig(current, inferred) ? current : inferred;
    });
  }, [fields]);

  const changeDraft = (patch: Partial<HeatmapConfig>) => {
    setTooltipResetSignal((value) => value + 1);
    setSelectedBucket(undefined);
    setSelectedMatrixCell(undefined);
    setShowExceptions(false);
    setDraftConfig((current) => {
      if (patch.tableId && patch.tableId !== current.tableId) {
        setQuickFilters({});
        return resetFieldsForTable(current, patch.tableId);
      }
      const statusFieldChanged = Object.prototype.hasOwnProperty.call(patch, 'statusFieldId');
      const ownerFieldChanged = Object.prototype.hasOwnProperty.call(patch, 'ownerFieldId');
      const groupFieldChanged = Object.prototype.hasOwnProperty.call(patch, 'groupFieldId');
      if (patch.timeFilterFieldIds) {
        const activeTimeFilterFieldIds = new Set(patch.timeFilterFieldIds);
        setQuickFilters((quickCurrent) =>
          Object.fromEntries(Object.entries(quickCurrent).filter(([fieldId]) => activeTimeFilterFieldIds.has(fieldId))),
        );
      }
      if (patch.matrixDetailFields) {
        const activeMatrixFilterFieldIds = new Set(patch.matrixDetailFields.filter((item) => item.enableFilter).map((item) => item.fieldId));
        setQuickFilters((quickCurrent) =>
          Object.fromEntries(Object.entries(quickCurrent).filter(([fieldId]) => activeMatrixFilterFieldIds.has(fieldId))),
        );
      }
      return {
        ...current,
        ...patch,
        statusFilters: statusFieldChanged ? [] : patch.statusFilters ?? current.statusFilters,
        matrixDelayedStatusValues: statusFieldChanged ? [] : patch.matrixDelayedStatusValues ?? current.matrixDelayedStatusValues,
        ownerFilters: ownerFieldChanged ? [] : patch.ownerFilters ?? current.ownerFilters,
        groupFilters: groupFieldChanged ? [] : patch.groupFilters ?? current.groupFilters,
      };
    });
  };

  useEffect(() => {
    const activeFieldIds = new Set(
      draftConfig.heatmapType === 'matrix'
        ? (draftConfig.matrixDetailFields ?? []).filter((item) => item.enableFilter).map((item) => item.fieldId)
        : (draftConfig.timeFilterFieldIds?.length
            ? draftConfig.timeFilterFieldIds
            : ([draftConfig.statusFieldId, draftConfig.ownerFieldId, draftConfig.groupFieldId].filter(Boolean) as string[])),
    );
    setQuickFilters((current) =>
      Object.fromEntries(Object.entries(current).filter(([fieldId]) => activeFieldIds.has(fieldId))),
    );
  }, [draftConfig.statusFieldId, draftConfig.ownerFieldId, draftConfig.groupFieldId, draftConfig.timeFilterFieldIds, draftConfig.matrixDetailFields, draftConfig.heatmapType]);

  const quickFilteredRecords = useMemo(() => {
    if (draftConfig.heatmapType === 'matrix') return records;
    return filterRecordsByQuickFilters(records, quickFilters, fields);
  }, [draftConfig.heatmapType, fields, records, quickFilters]);
  const debouncedMatrixQuickFilters = useDebouncedValue(quickFilters, draftConfig.heatmapType === 'matrix' ? 200 : 0);

  useEffect(() => {
    if (draftConfig.heatmapType !== 'time') return;
    const activeFilters = Object.fromEntries(Object.entries(quickFilters).filter(([, values]) => values.length > 0));
    console.log('[任务负荷热力图] 筛选结果', {
      beforeFilter: records.length,
      afterFilter: quickFilteredRecords.length,
      activeFilters,
    });
  }, [draftConfig.heatmapType, records.length, quickFilteredRecords.length, quickFilters]);

  const previewRecords = draftConfig.heatmapType === 'matrix' ? records : quickFilteredRecords;

  const result = useMemo(() => {
    if (draftConfig.heatmapType === 'matrix') return emptyResult;
    if (!draftConfig.tableId || !draftConfig.startDateFieldId || !draftConfig.endDateFieldId || !draftConfig.valueFieldId) {
      return emptyResult;
    }
    if (!hasRequiredTimeFields(fields, draftConfig)) {
      console.log('[任务负荷热力图][DEBUG] 当前表缺少必需字段，跳过本次计算', {
        tableId: draftConfig.tableId,
        startDateFieldId: draftConfig.startDateFieldId,
        endDateFieldId: draftConfig.endDateFieldId,
        valueFieldId: draftConfig.valueFieldId,
        fieldCount: fields.length,
      });
      return emptyResult;
    }
    return calculateHeatmap(previewRecords, draftConfig, fields);
  }, [fields, previewRecords, draftConfig]);

  const normalizedMatrixRecords = useMemo(() => {
    if (
      draftConfig.heatmapType !== 'matrix' ||
      !draftConfig.tableId ||
      !draftConfig.matrixRowNameFieldId ||
      !draftConfig.matrixColumnFieldId ||
      !draftConfig.statusFieldId
    ) {
      return [];
    }
    const start = performance.now();
    const normalized = normalizeMatrixRecords(records, draftConfig, fields);
    const end = performance.now();
    console.log('[矩阵热力图性能]', {
      normalizeRecordsMs: Math.round(end - start),
      recordsCount: records.length,
    });
    return normalized;
  }, [
    draftConfig.heatmapType,
    draftConfig.tableId,
    draftConfig.matrixRowGroupFieldId,
    draftConfig.matrixRowNameFieldId,
    draftConfig.matrixColumnFieldId,
    draftConfig.statusFieldId,
    draftConfig.matrixDelayedStatusValues,
    draftConfig.matrixDetailFields,
    draftConfig.titleFieldId,
    draftConfig.ownerFieldId,
    draftConfig.matrixStartDateFieldId,
    draftConfig.matrixEndDateFieldId,
    fields,
    records,
  ]);

  const matrixData = useMemo(() => {
    if (
      draftConfig.heatmapType !== 'matrix' ||
      !draftConfig.tableId ||
      !draftConfig.matrixRowNameFieldId ||
      !draftConfig.matrixColumnFieldId ||
      !draftConfig.statusFieldId
    ) {
      return emptyMatrixData;
    }
    const start = performance.now();
    const filtered = filterNormalizedMatrixRecords(normalizedMatrixRecords, debouncedMatrixQuickFilters);
    const afterFilter = performance.now();
    const data = buildMatrixHeatmapDataFromNormalized(filtered, draftConfig);
    const afterBuild = performance.now();
    console.log('[矩阵热力图性能]', {
      applyFiltersMs: Math.round(afterFilter - start),
      buildMatrixMs: Math.round(afterBuild - afterFilter),
      renderRowsCount: data.rows.length,
      renderColumnsCount: data.columns.length,
      recordsCount: normalizedMatrixRecords.length,
      filteredRecordsCount: filtered.length,
    });
    return data;
  }, [
    debouncedMatrixQuickFilters,
    draftConfig.heatmapType,
    draftConfig.tableId,
    draftConfig.matrixRowNameFieldId,
    draftConfig.matrixColumnFieldId,
    draftConfig.statusFieldId,
    draftConfig.matrixShowEmptyCells,
    normalizedMatrixRecords,
  ]);

  const draftFilterOptions = useMemo(() => {
    if (draftConfig.heatmapType === 'matrix') {
      const start = performance.now();
      const options = getMatrixFilterOptionsFromNormalized(normalizedMatrixRecords, draftConfig, fields);
      const end = performance.now();
      console.log('[矩阵热力图性能]', {
        buildFilterOptionsMs: Math.round(end - start),
        recordsCount: normalizedMatrixRecords.length,
      });
      return options;
    }
    return getFilterOptions(records, draftConfig, fields);
  }, [draftConfig, fields, normalizedMatrixRecords, records]);

  useEffect(() => {
    if (
      draftConfig.heatmapType === 'matrix' &&
      draftConfig.statusFieldId &&
      draftConfig.matrixDelayedStatusValues.length === 0 &&
      draftFilterOptions.statuses.includes('已延期')
    ) {
      setDraftConfig((current) => ({ ...current, matrixDelayedStatusValues: ['已延期'] }));
    }
  }, [draftConfig.heatmapType, draftConfig.statusFieldId, draftConfig.matrixDelayedStatusValues.length, draftFilterOptions.statuses]);

  useEffect(() => {
    if (!DEBUG) return;
    if (draftConfig.heatmapType !== 'matrix' || !fields.length || !records.length) return;
    const rowNameField = fields.find((field) => field.id === draftConfig.matrixRowNameFieldId);
    const columnField = fields.find((field) => field.id === draftConfig.matrixColumnFieldId);
    const statusField = fields.find((field) => field.id === draftConfig.statusFieldId);
    const selectedFields = [
      { label: '关键议题', field: rowNameField },
      { label: '涉及系统', field: columnField },
      { label: '进度', field: statusField },
    ];
    const warnings: Array<{
      type: string;
      label: string;
      fieldMeta?: FieldMeta;
      sample?: ReturnType<typeof getSelectedFieldDebugSamples>[number];
      reason?: string;
      selectedFieldId?: string;
    }> = [];

    console.info('[任务负荷热力图][字段调试] 所有字段关键信息', fields.map(getFieldDebugInfo));

    selectedFields.forEach(({ label, field }) => {
      if (!field) {
        warnings.push({
          type: 'missing-field',
          label,
          selectedFieldId:
            label === '关键议题'
              ? draftConfig.matrixRowNameFieldId
              : label === '涉及系统'
                ? draftConfig.matrixColumnFieldId
                : draftConfig.statusFieldId,
        });
        return;
      }

      const samples = getSelectedFieldDebugSamples(field, records);
      console.info(`[任务负荷热力图][字段调试] 当前选择的「${label}」字段`, {
        fieldMeta: field,
        samples,
      });

      samples.slice(0, 5).forEach((sample) => {
        if (isRawValuePresent(sample.rawValue) && !sample.displayValues.length) {
          warnings.push({
            type: 'empty-display-values',
            label,
            fieldMeta: field,
            sample,
          });
        }
        if (
          containsInternalId(sample.rawValue) &&
          (!sample.displayValues.length || sample.displayValues.some((value) => isFallbackDisplayValue(value, field)))
        ) {
          warnings.push({
            type: 'internal-id-fallback',
            label,
            fieldMeta: field,
            sample,
            reason: 'rawValue 包含 opt/rec/fld 内部 ID，displayValues 为空或命中了兜底显示值',
          });
        }
      });
    });

    console.info('[任务负荷热力图][矩阵调试] 当前生成的矩阵数据', {
      matrixRows: matrixData.rows.slice(0, 10),
      matrixColumns: matrixData.columns.slice(0, 10),
      matrixCells: matrixData.cells.slice(0, 20),
    });

    if (warnings.length) {
      const summary = warnings.reduce<Record<string, number>>((acc, warning) => {
        acc[warning.type] = (acc[warning.type] ?? 0) + 1;
        return acc;
      }, {});
      console.warn('[任务负荷热力图][字段调试] 解析异常汇总', {
        summary,
        samples: warnings.slice(0, 5),
      });
    }
  }, [draftConfig.heatmapType, draftConfig.matrixRowNameFieldId, draftConfig.matrixColumnFieldId, draftConfig.statusFieldId, fields, records, matrixData]);

  const applyAndSave = async () => {
    setSaving(true);
    if (draftConfig.heatmapType === 'time') {
      console.log('[任务负荷热力图][DEBUG] 保存配置', draftConfig);
    }
    await saveDashboardConfig(draftConfig);
    setSavedConfig(draftConfig);
    setShowConfigPanel(false);
    setSaving(false);
  };

  useEffect(() => {
    const hasRenderedData = draftConfig.heatmapType === 'matrix' ? matrixData.rows.length && matrixData.columns.length : result.buckets.length;
    if (!loading && !showConfigPanel && savedConfig.tableId && hasRenderedData) {
      const timer = window.setTimeout(() => {
        void markDashboardRendered();
      }, 800);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [draftConfig.heatmapType, loading, matrixData.columns.length, matrixData.rows.length, result.buckets.length, savedConfig.tableId, showConfigPanel]);

  const densityClass = !showConfigPanel && shellSize.height < 270 ? 'micro' : !showConfigPanel && shellSize.height < 390 ? 'compact' : '';
  const changeQuickFilter = (fieldId: string, values: string[]) => {
    setTooltipResetSignal((value) => value + 1);
    setSelectedBucket(undefined);
    setSelectedMatrixCell(undefined);
    setShowExceptions(false);
    setQuickFilters((current) => ({ ...current, [fieldId]: values }));
  };
  const clearQuickFilters = () => {
    setTooltipResetSignal((value) => value + 1);
    setSelectedBucket(undefined);
    setSelectedMatrixCell(undefined);
    setShowExceptions(false);
    setQuickFilters({});
  };
  const delayedMatrixCell = useMemo<MatrixCell>(() => {
    const delayedRecords = matrixData.cells
      .flatMap((cell) => cell.records)
      .filter((record) => record.delayed);
    const uniqueRecords = Array.from(new Map(delayedRecords.map((record) => [record.id, record])).values());
    return {
      key: 'matrix-delayed-tasks',
      rowKey: 'matrix-delayed-tasks',
      rowName: '延期任务列表',
      rowGroup: '全部',
      columnKey: 'all',
      columnName: '全部系统',
      totalCount: uniqueRecords.length,
      delayedCount: uniqueRecords.length,
      normalCount: 0,
      status: uniqueRecords.length ? 'delayed' : 'empty',
      records: uniqueRecords,
    };
  }, [matrixData.cells]);
  const isInitialDataLoading = loading && !fields.length && !records.length;

  return (
    <div
      className={`plugin-root app-shell ${showConfigPanel ? '' : 'config-collapsed'} ${densityClass}`}
      style={shellStyle}
      ref={shellRef}
    >
      <main className="plugin-card main-panel">
        <header className="plugin-header app-header">
          <div>
            <h1>{draftConfig.heatmapType === 'matrix' ? '矩阵状态热力图' : '任务负荷热力图'}</h1>
            <p>
              {draftConfig.heatmapType === 'matrix'
                ? '按行列维度查看任务状态，快速识别延期覆盖情况。'
                : '按任务周期分摊数值，查看每日或每周负荷峰值。'}
            </p>
          </div>
          <div className="header-actions">
            <SummaryBar
              summary={result.summary}
              variant={draftConfig.heatmapType}
              matrixSummary={matrixData.summary}
              onShowExceptions={() => {
                setTooltipResetSignal((value) => value + 1);
                if (draftConfig.heatmapType === 'matrix') {
                  setSelectedMatrixCell(delayedMatrixCell);
                  setSelectedBucket(undefined);
                  setShowExceptions(false);
                } else {
                  setShowExceptions(true);
                  setSelectedBucket(undefined);
                  setSelectedMatrixCell(undefined);
                }
              }}
            />
          </div>
        </header>

        <QuickFilterBar
          fields={fields}
          records={records}
          config={draftConfig}
          filterOptions={draftFilterOptions}
          quickFilters={quickFilters}
          onChange={changeQuickFilter}
          onClear={clearQuickFilters}
        />

        <section className="plugin-body heatmap-card">
          {isInitialDataLoading ? (
            <div className="empty">正在读取多维表格数据...</div>
          ) : draftConfig.heatmapType === 'matrix' ? (
            matrixData.rows.length && matrixData.columns.length ? (
              <MatrixHeatmap
                data={matrixData}
                showCellCount={draftConfig.matrixShowCellCount}
                onSelect={(cell) => {
                  setSelectedMatrixCell(cell);
                  setSelectedBucket(undefined);
                  setShowExceptions(false);
                }}
              />
            ) : (
              <div className="empty">
                已选择字段，但未生成矩阵。当前解析到 {matrixData.rows.length} 行、{matrixData.columns.length} 列，请检查行名称字段和列维度字段是否有值。
              </div>
            )
          ) : result.buckets.length ? (
            <Heatmap
              buckets={result.buckets}
              config={draftConfig}
              resetSignal={tooltipResetSignal}
              detailOpen={Boolean(selectedBucket || selectedMatrixCell || showExceptions)}
              onSelect={(bucket) => {
                setTooltipResetSignal((value) => value + 1);
                setSelectedBucket(bucket);
                setSelectedMatrixCell(undefined);
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
          quickFilters={quickFilters}
          saving={saving}
          onChange={changeDraft}
          onQuickFilterChange={changeQuickFilter}
          onApply={applyAndSave}
        />
      )}

      {selectedBucket && <DetailDrawer bucket={selectedBucket} onClose={() => setSelectedBucket(undefined)} />}
      {selectedMatrixCell && <DetailDrawer matrixCell={selectedMatrixCell} onClose={() => setSelectedMatrixCell(undefined)} />}
      {showExceptions && (
        <DetailDrawer exceptions={result.summary.exceptionRecords} onClose={() => setShowExceptions(false)} />
      )}
    </div>
  );
}
