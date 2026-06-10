import dayjs from 'dayjs';
import type { FieldMeta, SourceRecord } from '../types';

function isInternalId(value: string): boolean {
  return /^(opt|rec|fld)[A-Za-z0-9_-]+$/.test(value);
}

function optionNameOf(value: string, field?: FieldMeta): string {
  if (field?.kind !== 'singleSelect' && field?.kind !== 'multiSelect') return value;
  return field?.options?.find((option) => option.id === value || option.name === value)?.name ?? value;
}

function safeDisplayText(value: string, field?: FieldMeta): string {
  if (!value || isInternalId(value)) return '';
  if (hasLikelyFallbackText(value, field)) return '';
  return value;
}

function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

function isReadable(value: unknown): boolean {
  return !isEmptyValue(value) && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean');
}

function parseMaybeJson(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed || !/^[{[]/.test(trimmed)) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function normalizeDateLike(value: unknown): string | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  const raw = String(value);
  if (!/^\d{10,13}$/.test(raw)) return undefined;
  const timestamp = raw.length === 10 ? Number(raw) * 1000 : Number(raw);
  if (!Number.isFinite(timestamp)) return undefined;
  const date = dayjs(timestamp);
  return date.isValid() ? date.format('YYYY-MM-DD') : undefined;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function splitDisplayText(value: string): string[] {
  return unique(
    value
      .split(/\n|、|，|,/)
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function hasLikelyFallbackText(value: string, field?: FieldMeta): boolean {
  const fieldName = field?.name ?? '';
  if (/^(opt|rec|fld)[A-Za-z0-9_-]+$/.test(value)) return true;
  if (!fieldName) return false;
  const escapedFieldName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escapedFieldName}\\s+[A-Za-z0-9_-]{4}$`).test(value);
}

function hasLikelyFallbackValue(values: string[], field?: FieldMeta): boolean {
  return values.some((value) => hasLikelyFallbackText(value, field));
}

function normalizeContainerValues(obj: Record<string, unknown>, field?: FieldMeta): string[] {
  const containerKeys = [
    'values',
    'value',
    'result',
    'data',
    'items',
    'segments',
    'text_arr',
    'textArr',
    'optionIds',
    'option_ids',
    'recordIds',
    'record_ids',
    'recordIdList',
    'record_id_list',
    'linkedRecordIds',
    'linked_record_ids',
    'link_record_ids',
    'linkRecordIds',
  ];

  for (const key of containerKeys) {
    const nested = obj[key];
    if (Array.isArray(nested)) {
      const values = nested.flatMap((item) => normalizeDisplayValues(item, field));
      if (values.length) return values;
    }
    if (nested && typeof nested === 'object') {
      const values = normalizeDisplayValues(nested, field);
      if (values.length) return values;
    }
    if (isReadable(nested)) {
      const values = normalizeDisplayValues(nested, field);
      if (values.length) return values;
    }
  }

  return [];
}

export function valueToText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(valueToText).filter(Boolean).join('、');
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return valueToText(
      obj.text ??
        obj.name ??
        obj.en_name ??
        obj.zh_name ??
        obj.value ??
        obj.title ??
        obj.email ??
        obj.id ??
        '',
    );
  }
  return '';
}

export function normalizeDisplayValues(value: unknown, field?: FieldMeta): string[] {
  if (value === null || value === undefined || value === '') return [];
  if (Array.isArray(value)) return value.flatMap((item) => normalizeDisplayValues(item, field)).filter(Boolean);
  if (typeof value === 'string') {
    const parsed = parseMaybeJson(value);
    if (parsed !== value) return normalizeDisplayValues(parsed, field);
    const dateText = field?.kind === 'date' ? normalizeDateLike(value) : undefined;
    const mapped = optionNameOf(dateText ?? value, field);
    const safeText = safeDisplayText(mapped, field);
    return safeText ? [safeText] : [];
  }
  if (typeof value === 'number') {
    const dateText = field?.kind === 'date' ? normalizeDateLike(value) : undefined;
    return [dateText ?? String(value)];
  }
  if (typeof value === 'boolean') return [String(value)];
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const readable =
      obj.text ??
      obj.name ??
      obj.en_name ??
      obj.zh_name ??
      obj.title ??
      obj.email ??
      obj.displayName ??
      obj.display_name ??
      obj.fullName ??
      obj.full_name;
    if (readable !== undefined && readable !== null && readable !== '') return [String(readable)];

    const nestedValues = normalizeContainerValues(obj, field);
    if (nestedValues.length) return unique(nestedValues);

    const raw = String(
      obj.optionId ??
        obj.option_id ??
        obj.id ??
        obj.recordId ??
        obj.record_id ??
        obj.link_record_id ??
        obj.linkRecordId ??
        obj.userId ??
        obj.user_id ??
        obj.openId ??
        obj.open_id ??
        '',
    );
    if (!raw) return [];
    const mapped = optionNameOf(raw, field);
    const safeText = safeDisplayText(mapped, field);
    return safeText ? [safeText] : [];
  }
  return [];
}

export function normalizeDisplayValue(value: unknown, field?: FieldMeta): string {
  return normalizeDisplayValues(value, field).join('、');
}

export function getFieldDisplayValues(record: SourceRecord, field?: FieldMeta): string[] {
  if (!field) return [];
  const displayText = record.displayFields?.[field.id]?.trim();
  if (displayText) return splitDisplayText(displayText).filter((value) => !hasLikelyFallbackText(value, field));
  const rawValues = normalizeDisplayValues(record.fields[field.id], field).map((text) => text.trim()).filter(Boolean);
  if (hasLikelyFallbackValue(rawValues, field)) return [];
  return rawValues;
}

export function valueToNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const normalized = value.replace(/,/g, '').trim();
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
    const matched = normalized.match(/-?\d+(?:\.\d+)?/);
    return matched ? Number(matched[0]) : 0;
  }
  if (Array.isArray(value)) return valueToNumber(value[0]);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return valueToNumber(obj.value ?? obj.text ?? obj.number);
  }
  return 0;
}

export function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'zh-CN'));
}
