import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Estimate } from '../types';
import { filterToLatestEstimateVersions } from '../services/estimateIntelligence';

import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { List, type RowComponentProps } from 'react-window';
import * as XLSX from 'xlsx';

interface AnalyticsProps {
    estimates: Estimate[];
    isLoading?: boolean;
}

type PeriodPreset = 'month' | 'quarter' | 'year' | 'all';
type AnalyticsMode = 'overview' | 'compare' | 'details';
type DetailFilterPreset = 'all' | 'growth' | 'decrease' | 'added' | 'removed' | 'price' | 'quantity' | 'significant' | 'same';

const STORAGE_KEY = 'kmobn:analytics:filters:v1';

// Современная палитра (без добавления новых theme primitives — это обычные CSS-цвета для графиков)
const CHART_COLORS = ['#7C3AED', '#06B6D4', '#22C55E', '#F59E0B', '#EF4444', '#3B82F6', '#A855F7', '#14B8A6'];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const formatRub = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽`;
const formatSignedRub = (value: number) => `${value > 0 ? '+' : ''}${formatRub(value)}`;
const formatSignedPercent = (value: number) => `${value > 0 ? '+' : ''}${value}%`;

const dateKey = (input: string | Date) => {
    const d = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
};

const formatDateRu = (isoDay: string) => {
    const d = new Date(isoDay);
    if (Number.isNaN(d.getTime())) return isoDay;
    return d.toLocaleDateString('ru-RU');
};

const shiftMonths = (d: Date, months: number) => {
    const copy = new Date(d);
    copy.setMonth(copy.getMonth() + months);
    return copy;
};

const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

const exportToCsv = (rows: Record<string, any>[], filename: string) => {
    const headers = rows.length ? Object.keys(rows[0]) : [];
    const escape = (v: any) => {
        const s = String(v ?? '');
        if (/["\n\r,;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
    };
    const csv = [headers.join(';'), ...rows.map(r => headers.map(h => escape(r[h])).join(';'))].join('\n');
    // BOM для корректного открытия в Excel
    const blob = new Blob(["\uFEFF", csv], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, filename);
};

const exportToXlsx = (rows: Record<string, any>[], sheetName: string, filename: string) => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    downloadBlob(blob, filename);
};

const Sparkline: React.FC<{ values: number[]; className?: string }> = ({ values, className }) => {
    const w = 88;
    const h = 28;
    const safe = values.length ? values : [0];
    const min = Math.min(...safe);
    const max = Math.max(...safe);
    const range = max - min || 1;
    const points = safe
        .map((v, i) => {
            const x = (i / Math.max(1, safe.length - 1)) * (w - 2) + 1;
            const y = h - 1 - ((v - min) / range) * (h - 2);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');

    return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={className}>
            <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
    );
};

const Icon: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-white/10 border border-white/10">{children}</span>
);

const KpiCard: React.FC<{
    title: string;
    value: string;
    subtitle?: string;
    accentClassName: string;
    icon: React.ReactNode;
    badge?: { label: string; tone: 'up' | 'down' | 'flat' };
}> = ({ title, value, subtitle, accentClassName, icon, badge }) => {
    const badgeClass =
        badge?.tone === 'up'
            ? 'bg-green-500/15 text-green-200 border-green-500/20'
            : badge?.tone === 'down'
                ? 'bg-red-500/15 text-red-200 border-red-500/20'
                : 'bg-gray-500/15 text-text-primary border-border';

    return (
        <div
            className={
                'relative overflow-hidden rounded-xl border border-border shadow bg-surface p-4 ' +
                'transition duration-300 hover:-translate-y-0.5 hover:shadow-xl'
            }
        >
            <div className={
                'absolute inset-0 opacity-60 pointer-events-none ' +
                accentClassName
            } />
            <div className="relative flex items-start gap-3">
                <Icon>{icon}</Icon>
                <div className="flex-1 min-w-0">
                    <div className="text-sm text-text-secondary">{title}</div>
                    <div className="text-2xl font-bold text-text-primary mt-0.5 truncate">{value}</div>
                    {subtitle && <div className="text-xs text-text-secondary mt-1">{subtitle}</div>}
                </div>
                {badge && (
                    <div className={`text-xs px-2 py-1 rounded-lg border ${badgeClass}`}>{badge.label}</div>
                )}
            </div>
        </div>
    );
};

const SkeletonBlock: React.FC<{ className?: string }> = ({ className }) => (
    <div className={`animate-pulse bg-surface border border-border rounded-xl ${className ?? ''}`} />
);

const EmptyState: React.FC<{ title: string; description: string }> = ({ title, description }) => (
    <div className="bg-surface border border-border rounded-xl p-10 text-center">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-background border border-border flex items-center justify-center mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-text-secondary">
                <path d="M7 3h10a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.5" />
                <path d="M9 8h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M9 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
        </div>
        <div className="text-xl font-semibold text-text-primary">{title}</div>
        <div className="text-sm text-text-secondary mt-2 max-w-xl mx-auto">{description}</div>
        <div className="text-sm text-text-secondary mt-4">Подсказка: создайте смету во вкладке «Сметы», затем вернитесь сюда.</div>
    </div>
);

type EstimateOption = {
    id: string;
    estimateNumber: string;
    client: string;
    date: string;
    total: number;
};

const EstimateDropdown: React.FC<{
    label: string;
    options: EstimateOption[];
    valueId: string;
    onChange: (id: string) => void;
}> = ({ label, options, valueId, onChange }) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const rootRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (!rootRef.current) return;
            if (e.target instanceof Node && rootRef.current.contains(e.target)) return;
            setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const selected = options.find(o => o.id === valueId) ?? null;
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return options;
        return options.filter(o =>
            `${o.estimateNumber} ${o.client}`.toLowerCase().includes(q)
        );
    }, [options, query]);

    return (
        <div ref={rootRef} className="relative min-w-[240px]">
            <div className="text-xs text-text-secondary mb-1">{label}</div>
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center justify-between gap-3 bg-background border border-border rounded-lg px-3 py-2 text-left hover:border-primary transition"
            >
                <div className="min-w-0">
                    {selected ? (
                        <>
                            <div className="text-sm font-semibold text-text-primary truncate">{selected.estimateNumber}</div>
                            <div className="text-xs text-text-secondary truncate">
                                {new Date(selected.date).toLocaleDateString('ru-RU')} • {formatRub(selected.total)} • {selected.client}
                            </div>
                        </>
                    ) : (
                        <div className="text-sm text-text-secondary">Выберите смету</div>
                    )}
                </div>
                <div className="text-text-secondary">▾</div>
            </button>

            {open && (
                <div className="absolute z-30 mt-2 w-full bg-surface border border-border rounded-xl shadow-2xl overflow-hidden">
                    <div className="p-2 border-b border-border bg-background/40">
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Поиск..."
                            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-text-primary"
                        />
                    </div>
                    <div className="max-h-72 overflow-auto">
                        <button
                            className="w-full text-left px-3 py-2 hover:bg-background/50 transition text-sm text-text-secondary"
                            onClick={() => {
                                onChange('');
                                setOpen(false);
                                setQuery('');
                            }}
                        >
                            Очистить выбор
                        </button>
                        {filtered.map(o => (
                            <button
                                key={o.id}
                                className={`w-full text-left px-3 py-2 hover:bg-background/50 transition ${o.id === valueId ? 'bg-background/40' : ''}`}
                                onClick={() => {
                                    onChange(o.id);
                                    setOpen(false);
                                }}
                            >
                                <div className="text-sm font-semibold text-text-primary truncate">{o.estimateNumber}</div>
                                <div className="text-xs text-text-secondary truncate">
                                    {new Date(o.date).toLocaleDateString('ru-RU')} • {formatRub(o.total)} • {o.client}
                                </div>
                            </button>
                        ))}
                        {filtered.length === 0 && (
                            <div className="px-3 py-4 text-sm text-text-secondary">Ничего не найдено</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const Analytics: React.FC<AnalyticsProps> = ({ estimates, isLoading }) => {
    const [selectedEstimate1, setSelectedEstimate1] = useState<string>('');
    const [selectedEstimate2, setSelectedEstimate2] = useState<string>('');
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [activeMode, setActiveMode] = useState<AnalyticsMode>('compare');
    const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('quarter');
    const [detailPreset, setDetailPreset] = useState<DetailFilterPreset>('all');
    const [significantThreshold, setSignificantThreshold] = useState<number>(10);
    const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

    const [categoryTableQuery, setCategoryTableQuery] = useState('');
    const [itemQuery, setItemQuery] = useState('');
    const [categorySort, setCategorySort] = useState<{ key: 'category' | 'v1' | 'v2' | 'diff' | 'diffPct'; dir: 'asc' | 'desc' }>({ key: 'diff', dir: 'desc' });
    const [itemSort, setItemSort] = useState<{ key: 'name' | 'total1' | 'total2' | 'diff' | 'diffPct'; dir: 'asc' | 'desc' }>({ key: 'diff', dir: 'desc' });

    // hydrate saved filters
    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const saved = JSON.parse(raw) as any;
            if (typeof saved.selectedEstimate1 === 'string') setSelectedEstimate1(saved.selectedEstimate1);
            if (typeof saved.selectedEstimate2 === 'string') setSelectedEstimate2(saved.selectedEstimate2);
            if (typeof saved.selectedCategory === 'string') setSelectedCategory(saved.selectedCategory);
            if (saved.activeMode === 'overview' || saved.activeMode === 'compare' || saved.activeMode === 'details') setActiveMode(saved.activeMode);
            if (saved.periodPreset === 'month' || saved.periodPreset === 'quarter' || saved.periodPreset === 'year' || saved.periodPreset === 'all') setPeriodPreset(saved.periodPreset);
            if (
                saved.detailPreset === 'all' ||
                saved.detailPreset === 'growth' ||
                saved.detailPreset === 'decrease' ||
                saved.detailPreset === 'added' ||
                saved.detailPreset === 'removed' ||
                saved.detailPreset === 'price' ||
                saved.detailPreset === 'quantity' ||
                saved.detailPreset === 'significant' ||
                saved.detailPreset === 'same'
            ) {
                setDetailPreset(saved.detailPreset);
            } else if (saved.showOnlySignificant === true) {
                setDetailPreset('significant');
            } else if (saved.showOnlyDifferent === true) {
                setDetailPreset('growth');
            } else if (saved.showOnlySame === true) {
                setDetailPreset('same');
            }
            if (typeof saved.significantThreshold === 'number') setSignificantThreshold(saved.significantThreshold);
        } catch {
            // ignore
        }
        // only on mount
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        try {
            const payload = {
                selectedEstimate1,
                selectedEstimate2,
                selectedCategory,
                activeMode,
                periodPreset,
                detailPreset,
                significantThreshold,
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch {
            // ignore
        }
    }, [activeMode, detailPreset, periodPreset, selectedCategory, selectedEstimate1, selectedEstimate2, significantThreshold]);

    // Берем только актуальные версии смет
    const activeEstimates = useMemo(() => filterToLatestEstimateVersions(estimates), [estimates]);

    const options: EstimateOption[] = useMemo(() => {
        return activeEstimates
            .slice()
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .map(e => ({ id: e.id, estimateNumber: e.estimateNumber, client: e.client, date: e.date, total: e.total }));
    }, [activeEstimates]);

    const now = useMemo(() => new Date(), []);

    const periodRange = useMemo(() => {
        if (!activeEstimates.length) return { start: null as Date | null, end: null as Date | null };
        const end = new Date(now);
        if (periodPreset === 'all') {
            const min = activeEstimates
                .map(e => new Date(e.date))
                .filter(d => !Number.isNaN(d.getTime()))
                .sort((a, b) => a.getTime() - b.getTime())[0] ?? new Date(now);
            return { start: min, end };
        }
        const monthsBack = periodPreset === 'month' ? 1 : periodPreset === 'quarter' ? 3 : 12;
        return { start: shiftMonths(end, -monthsBack), end };
    }, [activeEstimates, now, periodPreset]);

    const estimatesInPeriod = useMemo(() => {
        const start = periodRange.start;
        const end = periodRange.end;
        if (!start || !end) return activeEstimates;
        const startMs = start.getTime();
        const endMs = end.getTime();
        return activeEstimates.filter(e => {
            const d = new Date(e.date);
            const ms = d.getTime();
            if (Number.isNaN(ms)) return false;
            return ms >= startMs && ms <= endMs;
        });
    }, [activeEstimates, periodRange.end, periodRange.start]);

    // Расчет стоимости по категориям (в выбранном периоде)
    const categoryCosts = useMemo(() => {
        const categoryMap: { [key: string]: number } = {};
        estimatesInPeriod.forEach(estimate => {
            estimate.items.forEach(item => {
                const category = item.category;
                categoryMap[category] = (categoryMap[category] || 0) + (item.total || 0);
            });
        });
        return Object.entries(categoryMap)
            .map(([category, cost]) => ({ name: category, value: Math.round(cost) }))
            .sort((a, b) => b.value - a.value);
    }, [estimatesInPeriod]);

    const mostExpensiveCategory = useMemo(() => {
        return categoryCosts[0]?.name ?? '—';
    }, [categoryCosts]);

    const totalEstimates = estimatesInPeriod.length;
    const totalEstimateValue = useMemo(() => {
        return estimatesInPeriod.reduce((s, e) => s + (e.total || 0), 0);
    }, [estimatesInPeriod]);

    const averageEstimate = useMemo(() => {
        if (!totalEstimates) return 0;
        return totalEstimateValue / totalEstimates;
    }, [totalEstimateValue, totalEstimates]);

    // Маржинальность: работы / (работы + материалы) × 100
    const marginData = useMemo(() => {
        return estimatesInPeriod.map(e => {
            let worksTotal = 0;
            let materialsTotal = 0;
            e.items.forEach(it => {
                if (it.subgroup === 'Работы') worksTotal += it.total || 0;
                else if (it.subgroup === 'Материалы') materialsTotal += it.total || 0;
            });
            const base = worksTotal + materialsTotal;
            const margin = base > 0 ? Math.round((worksTotal / base) * 100) : 0;
            return { date: dateKey(e.date), margin, worksTotal, materialsTotal, estimateNumber: e.estimateNumber };
        }).filter(d => d.date).sort((a, b) => a.date.localeCompare(b.date));
    }, [estimatesInPeriod]);

    const averageMargin = useMemo(() => {
        if (!marginData.length) return 0;
        return Math.round(marginData.reduce((s, d) => s + d.margin, 0) / marginData.length);
    }, [marginData]);

    const marginTone: 'up' | 'down' | 'flat' = averageMargin >= 40 ? 'up' : averageMargin >= 20 ? 'flat' : 'down';

    // Стоимость за м²
    const costPerSqmData = useMemo(() => {
        return estimatesInPeriod
            .filter(e => e.area > 0)
            .map(e => ({
                date: dateKey(e.date),
                costPerSqm: Math.round((e.total || 0) / e.area),
                area: e.area,
                total: e.total || 0,
                buildingType: e.buildingType || 'Не указан',
                estimateNumber: e.estimateNumber,
            }))
            .filter(d => d.date)
            .sort((a, b) => a.date.localeCompare(b.date));
    }, [estimatesInPeriod]);

    const averageCostPerSqm = useMemo(() => {
        if (!costPerSqmData.length) return 0;
        return Math.round(costPerSqmData.reduce((s, d) => s + d.costPerSqm, 0) / costPerSqmData.length);
    }, [costPerSqmData]);

    const periodDynamics = useMemo(() => {
        if (periodPreset === 'all') {
            return { pct: 0, tone: 'flat' as const, label: 'за весь период' };
        }
        const monthsBack = periodPreset === 'month' ? 1 : periodPreset === 'quarter' ? 3 : 12;
        const end = periodRange.end ?? new Date(now);
        const start = periodRange.start ?? shiftMonths(end, -monthsBack);
        const prevEnd = new Date(start);
        const prevStart = shiftMonths(prevEnd, -monthsBack);

        const sumInRange = (from: Date, to: Date) => {
            const a = from.getTime();
            const b = to.getTime();
            let sum = 0;
            activeEstimates.forEach(e => {
                const d = new Date(e.date);
                const ms = d.getTime();
                if (Number.isNaN(ms)) return;
                if (ms < a || ms > b) return;
                if (selectedCategory) {
                    sum += e.items.filter(it => it.category === selectedCategory).reduce((s, it) => s + (it.total || 0), 0);
                } else {
                    sum += e.total || 0;
                }
            });
            return sum;
        };

        const cur = sumInRange(start, end);
        const prev = sumInRange(prevStart, prevEnd);
        if (prev === 0) {
            return { pct: cur === 0 ? 0 : 100, tone: cur === 0 ? ('flat' as const) : ('up' as const), label: `к предыдущим ${monthsBack} мес.` };
        }
        const pct = Math.round(((cur - prev) / prev) * 100);
        const tone = pct > 0 ? ('up' as const) : pct < 0 ? ('down' as const) : ('flat' as const);
        return { pct, tone, label: `к предыдущим ${monthsBack} мес.` };
    }, [activeEstimates, now, periodPreset, periodRange.end, periodRange.start, selectedCategory]);

    // Сравнение выбранных смет (с учетом фильтра категории)
    const estimateComparison = useMemo(() => {
        const est1 = activeEstimates.find(e => e.id === selectedEstimate1);
        const est2 = activeEstimates.find(e => e.id === selectedEstimate2);
        const sumFor = (e: Estimate) => {
            if (!selectedCategory) return e.total || 0;
            return e.items.filter(it => it.category === selectedCategory).reduce((s, it) => s + (it.total || 0), 0);
        };
        const result: { name: string; total: number }[] = [];
        if (est1) result.push({ name: est1.estimateNumber, total: Math.round(sumFor(est1)) });
        if (est2) result.push({ name: est2.estimateNumber, total: Math.round(sumFor(est2)) });
        return result;
    }, [activeEstimates, selectedCategory, selectedEstimate1, selectedEstimate2]);

    // Подробное сравнение по категориям и позициям
    const detailedComparison = useMemo(() => {
        const est1 = activeEstimates.find(e => e.id === selectedEstimate1) || null;
        const est2 = activeEstimates.find(e => e.id === selectedEstimate2) || null;

        const getCategoryTotals = (est: Estimate | null) => {
            const map: Record<string, number> = {};
            if (!est) return map;
            est.items.forEach(it => {
                map[it.category] = (map[it.category] || 0) + (it.total || 0);
            });
            return map;
        };

        const totals1 = getCategoryTotals(est1);
        const totals2 = getCategoryTotals(est2);

        const allCategories = Array.from(new Set([
            ...Object.keys(totals1),
            ...Object.keys(totals2)
        ]));

        const categoriesComparison = allCategories.map(cat => {
            const v1 = Math.round(totals1[cat] || 0);
            const v2 = Math.round(totals2[cat] || 0);
            const diff = v2 - v1;
            const diffPct = v1 === 0 ? (v2 === 0 ? 0 : 100) : Math.round((diff / v1) * 100);
            return { category: cat, v1, v2, diff, diffPct };
        });

        // Items-level comparison (by name+unit key)
        const itemsMap: Record<string, { name: string; unit?: string; qty1?: number; price1?: number; total1?: number; qty2?: number; price2?: number; total2?: number; category?: string }> = {};
        const keyOf = (it: any) => `${it.name}___${it.unit || ''}`;
        if (est1) est1.items.forEach(it => {
            const k = keyOf(it);
            itemsMap[k] = itemsMap[k] || { name: it.name, unit: it.unit, category: it.category };
            itemsMap[k].qty1 = it.quantity;
            itemsMap[k].price1 = it.price;
            itemsMap[k].total1 = it.total;
        });
        if (est2) est2.items.forEach(it => {
            const k = keyOf(it);
            itemsMap[k] = itemsMap[k] || { name: it.name, unit: it.unit, category: it.category };
            itemsMap[k].qty2 = it.quantity;
            itemsMap[k].price2 = it.price;
            itemsMap[k].total2 = it.total;
        });

        const itemsComparison = Object.values(itemsMap).map(it => {
            const total1 = Math.round(it.total1 || 0);
            const total2 = Math.round(it.total2 || 0);
            const diff = total2 - total1;
            const diffPct = total1 === 0 ? (total2 === 0 ? 0 : 100) : Math.round((diff / total1) * 100);
            return {
                ...it,
                total1,
                total2,
                diff,
                diffPct,
            };
        });

        return { est1, est2, categoriesComparison, itemsComparison };
    }, [activeEstimates, selectedEstimate1, selectedEstimate2]);

    // Тренды расходов по времени (по дате создания) — в выбранном периоде
    const expenseTrends = useMemo(() => {
        const trends: Record<string, number> = {};
        estimatesInPeriod.forEach(estimate => {
            const dk = dateKey(estimate.date);
            if (!dk) return;
            const add = selectedCategory
                ? estimate.items.filter(it => it.category === selectedCategory).reduce((s, it) => s + (it.total || 0), 0)
                : (estimate.total || 0);
            trends[dk] = (trends[dk] || 0) + add;
        });
        return Object.entries(trends)
            .map(([day, total]) => ({ day, total: Math.round(total) }))
            .sort((a, b) => a.day.localeCompare(b.day));
    }, [estimatesInPeriod, selectedCategory]);

    // Серии по категориям (для sparklines)
    const categorySeriesByDay = useMemo(() => {
        const byCat: Record<string, Record<string, number>> = {};
        estimatesInPeriod.forEach(e => {
            const dk = dateKey(e.date);
            if (!dk) return;
            e.items.forEach(it => {
                const cat = it.category;
                byCat[cat] = byCat[cat] || {};
                byCat[cat][dk] = (byCat[cat][dk] || 0) + (it.total || 0);
            });
        });
        return byCat;
    }, [estimatesInPeriod]);

    const trendDays = useMemo(() => expenseTrends.map(t => t.day), [expenseTrends]);

    const kpiSubtitlePeriod = useMemo(() => {
        if (periodPreset === 'all') return 'весь период';
        return periodPreset === 'month' ? 'последний месяц' : periodPreset === 'quarter' ? 'последний квартал' : 'последний год';
    }, [periodPreset]);

    const overviewCategoryBars = useMemo(() => {
        const total = categoryCosts.reduce((s, c) => s + c.value, 0) || 1;
        return categoryCosts.slice(0, 6).map(c => ({
            ...c,
            share: Math.round((c.value / total) * 100),
        }));
    }, [categoryCosts]);

    const stackedCategoryMeta = useMemo(() => {
        const limit = 6;
        const top = categoryCosts.slice(0, limit).map(c => c.name);
        const rest = categoryCosts.slice(limit).map(c => c.name);
        const stacked = [...top];
        if (rest.length) stacked.push('Прочее');
        if (!stacked.length) stacked.push('Итого');
        return { stacked, extras: rest };
    }, [categoryCosts]);

    // Согласованный маппинг цветов для категорий.
    // Используем порядок stackedCategoryMeta (то, что показывает "Сравнение по категориям"),
    // затем — общий список categoryCosts, и фолбэк к последнему цвету.
    const getCategoryColor = (name: string) => {
        const stacked = stackedCategoryMeta.stacked || [];
        const idxStack = stacked.indexOf(name);
        if (idxStack !== -1) return CHART_COLORS[idxStack % CHART_COLORS.length];

        const idxAll = categoryCosts.findIndex(c => c.name === name);
        if (idxAll !== -1) return CHART_COLORS[idxAll % CHART_COLORS.length];

        return CHART_COLORS[CHART_COLORS.length - 1];
    };

    const categoryTotalsByEstimate = useMemo(() => {
        const result: Record<string, Record<string, number>> = {};
        if (!detailedComparison) return result;
        [detailedComparison.est1, detailedComparison.est2].forEach(est => {
            if (!est) return;
            const totals: Record<string, number> = {};
            est.items.forEach(it => {
                totals[it.category] = (totals[it.category] || 0) + (it.total || 0);
            });
            result[est.id] = totals;
        });
        return result;
    }, [detailedComparison]);

    const stackedComparisonData = useMemo(() => {
        if (!detailedComparison) return [] as Array<Record<string, number | string>>;
        const entries = [detailedComparison.est1, detailedComparison.est2].filter(Boolean) as Estimate[];
        if (!entries.length) return [];
        return entries.map(est => {
            const totals = categoryTotalsByEstimate[est.id] || {};
            const row: Record<string, number | string> = { name: est.estimateNumber };
            stackedCategoryMeta.stacked.forEach(category => {
                if (category === 'Прочее') {
                    const sum = stackedCategoryMeta.extras.reduce((s, cat) => s + Math.round(totals[cat] || 0), 0);
                    row[category] = sum;
                } else if (category === 'Итого') {
                    row[category] = Math.round(est.total || 0);
                } else {
                    row[category] = Math.round(totals[category] || 0);
                }
            });
            return row;
        });
    }, [categoryTotalsByEstimate, detailedComparison, stackedCategoryMeta]);

    const hasStackedComparison = stackedComparisonData.length > 0 && stackedCategoryMeta.stacked.length > 0;

    // Подготовка: таблица категорий с сортировкой/поиском/спарклайнами
    const categoriesTable = useMemo(() => {
        if (!detailedComparison) return [] as Array<any>;
        let rows = detailedComparison.categoriesComparison.slice();

        if (selectedCategory) {
            rows = rows.filter(r => r.category === selectedCategory);
        }

        const q = categoryTableQuery.trim().toLowerCase();
        if (q) rows = rows.filter(r => r.category.toLowerCase().includes(q));

        const dir = categorySort.dir === 'asc' ? 1 : -1;
        rows.sort((a, b) => {
            const key = categorySort.key;
            const av = a[key];
            const bv = b[key];
            if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * dir;
            return (Number(av) - Number(bv)) * dir;
        });

        return rows.map((r) => {
            const seriesMap = categorySeriesByDay[r.category] || {};
            const values = trendDays.map(d => Math.round(seriesMap[d] || 0));
            return { ...r, spark: values };
        });
    }, [categorySeriesByDay, categorySort.dir, categorySort.key, categoryTableQuery, detailedComparison, selectedCategory, trendDays]);

    const comparisonAnalytics = useMemo(() => {
        if (!detailedComparison?.est1 || !detailedComparison?.est2) return null;

        const sourceCategories = selectedCategory
            ? detailedComparison.categoriesComparison.filter(c => c.category === selectedCategory)
            : detailedComparison.categoriesComparison;

        const total1 = selectedCategory
            ? sourceCategories.reduce((s, c) => s + (c.v1 || 0), 0)
            : Math.round(detailedComparison.est1.total || 0);
        const total2 = selectedCategory
            ? sourceCategories.reduce((s, c) => s + (c.v2 || 0), 0)
            : Math.round(detailedComparison.est2.total || 0);
        const diff = total2 - total1;
        const diffPct = total1 === 0 ? (total2 === 0 ? 0 : 100) : Math.round((diff / total1) * 100);

        const categoryDrivers = sourceCategories
            .filter(c => c.diff !== 0)
            .slice()
            .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
        const totalAbsCategoryDiff = categoryDrivers.reduce((s, c) => s + Math.abs(c.diff), 0) || 1;

        const topCategoryDrivers = categoryDrivers.slice(0, 6).map(c => ({
            ...c,
            share: Math.round((Math.abs(c.diff) / totalAbsCategoryDiff) * 100),
        }));

        const waterfallDrivers = categoryDrivers.slice(0, 5);
        const restDiff = categoryDrivers.slice(5).reduce((s, c) => s + c.diff, 0);
        const waterfallSteps = restDiff === 0 ? waterfallDrivers : [...waterfallDrivers, {
            category: 'Прочее',
            v1: 0,
            v2: 0,
            diff: restDiff,
            diffPct: 0,
        }];

        let running = total1;
        const waterfallData: Array<{ name: string; base: number; value: number; signed: number; kind: 'total' | 'up' | 'down' }> = [
            { name: 'Смета 1', base: 0, value: Math.max(0, total1), signed: total1, kind: 'total' },
        ];
        waterfallSteps.forEach(step => {
            const signed = step.diff || 0;
            if (signed >= 0) {
                waterfallData.push({ name: step.category, base: Math.max(0, running), value: signed, signed, kind: 'up' });
                running += signed;
            } else {
                running += signed;
                waterfallData.push({ name: step.category, base: Math.max(0, running), value: Math.abs(signed), signed, kind: 'down' });
            }
        });
        waterfallData.push({ name: 'Смета 2', base: 0, value: Math.max(0, total2), signed: total2, kind: 'total' });

        const itemRows = detailedComparison.itemsComparison.filter(it => !selectedCategory || (it.category || 'ОБЩАЯ') === selectedCategory);
        const itemStats = itemRows.reduce(
            (acc, it) => {
                const has1 = (it.total1 || 0) > 0;
                const has2 = (it.total2 || 0) > 0;
                if (!has1 && has2) acc.added += 1;
                if (has1 && !has2) acc.removed += 1;
                if ((it.diff || 0) !== 0) acc.changed += 1;
                else acc.same += 1;
                if (typeof it.price1 === 'number' && typeof it.price2 === 'number' && it.price1 !== it.price2) acc.priceChanged += 1;
                if (typeof it.qty1 === 'number' && typeof it.qty2 === 'number' && it.qty1 !== it.qty2) acc.qtyChanged += 1;
                return acc;
            },
            { added: 0, removed: 0, changed: 0, same: 0, priceChanged: 0, qtyChanged: 0 }
        );

        const topItemDrivers = itemRows
            .filter(it => (it.diff || 0) !== 0)
            .slice()
            .sort((a, b) => Math.abs(b.diff || 0) - Math.abs(a.diff || 0))
            .slice(0, 8);

        const divergingData = categoryDrivers.slice(0, 8).map(c => ({
            category: c.category,
            diff: c.diff,
            diffPct: c.diffPct,
        }));

        return {
            total1,
            total2,
            diff,
            diffPct,
            topCategoryDrivers,
            topItemDrivers,
            itemStats,
            waterfallData,
            divergingData,
            categoryScheme: sourceCategories.slice().sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)),
        };
    }, [detailedComparison, selectedCategory]);

    const detailFilterButtons: Array<{ key: DetailFilterPreset; label: string }> = [
        { key: 'all', label: 'Все' },
        { key: 'growth', label: 'Рост' },
        { key: 'decrease', label: 'Снижение' },
        { key: 'added', label: 'Новые' },
        { key: 'removed', label: 'Удалённые' },
        { key: 'price', label: 'Цена' },
        { key: 'quantity', label: 'Объём' },
        { key: 'significant', label: 'Значимые' },
        { key: 'same', label: 'Без изменений' },
    ];

    const matchesDetailPreset = useCallback((it: any, preset: DetailFilterPreset) => {
        const total1 = it.total1 || 0;
        const total2 = it.total2 || 0;
        const diff = it.diff || 0;
        if (preset === 'all') return true;
        if (preset === 'growth') return diff > 0;
        if (preset === 'decrease') return diff < 0;
        if (preset === 'added') return total1 === 0 && total2 > 0;
        if (preset === 'removed') return total1 > 0 && total2 === 0;
        if (preset === 'price') return typeof it.price1 === 'number' && typeof it.price2 === 'number' && it.price1 !== it.price2;
        if (preset === 'quantity') return typeof it.qty1 === 'number' && typeof it.qty2 === 'number' && it.qty1 !== it.qty2;
        if (preset === 'significant') return Math.abs(it.diffPct || 0) >= significantThreshold;
        if (preset === 'same') return diff === 0 && total1 > 0 && total2 > 0;
        return true;
    }, [significantThreshold]);

    const detailSummary = useMemo(() => {
        if (!detailedComparison?.est1 || !detailedComparison?.est2) return null;
        const baseRows = detailedComparison.itemsComparison.filter(it => !selectedCategory || (it.category || 'ОБЩАЯ') === selectedCategory);
        const q = itemQuery.trim().toLowerCase();
        const visibleRows = baseRows.filter(it => {
            if (!matchesDetailPreset(it, detailPreset)) return false;
            if (q && !`${it.name} ${it.unit || ''} ${it.category || ''}`.toLowerCase().includes(q)) return false;
            return true;
        });
        const sum1 = visibleRows.reduce((s, it) => s + (it.total1 || 0), 0);
        const sum2 = visibleRows.reduce((s, it) => s + (it.total2 || 0), 0);
        const diff = sum2 - sum1;
        const totalAbsDiff = visibleRows.reduce((s, it) => s + Math.abs(it.diff || 0), 0);
        const added = visibleRows.filter(it => (it.total1 || 0) === 0 && (it.total2 || 0) > 0).length;
        const removed = visibleRows.filter(it => (it.total1 || 0) > 0 && (it.total2 || 0) === 0).length;
        const priceChanged = visibleRows.filter(it => typeof it.price1 === 'number' && typeof it.price2 === 'number' && it.price1 !== it.price2).length;
        const qtyChanged = visibleRows.filter(it => typeof it.qty1 === 'number' && typeof it.qty2 === 'number' && it.qty1 !== it.qty2).length;
        return {
            total: baseRows.length,
            visible: visibleRows.length,
            diff,
            totalAbsDiff,
            added,
            removed,
            priceChanged,
            qtyChanged,
        };
    }, [detailPreset, detailedComparison, itemQuery, matchesDetailPreset, selectedCategory]);

    const allCategoryKeys = useMemo(() => {
        if (!detailedComparison) return [] as string[];
        return detailedComparison.categoriesComparison.map(c => c.category);
    }, [detailedComparison]);

    const expandAll = () => {
        const next: Record<string, boolean> = {};
        allCategoryKeys.forEach(k => (next[k] = true));
        setOpenCategories(next);
    };

    const collapseAll = () => setOpenCategories({});

    // Если кликнули сегмент pie — откроем соответствующую категорию
    useEffect(() => {
        if (!selectedCategory) return;
        setOpenCategories(prev => ({ ...prev, [selectedCategory]: true }));
    }, [selectedCategory]);

    // profitReports removed — not needed for personal workflow

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">Аналитика смет</h1>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <SkeletonBlock className="h-24" />
                    <SkeletonBlock className="h-24" />
                    <SkeletonBlock className="h-24" />
                    <SkeletonBlock className="h-24" />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <SkeletonBlock className="h-[360px]" />
                    <SkeletonBlock className="h-[360px]" />
                </div>
                <SkeletonBlock className="h-[520px]" />
            </div>
        );
    }

    if (!activeEstimates.length) {
        return (
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">Аналитика смет</h1>
                </div>
                <EmptyState
                    title="Пока нет данных для аналитики"
                    description="Здесь появятся графики, сравнения и таблицы, когда будут сохранённые сметы."
                />
            </div>
        );
    }

    const dynamicsLabel =
        periodDynamics.tone === 'up'
            ? `+${periodDynamics.pct}%`
            : periodDynamics.tone === 'down'
                ? `${periodDynamics.pct}%`
                : '0%';

    const trendTone = periodDynamics.tone;

    const periodButtons: Array<{ key: PeriodPreset; label: string }> = [
        { key: 'month', label: 'Месяц' },
        { key: 'quarter', label: 'Квартал' },
        { key: 'year', label: 'Год' },
        { key: 'all', label: 'Всё' },
    ];

    const modeButtons: Array<{ key: AnalyticsMode; label: string; description: string }> = [
        { key: 'overview', label: 'Обзор', description: 'KPI и тренды' },
        { key: 'compare', label: 'Сравнение', description: 'две сметы' },
        { key: 'details', label: 'Детализация', description: 'таблицы и экспорт' },
    ];

    const itemsRowSort = (rows: any[]) => {
        const dir = itemSort.dir === 'asc' ? 1 : -1;
        const key = itemSort.key;
        return rows.slice().sort((a, b) => {
            const av = a[key];
            const bv = b[key];
            if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * dir;
            return (Number(av) - Number(bv)) * dir;
        });
    };

    const totalAbsDiffAllCats =
        detailedComparison
            ? (detailedComparison.categoriesComparison.reduce((s, c) => s + Math.abs(c.diff || 0), 0) || 1)
            : 1;

    const onExportCategories = (type: 'csv' | 'xlsx') => {
        const rows = categoriesTable.map(r => ({
            Категория: r.category,
            'Смета 1': r.v1,
            'Смета 2': r.v2,
            Разница: r.diff,
            'Изм. %': r.diffPct,
        }));
        const nameSuffix = selectedCategory ? `-${selectedCategory}` : '';
        const base = `categories-compare${nameSuffix}-${dateKey(new Date())}`;
        if (type === 'csv') exportToCsv(rows, `${base}.csv`);
        else exportToXlsx(rows, 'Categories', `${base}.xlsx`);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">Аналитика смет</h1>
                    <div className="text-sm text-text-secondary mt-1">
                        Клик по сегменту круговой диаграммы фильтрует сравнения и тренды.
                    </div>
                </div>
            </div>

            <div className="bg-surface border border-border rounded-xl p-2 shadow">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {modeButtons.map(mode => (
                        <button
                            key={mode.key}
                            type="button"
                            onClick={() => setActiveMode(mode.key)}
                            className={`rounded-lg px-4 py-3 text-left transition border ${
                                activeMode === mode.key
                                    ? 'bg-background border-primary shadow-inner'
                                    : 'border-transparent hover:bg-background/60'
                            }`}
                        >
                            <div className="text-sm font-semibold text-text-primary">{mode.label}</div>
                            <div className="text-xs text-text-secondary mt-0.5">{mode.description}</div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Панель фильтров */}
            <div className="bg-surface border border-border rounded-xl p-4 shadow">
                <div className="flex flex-col lg:flex-row lg:items-end gap-4 lg:gap-6 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-xs text-text-secondary w-full">Период</div>
                        <div className="inline-flex rounded-lg border border-border bg-background overflow-hidden">
                            {periodButtons.map(b => (
                                <button
                                    key={b.key}
                                    onClick={() => setPeriodPreset(b.key)}
                                    className={`px-3 py-2 text-sm transition ${periodPreset === b.key ? 'bg-primary text-white' : 'text-text-primary hover:bg-background/70'}`}
                                >
                                    {b.label}
                                </button>
                            ))}
                        </div>
                        {selectedCategory && (
                            <button
                                onClick={() => {
                                    setSelectedCategory('');
                                }}
                                className="ml-2 inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background hover:bg-background/70 transition text-sm"
                                title="Сбросить фильтр категории"
                            >
                                <span className="w-2 h-2 rounded-full bg-primary" />
                                <span className="text-text-primary truncate max-w-[220px]">{selectedCategory}</span>
                                <span className="text-text-secondary">×</span>
                            </button>
                        )}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 flex-wrap">
                        <EstimateDropdown label="Смета 1" options={options} valueId={selectedEstimate1} onChange={setSelectedEstimate1} />
                        <EstimateDropdown label="Смета 2" options={options} valueId={selectedEstimate2} onChange={setSelectedEstimate2} />
                    </div>

                    <div className="flex-1" />

                    <button
                        onClick={() => {
                            setSelectedEstimate1('');
                            setSelectedEstimate2('');
                            setSelectedCategory('');
                            setActiveMode('compare');
                            setPeriodPreset('quarter');
                            setDetailPreset('all');
                            setSignificantThreshold(10);
                            setCategoryTableQuery('');
                            setItemQuery('');
                            setOpenCategories({});
                        }}
                        className="px-4 py-2 rounded-lg border border-border bg-background hover:bg-background/70 transition text-sm"
                    >
                        Сбросить фильтры
                    </button>
                </div>
            </div>

            {/* KPI карточки */}
            {activeMode === 'overview' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                <KpiCard
                    title="Смет за период"
                    value={String(totalEstimates)}
                    subtitle={kpiSubtitlePeriod}
                    accentClassName="bg-gradient-to-br from-slate-400/10 to-transparent"
                    icon={
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-white">
                            <path d="M7 3h10a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                    }
                />
                <KpiCard
                    title="Оборот по сметам"
                    value={formatRub(totalEstimateValue)}
                    subtitle={kpiSubtitlePeriod}
                    badge={{ label: dynamicsLabel, tone: trendTone }}
                    accentClassName="bg-gradient-to-br from-cyan-500/15 to-transparent"
                    icon={
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-white">
                            <path d="M12 2v20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            <path d="M17 6H9a2 2 0 0 0 0 4h6a2 2 0 0 1 0 4H7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                    }
                />
                <KpiCard
                    title="Средняя смета"
                    value={formatRub(averageEstimate)}
                    subtitle={totalEstimates ? `${totalEstimates} расчётов в выборке` : 'нет данных'}
                    accentClassName="bg-gradient-to-br from-indigo-500/12 to-transparent"
                    icon={
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-white">
                            <path d="M5 19V5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            <path d="M5 19h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            <path d="M8 16l3-4 3 2 4-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    }
                />
                <KpiCard
                    title="Средняя стоимость за м²"
                    value={costPerSqmData.length ? formatRub(averageCostPerSqm) : '—'}
                    subtitle={costPerSqmData.length ? `${costPerSqmData.length} смет с площадью` : 'нет данных'}
                    accentClassName="bg-gradient-to-br from-red-500/12 to-transparent"
                    icon={
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-white">
                            <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
                            <path d="M3 9h18M9 3v18" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                    }
                />
                <KpiCard
                    title="Средняя маржа"
                    value={marginData.length ? `${averageMargin}%` : '—'}
                    subtitle={marginData.length ? `работы / (работы + материалы)` : 'нет данных'}
                    badge={marginData.length ? { label: marginTone === 'up' ? 'Хорошо' : marginTone === 'flat' ? 'Норма' : 'Низкая', tone: marginTone } : undefined}
                    accentClassName="bg-gradient-to-br from-emerald-500/12 to-transparent"
                    icon={
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-white">
                            <path d="M12 3l3 6 6 .5-4.5 4 1.5 6-6-3.5-6 3.5 1.5-6L3 9.5 9 9l3-6Z" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                    }
                />
            </div>
            )}

            {activeMode === 'compare' && (
                <div className="space-y-6">
                    {comparisonAnalytics && detailedComparison?.est1 && detailedComparison?.est2 ? (
                        <>
                            <div className="bg-surface border border-border rounded-xl p-5 shadow">
                                <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto_1fr] gap-4 xl:items-stretch">
                                    <div className="rounded-lg border border-border bg-background/40 p-4">
                                        <div className="text-xs uppercase tracking-wide text-text-secondary">База сравнения</div>
                                        <div className="mt-2 text-lg font-semibold text-text-primary truncate">{detailedComparison.est1.estimateNumber}</div>
                                        <div className="mt-1 text-sm text-text-secondary truncate">{detailedComparison.est1.client}</div>
                                        <div className="mt-4 text-2xl font-bold tabular-nums text-text-primary">{formatRub(comparisonAnalytics.total1)}</div>
                                        <div className="mt-1 text-xs text-text-secondary">{new Date(detailedComparison.est1.date).toLocaleDateString('ru-RU')}</div>
                                    </div>

                                    <div className="rounded-lg border border-border bg-background/60 p-5 flex flex-col justify-center text-center min-w-[240px]">
                                        <div className="text-xs uppercase tracking-wide text-text-secondary">Итоговое отклонение</div>
                                        <div className={`mt-3 text-3xl sm:text-4xl font-bold tabular-nums ${
                                            comparisonAnalytics.diff > 0
                                                ? 'text-red-200'
                                                : comparisonAnalytics.diff < 0
                                                    ? 'text-emerald-200'
                                                    : 'text-text-primary'
                                        }`}>
                                            {formatSignedRub(comparisonAnalytics.diff)}
                                        </div>
                                        <div className="mt-2 text-sm text-text-secondary">
                                            {formatSignedPercent(comparisonAnalytics.diffPct)} к первой смете
                                        </div>
                                        <div className="mt-4 flex justify-center gap-2 flex-wrap">
                                            <span className="rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-xs text-red-100">новых: {comparisonAnalytics.itemStats.added}</span>
                                            <span className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-100">удалённых: {comparisonAnalytics.itemStats.removed}</span>
                                            <span className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-100">цены: {comparisonAnalytics.itemStats.priceChanged}</span>
                                            <span className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-xs text-cyan-100">объёмы: {comparisonAnalytics.itemStats.qtyChanged}</span>
                                        </div>
                                    </div>

                                    <div className="rounded-lg border border-border bg-background/40 p-4">
                                        <div className="text-xs uppercase tracking-wide text-text-secondary">Сравниваемая смета</div>
                                        <div className="mt-2 text-lg font-semibold text-text-primary truncate">{detailedComparison.est2.estimateNumber}</div>
                                        <div className="mt-1 text-sm text-text-secondary truncate">{detailedComparison.est2.client}</div>
                                        <div className="mt-4 text-2xl font-bold tabular-nums text-text-primary">{formatRub(comparisonAnalytics.total2)}</div>
                                        <div className="mt-1 text-xs text-text-secondary">{new Date(detailedComparison.est2.date).toLocaleDateString('ru-RU')}</div>
                                    </div>
                                </div>

                                <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-3">
                                    {comparisonAnalytics.topCategoryDrivers.slice(0, 3).map(driver => (
                                        <button
                                            key={driver.category}
                                            type="button"
                                            onClick={() => setSelectedCategory(prev => (prev === driver.category ? '' : driver.category))}
                                            className="rounded-lg border border-border bg-background/30 p-3 text-left hover:border-primary transition"
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="text-sm font-semibold text-text-primary truncate">{driver.category}</div>
                                                    <div className="text-xs text-text-secondary mt-1">доля отклонений: {driver.share}%</div>
                                                </div>
                                                <div className={`text-sm font-semibold tabular-nums ${driver.diff > 0 ? 'text-red-200' : 'text-emerald-200'}`}>
                                                    {formatSignedRub(driver.diff)}
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                    {comparisonAnalytics.topCategoryDrivers.length === 0 && (
                                        <div className="lg:col-span-3 rounded-lg border border-border bg-background/30 p-4 text-sm text-text-secondary">
                                            Существенных отличий по категориям не найдено.
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                <div className="bg-surface border border-border rounded-xl p-5 shadow">
                                    <div className="flex items-start justify-between gap-3 mb-4">
                                        <div>
                                            <h2 className="text-lg font-semibold text-text-primary">Из чего сложилась разница</h2>
                                            <div className="text-xs text-text-secondary mt-1">Waterfall: первая смета, ключевые категории, итог второй сметы.</div>
                                        </div>
                                    </div>
                                    <ResponsiveContainer width="100%" height={320}>
                                        <BarChart data={comparisonAnalytics.waterfallData} margin={{ top: 8, right: 12, left: 0, bottom: 30 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                                            <XAxis dataKey="name" angle={-18} textAnchor="end" interval={0} height={64} tick={{ fontSize: 11 }} />
                                            <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                                            <Tooltip
                                                content={({ active, payload, label }) => {
                                                    if (!active || !payload?.length) return null;
                                                    const row = payload[0]?.payload as any;
                                                    return (
                                                        <div className="rounded-lg border border-border bg-background px-3 py-2 shadow-xl">
                                                            <div className="text-sm font-semibold text-text-primary">{label}</div>
                                                            <div className={`text-sm tabular-nums ${row.kind === 'down' ? 'text-emerald-200' : row.kind === 'up' ? 'text-red-200' : 'text-text-primary'}`}>
                                                                {row.kind === 'total' ? formatRub(row.signed) : formatSignedRub(row.signed)}
                                                            </div>
                                                        </div>
                                                    );
                                                }}
                                            />
                                            <Bar dataKey="base" stackId="waterfall" fill="transparent" isAnimationActive={false} />
                                            <Bar dataKey="value" stackId="waterfall" radius={[8, 8, 0, 0]} isAnimationActive animationDuration={700}>
                                                {comparisonAnalytics.waterfallData.map((entry, index) => (
                                                    <Cell
                                                        key={`waterfall-${index}`}
                                                        fill={entry.kind === 'total' ? '#64748B' : entry.kind === 'up' ? '#EF4444' : '#10B981'}
                                                    />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>

                                <div className="bg-surface border border-border rounded-xl p-5 shadow">
                                    <div className="flex items-start justify-between gap-3 mb-4">
                                        <div>
                                            <h2 className="text-lg font-semibold text-text-primary">Категории роста и снижения</h2>
                                            <div className="text-xs text-text-secondary mt-1">Расхождение вправо — рост стоимости, влево — снижение.</div>
                                        </div>
                                    </div>
                                    {comparisonAnalytics.divergingData.length > 0 ? (
                                        <ResponsiveContainer width="100%" height={320}>
                                            <BarChart data={comparisonAnalytics.divergingData} layout="vertical" margin={{ top: 8, right: 24, left: 18, bottom: 8 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                                                <XAxis type="number" tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                                                <YAxis type="category" dataKey="category" width={130} tick={{ fontSize: 11 }} />
                                                <Tooltip formatter={(value: any) => [formatSignedRub(Number(value || 0)), 'Разница']} />
                                                <Bar dataKey="diff" radius={[0, 8, 8, 0]} isAnimationActive animationDuration={700}>
                                                    {comparisonAnalytics.divergingData.map((entry, index) => (
                                                        <Cell key={`diverging-${index}`} fill={entry.diff >= 0 ? '#EF4444' : '#10B981'} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-[320px] flex items-center justify-center rounded-lg border border-border bg-background/30 text-sm text-text-secondary">
                                            Категории совпадают по стоимости.
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="bg-surface border border-border rounded-xl p-5 shadow">
                                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
                                    <div>
                                        <h2 className="text-lg font-semibold text-text-primary">Инженерная схема сметы</h2>
                                        <div className="text-xs text-text-secondary mt-1">Клик по блоку фильтрует сравнение по выбранной категории.</div>
                                    </div>
                                    {selectedCategory && (
                                        <button
                                            type="button"
                                            onClick={() => setSelectedCategory('')}
                                            className="px-3 py-2 rounded-lg border border-border bg-background hover:bg-background/70 transition text-sm"
                                        >
                                            Сбросить категорию
                                        </button>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                                    {comparisonAnalytics.categoryScheme.map(category => {
                                        const isSelected = selectedCategory === category.category;
                                        return (
                                            <button
                                                key={category.category}
                                                type="button"
                                                onClick={() => setSelectedCategory(prev => (prev === category.category ? '' : category.category))}
                                                className={`relative overflow-hidden rounded-lg border p-4 text-left bg-background/35 hover:border-primary transition ${
                                                    isSelected ? 'border-primary shadow-inner' : 'border-border'
                                                }`}
                                            >
                                                <div className="absolute inset-x-0 top-0 h-1" style={{ background: getCategoryColor(category.category) }} />
                                                <div className="text-sm font-semibold text-text-primary truncate">{category.category}</div>
                                                <div className="mt-3 flex items-end justify-between gap-3">
                                                    <div>
                                                        <div className="text-xs text-text-secondary">Смета 2</div>
                                                        <div className="text-lg font-bold tabular-nums text-text-primary">{formatRub(category.v2)}</div>
                                                    </div>
                                                    <div className={`text-sm font-semibold tabular-nums ${category.diff > 0 ? 'text-red-200' : category.diff < 0 ? 'text-emerald-200' : 'text-text-secondary'}`}>
                                                        {formatSignedRub(category.diff)}
                                                    </div>
                                                </div>
                                                <div className="mt-3 h-1.5 rounded-full bg-background border border-border overflow-hidden">
                                                    <div
                                                        className={category.diff >= 0 ? 'h-full bg-red-500' : 'h-full bg-emerald-500'}
                                                        style={{ width: `${clamp(Math.abs(category.diffPct), 4, 100)}%` }}
                                                    />
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="bg-surface border border-border rounded-xl p-5 shadow">
                                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
                                    <div>
                                        <h2 className="text-lg font-semibold text-text-primary">Позиции, которые двигают итог</h2>
                                        <div className="text-xs text-text-secondary mt-1">Топ изменений по абсолютному влиянию на сумму.</div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setActiveMode('details')}
                                        className="px-4 py-2 rounded-lg border border-border bg-background hover:bg-background/70 transition text-sm"
                                    >
                                        Открыть детализацию
                                    </button>
                                </div>
                                {comparisonAnalytics.topItemDrivers.length > 0 ? (
                                    <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                                        {comparisonAnalytics.topItemDrivers.map((item, index) => (
                                            <div key={`${item.name}-${item.unit}-${index}`} className="grid grid-cols-1 lg:grid-cols-[1fr_130px_130px_130px] gap-2 px-4 py-3 bg-background/25">
                                                <div className="min-w-0">
                                                    <div className="text-sm font-medium text-text-primary truncate">{item.name}</div>
                                                    <div className="text-xs text-text-secondary truncate">{item.category || 'ОБЩАЯ'}{item.unit ? ` • ${item.unit}` : ''}</div>
                                                </div>
                                                <div className="text-sm text-text-secondary lg:text-right tabular-nums">{formatRub(item.total1 || 0)}</div>
                                                <div className="text-sm text-text-secondary lg:text-right tabular-nums">{formatRub(item.total2 || 0)}</div>
                                                <div className={`text-sm font-semibold lg:text-right tabular-nums ${(item.diff || 0) > 0 ? 'text-red-200' : 'text-emerald-200'}`}>
                                                    {formatSignedRub(item.diff || 0)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="rounded-lg border border-border bg-background/30 p-4 text-sm text-text-secondary">
                                        По позициям нет отличий.
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <EmptyState
                            title="Выберите две сметы для сравнения"
                            description="После выбора появятся итоговая разница, ключевые причины отклонений, графики и инженерная схема категорий."
                        />
                    )}
                </div>
            )}

            {/* Графики — grid */}
            {activeMode !== 'compare' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {activeMode === 'overview' && (
                <>
                <div className="bg-surface border border-border rounded-xl p-6 shadow transition hover:shadow-xl">
                    <div className="flex items-center justify-between gap-3 mb-4">
                        <div>
                            <h2 className="text-xl font-semibold text-text-primary">Куда уходят деньги</h2>
                            <div className="text-xs text-text-secondary mt-1">Топ категорий за {kpiSubtitlePeriod}</div>
                        </div>
                        <div className="text-xs text-text-secondary truncate">Лидер: {mostExpensiveCategory}</div>
                    </div>
                    <div className="space-y-3">
                        {overviewCategoryBars.map(category => (
                            <button
                                key={category.name}
                                type="button"
                                onClick={() => setSelectedCategory(prev => (prev === category.name ? '' : category.name))}
                                className={`w-full rounded-lg border p-3 text-left transition ${
                                    selectedCategory === category.name
                                        ? 'border-primary bg-background/70'
                                        : 'border-border bg-background/30 hover:border-primary'
                                }`}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="text-sm font-semibold text-text-primary truncate">{category.name}</div>
                                        <div className="text-xs text-text-secondary mt-0.5">{category.share}% от выбранного периода</div>
                                    </div>
                                    <div className="text-sm font-semibold tabular-nums text-text-primary">{formatRub(category.value)}</div>
                                </div>
                                <div className="mt-3 h-2 rounded-full bg-background border border-border overflow-hidden">
                                    <div
                                        className="h-full rounded-full"
                                        style={{ width: `${clamp(category.share, 3, 100)}%`, background: getCategoryColor(category.name) }}
                                    />
                                </div>
                            </button>
                        ))}
                        {!overviewCategoryBars.length && (
                            <div className="rounded-lg border border-border bg-background/30 p-6 text-sm text-text-secondary">
                                За выбранный период нет категорий для анализа.
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-surface border border-border rounded-xl p-6 shadow transition hover:shadow-xl">
                    <div className="flex items-center justify-between gap-3 mb-4">
                        <div>
                            <h2 className="text-xl font-semibold text-text-primary">Финансовый тренд</h2>
                            <div className="text-xs text-text-secondary mt-1">
                                {selectedCategory ? `Категория: ${selectedCategory}` : 'Все категории'} • {kpiSubtitlePeriod}
                            </div>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={320}>
                        <LineChart data={expenseTrends}>
                            <defs>
                                <linearGradient id="trendStroke" x1="0" y1="0" x2="1" y2="0">
                                    <stop offset="0%" stopColor="#06B6D4" />
                                    <stop offset="100%" stopColor="#7C3AED" />
                                </linearGradient>
                            </defs>
                            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                            <XAxis dataKey="day" tickFormatter={(v) => formatDateRu(String(v))} tick={{ fontSize: 11 }} />
                            <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} tick={{ fontSize: 11 }} />
                            <Tooltip labelFormatter={(v) => formatDateRu(String(v))} formatter={(value: any) => [formatRub(Number(value || 0)), 'Расходы']} />
                            <Line
                                type="monotone"
                                dataKey="total"
                                name="Сумма"
                                stroke="url(#trendStroke)"
                                strokeWidth={3}
                                dot={{ r: 3 }}
                                isAnimationActive
                                animationDuration={650}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                {marginData.length > 1 && (
                    <div className="bg-surface border border-border rounded-xl p-6 shadow transition hover:shadow-xl">
                        <div className="flex items-center justify-between gap-3 mb-4">
                            <div>
                                <h2 className="text-xl font-semibold text-text-primary">Эффективность работ</h2>
                                <div className="text-xs text-text-secondary mt-1">Маржа по сметам в выбранном периоде</div>
                            </div>
                        </div>
                        <ResponsiveContainer width="100%" height={320}>
                            <LineChart data={marginData}>
                                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                                <XAxis dataKey="date" tickFormatter={(v) => formatDateRu(String(v))} tick={{ fontSize: 11 }} />
                                <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                                <Tooltip
                                    labelFormatter={(v) => formatDateRu(String(v))}
                                    formatter={(value: any) => [`${value}%`, 'Маржа']}
                                />
                                <Line type="monotone" dataKey="margin" name="Маржа %" stroke="#F59E0B" strokeWidth={3} dot={{ r: 3 }} isAnimationActive animationDuration={650} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}

                {costPerSqmData.length > 1 && (
                    <div className="bg-surface border border-border rounded-xl p-6 shadow transition hover:shadow-xl">
                        <div className="flex items-center justify-between gap-3 mb-4">
                            <div>
                                <h2 className="text-xl font-semibold text-text-primary">Стоимость квадратного метра</h2>
                                <div className="text-xs text-text-secondary mt-1">Средняя: {formatRub(averageCostPerSqm)}/м²</div>
                            </div>
                        </div>
                        <ResponsiveContainer width="100%" height={320}>
                            <LineChart data={costPerSqmData}>
                                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                                <XAxis dataKey="date" tickFormatter={(v) => formatDateRu(String(v))} tick={{ fontSize: 11 }} />
                                <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} tick={{ fontSize: 11 }} />
                                <Tooltip
                                    labelFormatter={(v) => formatDateRu(String(v))}
                                    formatter={(value: any) => [formatRub(Number(value || 0)), 'За м²']}
                                />
                                <Line type="monotone" dataKey="costPerSqm" name="₽/м²" stroke="#EF4444" strokeWidth={3} dot={{ r: 3 }} isAnimationActive animationDuration={650} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}

                </>
                )}

                {activeMode === 'details' && (
                <div className="bg-surface border border-border rounded-xl p-6 shadow lg:col-span-2 transition hover:shadow-xl">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
                        <div>
                            <h2 className="text-xl font-semibold text-text-primary">Сравнение смет</h2>
                            <div className="text-sm text-text-secondary">Выберите две сметы для детального сравнения по категориям и позициям.</div>
                        </div>
                        <div className="text-xs text-text-secondary">
                            {selectedCategory ? `Сравнение по категории: ${selectedCategory}` : 'Сравнение по итоговой сумме с разбивкой по блокам'}
                        </div>
                    </div>

                    {estimateComparison.length > 0 ? (
                        hasStackedComparison ? (
                            <ResponsiveContainer width="100%" height={320}>
                                <BarChart data={stackedComparisonData} margin={{ bottom: 10 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                                    <XAxis dataKey="name" />
                                    <YAxis />
                                    <Tooltip formatter={(value: any, name: string) => [formatRub(Number(value || 0)), name]} />
                                    <Legend />
                                    {stackedCategoryMeta.stacked.map((category) => (
                                        <Bar
                                            key={category}
                                            dataKey={category}
                                            stackId="stack"
                                            name={category}
                                            radius={[10, 10, 0, 0]}
                                            fill={getCategoryColor(category)}
                                            isAnimationActive
                                            animationDuration={750}
                                        />
                                    ))}
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <ResponsiveContainer width="100%" height={280}>
                                <BarChart data={estimateComparison}>
                                    <defs>
                                        <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#7C3AED" stopOpacity={0.95} />
                                            <stop offset="100%" stopColor="#06B6D4" stopOpacity={0.65} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                                    <XAxis dataKey="name" />
                                    <YAxis />
                                    <Tooltip formatter={(value: any) => [formatRub(Number(value || 0)), 'Стоимость']} />
                                    <Legend />
                                    <Bar dataKey="total" fill="url(#barFill)" name="Стоимость" isAnimationActive animationDuration={650} radius={[10, 10, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        )
                    ) : (
                        <div className="text-sm text-text-secondary">Выберите хотя бы одну смету для сравнения.</div>
                    )}

                    {detailedComparison && detailedComparison.est1 && detailedComparison.est2 ? (
                        <div className="mt-6 space-y-4">
                            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
                                <div>
                                    <h3 className="text-lg font-semibold text-text-primary">Сравнение по категориям</h3>
                                    <div className="text-xs text-text-secondary mt-1">
                                        Сортировка по заголовкам, поиск по категориям, экспорт в CSV/Excel.
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2 items-center">
                                    <input
                                        value={categoryTableQuery}
                                        onChange={(e) => setCategoryTableQuery(e.target.value)}
                                        placeholder="Поиск категории..."
                                        className="px-3 py-2 rounded-lg bg-background border border-border text-sm text-text-primary"
                                    />
                                    <button
                                        onClick={() => onExportCategories('csv')}
                                        className="px-3 py-2 rounded-lg bg-background border border-border hover:bg-background/70 transition text-sm"
                                    >
                                        CSV
                                    </button>
                                    <button
                                        onClick={() => onExportCategories('xlsx')}
                                        className="px-3 py-2 rounded-lg bg-background border border-border hover:bg-background/70 transition text-sm"
                                    >
                                        Excel
                                    </button>
                                </div>
                            </div>

                            <div className="overflow-x-auto rounded-xl border border-border">
                                <table className="min-w-full table-auto">
                                    <thead className="bg-background/40">
                                        <tr>
                                            <th className="px-3 py-2 text-left text-text-secondary text-xs uppercase">
                                                <button
                                                    onClick={() => setCategorySort(s => ({ key: 'category', dir: s.key === 'category' && s.dir === 'asc' ? 'desc' : 'asc' }))}
                                                    className="inline-flex items-center gap-2 hover:text-text-primary transition"
                                                >
                                                    Категория <span className="text-[10px]">{categorySort.key === 'category' ? (categorySort.dir === 'asc' ? '▲' : '▼') : ''}</span>
                                                </button>
                                            </th>
                                            <th className="px-3 py-2 text-left text-text-secondary text-xs uppercase">Тренд</th>
                                            <th className="px-3 py-2 text-right text-text-secondary text-xs uppercase">
                                                <button
                                                    onClick={() => setCategorySort(s => ({ key: 'v1', dir: s.key === 'v1' && s.dir === 'asc' ? 'desc' : 'asc' }))}
                                                    className="inline-flex items-center gap-2 hover:text-text-primary transition"
                                                >
                                                    Смета 1 <span className="text-[10px]">{categorySort.key === 'v1' ? (categorySort.dir === 'asc' ? '▲' : '▼') : ''}</span>
                                                </button>
                                            </th>
                                            <th className="px-3 py-2 text-right text-text-secondary text-xs uppercase">
                                                <button
                                                    onClick={() => setCategorySort(s => ({ key: 'v2', dir: s.key === 'v2' && s.dir === 'asc' ? 'desc' : 'asc' }))}
                                                    className="inline-flex items-center gap-2 hover:text-text-primary transition"
                                                >
                                                    Смета 2 <span className="text-[10px]">{categorySort.key === 'v2' ? (categorySort.dir === 'asc' ? '▲' : '▼') : ''}</span>
                                                </button>
                                            </th>
                                            <th className="px-3 py-2 text-right text-text-secondary text-xs uppercase">
                                                <button
                                                    onClick={() => setCategorySort(s => ({ key: 'diff', dir: s.key === 'diff' && s.dir === 'asc' ? 'desc' : 'asc' }))}
                                                    className="inline-flex items-center gap-2 hover:text-text-primary transition"
                                                >
                                                    Разница <span className="text-[10px]">{categorySort.key === 'diff' ? (categorySort.dir === 'asc' ? '▲' : '▼') : ''}</span>
                                                </button>
                                            </th>
                                            <th className="px-3 py-2 text-right text-text-secondary text-xs uppercase">
                                                <button
                                                    onClick={() => setCategorySort(s => ({ key: 'diffPct', dir: s.key === 'diffPct' && s.dir === 'asc' ? 'desc' : 'asc' }))}
                                                    className="inline-flex items-center gap-2 hover:text-text-primary transition"
                                                >
                                                    % изм. <span className="text-[10px]">{categorySort.key === 'diffPct' ? (categorySort.dir === 'asc' ? '▲' : '▼') : ''}</span>
                                                </button>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {categoriesTable.map((c: any, idx: number) => (
                                            <tr
                                                key={idx}
                                                className="border-t border-border hover:bg-background/40 transition"
                                            >
                                                <td className="px-3 py-2 text-text-primary">
                                                        <button
                                                        onClick={() => setSelectedCategory(prev => (prev === c.category ? '' : c.category))}
                                                        className="inline-flex items-center gap-2 hover:underline"
                                                        title="Фильтровать по категории"
                                                    >
                                                        <span className="w-2 h-2 rounded-full" style={{ background: getCategoryColor(c.category) }} />
                                                        {c.category}
                                                    </button>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <Sparkline values={c.spark} className="text-text-secondary" />
                                                </td>
                                                <td className="px-3 py-2 text-right text-text-primary tabular-nums">{formatRub(c.v1)}</td>
                                                <td className="px-3 py-2 text-right text-text-primary tabular-nums">{formatRub(c.v2)}</td>
                                                <td className={`px-3 py-2 text-right tabular-nums ${c.diff >= 0 ? 'text-green-300' : 'text-red-300'}`}>{formatRub(c.diff)}</td>
                                                <td className={`px-3 py-2 text-right tabular-nums ${c.diffPct > 0 ? 'text-green-200' : c.diffPct < 0 ? 'text-red-200' : 'text-text-primary'}`}>{c.diffPct}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="bg-background/30 border border-border rounded-xl p-4 space-y-4">
                                <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <div className="text-sm font-semibold text-text-primary">Фокус детализации</div>
                                        <div className="text-xs text-text-secondary mt-1">
                                            Выберите один аналитический срез: рост, снижение, новые позиции, изменения цены или объёма.
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <input
                                            value={itemQuery}
                                            onChange={(e) => setItemQuery(e.target.value)}
                                            placeholder="Поиск позиции..."
                                            className="px-3 py-2 rounded-lg bg-background border border-border text-sm text-text-primary"
                                        />
                                        <button onClick={expandAll} className="px-3 py-2 rounded-lg border border-border bg-background hover:bg-background/70 transition text-sm">Развернуть все</button>
                                        <button onClick={collapseAll} className="px-3 py-2 rounded-lg border border-border bg-background hover:bg-background/70 transition text-sm">Свернуть все</button>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {detailFilterButtons.map(filter => (
                                        <button
                                            key={filter.key}
                                            type="button"
                                            onClick={() => setDetailPreset(filter.key)}
                                            className={`px-3 py-2 rounded-lg border text-sm transition ${
                                                detailPreset === filter.key
                                                    ? 'bg-primary text-white border-primary'
                                                    : 'bg-background border-border text-text-primary hover:border-primary'
                                            }`}
                                        >
                                            {filter.label}
                                        </button>
                                    ))}
                                    <label className="flex items-center gap-2 text-text-primary text-sm ml-0 lg:ml-2">
                                        <span className="text-text-secondary">Порог</span>
                                        <input
                                            type="number"
                                            value={significantThreshold}
                                            onChange={(e) => setSignificantThreshold(clamp(Number(e.target.value || 0), 0, 999))}
                                            className="w-20 p-2 rounded-lg bg-background text-text-primary border border-border"
                                        />
                                        %
                                    </label>
                                </div>

                                {detailSummary && (
                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                        <div className="rounded-lg border border-border bg-background/40 p-3">
                                            <div className="text-xs text-text-secondary">Показано позиций</div>
                                            <div className="mt-1 text-lg font-bold text-text-primary tabular-nums">{detailSummary.visible} / {detailSummary.total}</div>
                                        </div>
                                        <div className="rounded-lg border border-border bg-background/40 p-3">
                                            <div className="text-xs text-text-secondary">Итог среза</div>
                                            <div className={`mt-1 text-lg font-bold tabular-nums ${detailSummary.diff > 0 ? 'text-red-200' : detailSummary.diff < 0 ? 'text-emerald-200' : 'text-text-primary'}`}>
                                                {formatSignedRub(detailSummary.diff)}
                                            </div>
                                        </div>
                                        <div className="rounded-lg border border-border bg-background/40 p-3">
                                            <div className="text-xs text-text-secondary">Абсолютное влияние</div>
                                            <div className="mt-1 text-lg font-bold text-text-primary tabular-nums">{formatRub(detailSummary.totalAbsDiff)}</div>
                                        </div>
                                        <div className="rounded-lg border border-border bg-background/40 p-3">
                                            <div className="text-xs text-text-secondary">Типы изменений</div>
                                            <div className="mt-1 text-xs text-text-secondary">
                                                +{detailSummary.added} новых · -{detailSummary.removed} удалённых · {detailSummary.priceChanged} цен · {detailSummary.qtyChanged} объёмов
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Аккордеоны категорий */}
                            <div className="space-y-4">
                                {(selectedCategory ? categoriesTable.map((c: any) => ({ category: c.category })) : detailedComparison.categoriesComparison)
                                    .map((catCmp: any) => {
                                        const category = catCmp.category;
                                        if (selectedCategory && category !== selectedCategory) return null;

                                        const allItems = detailedComparison.itemsComparison.filter(it => (it.category || 'ОБЩАЯ') === category);
                                        const q = itemQuery.trim().toLowerCase();
                                        let filteredItems = allItems.filter(it => {
                                            if (!matchesDetailPreset(it, detailPreset)) return false;
                                            if (q && !`${it.name} ${it.unit || ''} ${it.category || ''}`.toLowerCase().includes(q)) return false;
                                            return true;
                                        });
                                        filteredItems = itemsRowSort(filteredItems);

                                        const categorySum = filteredItems.reduce((s, it) => s + (it.diff || 0), 0);
                                        const share = Math.round((Math.abs(categorySum) / totalAbsDiffAllCats) * 100);
                                        const isOpen = !!openCategories[category];

                                        const seriesMap = categorySeriesByDay[category] || {};
                                        const sparkValues = trendDays.map(d => Math.round(seriesMap[d] || 0));

                                        const exportItems = (type: 'csv' | 'xlsx') => {
                                            const rows = filteredItems.map(it => ({
                                                Категория: category,
                                                Позиция: it.name,
                                                Ед: it.unit || '',
                                                'Кол-во 1': it.qty1 ?? '',
                                                'Цена 1': it.price1 ?? '',
                                                'Итог 1': it.total1 ?? 0,
                                                'Кол-во 2': it.qty2 ?? '',
                                                'Цена 2': it.price2 ?? '',
                                                'Итог 2': it.total2 ?? 0,
                                                Разница: it.diff ?? 0,
                                                'Изм. %': it.diffPct ?? 0,
                                            }));
                                            const base = `items-${category}-${dateKey(new Date())}`;
                                            if (type === 'csv') exportToCsv(rows, `${base}.csv`);
                                            else exportToXlsx(rows, 'Items', `${base}.xlsx`);
                                        };

                                        const VirtualRow = ({ ariaAttributes, index, style, items }: RowComponentProps<{ items: typeof filteredItems }>) => {
                                            const it = items[index];
                                            const zebra = index % 2 === 0 ? 'bg-background/20' : '';
                                            return (
                                                <div {...ariaAttributes} style={style} className={`grid grid-cols-[minmax(220px,1fr)_90px_110px_110px_90px_110px_110px_110px_80px] gap-2 px-3 py-2 border-t border-border hover:bg-background/40 transition ${zebra}`}>
                                                    <div className="text-text-primary truncate" title={`${it.name}${it.unit ? ` (${it.unit})` : ''}`}>{it.name}{it.unit ? ` (${it.unit})` : ''}</div>
                                                    <div className="text-right text-text-primary tabular-nums">{it.qty1 ?? '—'}</div>
                                                    <div className="text-right text-text-primary tabular-nums">{it.price1 ?? '—'}</div>
                                                    <div className="text-right text-text-primary tabular-nums">{formatRub(it.total1 ?? 0)}</div>
                                                    <div className="text-right text-text-primary tabular-nums">{it.qty2 ?? '—'}</div>
                                                    <div className="text-right text-text-primary tabular-nums">{it.price2 ?? '—'}</div>
                                                    <div className="text-right text-text-primary tabular-nums">{formatRub(it.total2 ?? 0)}</div>
                                                    <div className={`text-right tabular-nums ${it.diff >= 0 ? 'text-green-300' : 'text-red-300'}`}>{formatRub(it.diff ?? 0)}</div>
                                                    <div className={`text-right tabular-nums ${Math.abs(it.diffPct || 0) >= significantThreshold ? 'text-amber-200 font-semibold' : 'text-text-primary'}`}>{it.diffPct ?? 0}%</div>
                                                </div>
                                            );
                                        };

                                        return (
                                            <div key={category} className="bg-background/30 border border-border rounded-xl overflow-hidden">
                                                <div className="px-4 py-3">
                                                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                                                        <button
                                                            onClick={() => setOpenCategories(prev => ({ ...prev, [category]: !prev[category] }))}
                                                            className="inline-flex items-center gap-3 text-text-primary font-semibold hover:opacity-90 transition"
                                                        >
                                                            <span className="w-2 h-2 rounded-full" style={{ background: getCategoryColor(category) }} />
                                                            <span className="text-left">{isOpen ? '▾' : '▸'} {category}</span>
                                                            <span className="text-xs text-text-secondary font-normal">Позиций: {allItems.length}</span>
                                                        </button>

                                                        <div className="flex items-center gap-3 flex-wrap">
                                                            <div className="flex items-center gap-2">
                                                                <div
                                                                    className="h-2 w-44 bg-background border border-border rounded-full overflow-hidden"
                                                                    title={`Доля изменений по категории: ${share}% от общей суммы отклонений (${formatRub(categorySum)})`}
                                                                    aria-label={`Доля изменений по категории: ${share}% от общей суммы отклонений (${formatRub(categorySum)})`}
                                                                >
                                                                    <div className="h-full bg-primary" style={{ width: `${clamp(share, 0, 100)}%` }} />
                                                                </div>
                                                                <div className="text-xs text-text-secondary">{clamp(share, 0, 100)}%</div>
                                                            </div>
                                                            <Sparkline values={sparkValues} className="text-text-secondary" />
                                                            <div className={`text-sm tabular-nums ${categorySum >= 0 ? 'text-green-200' : 'text-red-200'}`}>{formatRub(categorySum)}</div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div
                                                    className={`grid transition-[grid-template-rows] duration-300 ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                                                >
                                                    <div className="overflow-hidden">
                                                        <div className="px-4 pb-4">
                                                            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                                                                <div className="text-sm text-text-secondary">Показано: {filteredItems.length} из {allItems.length}</div>
                                                                <div className="flex items-center gap-2">
                                                                    <button onClick={() => exportItems('csv')} className="px-3 py-2 rounded-lg border border-border bg-background hover:bg-background/70 transition text-sm">CSV</button>
                                                                    <button onClick={() => exportItems('xlsx')} className="px-3 py-2 rounded-lg border border-border bg-background hover:bg-background/70 transition text-sm">Excel</button>
                                                                </div>
                                                            </div>

                                                            <div className="overflow-x-auto rounded-xl border border-border">
                                                                <div className="min-w-[980px]">
                                                                    <div className="grid grid-cols-[minmax(220px,1fr)_90px_110px_110px_90px_110px_110px_110px_80px] gap-2 px-3 py-2 bg-background/40 text-xs uppercase text-text-secondary">
                                                                        <button onClick={() => setItemSort(s => ({ key: 'name', dir: s.key === 'name' && s.dir === 'asc' ? 'desc' : 'asc' }))} className="text-left hover:text-text-primary transition">Позиция {itemSort.key === 'name' ? (itemSort.dir === 'asc' ? '▲' : '▼') : ''}</button>
                                                                        <div className="text-right">Кол-во 1</div>
                                                                        <div className="text-right">Цена 1</div>
                                                                        <button onClick={() => setItemSort(s => ({ key: 'total1', dir: s.key === 'total1' && s.dir === 'asc' ? 'desc' : 'asc' }))} className="text-right hover:text-text-primary transition">Итог 1 {itemSort.key === 'total1' ? (itemSort.dir === 'asc' ? '▲' : '▼') : ''}</button>
                                                                        <div className="text-right">Кол-во 2</div>
                                                                        <div className="text-right">Цена 2</div>
                                                                        <button onClick={() => setItemSort(s => ({ key: 'total2', dir: s.key === 'total2' && s.dir === 'asc' ? 'desc' : 'asc' }))} className="text-right hover:text-text-primary transition">Итог 2 {itemSort.key === 'total2' ? (itemSort.dir === 'asc' ? '▲' : '▼') : ''}</button>
                                                                        <button onClick={() => setItemSort(s => ({ key: 'diff', dir: s.key === 'diff' && s.dir === 'asc' ? 'desc' : 'asc' }))} className="text-right hover:text-text-primary transition">Δ {itemSort.key === 'diff' ? (itemSort.dir === 'asc' ? '▲' : '▼') : ''}</button>
                                                                        <button onClick={() => setItemSort(s => ({ key: 'diffPct', dir: s.key === 'diffPct' && s.dir === 'asc' ? 'desc' : 'asc' }))} className="text-right hover:text-text-primary transition">%Δ {itemSort.key === 'diffPct' ? (itemSort.dir === 'asc' ? '▲' : '▼') : ''}</button>
                                                                    </div>

                                                                    {filteredItems.length > 45 ? (
                                                                        <List
                                                                            rowCount={filteredItems.length}
                                                                            rowHeight={44}
                                                                            rowComponent={VirtualRow}
                                                                            rowProps={{ items: filteredItems }}
                                                                            style={{ height: 360 }}
                                                                        />
                                                                    ) : (
                                                                        <div>
                                                                            {filteredItems.map((it, i) => (
                                                                                <div key={i} className={`grid grid-cols-[minmax(220px,1fr)_90px_110px_110px_90px_110px_110px_110px_80px] gap-2 px-3 py-2 border-t border-border hover:bg-background/40 transition ${i % 2 === 0 ? 'bg-background/20' : ''}`}>
                                                                                    <div className="text-text-primary truncate" title={`${it.name}${it.unit ? ` (${it.unit})` : ''}`}>{it.name}{it.unit ? ` (${it.unit})` : ''}</div>
                                                                                    <div className="text-right text-text-primary tabular-nums">{it.qty1 ?? '—'}</div>
                                                                                    <div className="text-right text-text-primary tabular-nums">{it.price1 ?? '—'}</div>
                                                                                    <div className="text-right text-text-primary tabular-nums">{formatRub(it.total1 ?? 0)}</div>
                                                                                    <div className="text-right text-text-primary tabular-nums">{it.qty2 ?? '—'}</div>
                                                                                    <div className="text-right text-text-primary tabular-nums">{it.price2 ?? '—'}</div>
                                                                                    <div className="text-right text-text-primary tabular-nums">{formatRub(it.total2 ?? 0)}</div>
                                                                                    <div className={`text-right tabular-nums ${it.diff >= 0 ? 'text-green-300' : 'text-red-300'}`}>{formatRub(it.diff ?? 0)}</div>
                                                                                    <div className={`text-right tabular-nums ${Math.abs(it.diffPct || 0) >= significantThreshold ? 'text-amber-200 font-semibold' : 'text-text-primary'}`}>{it.diffPct ?? 0}%</div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>
                    ) : (
                        <div className="mt-6">
                            <EmptyState
                                title="Выберите две сметы для детального сравнения"
                                description="После выбора вы увидите таблицы по категориям и позициям, сортировку, поиск и экспорт."
                            />
                        </div>
                    )}
                </div>
                )}
            </div>
            )}
        </div>
    );
};

export default React.memo(Analytics);
