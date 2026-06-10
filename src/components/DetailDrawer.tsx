import { X } from 'lucide-react';
import type { ExceptionRecord, HeatmapBucket, MatrixCell } from '../types';
import { formatValue } from '../utils/heatmap';

interface DetailDrawerProps {
  bucket?: HeatmapBucket;
  matrixCell?: MatrixCell;
  exceptions?: ExceptionRecord[];
  onClose: () => void;
}

export function DetailDrawer({ bucket, matrixCell, exceptions, onClose }: DetailDrawerProps) {
  const isException = Boolean(exceptions);
  const isMatrix = Boolean(matrixCell);

  return (
    <div className="drawer-mask" onClick={onClose}>
      <aside className="drawer" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <div className="drawer-title">{isException ? '异常记录' : isMatrix ? matrixCell?.rowName : bucket?.label}</div>
            <div className="drawer-subtitle">
              {isException
                ? `${exceptions?.length ?? 0} 条异常`
                : isMatrix
                  ? `系统 ${matrixCell?.columnName}，任务 ${matrixCell?.totalCount ?? 0} 条，延期 ${matrixCell?.delayedCount ?? 0} 条`
                  : `热度 ${formatValue(bucket?.value ?? 0)}，覆盖 ${bucket?.recordCount ?? 0} 条`}
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
                <div className="detail-columns">
                  <span>开始：{item.fieldValues?.start || '-'}</span>
                  <span>结束：{item.fieldValues?.end || '-'}</span>
                  <span>数值：{item.fieldValues?.value || '-'}</span>
                </div>
                <div className="detail-columns">
                  <span>标题raw：{item.debugValues?.rawTitleValue || '-'}</span>
                  <span>标题显示：{item.debugValues?.titleDisplay || item.title || '-'}</span>
                  <span>解析数值：{item.debugValues?.parsedValue || '-'}</span>
                </div>
                <div className="detail-columns">
                  <span>解析开始：{item.debugValues?.parsedStartDate || '-'}</span>
                  <span>解析结束：{item.debugValues?.parsedEndDate || '-'}</span>
                  <span>原因：{item.reason}</span>
                </div>
                <div className="detail-meta">recordId：{item.id}</div>
              </div>
            ))}
          </div>
        ) : isMatrix ? (
          <div className="drawer-list">
            <div className="detail-card">
              <div className="detail-title">{matrixCell?.rowName}</div>
              <div className="detail-columns">
                <span>分类：{matrixCell?.rowGroup || '-'}</span>
                <span>系统：{matrixCell?.columnName}</span>
                <span>总任务：{matrixCell?.totalCount ?? 0}</span>
                <span>正常：{matrixCell?.normalCount ?? 0}</span>
                <span>延期：{matrixCell?.delayedCount ?? 0}</span>
              </div>
            </div>
            {(matrixCell?.records ?? []).map((item) => (
              <div className={`detail-card ${item.delayed ? 'delayed' : ''}`} key={item.id}>
                <div className="detail-title">{item.title}</div>
                <div className="matrix-detail-fields">
                  {item.detailFields.length ? (
                    item.detailFields.map((field) => (
                      <div className="matrix-detail-field" key={field.fieldId} title={`${field.fieldName}：${field.value || '-'}`}>
                        <span>{field.fieldName}</span>
                        <b>{field.value || '-'}</b>
                      </div>
                    ))
                  ) : (
                    <>
                      <div className="matrix-detail-field" title={`状态：${item.status || '-'}`}>
                        <span>状态</span>
                        <b>{item.status || '-'}</b>
                      </div>
                      <div className="matrix-detail-field" title={`负责人：${item.owner || '-'}`}>
                        <span>负责人</span>
                        <b>{item.owner || '-'}</b>
                      </div>
                      <div className="matrix-detail-field" title={`开始：${item.startDate || '-'}`}>
                        <span>开始</span>
                        <b>{item.startDate || '-'}</b>
                      </div>
                      <div className="matrix-detail-field" title={`结束：${item.endDate || '-'}`}>
                        <span>结束</span>
                        <b>{item.endDate || '-'}</b>
                      </div>
                    </>
                  )}
                  <div className="matrix-detail-field">
                    <span>状态标记</span>
                    <b>{item.delayed ? '已延期' : '正常'}</b>
                  </div>
                </div>
              </div>
            ))}
            {!matrixCell?.records.length && <div className="empty">暂无相关任务</div>}
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
