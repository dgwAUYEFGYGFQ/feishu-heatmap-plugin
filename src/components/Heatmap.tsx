import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { HeatmapBucket, HeatmapConfig } from '../types';
import { formatCellValue, formatValue, getBucketColor, getBucketLevel, getCellTextColor } from '../utils/heatmap';
import { HeatmapTooltip } from './HeatmapTooltip';

interface HeatmapProps {
  buckets: HeatmapBucket[];
  config: HeatmapConfig;
  onSelect: (bucket: HeatmapBucket) => void;
  resetSignal?: number;
  detailOpen?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function Heatmap({ buckets, config, onSelect, resetSignal, detailOpen }: HeatmapProps) {
  const [hovered, setHovered] = useState<string>('');
  const [locked, setLocked] = useState<string>('');
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const rect = entry.contentRect;
      setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setHovered('');
    setLocked('');
  }, [resetSignal, buckets, config.tableId, config.startDateFieldId, config.endDateFieldId, config.valueFieldId, config.granularity, config.statisticMode]);

  const grouped = buckets.reduce<Array<{ month: string; buckets: HeatmapBucket[] }>>((acc, bucket) => {
    const last = acc[acc.length - 1];
    if (last?.month === bucket.monthLabel) {
      last.buckets.push(bucket);
    } else {
      acc.push({ month: bucket.monthLabel, buckets: [bucket] });
    }
    return acc;
  }, []);

  const cellMetrics = useMemo(() => {
    const monthCount = Math.max(1, grouped.length);
    const rows = config.granularity === 'week' ? 4 : 7;
    const monthColumns = grouped.map((group) => Math.max(1, Math.ceil(group.buckets.length / rows)));
    const totalMonthColumns = Math.max(1, monthColumns.reduce((sum, columns) => sum + columns, 0));
    const totalColumnGaps = monthColumns.reduce((sum, columns) => sum + Math.max(0, columns - 1), 0);
    const minCellSize = 10;
    const maxCellSize = 42;
    const defaultCellSize = 18;
    const cellWidthRatio = config.granularity === 'week' ? 1.85 : 1;
    const scrollPaddingX = 24;
    const scrollPaddingY = 24;
    const wrapGap = config.showLegend ? 12 : 0;
    const legendHeight = config.showLegend ? 24 : 0;
    const availableWidth = Math.max(0, size.width - scrollPaddingX);
    const availableHeight = Math.max(0, size.height - scrollPaddingY - wrapGap - legendHeight);

    const metricsForCell = (candidate: number) => {
      const gap = Math.round(clamp(candidate * 0.22, 3, 8));
      const monthGap = Math.round(clamp(candidate * 1.2, 16, 48));
      const monthFontSize = Math.round(clamp(candidate * 0.58, 13, 18));
      const monthTitleHeight = monthFontSize + 8;
      const cellWidth = config.granularity === 'week' ? Math.round(candidate * cellWidthRatio) : candidate;
      const requiredWidth =
        totalMonthColumns * cellWidth +
        totalColumnGaps * gap +
        Math.max(0, monthCount - 1) * monthGap;
      const requiredHeight = monthTitleHeight + rows * candidate + Math.max(0, rows - 1) * gap;
      return { gap, monthGap, monthFontSize, monthTitleHeight, cellWidth, requiredWidth, requiredHeight };
    };

    let cellSize = defaultCellSize;
    let foundSizeThatFitsBothAxes = false;
    for (let candidate = maxCellSize; candidate >= minCellSize; candidate -= 1) {
      const metrics = metricsForCell(candidate);
      if (metrics.requiredWidth <= availableWidth && metrics.requiredHeight <= availableHeight) {
        cellSize = candidate;
        foundSizeThatFitsBothAxes = true;
        break;
      }
    }

    if (!foundSizeThatFitsBothAxes) {
      for (let candidate = maxCellSize; candidate >= minCellSize; candidate -= 1) {
        const metrics = metricsForCell(candidate);
        if (metrics.requiredHeight <= availableHeight) {
          cellSize = candidate;
          break;
        }
      }
    }

    const metrics = metricsForCell(cellSize);
    const fontSize = cellSize >= 34 ? 14 : cellSize >= 24 ? 12 : cellSize >= 16 ? 10 : 0;
    return {
      cellSize,
      weekCellWidth: metrics.cellWidth,
      gap: metrics.gap,
      monthGap: metrics.monthGap,
      monthFontSize: metrics.monthFontSize,
      monthTitleHeight: metrics.monthTitleHeight,
      fontSize,
      isMaxed: cellSize >= maxCellSize,
      contentFitsWidth: metrics.requiredWidth <= availableWidth,
      contentFitsHeight: metrics.requiredHeight <= availableHeight,
      showInlineValue: config.showCellValue && cellSize >= 16,
    };
  }, [config.granularity, config.showCellValue, config.showLegend, grouped, size]);

  const activeTooltipKey = detailOpen ? '' : locked || hovered;
  const tooltipBucket = activeTooltipKey ? buckets.find((bucket) => bucket.key === activeTooltipKey) : undefined;

  return (
    <div
      className="heatmap-wrap"
      ref={wrapRef}
      style={
        {
          '--heat-cell-size': `${cellMetrics.cellSize}px`,
          '--heat-week-cell-width': `${cellMetrics.weekCellWidth}px`,
          '--heat-gap': `${cellMetrics.gap}px`,
          '--heat-month-gap': `${cellMetrics.monthGap}px`,
          '--heat-month-font-size': `${cellMetrics.monthFontSize}px`,
          '--heat-month-title-height': `${cellMetrics.monthTitleHeight}px`,
          '--heat-font-size': `${cellMetrics.fontSize}px`,
        } as CSSProperties
      }
    >
      <div
        className={`heatmap-scroll ${cellMetrics.isMaxed && cellMetrics.contentFitsWidth ? 'is-centered-x' : ''} ${cellMetrics.isMaxed && cellMetrics.contentFitsHeight ? 'is-centered-y' : ''}`}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setLocked('');
            setHovered('');
          }
        }}
      >
        {grouped.map((group) => (
          <div className="month-group" key={group.month}>
            <div className="month-label">{group.month}</div>
            <div className={`heatmap-grid ${config.granularity === 'week' ? 'week-grid' : ''}`}>
              {group.buckets.map((bucket) => {
                const level = getBucketLevel(bucket.value, config.colorStops);
                const cellValue = formatCellValue(bucket.value);
                return (
                  <button
                    key={bucket.key}
                    type="button"
                    className="heat-cell"
                    style={{
                      backgroundColor: getBucketColor(bucket.value, config.colorStops),
                      color: getCellTextColor(level),
                    }}
                    onMouseEnter={(event) => {
                      if (detailOpen) return;
                      if (!locked) setHovered(bucket.key);
                      setTooltipPos({ x: event.clientX, y: event.clientY });
                    }}
                    onMouseMove={(event) => {
                      if (detailOpen) return;
                      if (!locked) setTooltipPos({ x: event.clientX, y: event.clientY });
                    }}
                    onMouseLeave={() => {
                      if (!locked) setHovered('');
                    }}
                    onFocus={() => {
                      if (detailOpen) return;
                      if (!locked) setHovered(bucket.key);
                    }}
                    onBlur={() => {
                      if (!locked) setHovered('');
                    }}
                    onClick={(event) => {
                      if (detailOpen) {
                        setLocked('');
                        setHovered('');
                        onSelect(bucket);
                        return;
                      }
                      setTooltipPos({ x: event.clientX, y: event.clientY });
                      setLocked((current) => (current === bucket.key ? '' : bucket.key));
                    }}
                    aria-label={`${bucket.label}，热度 ${formatValue(bucket.value)}`}
                  >
                    {cellMetrics.showInlineValue && cellValue && <span>{cellValue}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {config.showLegend && (
        <div className="legend">
          <span>低</span>
          {config.colorStops.map((stop) => (
            <div className="legend-item" key={`${stop.min}-${stop.max}-${stop.color}`}>
              <i style={{ backgroundColor: stop.color }} />
              <span>{stop.min}-{stop.max}</span>
            </div>
          ))}
          <span>高</span>
        </div>
      )}
      {tooltipBucket && (
        <HeatmapTooltip
          bucket={tooltipBucket}
          position={tooltipPos}
          locked={Boolean(locked)}
          onMouseEnter={() => setHovered(activeTooltipKey)}
          onMouseLeave={() => {
            if (!locked) setHovered('');
          }}
          onClose={() => {
            setLocked('');
            setHovered('');
          }}
          onOpenDetail={() => {
            setLocked('');
            setHovered('');
            onSelect(tooltipBucket);
          }}
        />
      )}
    </div>
  );
}
