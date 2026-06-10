import type { FieldKind, FieldMeta, HeatmapConfig, TableMeta } from '../types';
import type { QuickFilters } from '../utils/quickFilters';

interface ConfigPanelProps {
  tables: TableMeta[];
  fields: FieldMeta[];
  draftConfig: HeatmapConfig;
  filterOptions: {
    statuses: string[];
    owners: string[];
    groups: string[];
    timeFilters?: Array<{
      fieldId: string;
      fieldName: string;
      options: string[];
    }>;
    matrixFilters?: Array<{
      fieldId: string;
      fieldName: string;
      options: string[];
    }>;
  };
  quickFilters: QuickFilters;
  saving: boolean;
  onChange: (patch: Partial<HeatmapConfig>) => void;
  onQuickFilterChange: (fieldId: string, values: string[]) => void;
  onApply: () => void;
}

const monthCounts = [3, 6, 8, 12];

function optionFields(fields: FieldMeta[], kinds?: FieldKind[]): FieldMeta[] {
  return kinds ? fields.filter((field) => kinds.includes(field.kind)) : fields;
}

function isPotentialNumericField(field: FieldMeta): boolean {
  if (field.kind === 'number') return true;
  if (field.kind === 'formula' || field.kind === 'other') {
    return /人天|工时|负荷|数值|金额|数量|总计|合计|预估|估算|value|number|count|sum/i.test(field.name);
  }
  return /人天|工时|负荷|数值|金额|数量|总计|合计|预估|估算|value|number|count|sum/i.test(field.name);
}

function isPotentialDateField(field: FieldMeta): boolean {
  if (field.kind === 'date') return true;
  const rawMetaText = JSON.stringify({
    type: field.type,
    property: field.property,
    rawMeta: field.rawMeta,
  }).toLowerCase();
  const hasDateFormatMeta = /date|datetime|timestamp|yyyy|month|day/.test(rawMetaText);
  const hasDateName = /日期|时间|开始|结束|截止|月底|月末|计划|start|end|date|time/i.test(field.name);
  return (field.kind === 'formula' || field.kind === 'other') && (hasDateFormatMeta || hasDateName);
}

function SelectField({
  label,
  value,
  options,
  onChange,
  optional,
}: {
  label: string;
  value?: string;
  options: FieldMeta[];
  onChange: (value: string) => void;
  optional?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value ?? ''} onChange={(event) => onChange(event.target.value)}>
        {optional && <option value="">不选择</option>}
        {!optional && <option value="">请选择</option>}
        {options.map((field) => (
          <option key={field.id} value={field.id}>
            {field.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function CheckboxFilter({
  label,
  values,
  options,
  onChange,
  emptyText,
}: {
  label: string;
  values: string[];
  options: string[];
  onChange: (values: string[]) => void;
  emptyText: string;
}) {
  const toggleValue = (option: string) => {
    onChange(values.includes(option) ? values.filter((value) => value !== option) : [...values, option]);
  };

  return (
    <div className="filter-box">
      <div className="filter-head">
        <span>{label}</span>
        {values.length > 0 && (
          <button type="button" onClick={() => onChange([])}>
            清空
          </button>
        )}
      </div>
      {options.length ? (
        <div className="filter-options">
          {options.map((option) => (
            <label className="filter-option" key={option}>
              <input type="checkbox" checked={values.includes(option)} onChange={() => toggleValue(option)} />
              <span>{option}</span>
            </label>
          ))}
        </div>
      ) : (
        <div className="filter-empty">{emptyText}</div>
      )}
    </div>
  );
}

export function ConfigPanel({ tables, fields, draftConfig, filterOptions, quickFilters, saving, onChange, onQuickFilterChange, onApply }: ConfigPanelProps) {
  const dateFields = fields.filter(isPotentialDateField);
  const numberFields = optionFields(fields, ['number']);
  const valueFields = fields.filter(isPotentialNumericField);
  const visibleValueFields = valueFields.length ? valueFields : fields;
  const isMatrix = draftConfig.heatmapType === 'matrix';
  const timeFilterFieldIds = draftConfig.timeFilterFieldIds ?? [];
  const addedTimeFilterFieldIds = new Set(timeFilterFieldIds);
  const availableTimeFilterFields = fields.filter((field) => !addedTimeFilterFieldIds.has(field.id));
  const matrixDetailFields = draftConfig.matrixDetailFields ?? [];
  const addedDetailFieldIds = new Set(matrixDetailFields.map((item) => item.fieldId));
  const availableDetailFields = fields.filter((field) => !addedDetailFieldIds.has(field.id));
  const fieldNameOf = (fieldId: string) => fields.find((field) => field.id === fieldId)?.name ?? '未知字段';
  const moveTimeFilterField = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= timeFilterFieldIds.length) return;
    const nextFields = [...timeFilterFieldIds];
    [nextFields[index], nextFields[nextIndex]] = [nextFields[nextIndex], nextFields[index]];
    onChange({ timeFilterFieldIds: nextFields });
  };
  const removeTimeFilterField = (index: number) => {
    onChange({ timeFilterFieldIds: timeFilterFieldIds.filter((_, itemIndex) => itemIndex !== index) });
  };
  const updateMatrixDetailField = (index: number, patch: Partial<(typeof matrixDetailFields)[number]>) => {
    onChange({
      matrixDetailFields: matrixDetailFields.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    });
  };
  const moveMatrixDetailField = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= matrixDetailFields.length) return;
    const nextFields = [...matrixDetailFields];
    [nextFields[index], nextFields[nextIndex]] = [nextFields[nextIndex], nextFields[index]];
    onChange({ matrixDetailFields: nextFields });
  };
  const removeMatrixDetailField = (index: number) => {
    onChange({ matrixDetailFields: matrixDetailFields.filter((_, itemIndex) => itemIndex !== index) });
  };

  return (
    <aside className="config-panel">
      <div className="panel-title">配置</div>

      <section className="panel-section">
        <label className="field">
          <span>热力图类型</span>
          <select value={draftConfig.heatmapType} onChange={(event) => onChange({ heatmapType: event.target.value as HeatmapConfig['heatmapType'] })}>
            <option value="time">时间负荷热力图</option>
            <option value="matrix">矩阵状态热力图</option>
          </select>
        </label>
        <label className="field">
          <span>数据表</span>
          <select value={draftConfig.tableId} onChange={(event) => onChange({ tableId: event.target.value })}>
            {tables.map((table) => (
              <option key={table.id} value={table.id}>
                {table.name}
              </option>
            ))}
          </select>
        </label>
        <div className="field-hint">
          已读取 {fields.length} 个字段，其中日期字段 {dateFields.length} 个，数字/可转数字字段 {valueFields.length || numberFields.length} 个
        </div>
        {!isMatrix && (
          <>
            <SelectField label="开始日期字段" value={draftConfig.startDateFieldId} options={dateFields} onChange={(value) => onChange({ startDateFieldId: value })} />
            <SelectField label="结束日期字段" value={draftConfig.endDateFieldId} options={dateFields} onChange={(value) => onChange({ endDateFieldId: value })} />
            <SelectField label="计算字段" value={draftConfig.valueFieldId} options={visibleValueFields} onChange={(value) => onChange({ valueFieldId: value })} />
            {!valueFields.length && fields.length > 0 && (
              <div className="field-hint warn">未识别到数字或可转数字字段，计算字段暂时显示全部字段；请选择可转成数字的字段。</div>
            )}
            <SelectField label="标题字段" value={draftConfig.titleFieldId} options={fields} optional onChange={(value) => onChange({ titleFieldId: value || undefined })} />
            <SelectField label="状态字段" value={draftConfig.statusFieldId} options={fields} optional onChange={(value) => onChange({ statusFieldId: value || undefined })} />
            <SelectField label="负责人字段" value={draftConfig.ownerFieldId} options={fields} optional onChange={(value) => onChange({ ownerFieldId: value || undefined })} />
            <SelectField label="分组字段" value={draftConfig.groupFieldId} options={fields} optional onChange={(value) => onChange({ groupFieldId: value || undefined })} />
          </>
        )}
      </section>

      {isMatrix && (
        <>
          <section className="panel-section">
            <div className="section-label">矩阵结构</div>
            <SelectField label="行分组字段" value={draftConfig.matrixRowGroupFieldId} options={fields} optional onChange={(value) => onChange({ matrixRowGroupFieldId: value || undefined })} />
            <SelectField label="行名称字段" value={draftConfig.matrixRowNameFieldId} options={fields} onChange={(value) => onChange({ matrixRowNameFieldId: value })} />
            <SelectField label="列维度字段" value={draftConfig.matrixColumnFieldId} options={fields} onChange={(value) => onChange({ matrixColumnFieldId: value })} />
          </section>

          <section className="panel-section">
            <div className="section-label">状态规则</div>
            <SelectField label="状态字段" value={draftConfig.statusFieldId} options={fields} onChange={(value) => onChange({ statusFieldId: value })} />
            <CheckboxFilter
              label="延期状态值"
              values={draftConfig.matrixDelayedStatusValues}
              options={filterOptions.statuses}
              emptyText={draftConfig.statusFieldId ? '当前状态字段没有可选值' : '请先选择状态字段'}
              onChange={(matrixDelayedStatusValues) => onChange({ matrixDelayedStatusValues })}
            />
          </section>

          <section className="panel-section">
            <div className="section-label">明细字段</div>
            <div className="field-hint">添加到这里的字段会用于格子明细展示；勾选“用作筛选”后，会自动出现在筛选区。</div>
            <div className="matrix-detail-list">
              {matrixDetailFields.map((item, index) => (
                <div className="matrix-detail-row" key={`${item.fieldId}-${index}`}>
                  <select
                    value={item.fieldId}
                    onChange={(event) => {
                      const nextFieldId = event.target.value;
                      if (!nextFieldId || addedDetailFieldIds.has(nextFieldId)) return;
                      updateMatrixDetailField(index, { fieldId: nextFieldId });
                    }}
                  >
                    <option value={item.fieldId}>{fieldNameOf(item.fieldId)}</option>
                    {availableDetailFields.map((field) => (
                      <option key={field.id} value={field.id}>
                        {field.name}
                      </option>
                    ))}
                  </select>
                  <label>
                    <input type="checkbox" checked={item.showInDetail} onChange={(event) => updateMatrixDetailField(index, { showInDetail: event.target.checked })} />
                    <span>明细展示</span>
                  </label>
                  <label>
                    <input type="checkbox" checked={item.enableFilter} onChange={(event) => updateMatrixDetailField(index, { enableFilter: event.target.checked })} />
                    <span>用作筛选</span>
                  </label>
                  <div className="matrix-detail-actions">
                    <button type="button" disabled={index === 0} onClick={() => moveMatrixDetailField(index, -1)}>上移</button>
                    <button type="button" disabled={index === matrixDetailFields.length - 1} onClick={() => moveMatrixDetailField(index, 1)}>下移</button>
                    <button type="button" onClick={() => removeMatrixDetailField(index)}>删除</button>
                  </div>
                </div>
              ))}
            </div>
            <label className="field">
              <span>添加字段</span>
              <select
                value=""
                onChange={(event) => {
                  const fieldId = event.target.value;
                  if (!fieldId) return;
                  onChange({
                    matrixDetailFields: [
                      ...matrixDetailFields,
                      { fieldId, showInDetail: true, enableFilter: true },
                    ],
                  });
                }}
              >
                <option value="">请选择要添加的字段</option>
                {availableDetailFields.map((field) => (
                  <option key={field.id} value={field.id}>
                    {field.name}
                  </option>
                ))}
              </select>
            </label>
          </section>
        </>
      )}

      {!isMatrix && <section className="panel-section">
        <label className="field">
          <span>日期统计方式</span>
          <select value={draftConfig.statisticMode} onChange={(event) => onChange({ statisticMode: event.target.value as HeatmapConfig['statisticMode'] })}>
            <option value="calendar">按自然日统计</option>
            <option value="workday">仅按工作日统计</option>
          </select>
        </label>
        <label className="field">
          <span>统计粒度</span>
          <select value={draftConfig.granularity} onChange={(event) => onChange({ granularity: event.target.value as HeatmapConfig['granularity'] })}>
            <option value="day">按天</option>
            <option value="week">按周</option>
          </select>
        </label>
      </section>}

      {!isMatrix && <section className="panel-section">
        <label className="field">
          <span>显示范围</span>
          <select value={draftConfig.rangeMode} onChange={(event) => onChange({ rangeMode: event.target.value as HeatmapConfig['rangeMode'] })}>
            <option value="month">按月份</option>
            <option value="custom">自定义</option>
          </select>
        </label>
        {draftConfig.rangeMode === 'month' ? (
          <>
            <label className="field">
              <span>起始月份</span>
              <input type="month" value={draftConfig.startMonth} onChange={(event) => onChange({ startMonth: event.target.value })} />
            </label>
            <label className="field">
              <span>显示月份数</span>
              <select value={draftConfig.monthCount} onChange={(event) => onChange({ monthCount: Number(event.target.value) })}>
                {monthCounts.map((count) => (
                  <option key={count} value={count}>
                    {count}个月
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <>
            <label className="field">
              <span>自定义开始日期</span>
              <input type="date" value={draftConfig.customStartDate} onChange={(event) => onChange({ customStartDate: event.target.value })} />
            </label>
            <label className="field">
              <span>自定义结束日期</span>
              <input type="date" value={draftConfig.customEndDate} onChange={(event) => onChange({ customEndDate: event.target.value })} />
            </label>
          </>
        )}
      </section>}

      {!isMatrix && <section className="panel-section">
        <div className="section-label">显示设置</div>
        <div className="section-label">颜色区间</div>
        {draftConfig.colorStops.map((stop, index) => (
          <div className="color-row" key={`${stop.color}-${index}`}>
            <input type="number" step="0.1" value={stop.min} onChange={(event) => {
              const colorStops = [...draftConfig.colorStops];
              colorStops[index] = { ...stop, min: Number(event.target.value) };
              onChange({ colorStops });
            }} />
            <input type="number" step="0.1" value={stop.max} onChange={(event) => {
              const colorStops = [...draftConfig.colorStops];
              colorStops[index] = { ...stop, max: Number(event.target.value) };
              onChange({ colorStops });
            }} />
            <input type="color" value={stop.color} onChange={(event) => {
              const colorStops = [...draftConfig.colorStops];
              colorStops[index] = { ...stop, color: event.target.value };
              onChange({ colorStops });
            }} />
          </div>
        ))}
        <label className="checkbox">
          <input type="checkbox" checked={draftConfig.showLegend} onChange={(event) => onChange({ showLegend: event.target.checked })} />
          <span>显示图例</span>
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={draftConfig.showCellValue} onChange={(event) => onChange({ showCellValue: event.target.checked })} />
          <span>显示格子数值</span>
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={draftConfig.showQuickFilters} onChange={(event) => onChange({ showQuickFilters: event.target.checked })} />
          <span>显示快捷筛选栏</span>
        </label>
      </section>}

      {!isMatrix && (
        <section className="panel-section">
          <div className="section-label">筛选字段</div>
          <div className="field-hint">添加到这里的字段会出现在右侧筛选区；开启快捷筛选栏后，也会显示在顶部。</div>
          <div className="matrix-detail-list">
            {timeFilterFieldIds.map((fieldId, index) => (
              <div className="matrix-detail-row" key={`${fieldId}-${index}`}>
                <select
                  value={fieldId}
                  onChange={(event) => {
                    const nextFieldId = event.target.value;
                    if (!nextFieldId || addedTimeFilterFieldIds.has(nextFieldId)) return;
                    onChange({ timeFilterFieldIds: timeFilterFieldIds.map((item, itemIndex) => (itemIndex === index ? nextFieldId : item)) });
                  }}
                >
                  <option value={fieldId}>{fieldNameOf(fieldId)}</option>
                  {availableTimeFilterFields.map((field) => (
                    <option key={field.id} value={field.id}>
                      {field.name}
                    </option>
                  ))}
                </select>
                <div className="matrix-detail-actions">
                  <button type="button" disabled={index === 0} onClick={() => moveTimeFilterField(index, -1)}>上移</button>
                  <button type="button" disabled={index === timeFilterFieldIds.length - 1} onClick={() => moveTimeFilterField(index, 1)}>下移</button>
                  <button type="button" onClick={() => removeTimeFilterField(index)}>删除</button>
                </div>
              </div>
            ))}
          </div>
          <label className="field">
            <span>添加筛选字段</span>
            <select
              value=""
              onChange={(event) => {
                const fieldId = event.target.value;
                if (!fieldId) return;
                onChange({ timeFilterFieldIds: [...timeFilterFieldIds, fieldId] });
              }}
            >
              <option value="">请选择要添加的字段</option>
              {availableTimeFilterFields.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.name}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}

      {isMatrix && (
        <section className="panel-section">
          <div className="section-label">显示设置</div>
          <label className="checkbox">
            <input type="checkbox" checked={draftConfig.matrixShowEmptyCells} onChange={(event) => onChange({ matrixShowEmptyCells: event.target.checked })} />
            <span>显示空白格子</span>
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={draftConfig.matrixShowCellCount} onChange={(event) => onChange({ matrixShowCellCount: event.target.checked })} />
            <span>显示格子任务数</span>
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={draftConfig.showQuickFilters} onChange={(event) => onChange({ showQuickFilters: event.target.checked })} />
            <span>显示快捷筛选栏</span>
          </label>
        </section>
      )}

      {isMatrix ? (
        <section className="panel-section">
          <div className="section-label">筛选设置</div>
          {filterOptions.matrixFilters?.length ? (
            filterOptions.matrixFilters.map((filter) => (
              <CheckboxFilter
                key={filter.fieldId}
                label={`${filter.fieldName}筛选`}
                values={quickFilters[filter.fieldId] ?? []}
                options={filter.options}
                emptyText="当前字段没有可筛选值"
                onChange={(values) => onQuickFilterChange(filter.fieldId, values)}
              />
            ))
          ) : (
            <div className="filter-empty">请在明细字段中勾选“用作筛选”</div>
          )}
        </section>
      ) : (
        <section className="panel-section">
          <div className="section-label">筛选设置</div>
          {filterOptions.timeFilters?.length ? (
            filterOptions.timeFilters.map((filter) => (
              <CheckboxFilter
                key={filter.fieldId}
                label={`${filter.fieldName}筛选`}
                values={quickFilters[filter.fieldId] ?? []}
                options={filter.options}
                emptyText="当前字段没有可筛选值"
                onChange={(values) => onQuickFilterChange(filter.fieldId, values)}
              />
            ))
          ) : (
            <div className="filter-empty">请先添加筛选字段</div>
          )}
        </section>
      )}

      <button className="apply-button" type="button" onClick={onApply} disabled={saving}>
        {saving ? '保存中...' : '保存并应用'}
      </button>
    </aside>
  );
}
