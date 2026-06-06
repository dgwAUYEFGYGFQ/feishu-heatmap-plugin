import { AlertTriangle } from 'lucide-react';
import type { CalculationSummary } from '../types';

interface SummaryBarProps {
  summary: CalculationSummary;
  onShowExceptions: () => void;
}

export function SummaryBar({ summary, onShowExceptions }: SummaryBarProps) {
  return (
    <div className="summary-bar">
      <div className="summary-item">
        <span>总记录</span>
        <strong>{summary.totalRecords}</strong>
      </div>
      <div className="summary-item">
        <span>已计算</span>
        <strong>{summary.calculatedRecords}</strong>
      </div>
      <button className="summary-item exception-button" type="button" onClick={onShowExceptions}>
        <AlertTriangle size={16} />
        <span>异常</span>
        <strong>{summary.exceptionRecords.length}</strong>
      </button>
    </div>
  );
}
