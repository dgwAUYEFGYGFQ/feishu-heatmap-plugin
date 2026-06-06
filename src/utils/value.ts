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

export function valueToNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
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
