import { bitable } from '@lark-base-open/js-sdk';
import type { FieldKind, FieldMeta, SourceRecord, TableMeta } from '../types';

const DEBUG = false;

type SdkTable = {
  getFieldMetaList?: () => Promise<Array<Record<string, unknown>>>;
  getRecordIdList?: () => Promise<string[]>;
  getRecordList?: (params?: Record<string, unknown>) => Promise<unknown>;
  getCellValue?: (fieldId: string, recordId: string) => Promise<unknown>;
  getCellString?: (fieldId: string, recordId: string) => Promise<string>;
};

interface LoadRecordsOptions {
  preferCellString?: boolean;
  skipPageRecordList?: boolean;
}

function fieldTypeToKind(type: unknown): FieldKind {
  const raw = String(type).toLowerCase();
  if (
    raw.includes('datetime') ||
    raw.includes('date') ||
    raw.includes('time') ||
    raw === '5' ||
    raw === '1001' ||
    raw === '1002'
  ) {
    return 'date';
  }
  if (raw.includes('formula') || raw === '20') return 'formula';
  if (raw.includes('lookup') || raw === '19') return 'other';
  if (raw.includes('link') || raw.includes('relation') || raw === '18' || raw === '21') return 'link';
  if (
    raw.includes('number') ||
    raw.includes('currency') ||
    raw.includes('progress') ||
    raw.includes('rating') ||
    raw === '2' ||
    raw === '1005' ||
    raw === '99002' ||
    raw === '99003' ||
    raw === '99004'
  ) {
    return 'number';
  }
  if (raw.includes('single') || raw === '3') return 'singleSelect';
  if (raw.includes('multi') || raw === '4') return 'multiSelect';
  if (raw.includes('user') || raw.includes('person') || raw === '11' || raw === '1003' || raw === '1004') return 'user';
  if (raw.includes('text') || raw === '1' || raw === '1001') return 'text';
  return 'other';
}

function isReadableCellValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.some(isReadableCellValue);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return Boolean(obj.text ?? obj.name ?? obj.en_name ?? obj.zh_name ?? obj.title ?? obj.email ?? obj.displayName ?? obj.display_name);
  }
  return false;
}

function containsInternalReference(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return /^(opt|rec|fld)[A-Za-z0-9_-]+$/.test(value);
  if (Array.isArray(value)) return value.some(containsInternalReference);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const directValues = [
      obj.id,
      obj.optionId,
      obj.option_id,
      obj.recordId,
      obj.record_id,
      obj.value,
      obj.recordIds,
      obj.record_ids,
      obj.link_record_ids,
      obj.linkRecordIds,
      obj.linkedRecordIds,
      obj.linked_record_ids,
    ];
    return directValues.some(containsInternalReference);
  }
  return false;
}

function shouldReadCellString(value: unknown): boolean {
  return containsInternalReference(value) && !isReadableCellValue(value);
}

function shouldAlwaysReadCellString(field: FieldMeta, value: unknown): boolean {
  if (field.kind === 'link' || field.kind === 'formula' || field.kind === 'other') return true;
  return containsInternalReference(value);
}

function parseMaybeJsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeOptions(meta: Record<string, unknown>): FieldMeta['options'] {
  const property = parseMaybeJsonObject(meta.property);
  const rawOptionSources = [meta.options, property.options, property.option, property.optionsMap, property.optionMap];
  const optionRecords: Array<Record<string, unknown> & { __entryId?: string }> = [];

  for (const source of rawOptionSources) {
    if (Array.isArray(source)) {
      optionRecords.push(...(source as Array<Record<string, unknown>>));
    } else if (source && typeof source === 'object') {
      Object.entries(source as Record<string, unknown>).forEach(([entryId, option]) => {
        if (option && typeof option === 'object') {
          optionRecords.push({ ...(option as Record<string, unknown>), __entryId: entryId });
        }
      });
    }
  }

  return optionRecords
    .map((option) => {
      const optionId = String(option.id ?? option.optionId ?? option.option_id ?? option.value ?? option.__entryId ?? '');
      const optionName = String(option.name ?? option.text ?? option.label ?? option.option_name ?? option.value ?? optionId);
      return optionId ? { id: optionId, name: optionName } : null;
    })
    .filter(Boolean) as FieldMeta['options'];
}

function normalizeField(meta: Record<string, unknown>): FieldMeta {
  const id = String(meta.id ?? meta.fieldId ?? meta.field_id ?? '');
  const property = parseMaybeJsonObject(meta.property);
  return {
    id,
    name: String(meta.name ?? meta.fieldName ?? meta.field_name ?? id),
    type: meta.type,
    kind: fieldTypeToKind(meta.type),
    property,
    rawMeta: meta,
    options: normalizeOptions(meta),
  };
}

function normalizeTable(meta: Record<string, unknown>): TableMeta {
  const id = String(meta.id ?? meta.tableId ?? meta.table_id ?? '');
  return {
    id,
    name: String(meta.name ?? meta.tableName ?? meta.table_name ?? id),
  };
}

export async function loadTables(): Promise<TableMeta[]> {
  try {
    const tableMetaList = await bitable.base.getTableMetaList();
    const tables = tableMetaList.map((meta) => normalizeTable(meta as unknown as Record<string, unknown>)).filter((item) => item.id);
    return tables.length ? tables : mockTables;
  } catch {
    return mockTables;
  }
}

export async function loadFields(tableId: string): Promise<FieldMeta[]> {
  try {
    const table = (await bitable.base.getTableById(tableId)) as unknown as SdkTable;
    const fieldMetaList = await table.getFieldMetaList?.();
    const fields = (fieldMetaList ?? [])
      .map((meta) => normalizeField(meta as unknown as Record<string, unknown>))
      .filter((item) => item.id);
    return fields.length ? fields : mockFields;
  } catch {
    return mockFields;
  }
}

function extractRecordId(record: unknown): string {
  if (typeof record === 'string') return record;
  if (!record || typeof record !== 'object') return '';
  const obj = record as Record<string, unknown>;
  return String(obj.recordId ?? obj.record_id ?? obj.id ?? '');
}

function extractRecordFields(record: unknown): Record<string, unknown> {
  if (!record || typeof record !== 'object') return {};
  const obj = record as Record<string, unknown>;
  const fields = obj.fields ?? obj.fieldValues ?? obj.field_values ?? obj.recordFields ?? obj.record_fields;
  return fields && typeof fields === 'object' && !Array.isArray(fields) ? (fields as Record<string, unknown>) : {};
}

function extractDisplayFields(record: unknown, fields: FieldMeta[]): Record<string, string> {
  if (!record || typeof record !== 'object') return {};
  const obj = record as Record<string, unknown>;
  const source = obj.displayFields ?? obj.display_fields ?? obj.fieldStringValues ?? obj.field_string_values ?? obj.cellStringValues ?? obj.cell_string_values;
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    return Object.fromEntries(
      Object.entries(source as Record<string, unknown>)
        .map(([fieldId, value]) => [fieldId, typeof value === 'string' ? value : ''])
        .filter(([, value]) => value),
    );
  }

  const rawFields = extractRecordFields(record);
  return Object.fromEntries(
    fields
      .map((field) => {
        const rawValue = rawFields[field.id];
        if (typeof rawValue === 'string' && !/^(opt|rec|fld)[A-Za-z0-9_-]+$/.test(rawValue)) return [field.id, rawValue] as const;
        return [field.id, ''] as const;
      })
      .filter(([, value]) => value),
  );
}

function extractRecordPage(response: unknown): { rawRecords: unknown[]; recordIds: string[]; hasMore: boolean; nextPageToken?: string } {
  if (Array.isArray(response)) {
    return { rawRecords: response, recordIds: response.map(extractRecordId).filter(Boolean), hasMore: false };
  }
  if (!response || typeof response !== 'object') {
    return { rawRecords: [], recordIds: [], hasMore: false };
  }
  const obj = response as Record<string, unknown>;
  const dataObj = obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data) ? (obj.data as Record<string, unknown>) : undefined;
  const records = (obj.records ?? obj.items ?? dataObj?.records ?? dataObj?.items ?? obj.data ?? []) as unknown;
  const rawRecords = Array.isArray(records) ? records : [];
  const recordIds = Array.isArray(records) ? records.map(extractRecordId).filter(Boolean) : [];
  const nextPageToken = String(obj.nextPageToken ?? obj.next_page_token ?? obj.pageToken ?? obj.page_token ?? dataObj?.nextPageToken ?? dataObj?.next_page_token ?? '');
  const hasMore = Boolean(obj.hasMore ?? obj.has_more ?? dataObj?.hasMore ?? dataObj?.has_more ?? nextPageToken);
  return { rawRecords, recordIds, hasMore, nextPageToken: nextPageToken || undefined };
}

async function loadRecordsByPage(table: SdkTable, fields: FieldMeta[]): Promise<{ records: SourceRecord[]; pageCount: number } | null> {
  if (!table.getRecordList) return null;

  const records: SourceRecord[] = [];
  let pageToken = '';
  let pageCount = 0;
  for (let guard = 0; guard < 1000; guard += 1) {
    const response = await table.getRecordList({ pageSize: 500, pageToken: pageToken || undefined });
    const page = extractRecordPage(response);
    pageCount += 1;
    if (pageCount === 1 && !page.rawRecords.some((record) => Object.keys(extractRecordFields(record)).length > 0)) {
      return null;
    }
    const pageRecords = page.rawRecords
      .map((record) => {
        const id = extractRecordId(record);
        const rawFields = extractRecordFields(record);
        if (!id || !Object.keys(rawFields).length) return null;
        return {
          id,
          fields: rawFields,
          displayFields: extractDisplayFields(record, fields),
        };
      })
      .filter(Boolean) as SourceRecord[];
    records.push(...pageRecords);
    if (!page.hasMore || !page.nextPageToken || page.nextPageToken === pageToken) break;
    pageToken = page.nextPageToken;
  }

  if (!records.length) return null;
  const uniqueRecords = Array.from(new Map(records.map((record) => [record.id, record])).values());
  return { records: uniqueRecords, pageCount };
}

async function loadAllRecordIds(table: SdkTable): Promise<{ recordIds: string[]; pageCount: number }> {
  if (table.getRecordList) {
    const recordIds: string[] = [];
    let pageToken = '';
    let pageCount = 0;
    for (let guard = 0; guard < 1000; guard += 1) {
      const response = await table.getRecordList({ pageSize: 500, pageToken: pageToken || undefined });
      const page = extractRecordPage(response);
      pageCount += 1;
      recordIds.push(...page.recordIds);
      if (!page.hasMore || !page.nextPageToken || page.nextPageToken === pageToken) break;
      pageToken = page.nextPageToken;
    }
    if (recordIds.length) {
      return { recordIds: Array.from(new Set(recordIds)), pageCount };
    }
  }

  const recordIds = (await table.getRecordIdList?.()) ?? [];
  return { recordIds, pageCount: recordIds.length ? 1 : 0 };
}

export async function loadRecords(tableId: string, fields: FieldMeta[]): Promise<SourceRecord[]> {
  return loadRecordsWithOptions(tableId, fields);
}

export async function loadRecordsWithOptions(tableId: string, fields: FieldMeta[], options: LoadRecordsOptions = {}): Promise<SourceRecord[]> {
  try {
    const table = (await bitable.base.getTableById(tableId)) as unknown as SdkTable;
    const start = performance.now();
    const pageResult = options.skipPageRecordList ? null : await loadRecordsByPage(table, fields);
    if (pageResult) {
      console.log('[任务负荷热力图] records读取完成', {
        tableId,
        totalRecords: pageResult.records.length,
        pageCount: pageResult.pageCount,
        mode: 'page',
        readMs: Math.round(performance.now() - start),
      });
      return pageResult.records.length ? pageResult.records : mockRecords;
    }

    const { recordIds, pageCount } = await loadAllRecordIds(table);
    const records = await Promise.all(
      recordIds.map(async (recordId) => {
        const cellEntries = await Promise.all(
          fields.map(async (field) => {
            if (options.preferCellString && table.getCellString) {
              try {
                const displayText = await table.getCellString(field.id, recordId);
                return [field.id, displayText, displayText] as const;
              } catch (error) {
                if (DEBUG) {
                  console.warn('[任务负荷热力图] getCellString 读取失败', { tableId, recordId, field, error });
                }
              }
            }
            const rawValue = await table.getCellValue?.(field.id, recordId);
            let displayText = '';
            if (table.getCellString && (shouldAlwaysReadCellString(field, rawValue) || shouldReadCellString(rawValue))) {
              try {
                displayText = await table.getCellString(field.id, recordId);
              } catch (error) {
                if (DEBUG) {
                  console.warn('[任务负荷热力图] getCellString 读取失败', { tableId, recordId, field, rawValue, error });
                }
              }
            }
            return [field.id, rawValue, displayText] as const;
          }),
        );
        return {
          id: recordId,
          fields: Object.fromEntries(cellEntries.map(([fieldId, rawValue]) => [fieldId, rawValue])),
          displayFields: Object.fromEntries(
            cellEntries
              .filter(([, , displayText]) => displayText)
              .map(([fieldId, , displayText]) => [fieldId, displayText]),
          ),
        };
      }),
    );
    console.log('[任务负荷热力图] records读取完成', {
      tableId,
      totalRecords: records.length,
      pageCount,
      mode: 'cell',
      readMs: Math.round(performance.now() - start),
    });
    return records.length ? records : mockRecords;
  } catch {
    return mockRecords;
  }
}

export const mockTables: TableMeta[] = [{ id: 'mock_tasks', name: '任务排期表' }];

export const mockFields: FieldMeta[] = [
  { id: 'title', name: '任务名称', type: 'Text', kind: 'text', options: [] },
  { id: 'start', name: '开始日期', type: 'DateTime', kind: 'date', options: [] },
  { id: 'end', name: '结束日期', type: 'DateTime', kind: 'date', options: [] },
  { id: 'value', name: '开发人天', type: 'Number', kind: 'number', options: [] },
  { id: 'status', name: '状态', type: 'SingleSelect', kind: 'singleSelect', options: [] },
  { id: 'owner', name: '负责人', type: 'User', kind: 'user', options: [] },
  { id: 'group', name: '项目组', type: 'SingleSelect', kind: 'singleSelect', options: [] },
];

export const mockRecords: SourceRecord[] = [
  {
    id: 'rec_1',
    fields: {
      title: '订单同步重构',
      start: '2026-06-01',
      end: '2026-06-05',
      value: 12.5,
      status: '进行中',
      owner: '李雷',
      group: '交易',
    },
  },
  {
    id: 'rec_2',
    fields: {
      title: '移动端看板',
      start: '2026-06-04',
      end: '2026-06-12',
      value: 18,
      status: '未开始',
      owner: '韩梅梅',
      group: '增长',
    },
  },
  {
    id: 'rec_3',
    fields: {
      title: '权限灰度验证',
      start: '2026-06-10',
      end: '2026-06-10',
      value: 3,
      status: '已完成',
      owner: '王强',
      group: '平台',
    },
  },
  {
    id: 'rec_4',
    fields: {
      title: '客服工单导入',
      start: '2026-06-15',
      end: '2026-06-26',
      value: 22.5,
      status: '进行中',
      owner: '李雷',
      group: '平台',
    },
  },
  {
    id: 'rec_5',
    fields: {
      title: '异常样例：缺开始日期',
      start: '',
      end: '2026-06-20',
      value: 6,
      status: '风险',
      owner: '韩梅梅',
      group: '增长',
    },
  },
  {
    id: 'rec_6',
    fields: {
      title: '异常样例：日期反向',
      start: '2026-07-08',
      end: '2026-07-03',
      value: 9,
      status: '风险',
      owner: '王强',
      group: '交易',
    },
  },
  {
    id: 'rec_7',
    fields: {
      title: '版本联调',
      start: '2026-07-01',
      end: '2026-07-17',
      value: 30,
      status: '未开始',
      owner: '赵敏',
      group: '交易',
    },
  },
];
