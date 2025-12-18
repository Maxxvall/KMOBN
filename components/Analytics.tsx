import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Estimate } from '../types';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Line,
    LineChart,
    Pie,
    PieChart,
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

const STORAGE_KEY = 'kmobn:analytics:filters:v1';

// Современная палитра (без добавления новых theme primitives — это обычные CSS-цвета для графиков)
const CHART_COLORS = ['#7C3AED', '#06B6D4', '#22C55E', '#F59E0B', '#EF4444', '#3B82F6', '#A855F7', '#14B8A6'];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const formatRub = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽`;

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
    const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('quarter');
    const [showOnlyDifferent, setShowOnlyDifferent] = useState<boolean>(false);
    const [showOnlySignificant, setShowOnlySignificant] = useState<boolean>(false);
    const [significantThreshold, setSignificantThreshold] = useState<number>(10);
    const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});
    const [activePieIndex, setActivePieIndex] = useState<number | null>(null);

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
            if (saved.periodPreset === 'month' || saved.periodPreset === 'quarter' || saved.periodPreset === 'year' || saved.periodPreset === 'all') setPeriodPreset(saved.periodPreset);
            if (typeof saved.showOnlyDifferent === 'boolean') setShowOnlyDifferent(saved.showOnlyDifferent);
            if (typeof saved.showOnlySignificant === 'boolean') setShowOnlySignificant(saved.showOnlySignificant);
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
                periodPreset,
                showOnlyDifferent,
                showOnlySignificant,
                significantThreshold,
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch {
            // ignore
        }
    }, [periodPreset, selectedCategory, selectedEstimate1, selectedEstimate2, showOnlyDifferent, showOnlySignificant, significantThreshold]);

    // Фильтруем активные сметы
    const activeEstimates = useMemo(() => estimates.filter(est => !est.isArchived), [estimates]);

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
    const averageEstimate = useMemo(() => {
        if (!totalEstimates) return 0;
        const sum = estimatesInPeriod.reduce((s, e) => s + (e.total || 0), 0);
        return sum / totalEstimates;
    }, [estimatesInPeriod, totalEstimates]);

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

    const categoryPieData = categoryCosts;

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
                    <h1 className="text-3xl font-bold text-text-primary">Аналитика смет</h1>
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
                    <h1 className="text-3xl font-bold text-text-primary">Аналитика смет</h1>
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

    const totalAbsDiffAllCats = useMemo(() => {
        if (!detailedComparison) return 1;
        return (
            detailedComparison.categoriesComparison.reduce((s, c) => s + Math.abs(c.diff || 0), 0) || 1
        );
    }, [detailedComparison]);

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
                    <h1 className="text-3xl font-bold text-text-primary">Аналитика смет</h1>
                    <div className="text-sm text-text-secondary mt-1">
                        Клик по сегменту круговой диаграммы фильтрует сравнения и тренды.
                    </div>
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
                                    setActivePieIndex(null);
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
                            setActivePieIndex(null);
                            setPeriodPreset('quarter');
                            setShowOnlyDifferent(false);
                            setShowOnlySignificant(false);
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                    title="Общее количество смет"
                    value={String(totalEstimates)}
                    subtitle={kpiSubtitlePeriod}
                    accentClassName="bg-gradient-to-br from-indigo-600/25 to-purple-600/10"
                    icon={
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-white">
                            <path d="M7 3h10a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                    }
                />
                <KpiCard
                    title="Средняя стоимость сметы"
                    value={formatRub(averageEstimate)}
                    subtitle={kpiSubtitlePeriod}
                    accentClassName="bg-gradient-to-br from-cyan-600/25 to-blue-600/10"
                    icon={
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-white">
                            <path d="M12 2v20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            <path d="M17 6H9a2 2 0 0 0 0 4h6a2 2 0 0 1 0 4H7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                    }
                />
                <KpiCard
                    title="Самая дорогая категория"
                    value={mostExpensiveCategory}
                    subtitle={kpiSubtitlePeriod}
                    accentClassName="bg-gradient-to-br from-amber-600/25 to-orange-600/10"
                    icon={
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-white">
                            <path d="M12 3l3 6 6 .5-4.5 4 1.5 6-6-3.5-6 3.5 1.5-6L3 9.5 9 9l3-6Z" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                    }
                />
                <KpiCard
                    title="Динамика"
                    value={selectedCategory ? 'Категория' : 'Итого'}
                    subtitle={periodDynamics.label}
                    badge={{ label: dynamicsLabel, tone: trendTone }}
                    accentClassName="bg-gradient-to-br from-emerald-600/25 to-teal-600/10"
                    icon={
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-white">
                            <path d="M4 16l6-6 4 4 6-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M20 8v6h-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    }
                />
            </div>

            {/* Графики — grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-surface border border-border rounded-xl p-6 shadow transition hover:shadow-xl">
                    <div className="flex items-center justify-between gap-3 mb-4">
                        <div>
                            <h2 className="text-xl font-semibold text-text-primary">Распределение по категориям</h2>
                            <div className="text-xs text-text-secondary mt-1">{kpiSubtitlePeriod}</div>
                        </div>
                        <div className="text-xs text-text-secondary">Нажмите на сегмент для фильтра</div>
                    </div>
                    <ResponsiveContainer width="100%" height={320}>
                        <PieChart>
                            <Pie
                                data={categoryPieData}
                                cx="50%"
                                cy="50%"
                                outerRadius={110}
                                innerRadius={62}
                                dataKey="value"
                                isAnimationActive
                                animationDuration={650}
                                activeIndex={activePieIndex ?? undefined}
                                onMouseEnter={(_, index) => setActivePieIndex(index)}
                                onMouseLeave={() => setActivePieIndex(null)}
                                onClick={(data, index) => {
                                    const name = (data as any)?.name as string | undefined;
                                    if (!name) return;
                                    setActivePieIndex(index);
                                    setSelectedCategory(prev => (prev === name ? '' : name));
                                }}
                                labelLine={false}
                                label={({ name, percent }) => {
                                    if ((percent ?? 0) < 0.06) return '';
                                    return `${name} ${(Number(percent) * 100).toFixed(0)}%`;
                                }}
                            >
                                {categoryPieData.map((entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                                        opacity={!selectedCategory || selectedCategory === entry.name ? 1 : 0.25}
                                    />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value: any) => [formatRub(Number(value || 0)), 'Стоимость']} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                <div className="bg-surface border border-border rounded-xl p-6 shadow transition hover:shadow-xl">
                    <div className="flex items-center justify-between gap-3 mb-4">
                        <div>
                            <h2 className="text-xl font-semibold text-text-primary">Тренды расходов</h2>
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
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                            <XAxis dataKey="day" tickFormatter={(v) => formatDateRu(String(v))} />
                            <YAxis />
                            <Tooltip labelFormatter={(v) => formatDateRu(String(v))} formatter={(value: any) => [formatRub(Number(value || 0)), 'Расходы']} />
                            <Legend />
                            <Line
                                type="monotone"
                                dataKey="total"
                                name="Сумма"
                                stroke="url(#trendStroke)"
                                strokeWidth={3}
                                dot={false}
                                isAnimationActive
                                animationDuration={650}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                <div className="bg-surface border border-border rounded-xl p-6 shadow lg:col-span-2 transition hover:shadow-xl">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
                        <div>
                            <h2 className="text-xl font-semibold text-text-primary">Сравнение смет</h2>
                            <div className="text-sm text-text-secondary">Выберите две сметы для детального сравнения по категориям и позициям.</div>
                        </div>
                        <div className="text-xs text-text-secondary">
                            {selectedCategory ? `Сравнение по категории: ${selectedCategory}` : 'Сравнение по итогу'}
                        </div>
                    </div>

                    {estimateComparison.length > 0 ? (
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
                                                        <span className="w-2 h-2 rounded-full" style={{ background: CHART_COLORS[(idx + 1) % CHART_COLORS.length] }} />
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

                            {/* Контролы детального просмотра */}
                            <div className="bg-background/30 border border-border rounded-xl p-4">
                                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                                    <div className="flex flex-wrap items-center gap-4">
                                        <label className="flex items-center gap-2 text-text-primary text-sm">
                                            <input type="checkbox" checked={showOnlyDifferent} onChange={(e) => setShowOnlyDifferent(e.target.checked)} />
                                            Только отличия
                                        </label>
                                        <label className="flex items-center gap-2 text-text-primary text-sm">
                                            <input type="checkbox" checked={showOnlySignificant} onChange={(e) => setShowOnlySignificant(e.target.checked)} />
                                            Только значимые
                                        </label>
                                        <label className="flex items-center gap-2 text-text-primary text-sm">
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
                            </div>

                            {/* Аккордеоны категорий */}
                            <div className="space-y-4">
                                {(selectedCategory ? categoriesTable.map((c: any) => ({ category: c.category })) : detailedComparison.categoriesComparison)
                                    .map((catCmp: any, idx: number) => {
                                        const category = catCmp.category;
                                        if (selectedCategory && category !== selectedCategory) return null;

                                        const allItems = detailedComparison.itemsComparison.filter(it => (it.category || 'ОБЩАЯ') === category);
                                        const q = itemQuery.trim().toLowerCase();
                                        let filteredItems = allItems.filter(it => {
                                            if (showOnlyDifferent && (it.diff === 0)) return false;
                                            if (showOnlySignificant && (Math.abs(it.diffPct || 0) < significantThreshold)) return false;
                                            if (q && !`${it.name} ${it.unit || ''}`.toLowerCase().includes(q)) return false;
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
                                                            <span className="w-2 h-2 rounded-full" style={{ background: CHART_COLORS[(idx + 2) % CHART_COLORS.length] }} />
                                                            <span className="text-left">{isOpen ? '▾' : '▸'} {category}</span>
                                                            <span className="text-xs text-text-secondary font-normal">Позиций: {allItems.length}</span>
                                                        </button>

                                                        <div className="flex items-center gap-3 flex-wrap">
                                                            <div className="flex items-center gap-2">
                                                                <div className="h-2 w-44 bg-background border border-border rounded-full overflow-hidden">
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
            </div>
        </div>
    );
};

export default Analytics;