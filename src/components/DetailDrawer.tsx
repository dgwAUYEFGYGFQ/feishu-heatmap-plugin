import { X } from 'lucide-react';
import type { ExceptionRecord, HeatmapBucket } from '../types';
import { formatValue } from '../utils/heatmap';

interface DetailDrawerProps {
  bucket?: HeatmapBucket;
  exceptions?: ExceptionRecord[];
  onClose: () => void;
}

export function DetailDrawer({ bucket, exceptions, onClose }: DetailDrawerProps) {
  const isException = Boolean(exceptions);

  return (
    <div className="drawer-mask" onClick={onClose}>
      <aside className="drawer" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <div className="drawer-title">{isException ? '异常记录' : bucket?.label}</div>
            <div className="drawer-subtitle">
              {isException ? `${exceptions?.length ?? 0} 条异常` : `热度 ${formatValue(bucket?.value ?? 0)}，覆盖 ${bucket?.recordCount ?? 0} 条`}
            </div>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        {isException ? (
          <div className="drawer-list">
            {(exceptions ?? []).map((item) => (
              <div className="detail-card" key={item.id}>
                <div className="detail-title">{item.title}</div>
                <div className="detail-meta danger">{item.reason}</div>
                <div className="detail-meta">记录 ID：{item.id}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="drawer-list">
            {(bucket?.details ?? []).map((item) => (
              <div className="detail-card" key={item.id}>
                <div className="detail-title">{item.title}</div>
                <div className="detail-meta">{item.startDate} 至 {item.endDate}</div>
                <div className="detail-columns">
                  <span>总值：{formatValue(item.value)}</span>
                  <span>每日：{formatValue(item.dailyValue)}</span>
                  <span>本格：{formatValue(item.bucketValue)}</span>
                </div>
                <div className="detail-meta">{[item.status, item.owner, item.group].filter(Boolean).join(' / ')}</div>
              </div>
            ))}
            {!bucket?.details.length && <div className="empty">当前日期范围没有覆盖记录</div>}
          </div>
        )}
      </aside>
    </div>
  );
}
