export type FieldKind = 'date' | 'number' | 'text' | 'singleSelect' | 'multiSelect' | 'user' | 'link' | 'formula' | 'other';

export type StatisticMode = 'calendar' | 'workday';
export type Granularity = 'day' | 'week';
export type HeatmapType = 'time' | 'matrix';

export interface TableMeta {
  id: string;
  name: string;
}

export interface FieldMeta {
  id: string;
  name: string;
  type: unknown;
  kind: FieldKind;
  property?: Record<string, unknown>;
  rawMeta?: Record<string, unknown>;
  options?: Array<{
    id: string;
    name: string;
  }>;
}

export interface SourceRecord {
  id: string;
  fields: Record<string, unknown>;
  displayFields?: Record<string, string>;
}

export interface ColorStop {
  min: number;
  max: number;
  color: string;
}

export interface MatrixDetailFieldConfig {
  fieldId: string;
  showInDetail: boolean;
  enableFilter: boolean;
}

export interface HeatmapConfig {
  heatmapType: HeatmapType;
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
  timeFilterFieldIds: string[];
  matrixRowGroupFieldId?: string;
  matrixRowNameFieldId?: string;
  matrixColumnFieldId?: string;
  matrixDelayedStatusValues: string[];
  matrixStartDateFieldId?: string;
  matrixEndDateFieldId?: string;
  matrixDetailFields: MatrixDetailFieldConfig[];
  matrixShowEmptyCells: boolean;
  matrixShowCellCount: boolean;
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
  rawStartValue?: unknown;
  rawEndValue?: unknown;
  rawValue?: unknown;
  rawTitleValue?: unknown;
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
  rawStartValue?: unknown;
  rawEndValue?: unknown;
  rawValue?: unknown;
  fieldValues?: Record<string, string>;
  debugValues?: Record<string, string>;
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
    timeFilters?: Array<{
      fieldId: string;
      fieldName: string;
      options: string[];
    }>;
  };
}

export interface MatrixRecordDetail {
  id: string;
  title: string;
  status: string;
  owner: string;
  startDate: string;
  endDate: string;
  delayed: boolean;
  detailFields: Array<{
    fieldId: string;
    fieldName: string;
    value: string;
  }>;
  raw: SourceRecord;
}

export interface MatrixCell {
  key: string;
  rowKey: string;
  rowName: string;
  rowGroup?: string;
  columnKey: string;
  columnName: string;
  totalCount: number;
  delayedCount: number;
  normalCount: number;
  status: 'empty' | 'normal' | 'delayed';
  records: MatrixRecordDetail[];
}

export interface MatrixRow {
  key: string;
  name: string;
  group?: string;
}

export interface MatrixColumn {
  key: string;
  name: string;
}

export interface MatrixHeatmapData {
  rows: MatrixRow[];
  columns: MatrixColumn[];
  cells: MatrixCell[];
  summary: {
    totalTasks: number;
    delayedTasks: number;
    activeCells: number;
  };
}
