import dayjs from 'dayjs';
import type {
  AllocationDetail,
  CalculationResult,
  ExceptionRecord,
  HeatmapBucket,
  HeatmapConfig,
  FieldMeta,
  NormalizedRecord,
  SourceRecord,
} from '../types';
import { buildDayRange, expandDateRange, getWeekRange, resolveDisplayRange, toDateString } from './date';
import { BLANK_FILTER_VALUE } from './quickFilters';
import { getFieldDisplayValues, normalizeDisplayValue, uniqueSorted, valueToNumber, valueToText } from './value';

const DEBUG_TIME_HEATMAP = true;

function fieldOf(fields: FieldMeta[], fieldId?: string): FieldMeta | undefined {
  return fields.find((field) => field.id === fieldId);
}

function fieldDebugMeta(field?: FieldMeta) {
  if (!field) return null;
  return {
    id: field.id,
    name: field.name,
    type: field.type,
    kind: field.kind,
    optionsCount: field.options?.length ?? 0,
  };
}

function rawValueSummary(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function parseDateText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') {
    const raw = String(Math.trunc(value));
    if (/^\d{10}$/.test(raw) || /^\d{13}$/.test(raw)) {
      const timestamp = raw.length === 10 ? value * 1000 : value;
      const parsed = dayjs(timestamp);
      return parsed.isValid() ? parsed.format('YYYY-MM-DD') : '';
    }
    return toDateString(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^\d{10}$/.test(trimmed) || /^\d{13}$/.test(trimmed)) {
      return parseDateText(Number(trimmed));
    }
    const normalized = trimmed.replace(/\//g, '-');
    const parsed = dayjs(normalized);
    return parsed.isValid() ? parsed.format('YYYY-MM-DD') : '';
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = parseDateText(item);
      if (parsed) return parsed;
    }
    return '';
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const candidates = [
      obj.timestamp,
      obj.start_time,
      obj.startTime,
      obj.end_time,
      obj.endTime,
      obj.date,
      obj.value,
      obj.text,
      obj.name,
    ];
    for (const candidate of candidates) {
      const parsed = parseDateText(candidate);
      if (parsed) return parsed;
    }
  }
  return '';
}

function parseDateCellValue(record: SourceRecord, fieldId: string, field?: FieldMeta): string {
  const rawParsed = parseDateText(record.fields[fieldId]);
  if (rawParsed) return rawParsed;
  const displayParsed = parseDateText(record.displayFields?.[fieldId]);
  if (displayParsed) return displayParsed;
  const displayValues = getFieldDisplayValues(record, field);
  for (const value of displayValues) {
    const parsed = parseDateText(value);
    if (parsed) return parsed;
  }
  return '';
}

function parseNumberCellValue(record: SourceRecord, fieldId: string, field?: FieldMeta): number {
  const displayText = record.displayFields?.[fieldId];
  if (displayText && (field?.kind === 'formula' || field?.kind === 'other')) {
    return valueToNumber(displayText);
  }
  const displayValues = field ? getFieldDisplayValues(record, field) : [];
  if (displayValues.length && (field?.kind === 'formula' || field?.kind === 'other')) {
    return valueToNumber(displayValues[0]);
  }
  return valueToNumber(record.fields[fieldId]);
}

function getDisplayText(record: SourceRecord, fieldId?: string, fields: FieldMeta[] = []): string {
  if (!fieldId) return '';
  const field = fieldOf(fields, fieldId);
  return getFieldDisplayValues(record, field).join('、') || normalizeDisplayValue(record.fields[fieldId], field);
}

function buildDebugSample(record: SourceRecord, index: number, config: HeatmapConfig, fields: FieldMeta[]) {
  const titleField = fieldOf(fields, config.titleFieldId);
  const startField = fieldOf(fields, config.startDateFieldId);
  const endField = fieldOf(fields, config.endDateFieldId);
  const valueField = fieldOf(fields, config.valueFieldId);
  return {
    index,
    recordId: record.id,
    rawTitleValue: rawValueSummary(config.titleFieldId ? record.fields[config.titleFieldId] : undefined),
    titleDisplay: getDisplayText(record, config.titleFieldId, fields),
    rawTitleCellString: config.titleFieldId ? record.displayFields?.[config.titleFieldId] ?? '' : '',
    rawStartValue: rawValueSummary(record.fields[config.startDateFieldId]),
    startDisplay: getDisplayText(record, config.startDateFieldId, fields),
    startCellString: record.displayFields?.[config.startDateFieldId] ?? '',
    parsedStartDate: parseDateCellValue(record, config.startDateFieldId, startField),
    rawEndValue: rawValueSummary(record.fields[config.endDateFieldId]),
    endDisplay: getDisplayText(record, config.endDateFieldId, fields),
    endCellString: record.displayFields?.[config.endDateFieldId] ?? '',
    parsedEndDate: parseDateCellValue(record, config.endDateFieldId, endField),
    rawValue: rawValueSummary(record.fields[config.valueFieldId]),
    valueCellString: record.displayFields?.[config.valueFieldId] ?? '',
    parsedValue: parseNumberCellValue(record, config.valueFieldId, valueField),
    titleFieldName: titleField?.name ?? '',
  };
}

function normalizeRecord(record: SourceRecord, config: HeatmapConfig, fields: FieldMeta[] = []): NormalizedRecord {
  const startField = fieldOf(fields, config.startDateFieldId);
  const endField = fieldOf(fields, config.endDateFieldId);
  const titleField = fieldOf(fields, config.titleFieldId);
  const valueField = fieldOf(fields, config.valueFieldId);
  const startDate = parseDateCellValue(record, config.startDateFieldId, startField);
  const endValue = parseDateCellValue(record, config.endDateFieldId, endField);
  return {
    id: record.id,
    title: config.titleFieldId ? getFieldDisplayValues(record, titleField).join('、') || normalizeDisplayValue(record.fields[config.titleFieldId], titleField) || record.id : record.id,
    startDate,
    endDate: endValue || startDate,
    value: parseNumberCellValue(record, config.valueFieldId, valueField),
    status: config.statusFieldId ? getFieldDisplayValues(record, fieldOf(fields, config.statusFieldId)).join('、') : '',
    owner: config.ownerFieldId ? getFieldDisplayValues(record, fieldOf(fields, config.ownerFieldId)).join('、') : '',
    group: config.groupFieldId ? getFieldDisplayValues(record, fieldOf(fields, config.groupFieldId)).join('、') : '',
    rawStartValue: record.fields[config.startDateFieldId] ?? record.displayFields?.[config.startDateFieldId],
    rawEndValue: record.fields[config.endDateFieldId] ?? record.displayFields?.[config.endDateFieldId],
    rawValue: record.displayFields?.[config.valueFieldId] ?? record.fields[config.valueFieldId],
    rawTitleValue: config.titleFieldId ? record.fields[config.titleFieldId] ?? record.displayFields?.[config.titleFieldId] : undefined,
    raw: record,
  };
}

function createEmptyDayBuckets(startDate: string, endDate: string): Map<string, HeatmapBucket> {
  const buckets = new Map<string, HeatmapBucket>();
  for (const date of buildDayRange(startDate, endDate)) {
    buckets.set(date, {
      key: date,
      label: date,
      rangeStart: date,
      rangeEnd: date,
      monthLabel: dayjs(date).format('YYYY年M月'),
      value: 0,
      recordCount: 0,
      details: [],
    });
  }
  return buckets;
}

function createEmptyWeekBuckets(startDate: string, endDate: string): Map<string, HeatmapBucket> {
  const buckets = new Map<string, HeatmapBucket>();
  for (const date of buildDayRange(startDate, endDate)) {
    const week = getWeekRange(date);
    if (!buckets.has(week.key)) {
      buckets.set(week.key, {
        key: week.key,
        label: week.label,
        rangeStart: week.start,
        rangeEnd: week.end,
        monthLabel: dayjs(week.start).format('YYYY年M月'),
        value: 0,
        recordCount: 0,
        details: [],
      });
    }
  }
  return buckets;
}

function createException(record: NormalizedRecord, reason: string): ExceptionRecord {
  return {
    id: record.id,
    title: record.title,
    reason,
    rawStartValue: record.rawStartValue,
    rawEndValue: record.rawEndValue,
    rawValue: record.rawValue,
    fieldValues: {
      start: rawValueSummary(record.rawStartValue),
      end: rawValueSummary(record.rawEndValue),
      value: rawValueSummary(record.rawValue),
    },
    debugValues: {
      parsedStartDate: record.startDate || '-',
      parsedEndDate: record.endDate || '-',
      parsedValue: String(record.value),
      rawTitleValue: rawValueSummary(record.rawTitleValue),
      titleDisplay: record.title,
    },
    raw: record.raw,
  };
}

function validateRecord(record: NormalizedRecord): ExceptionRecord | null {
  if (!record.startDate || !dayjs(record.startDate).isValid()) {
    return createException(record, '开始日期为空或格式无效');
  }
  if (!record.endDate || !dayjs(record.endDate).isValid()) {
    return null;
  }
  if (dayjs(record.endDate).isBefore(dayjs(record.startDate), 'day')) {
    return createException(record, '结束日期早于开始日期');
  }
  return null;
}

function addDetail(bucket: HeatmapBucket, detail: AllocationDetail): void {
  const existing = bucket.details.find((item) => item.id === detail.id);
  if (existing) {
    existing.bucketValue += detail.bucketValue;
  } else {
    bucket.details.push(detail);
  }
}

export function calculateHeatmap(records: SourceRecord[], config: HeatmapConfig, fields: FieldMeta[] = []): CalculationResult {
  if (DEBUG_TIME_HEATMAP) {
    console.log('[任务负荷热力图][DEBUG] 当前配置字段', {
      tableId: config.tableId,
      startDateFieldId: config.startDateFieldId,
      endDateFieldId: config.endDateFieldId,
      valueFieldId: config.valueFieldId,
      titleFieldId: config.titleFieldId,
      statusFieldId: config.statusFieldId,
      ownerFieldId: config.ownerFieldId,
      groupFieldId: config.groupFieldId,
    });
    console.log('[任务负荷热力图][DEBUG] 字段元信息', {
      startDateField: fieldDebugMeta(fieldOf(fields, config.startDateFieldId)),
      endDateField: fieldDebugMeta(fieldOf(fields, config.endDateFieldId)),
      valueField: fieldDebugMeta(fieldOf(fields, config.valueFieldId)),
      titleField: fieldDebugMeta(fieldOf(fields, config.titleFieldId)),
      statusField: fieldDebugMeta(fieldOf(fields, config.statusFieldId)),
      ownerField: fieldDebugMeta(fieldOf(fields, config.ownerFieldId)),
      groupField: fieldDebugMeta(fieldOf(fields, config.groupFieldId)),
    });
    const sampleRecords = records.slice(0, 10).map((record, index) => buildDebugSample(record, index, config, fields));
    console.table(sampleRecords);
    console.log('[任务负荷热力图][DEBUG] 实际参与计算配置', config);
  }

  const displayRange = resolveDisplayRange(config);
  const buckets =
    config.granularity === 'day'
      ? createEmptyDayBuckets(displayRange.startDate, displayRange.endDate)
      : createEmptyWeekBuckets(displayRange.startDate, displayRange.endDate);

  const normalizedRecords = records.map((record) => normalizeRecord(record, config, fields));
  const exceptions: ExceptionRecord[] = [];
  let calculatedRecords = 0;
  let totalLoad = 0;
  let validStartDateCount = 0;
  let validEndDateCount = 0;
  let invalidEndDateCount = 0;

  for (const record of normalizedRecords) {
    if (record.startDate) validStartDateCount += 1;
    if (record.endDate) validEndDateCount += 1;
    if (record.rawEndValue && !record.endDate) invalidEndDateCount += 1;
    const exception = validateRecord(record);
    if (exception) {
      exceptions.push(exception);
      continue;
    }

    const taskStart = dayjs(record.startDate);
    const taskEnd = dayjs(record.endDate);
    const rangeStart = dayjs(displayRange.startDate);
    const rangeEnd = dayjs(displayRange.endDate);
    const activeStart = taskStart.isBefore(rangeStart, 'day') ? rangeStart.format('YYYY-MM-DD') : taskStart.format('YYYY-MM-DD');
    const activeEnd = taskEnd.isAfter(rangeEnd, 'day') ? rangeEnd.format('YYYY-MM-DD') : taskEnd.format('YYYY-MM-DD');

    if (dayjs(activeEnd).isBefore(dayjs(activeStart), 'day')) {
      continue;
    }

    const allocationDates = expandDateRange(activeStart, activeEnd, config.statisticMode === 'workday');
    if (!allocationDates.length) {
      exceptions.push(createException(record, '日期范围内没有可统计日期'));
      continue;
    }

    calculatedRecords += 1;
    totalLoad += record.value;

    const dailyValue = record.value / allocationDates.length;
    for (const date of allocationDates) {
      if (dayjs(date).isBefore(displayRange.startDate, 'day') || dayjs(date).isAfter(displayRange.endDate, 'day')) {
        continue;
      }

      const key = config.granularity === 'day' ? date : getWeekRange(date).key;
      const bucket = buckets.get(key);
      if (!bucket) continue;

      bucket.value += dailyValue;
      addDetail(bucket, {
        ...record,
        dailyValue,
        bucketValue: dailyValue,
      });
    }
  }

  if (DEBUG_TIME_HEATMAP) {
    console.log('[任务负荷热力图] 日期解析汇总', {
      totalRecords: records.length,
      validStartDateCount,
      invalidStartDateCount: records.length - validStartDateCount,
      validEndDateCount,
      invalidEndDateCount,
      sampleInvalidRecords: exceptions.slice(0, 5).map((item) => ({
        recordId: item.id,
        title: item.title,
        reason: item.reason,
        rawStartValue: item.fieldValues?.start,
        rawEndValue: item.fieldValues?.end,
        rawValue: item.fieldValues?.value,
      })),
    });
    const failedDateSamples = records
      .map((record, index) => buildDebugSample(record, index, config, fields))
      .filter((sample) => !sample.parsedStartDate || (sample.rawEndValue && !sample.parsedEndDate))
      .slice(0, 10);
    if (failedDateSamples.length) {
      console.log('[任务负荷热力图][DEBUG] 日期解析失败样例', failedDateSamples);
    }
  }

  for (const bucket of buckets.values()) {
    bucket.recordCount = bucket.details.length;
    bucket.value = Number(bucket.value.toFixed(4));
    bucket.details.sort((a, b) => b.bucketValue - a.bucketValue);
  }

  return {
    buckets: Array.from(buckets.values()).sort((a, b) => a.rangeStart.localeCompare(b.rangeStart)),
    summary: {
      totalRecords: records.length,
      totalLoad: Number(totalLoad.toFixed(4)),
      calculatedRecords,
      exceptionRecords: exceptions,
    },
    filterOptions: {
      statuses: uniqueSorted(normalizedRecords.map((record) => record.status)),
      owners: uniqueSorted(normalizedRecords.map((record) => record.owner)),
      groups: uniqueSorted(normalizedRecords.map((record) => record.group)),
    },
  };
}

export function getFilterOptions(records: SourceRecord[], config: HeatmapConfig, fields: FieldMeta[] = []): CalculationResult['filterOptions'] {
  const normalizedRecords = records.map((record) => normalizeRecord(record, config, fields));
  const timeFilterFieldIds = config.timeFilterFieldIds?.length
    ? config.timeFilterFieldIds
    : ([config.statusFieldId, config.ownerFieldId, config.groupFieldId].filter(Boolean) as string[]);
  const timeFilters = Array.from(new Set(timeFilterFieldIds))
    .map((fieldId) => {
      const field = fieldOf(fields, fieldId);
      const values = records.flatMap((record) => getFieldDisplayValues(record, field));
      const hasBlank = records.some((record) => getFieldDisplayValues(record, field).length === 0);
      return {
        fieldId,
        fieldName: field?.name ?? '未知字段',
        options: hasBlank ? [...uniqueSorted(values), BLANK_FILTER_VALUE] : uniqueSorted(values),
      };
    })
    .filter((item) => item.options.length > 0);
  return {
    statuses: uniqueSorted(normalizedRecords.map((record) => record.status)),
    owners: uniqueSorted(normalizedRecords.map((record) => record.owner)),
    groups: uniqueSorted(normalizedRecords.map((record) => record.group)),
    timeFilters,
  };
}

export function getBucketColor(value: number, stops: HeatmapConfig['colorStops']): string {
  const sorted = [...stops].sort((a, b) => a.min - b.min);
  const matched = sorted.find((stop) => value >= stop.min && value <= stop.max);
  if (matched) return matched.color;
  if (!sorted.length || value <= 0) return '#F5F6F7';
  return value > sorted[sorted.length - 1].max ? sorted[sorted.length - 1].color : '#F5F6F7';
}

export function getBucketLevel(value: number, stops: HeatmapConfig['colorStops']): number {
  if (!value || value <= 0) return 0;
  const sorted = [...stops].sort((a, b) => a.min - b.min);
  const index = sorted.findIndex((stop) => value >= stop.min && value <= stop.max);
  if (index >= 0) return index + 1;
  return sorted.length && value > sorted[sorted.length - 1].max ? sorted.length : 0;
}

export function getCellTextColor(level: number): string {
  return level >= 3 ? '#FFFFFF' : '#1F2329';
}

export function formatCellValue(value: number): string {
  if (!value || value === 0) return '';
  if (value >= 100) return '99+';
  if (value >= 10) return Math.round(value).toString();
  return Number(value.toFixed(1)).toString();
}

export function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
