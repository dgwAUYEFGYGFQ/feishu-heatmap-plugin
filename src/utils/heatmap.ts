import dayjs from 'dayjs';
import type {
  AllocationDetail,
  CalculationResult,
  ExceptionRecord,
  HeatmapBucket,
  HeatmapConfig,
  NormalizedRecord,
  SourceRecord,
} from '../types';
import { buildDayRange, expandDateRange, getWeekRange, resolveDisplayRange, toDateString } from './date';
import { uniqueSorted, valueToNumber, valueToText } from './value';

function normalizeRecord(record: SourceRecord, config: HeatmapConfig): NormalizedRecord {
  const startDate = toDateString(record.fields[config.startDateFieldId]);
  const endValue = toDateString(record.fields[config.endDateFieldId]);
  return {
    id: record.id,
    title: config.titleFieldId ? valueToText(record.fields[config.titleFieldId]) || record.id : record.id,
    startDate,
    endDate: endValue || startDate,
    value: valueToNumber(record.fields[config.valueFieldId]),
    status: config.statusFieldId ? valueToText(record.fields[config.statusFieldId]) : '',
    owner: config.ownerFieldId ? valueToText(record.fields[config.ownerFieldId]) : '',
    group: config.groupFieldId ? valueToText(record.fields[config.groupFieldId]) : '',
    raw: record,
  };
}

function passesFilters(record: NormalizedRecord, config: HeatmapConfig): boolean {
  const statusOk = !config.statusFilters.length || config.statusFilters.includes(record.status);
  const ownerOk = !config.ownerFilters.length || config.ownerFilters.includes(record.owner);
  const groupOk = !config.groupFilters.length || config.groupFilters.includes(record.group);
  return statusOk && ownerOk && groupOk;
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

function validateRecord(record: NormalizedRecord): ExceptionRecord | null {
  if (!record.startDate || !dayjs(record.startDate).isValid()) {
    return { id: record.id, title: record.title, reason: '开始日期为空或格式无效', raw: record.raw };
  }
  if (!record.endDate || !dayjs(record.endDate).isValid()) {
    return { id: record.id, title: record.title, reason: '结束日期格式无效', raw: record.raw };
  }
  if (dayjs(record.endDate).isBefore(dayjs(record.startDate), 'day')) {
    return { id: record.id, title: record.title, reason: '结束日期早于开始日期', raw: record.raw };
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

export function calculateHeatmap(records: SourceRecord[], config: HeatmapConfig): CalculationResult {
  const displayRange = resolveDisplayRange(config);
  const buckets =
    config.granularity === 'day'
      ? createEmptyDayBuckets(displayRange.startDate, displayRange.endDate)
      : createEmptyWeekBuckets(displayRange.startDate, displayRange.endDate);

  const normalizedRecords = records.map((record) => normalizeRecord(record, config));
  const exceptions: ExceptionRecord[] = [];
  let calculatedRecords = 0;
  let totalLoad = 0;

  for (const record of normalizedRecords) {
    const exception = validateRecord(record);
    if (exception) {
      exceptions.push(exception);
      continue;
    }

    const allocationDates = expandDateRange(record.startDate, record.endDate, config.statisticMode === 'workday');
    if (!allocationDates.length) {
      exceptions.push({ id: record.id, title: record.title, reason: '日期区间内没有可统计日期', raw: record.raw });
      continue;
    }

    calculatedRecords += 1;
    if (!passesFilters(record, config)) continue;
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

export function getFilterOptions(records: SourceRecord[], config: HeatmapConfig): CalculationResult['filterOptions'] {
  const normalizedRecords = records.map((record) => normalizeRecord(record, config));
  return {
    statuses: uniqueSorted(normalizedRecords.map((record) => record.status)),
    owners: uniqueSorted(normalizedRecords.map((record) => record.owner)),
    groups: uniqueSorted(normalizedRecords.map((record) => record.group)),
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
