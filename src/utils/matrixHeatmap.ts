import type { FieldMeta, HeatmapConfig, MatrixCell, MatrixColumn, MatrixDetailFieldConfig, MatrixHeatmapData, MatrixRecordDetail, MatrixRow, SourceRecord } from '../types';
import { toDateString } from './date';
import { BLANK_FILTER_VALUE } from './quickFilters';
import { getFieldDisplayValues, uniqueSorted } from './value';

function fieldOf(fields: FieldMeta[], fieldId?: string): FieldMeta | undefined {
  return fields.find((field) => field.id === fieldId);
}

function valuesOf(record: SourceRecord, fieldId?: string, fields: FieldMeta[] = []): string[] {
  if (!fieldId) return [];
  return getFieldDisplayValues(record, fieldOf(fields, fieldId));
}

function firstValue(record: SourceRecord, fieldId?: string, fields: FieldMeta[] = []): string {
  return valuesOf(record, fieldId, fields)[0] ?? '';
}

function makeKey(value: string): string {
  return value.trim();
}

function uniquePush<T extends { key: string }>(items: T[], item: T): void {
  if (!items.some((current) => current.key === item.key)) items.push(item);
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

export function extractMatrixRows(records: SourceRecord[], config: HeatmapConfig, fields: FieldMeta[] = []): MatrixRow[] {
  if (!config.matrixRowNameFieldId) return [];
  const rows: MatrixRow[] = [];
  for (const record of records) {
    const names = valuesOf(record, config.matrixRowNameFieldId, fields);
    const groups = valuesOf(record, config.matrixRowGroupFieldId, fields);
    const groupValues = groups.length ? groups : [''];
    for (const name of names) {
      if (!name) continue;
      for (const group of groupValues) {
        uniquePush(rows, { key: `${group}::${name}`, name, group });
      }
    }
  }
  return groupRows(rows);
}

export function extractMatrixColumns(records: SourceRecord[], config: HeatmapConfig, fields: FieldMeta[] = []): MatrixColumn[] {
  if (!config.matrixColumnFieldId) return [];
  const columns: MatrixColumn[] = [];
  const columnField = fieldOf(fields, config.matrixColumnFieldId);
  for (const record of records) {
    for (const name of getFieldDisplayValues(record, columnField)) {
      uniquePush(columns, { key: makeKey(name), name });
    }
  }
  return columns;
}

function recordMatchesRow(record: SourceRecord, row: MatrixRow, config: HeatmapConfig, fields: FieldMeta[]): boolean {
  const names = valuesOf(record, config.matrixRowNameFieldId, fields);
  const groups = valuesOf(record, config.matrixRowGroupFieldId, fields);
  return names.includes(row.name) && (!config.matrixRowGroupFieldId || groups.includes(row.group ?? ''));
}

function recordMatchesColumn(record: SourceRecord, column: MatrixColumn, config: HeatmapConfig, fields: FieldMeta[]): boolean {
  if (!config.matrixColumnFieldId) return false;
  return getFieldDisplayValues(record, fieldOf(fields, config.matrixColumnFieldId)).includes(column.name);
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

function buildDetail(record: SourceRecord, config: HeatmapConfig, fields: FieldMeta[]): MatrixRecordDetail {
  const statuses = config.statusFieldId ? getFieldDisplayValues(record, fieldOf(fields, config.statusFieldId)) : [];
  const delayed = statuses.some((status) => config.matrixDelayedStatusValues.includes(status));
  const title = config.titleFieldId ? getFieldDisplayValues(record, fieldOf(fields, config.titleFieldId)).join('、') || record.id : record.id;
  const detailFields = getDetailFieldConfigs(config)
    .filter((item) => item.showInDetail)
    .map((item) => {
      const field = fieldOf(fields, item.fieldId);
      return {
        fieldId: item.fieldId,
        fieldName: field?.name ?? '未知字段',
        value: getFieldDisplayValues(record, field).join('、') || '-',
      };
    });
  return {
    id: record.id,
    title,
    status: statuses.join('、'),
    owner: config.ownerFieldId ? getFieldDisplayValues(record, fieldOf(fields, config.ownerFieldId)).join('、') : '',
    startDate: toDateString(record.fields[config.matrixStartDateFieldId ?? '']),
    endDate: toDateString(record.fields[config.matrixEndDateFieldId ?? '']),
    delayed,
    detailFields,
    raw: record,
  };
}

export function getMatrixFilterOptions(records: SourceRecord[], config: HeatmapConfig, fields: FieldMeta[] = []) {
  const statusField = fieldOf(fields, config.statusFieldId);
  const matrixFilters = getDetailFieldConfigs(config)
    .filter((item) => item.enableFilter)
    .map((item) => {
      const field = fieldOf(fields, item.fieldId);
      const values = records.flatMap((record) => getFieldDisplayValues(record, field));
      const hasBlank = records.some((record) => getFieldDisplayValues(record, field).length === 0);
      return {
        fieldId: item.fieldId,
        fieldName: field?.name ?? '未知字段',
        options: hasBlank ? [...uniqueSorted(values), BLANK_FILTER_VALUE] : uniqueSorted(values),
      };
    })
    .filter((item) => item.options.length > 0);
  return {
    statuses: uniqueSorted(records.flatMap((record) => getFieldDisplayValues(record, statusField))),
    owners: [],
    groups: [],
    matrixFilters,
  };
}

export function buildMatrixHeatmapData(records: SourceRecord[], config: HeatmapConfig, fields: FieldMeta[] = []): MatrixHeatmapData {
  const filteredRecords = records;
  const rows = extractMatrixRows(filteredRecords, config, fields);
  const columns = extractMatrixColumns(filteredRecords, config, fields);
  const cells: MatrixCell[] = [];
  let activeCells = 0;
  const delayedTaskIds = new Set<string>();

  for (const row of rows) {
    for (const column of columns) {
      const matchedRecords = filteredRecords.filter((record) => recordMatchesRow(record, row, config, fields) && recordMatchesColumn(record, column, config, fields));
      const details = matchedRecords.map((record) => buildDetail(record, config, fields));
      const delayedCount = details.filter((record) => record.delayed).length;
      const totalCount = details.length;
      if (totalCount > 0) activeCells += 1;
      details.filter((record) => record.delayed).forEach((record) => delayedTaskIds.add(record.id));
      cells.push({
        key: `${row.key}::${column.key}`,
        rowKey: row.key,
        rowName: row.name,
        rowGroup: row.group,
        columnKey: column.key,
        columnName: column.name,
        totalCount,
        delayedCount,
        normalCount: totalCount - delayedCount,
        status: totalCount === 0 ? 'empty' : delayedCount > 0 ? 'delayed' : 'normal',
        records: details,
      });
    }
  }

  return {
    rows,
    columns,
    cells: config.matrixShowEmptyCells ? cells : cells.filter((cell) => cell.totalCount > 0),
    summary: {
      totalTasks: filteredRecords.length,
      delayedTasks: delayedTaskIds.size,
      activeCells,
    },
  };
}
