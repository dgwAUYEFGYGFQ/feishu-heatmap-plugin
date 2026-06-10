import type { FieldMeta, SourceRecord } from '../types';
import { getFieldDisplayValues, normalizeDisplayValues, uniqueSorted } from './value';

export type QuickFilters = Record<string, string[]>;
export const BLANK_FILTER_VALUE = '（空白）';

export function normalizeFieldValues(value: unknown, field?: FieldMeta): string[] {
  return normalizeDisplayValues(value, field).map((text) => text.trim()).filter(Boolean);
}

export function extractQuickFilterOptions(records: SourceRecord[], fieldId: string, fields: FieldMeta[] = []): string[] {
  const field = fields.find((item) => item.id === fieldId);
  const values = records.flatMap((record) => getFieldDisplayValues(record, field));
  const hasBlank = records.some((record) => getFieldDisplayValues(record, field).length === 0);
  return hasBlank ? [...uniqueSorted(values), BLANK_FILTER_VALUE] : uniqueSorted(values);
}

export function filterRecordsByQuickFilters(records: SourceRecord[], quickFilters: QuickFilters, fields: FieldMeta[] = []): SourceRecord[] {
  const activeEntries = Object.entries(quickFilters).filter(([, values]) => values.length > 0);
  if (!activeEntries.length) return records;

  return records.filter((record) =>
    activeEntries.every(([fieldId, selectedValues]) => {
      const field = fields.find((item) => item.id === fieldId);
      const recordValues = getFieldDisplayValues(record, field);
      if (!recordValues.length && selectedValues.includes(BLANK_FILTER_VALUE)) return true;
      return recordValues.some((value) => selectedValues.includes(value));
    }),
  );
}

export function hasQuickFilters(quickFilters: QuickFilters): boolean {
  return Object.values(quickFilters).some((values) => values.length > 0);
}
