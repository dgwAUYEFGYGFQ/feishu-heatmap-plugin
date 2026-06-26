import type { FieldMeta, HeatmapConfig, MatrixCell, MatrixColumn, MatrixDetailFieldConfig, MatrixHeatmapData, MatrixRecordDetail, MatrixRow, SourceRecord } from '../types';
import { toDateString } from './date';
import { BLANK_FILTER_VALUE } from './quickFilters';
import type { QuickFilters } from './quickFilters';
import { getFieldDisplayValues, uniqueSorted } from './value';

const DEBUG_MATRIX_PERF = true;

export interface NormalizedMatrixRecord {
  recordId: string;
  rowGroupValues: string[];
  rowNameValues: string[];
  columnValues: string[];
  statusValues: string[];
  isDelayed: boolean;
  detail: MatrixRecordDetail;
  filterValues: Record<string, string[]>;
}

function fieldOf(fields: FieldMeta[], fieldId?: string): FieldMeta | undefined {
  return fields.find((field) => field.id === fieldId);
}

function getDetailFieldConfigs(config: HeatmapConfig): MatrixDetailFieldConfig[] {
  if (config.matrixDetailFields?.length) return config.matrixDetailFields;
  return [
    config.titleFieldId ? { fieldId: config.titleFieldId, showInDetail: true, enableFilter: false } : undefined,
    config.statusFieldId ? { fieldId: config.statusFieldId, showInDetail: true, enableFilter: true } : undefined,
    config.ownerFieldId ? { fieldId: config.ownerFieldId, showInDetail: true, enableFilter: true } : undefined,
    config.matrixStartDateFieldId ? { fieldId: config.matrixStartDateFieldId, showInDetail: true, enableFilter: false } : undefined,
    config.matrixEndDateFieldId ? { fieldId: config.matrixEndDateFieldId, showInDetail: true, enableFilter: false } : undefined,
  ].filter(Boolean) as MatrixDetailFieldConfig[];
}

function isTitleLikeField(field?: FieldMeta): boolean {
  return Boolean(field && /子任务|改造任务|任务|标题|名称|title/i.test(field.name));
}

function isInternalIdText(value: string): boolean {
  return /^(rec|fld|opt)[A-Za-z0-9_-]{6,}$/i.test(value.trim());
}

function getMatrixTitleCandidateFieldIds(config: HeatmapConfig, fields: FieldMeta[], detailFields: MatrixDetailFieldConfig[]): string[] {
  const findField = (fieldId?: string) => fields.find((field) => field.id === fieldId);
  const candidates = [
    ...detailFields
      .filter((item) => item.showInDetail)
      .map((item) => findField(item.fieldId))
      .filter((field): field is FieldMeta => isTitleLikeField(field))
      .map((field) => field.id),
    isTitleLikeField(findField(config.titleFieldId)) ? config.titleFieldId : undefined,
    ...detailFields
      .filter((item) => item.showInDetail)
      .map((item) => item.fieldId),
    config.titleFieldId,
  ].filter(Boolean) as string[];

  return Array.from(new Set(candidates));
}

function pickRecordTitle(
  record: SourceRecord,
  fields: FieldMeta[],
  candidateFieldIds: string[],
  detailValueMap: Map<string, string[]>,
): string {
  for (const fieldId of candidateFieldIds) {
    const values = (detailValueMap.get(fieldId) ?? valuesOf(record, fieldId, fields))
      .map((value) => value.trim())
      .filter((value) => value && !isInternalIdText(value));
    if (values.length) return values.join('、');
  }
  return record.id;
}

function valuesOf(record: SourceRecord, fieldId: string | undefined, fields: FieldMeta[]): string[] {
  if (!fieldId) return [];
  return getFieldDisplayValues(record, fieldOf(fields, fieldId));
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function makeRowKey(group: string, name: string): string {
  return `${group || ''}::${name}`;
}

function makeCellKey(rowKey: string, columnKey: string): string {
  return `${rowKey}::${columnKey}`;
}

function addRow(rows: MatrixRow[], seen: Set<string>, group: string, name: string): string {
  const key = makeRowKey(group, name);
  if (!seen.has(key)) {
    seen.add(key);
    rows.push({ key, name, group });
  }
  return key;
}

function addColumn(columns: MatrixColumn[], seen: Set<string>, name: string): string {
  const key = name.trim();
  if (!seen.has(key)) {
    seen.add(key);
    columns.push({ key, name });
  }
  return key;
}

function groupRows(rows: MatrixRow[]): MatrixRow[] {
  const groupOrder: string[] = [];
  const grouped = new Map<string, MatrixRow[]>();
  for (const row of rows) {
    const groupKey = row.group || '-';
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, []);
      groupOrder.push(groupKey);
    }
    grouped.get(groupKey)?.push(row);
  }
  return groupOrder.flatMap((groupKey) => grouped.get(groupKey) ?? []);
}

export function normalizeMatrixRecords(records: SourceRecord[], config: HeatmapConfig, fields: FieldMeta[] = []): NormalizedMatrixRecord[] {
  const detailFields = getDetailFieldConfigs(config);
  const filterFieldIds = detailFields.filter((item) => item.enableFilter).map((item) => item.fieldId);
  const titleCandidateFieldIds = getMatrixTitleCandidateFieldIds(config, fields, detailFields);
  const normalized: NormalizedMatrixRecord[] = [];

  for (const record of records) {
    const rowGroupValues = uniqueValues(valuesOf(record, config.matrixRowGroupFieldId, fields));
    const rowNameValues = uniqueValues(valuesOf(record, config.matrixRowNameFieldId, fields));
    const columnValues = uniqueValues(valuesOf(record, config.matrixColumnFieldId, fields));
    const statusValues = uniqueValues(valuesOf(record, config.statusFieldId, fields));
    const isDelayed = statusValues.some((status) => config.matrixDelayedStatusValues.includes(status));
    const detailValueMap = new Map(
      detailFields
        .filter((item) => item.showInDetail)
        .map((item) => [item.fieldId, valuesOf(record, item.fieldId, fields)] as const),
    );
    const detailFieldValues = detailFields
      .filter((item) => item.showInDetail)
      .map((item) => {
        const field = fieldOf(fields, item.fieldId);
        return {
          fieldId: item.fieldId,
          fieldName: field?.name ?? '未知字段',
          value: (detailValueMap.get(item.fieldId) ?? []).join('、') || '-',
        };
      });
    const filterValues = Object.fromEntries(
      filterFieldIds.map((fieldId) => [fieldId, uniqueValues(valuesOf(record, fieldId, fields))]),
    );
    normalized.push({
      recordId: record.id,
      rowGroupValues,
      rowNameValues,
      columnValues,
      statusValues,
      isDelayed,
      filterValues,
      detail: {
        id: record.id,
        title: pickRecordTitle(record, fields, titleCandidateFieldIds, detailValueMap),
        status: statusValues.join('、'),
        owner: config.ownerFieldId ? valuesOf(record, config.ownerFieldId, fields).join('、') : '',
        startDate: toDateString(record.fields[config.matrixStartDateFieldId ?? '']),
        endDate: toDateString(record.fields[config.matrixEndDateFieldId ?? '']),
        delayed: isDelayed,
        detailFields: detailFieldValues,
        raw: record,
      },
    });
  }

  return normalized;
}

export function filterNormalizedMatrixRecords(records: NormalizedMatrixRecord[], quickFilters: QuickFilters): NormalizedMatrixRecord[] {
  const activeEntries = Object.entries(quickFilters)
    .filter(([, values]) => values.length > 0)
    .map(([fieldId, values]) => [fieldId, new Set(values)] as const);
  if (!activeEntries.length) return records;

  return records.filter((record) =>
    activeEntries.every(([fieldId, selectedSet]) => {
      const values = record.filterValues[fieldId] ?? [];
      if (!values.length && selectedSet.has(BLANK_FILTER_VALUE)) return true;
      return values.some((value) => selectedSet.has(value));
    }),
  );
}

function optionsFromNormalized(records: NormalizedMatrixRecord[], fieldId: string): string[] {
  const values = new Set<string>();
  let hasBlank = false;
  for (const record of records) {
    const recordValues = record.filterValues[fieldId] ?? [];
    if (!recordValues.length) {
      hasBlank = true;
    } else {
      recordValues.forEach((value) => values.add(value));
    }
  }
  const options = uniqueSorted(Array.from(values));
  return hasBlank ? [...options, BLANK_FILTER_VALUE] : options;
}

export function getMatrixFilterOptionsFromNormalized(records: NormalizedMatrixRecord[], config: HeatmapConfig, fields: FieldMeta[] = []) {
  const matrixFilters = getDetailFieldConfigs(config)
    .filter((item) => item.enableFilter)
    .map((item) => {
      const field = fieldOf(fields, item.fieldId);
      return {
        fieldId: item.fieldId,
        fieldName: field?.name ?? '未知字段',
        options: optionsFromNormalized(records, item.fieldId),
      };
    })
    .filter((item) => item.options.length > 0);
  return {
    statuses: uniqueSorted(records.flatMap((record) => record.statusValues)),
    owners: [],
    groups: [],
    matrixFilters,
  };
}

export function buildMatrixHeatmapDataFromNormalized(records: NormalizedMatrixRecord[], config: HeatmapConfig): MatrixHeatmapData {
  const rows: MatrixRow[] = [];
  const columns: MatrixColumn[] = [];
  const rowSeen = new Set<string>();
  const columnSeen = new Set<string>();
  const cellMap = new Map<string, MatrixCell>();
  const delayedTaskIds = new Set<string>();

  for (const record of records) {
    if (!record.rowNameValues.length || !record.columnValues.length) continue;
    const groupValues = record.rowGroupValues.length ? record.rowGroupValues : [''];

    for (const rowName of record.rowNameValues) {
      for (const rowGroup of groupValues) {
        const rowKey = addRow(rows, rowSeen, rowGroup, rowName);
        for (const columnName of record.columnValues) {
          const columnKey = addColumn(columns, columnSeen, columnName);
          const cellKey = makeCellKey(rowKey, columnKey);
          let cell = cellMap.get(cellKey);
          if (!cell) {
            cell = {
              key: cellKey,
              rowKey,
              rowName,
              rowGroup,
              columnKey,
              columnName,
              totalCount: 0,
              delayedCount: 0,
              normalCount: 0,
              status: 'empty',
              records: [],
            };
            cellMap.set(cellKey, cell);
          }
          cell.totalCount += 1;
          if (record.isDelayed) {
            cell.delayedCount += 1;
            delayedTaskIds.add(record.recordId);
          }
          cell.records.push(record.detail);
        }
      }
    }
  }

  const orderedRows = groupRows(rows);
  const cells: MatrixCell[] = [];
  let activeCells = 0;

  if (config.matrixShowEmptyCells) {
    for (const row of orderedRows) {
      for (const column of columns) {
        const key = makeCellKey(row.key, column.key);
        const cell = cellMap.get(key) ?? {
          key,
          rowKey: row.key,
          rowName: row.name,
          rowGroup: row.group,
          columnKey: column.key,
          columnName: column.name,
          totalCount: 0,
          delayedCount: 0,
          normalCount: 0,
          status: 'empty' as const,
          records: [],
        };
        if (cell.totalCount > 0) activeCells += 1;
        cell.normalCount = cell.totalCount - cell.delayedCount;
        cell.status = cell.totalCount === 0 ? 'empty' : cell.delayedCount > 0 ? 'delayed' : 'normal';
        cells.push(cell);
      }
    }
  } else {
    for (const cell of cellMap.values()) {
      cell.normalCount = cell.totalCount - cell.delayedCount;
      cell.status = cell.delayedCount > 0 ? 'delayed' : 'normal';
      activeCells += 1;
      cells.push(cell);
    }
  }

  return {
    rows: orderedRows,
    columns,
    cells,
    summary: {
      totalTasks: records.length,
      delayedTasks: delayedTaskIds.size,
      activeCells,
    },
  };
}

export function getMatrixFilterOptions(records: SourceRecord[], config: HeatmapConfig, fields: FieldMeta[] = []) {
  return getMatrixFilterOptionsFromNormalized(normalizeMatrixRecords(records, config, fields), config, fields);
}

export function buildMatrixHeatmapData(records: SourceRecord[], config: HeatmapConfig, fields: FieldMeta[] = []): MatrixHeatmapData {
  const start = performance.now();
  const normalized = normalizeMatrixRecords(records, config, fields);
  const afterNormalize = performance.now();
  const data = buildMatrixHeatmapDataFromNormalized(normalized, config);
  const afterBuild = performance.now();
  if (DEBUG_MATRIX_PERF) {
    console.log('[矩阵热力图性能]', {
      normalizeRecordsMs: Math.round(afterNormalize - start),
      buildMatrixMs: Math.round(afterBuild - afterNormalize),
      renderRowsCount: data.rows.length,
      renderColumnsCount: data.columns.length,
      recordsCount: records.length,
    });
  }
  return data;
}
