import { ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FieldMeta, HeatmapConfig, SourceRecord } from '../types';
import type { QuickFilters } from '../utils/quickFilters';
import { extractQuickFilterOptions, hasQuickFilters } from '../utils/quickFilters';

interface QuickFilterBarProps {
  fields: FieldMeta[];
  records: SourceRecord[];
  config: HeatmapConfig;
  quickFilters: QuickFilters;
  onChange: (fieldId: string, values: string[]) => void;
  onClear: () => void;
}

interface FilterItem {
  fieldId: string;
  fieldName: string;
  options: string[];
  selectedValues: string[];
}

function formatChipLabel(fieldName: string, selectedValues: string[]): string {
  if (!selectedValues.length) return `${fieldName}：全部`;
  if (selectedValues.length === 1) return `${fieldName}：${selectedValues[0]}`;
  if (selectedValues.length === 2) return `${fieldName}：${selectedValues.join('、')}`;
  return `${fieldName}：已选 ${selectedValues.length} 项`;
}

export function QuickFilterBar({ fields, records, config, quickFilters, onChange, onClear }: QuickFilterBarProps) {
  const [openFieldId, setOpenFieldId] = useState('');
  const [searchText, setSearchText] = useState('');
  const [draftValues, setDraftValues] = useState<string[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  const fieldMap = useMemo(() => new Map(fields.map((field) => [field.id, field])), [fields]);
  const filterItems = useMemo<FilterItem[]>(() => {
    const configs = config.heatmapType === 'matrix'
      ? (config.matrixDetailFields ?? []).filter((item) => item.enableFilter).map((item) => item.fieldId)
      : ([config.statusFieldId, config.ownerFieldId, config.groupFieldId].filter(Boolean) as string[]);
    const uniqueFieldIds = Array.from(new Set(configs));
    return uniqueFieldIds
      .map((fieldId) => {
        const field = fieldMap.get(fieldId);
        if (!field) return null;
        const options = extractQuickFilterOptions(records, fieldId, fields);
        if (!options.length) return null;
        return {
          fieldId,
          fieldName: field.name,
          options,
          selectedValues: quickFilters[fieldId] ?? [],
        };
      })
      .filter(Boolean) as FilterItem[];
  }, [config.groupFieldId, config.heatmapType, config.matrixDetailFields, config.ownerFieldId, config.statusFieldId, fieldMap, fields, quickFilters, records]);

  const activeItem = filterItems.find((item) => item.fieldId === openFieldId);
  const visibleOptions = useMemo(() => {
    if (!activeItem) return [];
    const keyword = searchText.trim().toLocaleLowerCase();
    if (!keyword) return activeItem.options;
    return activeItem.options.filter((option) => option.toLocaleLowerCase().includes(keyword));
  }, [activeItem, searchText]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpenFieldId('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!config.showQuickFilters || !filterItems.length) return null;

  const openFilter = (item: FilterItem) => {
    setOpenFieldId((current) => (current === item.fieldId ? '' : item.fieldId));
    setSearchText('');
    setDraftValues(item.selectedValues);
  };

  const toggleValue = (value: string) => {
    setDraftValues((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));
  };

  return (
    <div className="quick-filter-bar" ref={rootRef}>
      <span className="quick-filter-label">筛选：</span>
      {filterItems.map((item) => (
        <div className="quick-filter-item" key={item.fieldId}>
          <button
            className={`filter-chip ${item.selectedValues.length ? 'active' : ''}`}
            type="button"
            onClick={() => openFilter(item)}
          >
            <span>{formatChipLabel(item.fieldName, item.selectedValues)}</span>
            <ChevronDown size={14} />
          </button>
          {openFieldId === item.fieldId && (
            <div className="filter-popover">
              <div className="filter-popover-title">{item.fieldName}</div>
              <input
                className="filter-search"
                type="search"
                value={searchText}
                placeholder={`搜索${item.fieldName}`}
                onChange={(event) => setSearchText(event.target.value)}
              />
              <div className="filter-popover-options">
                {visibleOptions.length ? (
                  visibleOptions.map((option) => (
                    <label className="filter-popover-option" key={option}>
                      <input type="checkbox" checked={draftValues.includes(option)} onChange={() => toggleValue(option)} />
                      <span>{option}</span>
                    </label>
                  ))
                ) : (
                  <div className="filter-popover-empty">没有匹配项</div>
                )}
              </div>
              <div className="filter-popover-actions">
                <button type="button" onClick={() => setDraftValues([])}>
                  重置
                </button>
                <button
                  className="primary"
                  type="button"
                  onClick={() => {
                    onChange(item.fieldId, draftValues);
                    setOpenFieldId('');
                  }}
                >
                  确定
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
      <button className="clear-filter" type="button" disabled={!hasQuickFilters(quickFilters)} onClick={onClear}>
        清空筛选
      </button>
    </div>
  );
}
