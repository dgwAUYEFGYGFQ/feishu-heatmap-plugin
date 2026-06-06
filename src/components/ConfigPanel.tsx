import type { FieldKind, FieldMeta, HeatmapConfig, TableMeta } from '../types';

interface ConfigPanelProps {
  tables: TableMeta[];
  fields: FieldMeta[];
  draftConfig: HeatmapConfig;
  filterOptions: {
    statuses: string[];
    owners: string[];
    groups: string[];
  };
  saving: boolean;
  onChange: (patch: Partial<HeatmapConfig>) => void;
  onApply: () => void;
}

const monthCounts = [3, 6, 8, 12];

function optionFields(fields: FieldMeta[], kinds?: FieldKind[]): FieldMeta[] {
  return kinds ? fields.filter((field) => kinds.includes(field.kind)) : fields;
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

export function ConfigPanel({ tables, fields, draftConfig, filterOptions, saving, onChange, onApply }: ConfigPanelProps) {
  const dateFields = optionFields(fields, ['date']);
  const numberFields = optionFields(fields, ['number']);
  const valueFields = numberFields.length ? numberFields : fields;

  return (
    <aside className="config-panel">
      <div className="panel-title">配置</div>

      <section className="panel-section">
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
          已读取 {fields.length} 个字段，其中日期字段 {dateFields.length} 个，数字字段 {numberFields.length} 个
        </div>
        <SelectField label="开始日期字段" value={draftConfig.startDateFieldId} options={dateFields} onChange={(value) => onChange({ startDateFieldId: value })} />
        <SelectField label="结束日期字段" value={draftConfig.endDateFieldId} options={dateFields} onChange={(value) => onChange({ endDateFieldId: value })} />
        <SelectField label="计算字段" value={draftConfig.valueFieldId} options={valueFields} onChange={(value) => onChange({ valueFieldId: value })} />
        {!numberFields.length && fields.length > 0 && (
          <div className="field-hint warn">未识别到数字字段，计算字段暂时显示全部字段；请选择可转成数字的字段。</div>
        )}
        <SelectField label="标题字段" value={draftConfig.titleFieldId} options={fields} optional onChange={(value) => onChange({ titleFieldId: value || undefined })} />
        <SelectField label="状态字段" value={draftConfig.statusFieldId} options={fields} optional onChange={(value) => onChange({ statusFieldId: value || undefined })} />
        <SelectField label="负责人字段" value={draftConfig.ownerFieldId} options={fields} optional onChange={(value) => onChange({ ownerFieldId: value || undefined })} />
        <SelectField label="分组字段" value={draftConfig.groupFieldId} options={fields} optional onChange={(value) => onChange({ groupFieldId: value || undefined })} />
      </section>

      <section className="panel-section">
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
      </section>

      <section className="panel-section">
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
      </section>

      <section className="panel-section">
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
      </section>

      <section className="panel-section">
        <CheckboxFilter
          label="状态筛选"
          values={draftConfig.statusFilters}
          options={filterOptions.statuses}
          emptyText={draftConfig.statusFieldId ? '当前字段没有可筛选值' : '请先选择状态字段'}
          onChange={(statusFilters) => onChange({ statusFilters })}
        />
        <CheckboxFilter
          label="负责人筛选"
          values={draftConfig.ownerFilters}
          options={filterOptions.owners}
          emptyText={draftConfig.ownerFieldId ? '当前字段没有可筛选值' : '请先选择负责人字段'}
          onChange={(ownerFilters) => onChange({ ownerFilters })}
        />
        <CheckboxFilter
          label="分组筛选"
          values={draftConfig.groupFilters}
          options={filterOptions.groups}
          emptyText={draftConfig.groupFieldId ? '当前字段没有可筛选值' : '请先选择分组字段'}
          onChange={(groupFilters) => onChange({ groupFilters })}
        />
      </section>

      <button className="apply-button" type="button" onClick={onApply} disabled={saving}>
        {saving ? '保存中...' : '保存并应用'}
      </button>
    </aside>
  );
}
