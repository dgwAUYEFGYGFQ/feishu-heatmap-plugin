import { bitable } from '@lark-base-open/js-sdk';
import type { FieldKind, FieldMeta, SourceRecord, TableMeta } from '../types';

type SdkTable = {
  getFieldMetaList?: () => Promise<Array<Record<string, unknown>>>;
  getRecordIdList?: () => Promise<string[]>;
  getCellValue?: (fieldId: string, recordId: string) => Promise<unknown>;
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
  if (
    raw.includes('number') ||
    raw.includes('currency') ||
    raw.includes('progress') ||
    raw.includes('rating') ||
    raw === '2' ||
    raw === '19' ||
    raw === '20' ||
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

function normalizeField(meta: Record<string, unknown>): FieldMeta {
  const id = String(meta.id ?? meta.fieldId ?? '');
  return {
    id,
    name: String(meta.name ?? meta.fieldName ?? id),
    type: meta.type,
    kind: fieldTypeToKind(meta.type),
  };
}

function normalizeTable(meta: Record<string, unknown>): TableMeta {
  const id = String(meta.id ?? meta.tableId ?? '');
  return {
    id,
    name: String(meta.name ?? meta.tableName ?? id),
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
        const values = await Promise.all(
          fields.map(async (field) => [field.id, await table.getCellValue?.(field.id, recordId)] as const),
        );
        return { id: recordId, fields: Object.fromEntries(values) };
      }),
    );
    return records.length ? records : mockRecords;
  } catch {
    return mockRecords;
  }
}

export const mockTables: TableMeta[] = [{ id: 'mock_tasks', name: '任务排期表' }];

export const mockFields: FieldMeta[] = [
  { id: 'title', name: '任务名称', type: 'Text', kind: 'text' },
  { id: 'start', name: '开始日期', type: 'DateTime', kind: 'date' },
  { id: 'end', name: '结束日期', type: 'DateTime', kind: 'date' },
  { id: 'value', name: '开发人天', type: 'Number', kind: 'number' },
  { id: 'status', name: '状态', type: 'SingleSelect', kind: 'singleSelect' },
  { id: 'owner', name: '负责人', type: 'User', kind: 'user' },
  { id: 'group', name: '项目组', type: 'SingleSelect', kind: 'singleSelect' },
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
