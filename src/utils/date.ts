import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';

dayjs.extend(isoWeek);

export const DATE_FORMAT = 'YYYY-MM-DD';
export const MONTH_FORMAT = 'YYYY-MM';

export function toDateString(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') {
    const raw = String(Math.trunc(value));
    if (/^\d{10}$/.test(raw) || /^\d{13}$/.test(raw)) {
      const timestamp = raw.length === 10 ? value * 1000 : value;
      const timestampDate = dayjs(timestamp);
      if (timestampDate.isValid() && timestampDate.year() > 1990) return timestampDate.format(DATE_FORMAT);
    }
    const direct = dayjs(value);
    if (direct.isValid() && direct.year() > 1990) return direct.format(DATE_FORMAT);
    const excelLike = dayjs('1899-12-30').add(value, 'day');
    return excelLike.isValid() ? excelLike.format(DATE_FORMAT) : '';
  }
  if (typeof value === 'string') {
    const parsed = dayjs(value);
    return parsed.isValid() ? parsed.format(DATE_FORMAT) : '';
  }
  if (Array.isArray(value)) {
    return toDateString(value[0]);
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return toDateString(
      obj.timestamp ??
        obj.start_time ??
        obj.startTime ??
        obj.end_time ??
        obj.endTime ??
        obj.date ??
        obj.value ??
        obj.text,
    );
  }
  return '';
}

export function expandDateRange(startDate: string, endDate: string, workdayOnly: boolean): string[] {
  const start = dayjs(startDate);
  const end = dayjs(endDate);
  const dates: string[] = [];
  for (let cursor = start; cursor.isBefore(end) || cursor.isSame(end, 'day'); cursor = cursor.add(1, 'day')) {
    const day = cursor.day();
    if (!workdayOnly || (day >= 1 && day <= 5)) {
      dates.push(cursor.format(DATE_FORMAT));
    }
  }
  return dates;
}

export function buildDayRange(startDate: string, endDate: string): string[] {
  return expandDateRange(startDate, endDate, false);
}

export function getWeekKey(date: string): string {
  const d = dayjs(date);
  return `${d.isoWeekYear()}-W${String(d.isoWeek()).padStart(2, '0')}`;
}

export function getWeekRange(date: string): { start: string; end: string; label: string; key: string } {
  const d = dayjs(date);
  const start = d.isoWeekday(1).format(DATE_FORMAT);
  const end = d.isoWeekday(7).format(DATE_FORMAT);
  return {
    start,
    end,
    key: getWeekKey(date),
    label: `${start} 至 ${end}`,
  };
}

export function resolveDisplayRange(config: {
  rangeMode: 'month' | 'custom';
  startMonth: string;
  monthCount: number;
  customStartDate: string;
  customEndDate: string;
}): { startDate: string; endDate: string } {
  if (config.rangeMode === 'custom') {
    const start = dayjs(config.customStartDate);
    const end = dayjs(config.customEndDate);
    if (start.isValid() && end.isValid() && !end.isBefore(start, 'day')) {
      return { startDate: start.format(DATE_FORMAT), endDate: end.format(DATE_FORMAT) };
    }
  }

  const month = dayjs(config.startMonth || dayjs().format(MONTH_FORMAT));
  const start = month.isValid() ? month.startOf('month') : dayjs().startOf('month');
  return {
    startDate: start.format(DATE_FORMAT),
    endDate: start.add(Math.max(1, config.monthCount), 'month').subtract(1, 'day').format(DATE_FORMAT),
  };
}
