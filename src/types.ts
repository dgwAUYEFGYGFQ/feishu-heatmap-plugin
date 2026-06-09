export type FieldKind = 'date' | 'number' | 'text' | 'singleSelect' | 'multiSelect' | 'user' | 'other';

export type StatisticMode = 'calendar' | 'workday';
export type Granularity = 'day' | 'week';

export interface TableMeta {
  id: string;
  name: string;
}

export interface FieldMeta {
  id: string;
  name: string;
  type: unknown;
  kind: FieldKind;
}

export interface SourceRecord {
  id: string;
  fields: Record<string, unknown>;
}

export interface ColorStop {
  min: number;
  max: number;
  color: string;
}

export interface HeatmapConfig {
  tableId: string;
  startDateFieldId: string;
  endDateFieldId: string;
  valueFieldId: string;
  titleFieldId?: string;
  statusFieldId?: string;
  ownerFieldId?: string;
  groupFieldId?: string;
  statisticMode: StatisticMode;
  granularity: Granularity;
  rangeMode: 'month' | 'custom';
  startMonth: string;
  monthCount: number;
  customStartDate: string;
  customEndDate: string;
  colorStops: ColorStop[];
  showLegend: boolean;
  showCellValue: boolean;
  showQuickFilters: boolean;
  statusFilters: string[];
  ownerFilters: string[];
  groupFilters: string[];
}

export interface NormalizedRecord {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  value: number;
  status: string;
  owner: string;
  group: string;
  raw: SourceRecord;
}

export interface AllocationDetail extends NormalizedRecord {
  dailyValue: number;
  bucketValue: number;
}

export interface HeatmapBucket {
  key: string;
  label: string;
  rangeStart: string;
  rangeEnd: string;
  monthLabel: string;
  value: number;
  recordCount: number;
  details: AllocationDetail[];
}

export interface ExceptionRecord {
  id: string;
  title: string;
  reason: string;
  raw: SourceRecord;
}

export interface CalculationSummary {
  totalRecords: number;
  totalLoad: number;
  calculatedRecords: number;
  exceptionRecords: ExceptionRecord[];
}

export interface CalculationResult {
  buckets: HeatmapBucket[];
  summary: CalculationSummary;
  filterOptions: {
    statuses: string[];
    owners: string[];
    groups: string[];
  };
}
