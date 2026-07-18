import React, { useId } from 'react';
import { getCuttingStageLabel } from '../services/cutting/stageOrder';
import { CuttingSheet, CuttingStageId } from '../services/cutting/types';

interface PlywoodCutMapProps {
    sheet: CuttingSheet;
    index?: number;
}

const STAGE_COLORS: Record<CuttingStageId, { fill: string; stroke: string }> = {
    rostverk: { fill: '#b45309', stroke: '#f59e0b' },
    subfloor: { fill: '#0369a1', stroke: '#38bdf8' },
    joists: { fill: '#047857', stroke: '#34d399' },
    walls: { fill: '#6d28d9', stroke: '#a78bfa' },
    roof: { fill: '#be123c', stroke: '#fb7185' },
    exterior: { fill: '#0f766e', stroke: '#2dd4bf' },
    other: { fill: '#475569', stroke: '#94a3b8' },
};

const formatNumber = (value: number): string => value.toLocaleString('ru-RU', { maximumFractionDigits: 1 });

const PlywoodCutMap: React.FC<PlywoodCutMapProps> = ({ sheet, index }) => {
    const titleId = useId();
    const descriptionId = useId();
    const scale = Math.max(sheet.width, sheet.height) > 0 ? 1000 / Math.max(sheet.width, sheet.height) : 1;
    const sheetDrawWidth = sheet.width * scale;
    const sheetDrawHeight = sheet.height * scale;
    const offsetX = (1000 - sheetDrawWidth) / 2;
    const offsetY = (1000 - sheetDrawHeight) / 2;

    return (
        <article className="overflow-hidden rounded-lg border border-border bg-background/35">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-3 py-2.5">
                <div className="min-w-0">
                    <h4 className="truncate text-sm font-semibold text-text-primary">
                        {sheet.id}{index !== undefined ? ` · лист ${index + 1}` : ''}
                    </h4>
                    <p className="mt-0.5 text-xs text-text-secondary">
                        {sheet.material}{sheet.thickness ? ` · ${formatNumber(sheet.thickness)} мм` : ''}
                    </p>
                </div>
                <div className="text-right text-xs text-text-secondary">
                    <div>{formatNumber(sheet.width)} × {formatNumber(sheet.height)} мм</div>
                    <div>Отход {formatNumber(sheet.wastePercentage)}%</div>
                </div>
            </div>

            <div className="p-3">
                <svg
                    viewBox="0 0 1000 1000"
                    className="aspect-square w-full max-w-xl rounded border border-border bg-surface"
                    role="img"
                    aria-labelledby={`${titleId} ${descriptionId}`}
                    preserveAspectRatio="xMidYMid meet"
                >
                    <title id={titleId}>Карта раскроя листа {sheet.id}</title>
                    <desc id={descriptionId}>
                        Лист {formatNumber(sheet.width)} на {formatNumber(sheet.height)} миллиметров, деталей: {sheet.parts.length}.
                    </desc>
                    <rect x={offsetX} y={offsetY} width={sheetDrawWidth} height={sheetDrawHeight} className="fill-surface stroke-border" strokeWidth="4" />
                    {sheet.parts.map(part => {
                        const color = STAGE_COLORS[part.stage];
                        const x = offsetX + part.x * scale;
                        const y = offsetY + part.y * scale;
                        const width = Math.max(1, part.width * scale);
                        const height = Math.max(1, part.height * scale);
                        const canShowLabel = width >= 135 && height >= 70;
                        const canShowName = width >= 230 && height >= 125;
                        const centerX = x + width / 2;
                        const centerY = y + height / 2;

                        return (
                            <g key={part.id}>
                                <rect
                                    x={x}
                                    y={y}
                                    width={width}
                                    height={height}
                                    fill={color.fill}
                                    fillOpacity="0.5"
                                    stroke={color.stroke}
                                    strokeWidth="4"
                                />
                                <title>
                                    {part.construction}: {formatNumber(part.width)} × {formatNumber(part.height)} мм, {getCuttingStageLabel(part.stage)}
                                </title>
                                {canShowLabel && (
                                    <text x={centerX} y={centerY - (canShowName ? 13 : 0)} textAnchor="middle" className="fill-white text-[32px] font-semibold">
                                        {formatNumber(part.width)}×{formatNumber(part.height)}
                                    </text>
                                )}
                                {canShowName && (
                                    <text x={centerX} y={centerY + 28} textAnchor="middle" className="fill-white/80 text-[24px]">
                                        {part.construction.length > 22 ? `${part.construction.slice(0, 20)}…` : part.construction}
                                    </text>
                                )}
                            </g>
                        );
                    })}
                </svg>

                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1" aria-label="Этапы на карте">
                    {Array.from(new Set(sheet.parts.map(part => part.stage))).map(stage => (
                        <span key={stage} className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
                            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: STAGE_COLORS[stage].stroke }} aria-hidden="true" />
                            {getCuttingStageLabel(stage)}
                        </span>
                    ))}
                </div>
            </div>
        </article>
    );
};

export default PlywoodCutMap;
