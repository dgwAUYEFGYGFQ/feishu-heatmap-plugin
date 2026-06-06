import type { HeatmapBucket } from '../types';
import { formatValue } from '../utils/heatmap';

interface HeatmapTooltipProps {
  bucket: HeatmapBucket;
  position: { x: number; y: number };
  locked: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClose: () => void;
  onOpenDetail: () => void;
}

export function HeatmapTooltip({
  bucket,
  position,
  locked,
  onMouseEnter,
  onMouseLeave,
  onClose,
  onOpenDetail,
}: HeatmapTooltipProps) {
  const width = 320;
  const viewportWidth = typeof window === 'undefined' ? 1440 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 900 : window.innerHeight;
  const left = Math.max(12, Math.min(position.x + 14, viewportWidth - width - 12));
  const top = Math.max(12, Math.min(position.y + 14, viewportHeight - 260));

  return (
    <div className="tooltip" style={{ left, top, width }} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <div className="tooltip-header">
        <div className="tooltip-title">{bucket.label}</div>
        {locked && (
          <button className="tooltip-close" type="button" onClick={onClose} aria-label="关闭悬浮明细">
            ×
          </button>
        )}
      </div>
      <div className="tooltip-grid">
        <span>热度值</span>
        <strong>{formatValue(bucket.value)}</strong>
        <span>覆盖记录</span>
        <strong>{bucket.recordCount} 条</strong>
      </div>
      {locked && (
        <button className="tooltip-detail-button" type="button" onClick={onOpenDetail}>
          查看完整明细
        </button>
      )}
      <div className="tooltip-list">
        {bucket.details.slice(0, 6).map((item) => (
          <div className="tooltip-item" key={item.id}>
            <div className="tooltip-item-title">{item.title}</div>
            <div>{item.startDate} 至 {item.endDate}</div>
            <div>总值 {formatValue(item.value)}，分摊 {formatValue(item.bucketValue)}</div>
            <div>{[item.status, item.owner].filter(Boolean).join(' / ')}</div>
          </div>
        ))}
        {bucket.details.length > 6 && <div className="tooltip-more">还有 {bucket.details.length - 6} 条，点击查看</div>}
      </div>
    </div>
  );
}
