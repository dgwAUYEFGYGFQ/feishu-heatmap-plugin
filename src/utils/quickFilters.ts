import type { SourceRecord } from '../types';
import { uniqueSorted, valueToText } from './value';

export type QuickFilters = Record<string, string[]>;

export function normalizeFieldValues(value: unknown): string[] {
  if (value === null || value === undefined || value === '') return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeFieldValues(item)).filter(Boolean);
  }
  const text = valueToText(value).trim();
  return text ? [text] : [];
}

export function extractQuickFilterOptions(records: SourceRecord[], fieldId: string): string[] {
  return uniqueSorted(records.flatMap((record) => normalizeFieldValues(record.fields[fieldId])));
}

export function filterRecordsByQuickFilters(records: SourceRecord[], quickFilters: QuickFilters): SourceRecord[] {
  const activeEntries = Object.entries(quickFilters).filter(([, values]) => values.length > 0);
  if (!activeEntries.length) return records;

  return records.filter((record) =>
    activeEntries.every(([fieldId, selectedValues]) => {
      const recordValues = normalizeFieldValues(record.fields[fieldId]);
      return recordValues.some((value) => selectedValues.includes(value));
    }),
  );
}

export function hasQuickFilters(quickFilters: QuickFilters): boolean {
  return Object.values(quickFilters).some((values) => values.length > 0);
}
