import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { HeatmapBucket, HeatmapConfig } from '../types';
import { formatCellValue, formatValue, getBucketColor, getBucketLevel, getCellTextColor } from '../utils/heatmap';
import { HeatmapTooltip } from './HeatmapTooltip';

interface HeatmapProps {
  buckets: HeatmapBucket[];
  config: HeatmapConfig;
  onSelect: (bucket: HeatmapBucket) => void;
}

export function Heatmap({ buckets, config, onSelect }: HeatmapProps) {
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
    const maxBucketsInMonth = Math.max(1, ...grouped.map((group) => group.buckets.length));
    const rows = config.granularity === 'week' ? 4 : 7;
    const columns = Math.ceil(maxBucketsInMonth / rows);
    const minCellSize = config.granularity === 'week' ? 14 : 10;
    const maxCellSize = config.granularity === 'week' ? 46 : 28;
    const defaultCellSize = config.granularity === 'week' ? 28 : 18;
    const gap = 4;
    const monthGap = 14;
    const panelPadding = 24;
    const labelHeight = 21;
    const legendHeight = config.showLegend ? 24 : 0;
    const verticalChrome = panelPadding + labelHeight + legendHeight + 12;
    const horizontalChrome = panelPadding + Math.max(0, monthCount - 1) * monthGap;
    const availableWidth = Math.max(0, size.width - horizontalChrome);
    const availableHeight = Math.max(0, size.height - verticalChrome);
    const byWidth = Math.floor(availableWidth / Math.max(1, monthCount * columns));
    const byHeight = Math.floor(availableHeight / rows);
    const rawCellSize = size.width && size.height ? Math.min(byWidth, byHeight) - gap : defaultCellSize;
    const cellSize = Math.max(minCellSize, Math.min(maxCellSize, rawCellSize || defaultCellSize));
    const fontSize = cellSize > 22 ? 12 : cellSize >= 16 ? 10 : 0;
    return {
      cellSize,
      weekCellWidth: Math.max(config.showCellValue ? 36 : 24, Math.floor(cellSize * 1.85)),
      gap,
      fontSize,
      showInlineValue: config.showCellValue && cellSize >= 16,
    };
  }, [config.granularity, config.showCellValue, config.showLegend, grouped, size]);

  const activeTooltipKey = locked || hovered;
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
          '--heat-font-size': `${cellMetrics.fontSize}px`,
        } as CSSProperties
      }
    >
      <div className="heatmap-scroll">
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
                      if (!locked) setHovered(bucket.key);
                      setTooltipPos({ x: event.clientX, y: event.clientY });
                    }}
                    onMouseMove={(event) => {
                      if (!locked) setTooltipPos({ x: event.clientX, y: event.clientY });
                    }}
                    onMouseLeave={() => {
                      if (!locked) setHovered('');
                    }}
                    onFocus={() => {
                      if (!locked) setHovered(bucket.key);
                    }}
                    onBlur={() => {
                      if (!locked) setHovered('');
                    }}
                    onClick={(event) => {
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
          onOpenDetail={() => onSelect(tooltipBucket)}
        />
      )}
    </div>
  );
}
