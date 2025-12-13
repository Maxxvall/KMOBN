import React, { useMemo, useState } from 'react';
import { Estimate, EstimateCategory } from '../types';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line, ResponsiveContainer } from 'recharts';

interface AnalyticsProps {
    estimates: Estimate[];
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658'];

const Analytics: React.FC<AnalyticsProps> = ({ estimates }) => {
    const [selectedEstimate1, setSelectedEstimate1] = useState<string>('');
    const [selectedEstimate2, setSelectedEstimate2] = useState<string>('');
    const [showOnlyDifferent, setShowOnlyDifferent] = useState<boolean>(false);
    const [showOnlySignificant, setShowOnlySignificant] = useState<boolean>(false);
    const [significantThreshold, setSignificantThreshold] = useState<number>(10);
    const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

    // Фильтруем активные сметы
    const activeEstimates = useMemo(() => estimates.filter(est => !est.isArchived), [estimates]);

    // Расчет стоимости по категориям для всех смет
    const categoryCosts = useMemo(() => {
        const categoryMap: { [key: string]: number } = {};
        estimates.forEach(estimate => {
            estimate.items.forEach(item => {
                const category = item.category;
                categoryMap[category] = (categoryMap[category] || 0) + item.total;
            });
        });
        return Object.entries(categoryMap).map(([category, cost]) => ({
            name: category,
            value: Math.round(cost),
        }));
    }, [estimates]);

    // Сравнение выбранных смет
    const estimateComparison = useMemo(() => {
        const est1 = activeEstimates.find(e => e.id === selectedEstimate1);
        const est2 = activeEstimates.find(e => e.id === selectedEstimate2);
        const result = [];
        if (est1) result.push({ name: est1.estimateNumber, total: est1.total });
        if (est2) result.push({ name: est2.estimateNumber, total: est2.total });
        return result;
    }, [activeEstimates, selectedEstimate1, selectedEstimate2]);

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

    // Тренды расходов по времени (по дате создания)
    const expenseTrends = useMemo(() => {
        const trends: { [date: string]: number } = {};
        estimates.forEach(estimate => {
            const date = new Date(estimate.date).toLocaleDateString('ru-RU');
            trends[date] = (trends[date] || 0) + estimate.total;
        });
        return Object.entries(trends)
            .map(([date, total]) => ({ date, total: Math.round(total) }))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [estimates]);

    // profitReports removed — not needed for personal workflow

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-text-primary">Аналитика смет</h1>
            </div>

            {/* График стоимости по категориям */}
            <div className="bg-background p-6 rounded-lg shadow">
                <h2 className="text-xl font-semibold mb-4 text-text-primary">Распределение стоимости по категориям</h2>
                <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                        <Pie
                            data={categoryCosts}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                        >
                            {categoryCosts.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip formatter={(value) => [`${value} руб`, 'Стоимость']} />
                    </PieChart>
                </ResponsiveContainer>
            </div>

            {/* Выбор смет для сравнения */}
            <div className="bg-background p-6 rounded-lg shadow">
                <h2 className="text-xl font-semibold mb-4 text-text-primary">Сравнение смет</h2>
                <div className="text-sm text-text-primary mb-3">Выберите две сметы для детального сравнения по категориям и позициям.</div>
                <div className="flex gap-4 mb-4">
                    <div>
                        <label className="block text-sm font-medium text-text-primary mb-1">Смета 1</label>
                        <select
                            value={selectedEstimate1}
                            onChange={(e) => setSelectedEstimate1(e.target.value)}
                            className="w-full p-2 border border-border rounded bg-surface text-text-primary"
                        >
                            <option value="">Выберите смету</option>
                            {activeEstimates.map(est => (
                                <option key={est.id} value={est.id}>{est.estimateNumber}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-text-primary mb-1">Смета 2</label>
                        <select
                            value={selectedEstimate2}
                            onChange={(e) => setSelectedEstimate2(e.target.value)}
                            className="w-full p-2 border border-border rounded bg-surface text-text-primary"
                        >
                            <option value="">Выберите смету</option>
                            {activeEstimates.map(est => (
                                <option key={est.id} value={est.id}>{est.estimateNumber}</option>
                            ))}
                        </select>
                    </div>
                </div>
                {estimateComparison.length > 0 && (
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={estimateComparison}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip formatter={(value) => [`${value} руб`, 'Стоимость']} />
                            <Legend />
                            <Bar dataKey="total" fill="#8884d8" name="Общая стоимость" />
                        </BarChart>
                    </ResponsiveContainer>
                )}

                {/* Подробное сравнение по категориям */}
                {detailedComparison && (
                    <div className="mt-6">
                        <h3 className="text-lg font-semibold text-text-primary mb-2">Сравнение по категориям</h3>
                        <div className="overflow-x-auto">
                            <table className="min-w-full table-auto mb-4">
                                <thead>
                                    <tr className="bg-surface">
                                        <th className="px-3 py-2 text-left text-text-primary">Категория</th>
                                        <th className="px-3 py-2 text-right text-text-primary">Смета 1</th>
                                        <th className="px-3 py-2 text-right text-text-primary">Смета 2</th>
                                        <th className="px-3 py-2 text-right text-text-primary">Разница</th>
                                        <th className="px-3 py-2 text-right text-text-primary">% изм.</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {detailedComparison.categoriesComparison.map((c, idx) => (
                                        <tr key={idx} className="border-t border-border">
                                            <td className="px-3 py-2 text-text-primary">{c.category}</td>
                                            <td className="px-3 py-2 text-right text-text-primary">{c.v1} руб</td>
                                            <td className="px-3 py-2 text-right text-text-primary">{c.v2} руб</td>
                                            <td className={`px-3 py-2 text-right ${c.diff >= 0 ? 'text-green-400' : 'text-red-400'}`}>{c.diff} руб</td>
                                            <td className="px-3 py-2 text-right text-text-primary">{c.diffPct}%</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {/* Controls for detailed view */}
                        <div className="flex items-center gap-4 mb-4">
                            <label className="flex items-center gap-2 text-text-primary">
                                <input type="checkbox" checked={showOnlyDifferent} onChange={(e) => setShowOnlyDifferent(e.target.checked)} />
                                Показывать только отличающиеся позиции
                            </label>
                            <label className="flex items-center gap-2 text-text-primary">
                                <input type="checkbox" checked={showOnlySignificant} onChange={(e) => setShowOnlySignificant(e.target.checked)} />
                                <span>Только значимые (&gt;% )</span>
                            </label>
                            <label className="flex items-center gap-2 text-text-primary">
                                <input type="number" value={significantThreshold} onChange={(e) => setSignificantThreshold(Number(e.target.value || 0))} className="w-16 p-1 rounded bg-surface text-text-primary border border-border" />
                                %
                            </label>
                        </div>

                        {/* Accordion grouped by category */}
                        <div className="space-y-4">
                            {detailedComparison.categoriesComparison.map((catCmp) => {
                                const category = catCmp.category;
                                const allItems = detailedComparison.itemsComparison.filter(it => (it.category || 'ОБЩАЯ') === category);
                                // Apply filters
                                const filteredItems = allItems.filter(it => {
                                    if (showOnlyDifferent && (it.diff === 0)) return false;
                                    if (showOnlySignificant && (Math.abs(it.diffPct || 0) < significantThreshold)) return false;
                                    return true;
                                });
                                const categorySum = filteredItems.reduce((s, it) => s + (it.diff || 0), 0);
                                const isOpen = !!openCategories[category];
                                return (
                                    <div key={category} className="bg-background p-4 rounded-lg shadow">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-3">
                                                <button onClick={() => setOpenCategories(prev => ({ ...prev, [category]: !prev[category] }))} className="text-text-primary font-semibold">
                                                    {isOpen ? '▾' : '▸'} {category}
                                                </button>
                                                <div className="text-sm text-text-primary">Позиций: {allItems.length}</div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className={`text-sm ${categorySum >= 0 ? 'text-green-300' : 'text-red-300'}`}>{categorySum} руб</div>
                                            </div>
                                        </div>
                                        {isOpen && (
                                            <div className="overflow-x-auto">
                                                <table className="min-w-full table-auto">
                                                    <thead>
                                                        <tr className="bg-surface">
                                                            <th className="px-3 py-2 text-left text-text-primary">Позиция</th>
                                                            <th className="px-3 py-2 text-right text-text-primary">Кол-во 1</th>
                                                            <th className="px-3 py-2 text-right text-text-primary">Цена 1</th>
                                                            <th className="px-3 py-2 text-right text-text-primary">Итог 1</th>
                                                            <th className="px-3 py-2 text-right text-text-primary">Кол-во 2</th>
                                                            <th className="px-3 py-2 text-right text-text-primary">Цена 2</th>
                                                            <th className="px-3 py-2 text-right text-text-primary">Итог 2</th>
                                                            <th className="px-3 py-2 text-right text-text-primary">Δ</th>
                                                            <th className="px-3 py-2 text-right text-text-primary">%Δ</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {filteredItems.map((it, idx) => (
                                                            <tr key={idx} className={`border-t border-border ${idx % 2 === 0 ? 'bg-surface/5' : ''}`}>
                                                                <td className="px-3 py-2 text-text-primary max-w-xl break-words">{it.name} {it.unit ? `(${it.unit})` : ''}</td>
                                                                <td className="px-3 py-2 text-right text-text-primary">{it.qty1 ?? '-'}</td>
                                                                <td className="px-3 py-2 text-right text-text-primary">{it.price1 ?? '-'}</td>
                                                                <td className="px-3 py-2 text-right text-text-primary">{it.total1 ?? 0}</td>
                                                                <td className="px-3 py-2 text-right text-text-primary">{it.qty2 ?? '-'}</td>
                                                                <td className="px-3 py-2 text-right text-text-primary">{it.price2 ?? '-'}</td>
                                                                <td className="px-3 py-2 text-right text-text-primary">{it.total2 ?? 0}</td>
                                                                <td className={`px-3 py-2 text-right ${it.diff >= 0 ? 'text-green-400' : 'text-red-400'}`}>{it.diff}</td>
                                                                <td className={`px-3 py-2 text-right ${Math.abs(it.diffPct || 0) >= significantThreshold ? 'text-yellow-300 font-semibold' : 'text-text-primary'}`}>{it.diffPct ?? 0}%</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

                {/* Тренды расходов */}
            <div className="bg-background p-6 rounded-lg shadow">
                <h2 className="text-xl font-semibold mb-4 text-text-primary">Тренды расходов по времени</h2>
                <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={expenseTrends}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip formatter={(value) => [`${value} руб`, 'Расходы']} />
                        <Legend />
                        <Line type="monotone" dataKey="total" stroke="#8884d8" strokeWidth={2} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default Analytics;