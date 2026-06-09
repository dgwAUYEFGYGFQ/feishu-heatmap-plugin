import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { MatrixCell, MatrixHeatmapData } from '../types';

interface MatrixHeatmapProps {
  data: MatrixHeatmapData;
  showCellCount: boolean;
  onSelect: (cell: MatrixCell) => void;
}

interface MatrixLayout {
  rowHeight: number;
  columnWidth: number;
  cellSize: number;
  cellGap: number;
  groupWidth: number;
  issueWidth: number;
  headerHeight: number;
  cellFontSize: number;
  headerFontSize: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getCellFontSize(cellSize: number): number {
  if (cellSize < 14) return 0;
  if (cellSize < 18) return 9;
  if (cellSize < 22) return 10;
  if (cellSize < 28) return 11;
  return 13;
}

function calculateMatrixLayout(width: number, height: number, rowCount: number, columnCount: number, longestColumnNameLength: number): MatrixLayout {
  const safeWidth = Math.max(width, 360);
  const safeHeight = Math.max(height, 240);
  const sizeBase = Math.min(safeWidth, safeHeight);
  const cellGap = clamp(Math.round(sizeBase / 280), 2, 5);
  const widthScale = clamp(safeWidth / 1000, 0.75, 1.35);
  const heightScale = clamp(safeHeight / 540, 0.75, 1.35);
  const groupWidth = clamp(Math.round(110 * widthScale), 80, 150);
  const issueWidth = clamp(Math.round(260 * widthScale), 180, 360);
  const headerFontSize = clamp(Math.round(11 * heightScale), 10, 14);
  const headerHeight = clamp(Math.round(longestColumnNameLength * headerFontSize * 0.9 + 28), 88, 220);
  const legendReserve = 28;
  const verticalPadding = 8;
  const horizontalPadding = 8;
  const matrixAreaWidth = Math.max(0, safeWidth - groupWidth - issueWidth - horizontalPadding);
  const columnFit = columnCount > 0 ? Math.floor((matrixAreaWidth - Math.max(columnCount - 1, 0) * cellGap) / columnCount) : 30;
  const columnWidth = clamp(columnFit || Math.round(30 * widthScale), 24, 44);
  const availableRowsHeight = Math.max(0, safeHeight - headerHeight - legendReserve - verticalPadding);
  const rowFit = rowCount > 0 ? Math.floor((availableRowsHeight - Math.max(rowCount - 1, 0) * cellGap) / rowCount) : 28;
  const rowHeight = clamp(rowFit || Math.round(28 * heightScale), 22, 38);
  const cellSize = clamp(Math.min(rowHeight - 6, columnWidth - 6), 14, 32);

  return {
    rowHeight,
    columnWidth,
    cellSize,
    cellGap,
    groupWidth,
    issueWidth,
    headerHeight,
    cellFontSize: getCellFontSize(cellSize),
    headerFontSize,
  };
}

function formatCount(value: number): string {
  return value >= 100 ? '99+' : String(value);
}

function formatMatrixCellLabel(cell: MatrixCell, cellSize: number, showCellCount: boolean): string {
  if (!showCellCount || cell.totalCount === 0) return '';
  if (cellSize < 14) return '';
  if (cell.status === 'normal') return formatCount(cell.totalCount);
  if (cell.status === 'delayed') {
    if (cellSize < 26) return formatCount(cell.delayedCount);
    const full = `${cell.delayedCount}/${cell.totalCount}`;
    return full.length <= 4 ? full : formatCount(cell.delayedCount);
  }
  return '';
}

function cellTitle(cell: MatrixCell): string {
  if (cell.totalCount === 0) return `专题：${cell.rowName}\n系统：${cell.columnName}\n暂无相关任务`;
  return `专题：${cell.rowName}\n系统：${cell.columnName}\n总任务数：${cell.totalCount}\n延期任务数：${cell.delayedCount}\n正常任务数：${cell.normalCount}\n延期 ${cell.delayedCount} / 总数 ${cell.totalCount}\n状态：${cell.delayedCount > 0 ? '存在延期任务' : '正常'}`;
}

export function MatrixHeatmap({ data, showCellCount, onSelect }: MatrixHeatmapProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [hoveredCell, setHoveredCell] = useState<{ rowKey: string; columnKey: string } | null>(null);
  const cellMap = new Map(data.cells.map((cell) => [cell.key, cell]));
  const longestColumnNameLength = Math.max(0, ...data.columns.map((column) => column.name.length));
  const [layout, setLayout] = useState<MatrixLayout>(() => calculateMatrixLayout(900, 420, data.rows.length, data.columns.length, longestColumnNameLength));
  const rowGroups = data.rows.reduce<Array<{ key: string; name: string; startIndex: number; rows: typeof data.rows }>>((groups, row, index) => {
    const groupName = row.group || '未分组';
    const current = groups[groups.length - 1];
    if (current?.name === groupName) {
      current.rows.push(row);
    } else {
      groups.push({ key: `${groupName}-${index}`, name: groupName, startIndex: index, rows: [row] });
    }
    return groups;
  }, []);

  useEffect(() => {
    const element = panelRef.current;
    if (!element) return undefined;
    const updateLayout = (width: number, height: number) => {
      setLayout(calculateMatrixLayout(width, height, data.rows.length, data.columns.length, longestColumnNameLength));
    };
    const observer = new ResizeObserver(([entry]) => {
      updateLayout(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(element);
    updateLayout(element.clientWidth, element.clientHeight);
    return () => observer.disconnect();
  }, [data.columns.length, data.rows.length, longestColumnNameLength]);

  const layoutStyle = {
    '--matrix-row-height': `${layout.rowHeight}px`,
    '--matrix-col-width': `${layout.columnWidth}px`,
    '--matrix-cell-size': `${layout.cellSize}px`,
    '--matrix-cell-gap': `${layout.cellGap}px`,
    '--matrix-group-width': `${layout.groupWidth}px`,
    '--matrix-issue-width': `${layout.issueWidth}px`,
    '--matrix-header-height': `${layout.headerHeight}px`,
    '--matrix-cell-font-size': `${layout.cellFontSize}px`,
    '--matrix-header-font-size': `${layout.headerFontSize}px`,
  } as CSSProperties;

  if (!data.rows.length || !data.columns.length) {
    return <div className="empty">请选择行名称字段、列维度字段和状态字段后生成矩阵状态热力图</div>;
  }

  return (
    <div className="matrix-panel" ref={panelRef} style={layoutStyle} onMouseLeave={() => setHoveredCell(null)}>
      <div className="matrix-scroll">
        <div
          className="matrix-grid"
          style={{
            gridTemplateColumns: `var(--matrix-group-width) var(--matrix-issue-width) repeat(${data.columns.length}, var(--matrix-col-width))`,
            gridTemplateRows: `var(--matrix-header-height) repeat(${data.rows.length}, var(--matrix-row-height))`,
          }}
        >
          <div className="matrix-corner matrix-sticky matrix-sticky-top matrix-sticky-left" style={{ gridColumn: 1, gridRow: 1 }}>分类</div>
          <div className="matrix-corner matrix-sticky matrix-sticky-top matrix-sticky-name" style={{ gridColumn: 2, gridRow: 1 }}>关键议题</div>
          {data.columns.map((column, columnIndex) => (
            <div
              className={`matrix-column matrix-sticky matrix-sticky-top ${hoveredCell?.columnKey === column.key ? 'is-column-hovered' : ''}`}
              key={column.key}
              title={column.name}
              style={{ gridColumn: columnIndex + 3, gridRow: 1 }}
            >
              {column.name}
            </div>
          ))}

          {rowGroups.map((group) => (
            <div
              className={`matrix-row-group matrix-group-merged matrix-sticky matrix-sticky-left ${group.rows.some((row) => row.key === hoveredCell?.rowKey) ? 'is-row-hovered' : ''}`}
              key={group.key}
              title={group.name}
              style={{ gridColumn: 1, gridRow: `${group.startIndex + 2} / span ${group.rows.length}` }}
            >
              {group.name}
            </div>
          ))}

          {data.rows.map((row, rowIndex) => (
            <div className="matrix-row-fragment" key={row.key}>
              <div className={`matrix-row-name matrix-sticky matrix-sticky-name ${hoveredCell?.rowKey === row.key ? 'is-row-hovered' : ''}`} title={row.name} style={{ gridColumn: 2, gridRow: rowIndex + 2 }}>
                {row.name}
              </div>
              {data.columns.map((column, columnIndex) => {
                const cell = cellMap.get(`${row.key}::${column.key}`);
                const style = { gridColumn: columnIndex + 3, gridRow: rowIndex + 2 };
                const isRowHovered = hoveredCell?.rowKey === row.key;
                const isColumnHovered = hoveredCell?.columnKey === column.key;
                const isCurrentHovered = isRowHovered && isColumnHovered;
                const hoverClassName = `${isRowHovered ? 'is-row-hovered' : ''} ${isColumnHovered ? 'is-column-hovered' : ''} ${isCurrentHovered ? 'is-hovered' : ''}`;
                if (!cell) {
                  return (
                    <div
                      className={`matrix-cell-placeholder ${hoverClassName}`}
                      key={column.key}
                      style={style}
                      onMouseEnter={() => setHoveredCell({ rowKey: row.key, columnKey: column.key })}
                    />
                  );
                }
                return (
                  <button
                    className={`matrix-cell ${cell.status === 'empty' ? 'is-empty' : cell.status} ${hoverClassName}`}
                    key={column.key}
                    type="button"
                    title={cellTitle(cell)}
                    style={style}
                    disabled={cell.totalCount === 0}
                    onMouseEnter={() => setHoveredCell({ rowKey: row.key, columnKey: column.key })}
                    onClick={() => {
                      if (cell.totalCount > 0) onSelect(cell);
                    }}
                  >
                    <span className="matrix-cell-label">{formatMatrixCellLabel(cell, layout.cellSize, showCellCount)}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="matrix-legend">
        <span><i className="matrix-legend-dot normal" />正常</span>
        <span><i className="matrix-legend-dot delayed" />延期</span>
        <span><i className="matrix-legend-dot no-task" />无任务</span>
      </div>
    </div>
  );
}
