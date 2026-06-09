import { bitable } from '@lark-base-open/js-sdk';
import type { FieldKind, FieldMeta, SourceRecord, TableMeta } from '../types';

const DEBUG = false;

type SdkTable = {
  getFieldMetaList?: () => Promise<Array<Record<string, unknown>>>;
  getRecordIdList?: () => Promise<string[]>;
  getCellValue?: (fieldId: string, recordId: string) => Promise<unknown>;
  getCellString?: (fieldId: string, recordId: string) => Promise<string>;
};

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
  if (!containsInternalReference(value)) return false;
  return field.kind === 'link' || field.kind === 'formula';
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

export async function loadRecords(tableId: string, fields: FieldMeta[]): Promise<SourceRecord[]> {
  try {
    const table = (await bitable.base.getTableById(tableId)) as unknown as SdkTable;
    const recordIds = (await table.getRecordIdList?.()) ?? [];
    const records = await Promise.all(
      recordIds.map(async (recordId) => {
        const cellEntries = await Promise.all(
          fields.map(async (field) => {
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
