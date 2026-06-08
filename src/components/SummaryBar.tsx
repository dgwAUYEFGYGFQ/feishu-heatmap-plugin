import { AlertTriangle } from 'lucide-react';
import type { CalculationSummary } from '../types';
import { formatValue } from '../utils/heatmap';

interface SummaryBarProps {
  summary: CalculationSummary;
  onShowExceptions: () => void;
}

export function SummaryBar({ summary, onShowExceptions }: SummaryBarProps) {
  const exceptionCount = summary.exceptionRecords.length;

  return (
    <div className="summary-bar">
      <div className="summary-item">
        <span>总负荷</span>
        <strong>{formatValue(summary.totalLoad)} 人天</strong>
      </div>
      <div className="summary-item">
        <span>有效记录</span>
        <strong>{summary.calculatedRecords} 条</strong>
      </div>
      <button className={`summary-item exception-button ${exceptionCount > 0 ? 'has-exception' : ''}`} type="button" onClick={onShowExceptions}>
        {exceptionCount > 0 && <AlertTriangle size={14} />}
        <span>异常记录</span>
        <strong>{exceptionCount} 条</strong>
      </button>
    </div>
  );
}
