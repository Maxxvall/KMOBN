import React, { useState, useMemo, useEffect } from 'react';
import { Estimate, Worker, WorkAllocation, SalaryCalculation, EstimateSubgroup, SalaryMode } from '../types';
import { saveSalaryCalculation, loadSalaryCalculationByEstimateId } from '../services/database';


interface SalaryCalculatorProps {
    estimates: Estimate[];
}

const formatPrice = (price: number): string => {
    const hasDecimals = price % 1 !== 0;
    if (hasDecimals) {
        return price.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';
    }
    return price.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' ₽';
};

const SalaryCalculator: React.FC<SalaryCalculatorProps> = ({ estimates }) => {
    const [selectedEstimateId, setSelectedEstimateId] = useState<string>('');
    const [workers, setWorkers] = useState<Worker[]>([]);
    const [newWorkerName, setNewWorkerName] = useState('');
    const [workAllocations, setWorkAllocations] = useState<WorkAllocation[]>([]);
    const [mode, setMode] = useState<SalaryMode>('percent');

    const activeEstimates = useMemo(() => estimates.filter(e => !e.isArchived), [estimates]);
    const selectedEstimate = useMemo(() => activeEstimates.find(e => e.id === selectedEstimateId), [activeEstimates, selectedEstimateId]);
    const workItems = useMemo(() => selectedEstimate?.items.filter(item => item.subgroup === EstimateSubgroup.WORKS) || [], [selectedEstimate]);

    // Load saved calculation
    useEffect(() => {
        const loadSavedCalculation = async () => {
            if (selectedEstimateId) {
                const saved = await loadSalaryCalculationByEstimateId(selectedEstimateId);
                if (saved) {
                    setWorkers(saved.workers);
                    setWorkAllocations(saved.workAllocations);
                    if (saved.mode) setMode(saved.mode);
                }
            }
        };
        loadSavedCalculation();
    }, [selectedEstimateId]);

    // Auto-save
    useEffect(() => {
        const saveCalculation = async () => {
            if (selectedEstimateId && selectedEstimate && (workers.length > 0 || workAllocations.length > 0)) {
                const calculation: SalaryCalculation = {
                    id: `salary-${selectedEstimateId}`,
                    estimateId: selectedEstimateId,
                    estimateNumber: selectedEstimate.estimateNumber,
                    workers,
                    workAllocations,
                    createdDate: new Date().toISOString(),
                    mode,
                };
                await saveSalaryCalculation(calculation);
            }
        };
        saveCalculation();
    }, [selectedEstimateId, selectedEstimate, workers, workAllocations, mode]);

    const handleEstimateChange = (estimateId: string) => {
        setSelectedEstimateId(estimateId);
        const estimate = activeEstimates.find(e => e.id === estimateId);
        if (estimate) {
            const works = estimate.items.filter(item => item.subgroup === EstimateSubgroup.WORKS);
            const initialAllocations: WorkAllocation[] = works.map(work => ({
                workItemId: work.id,
                workItemName: work.name,
                workItemTotal: work.total,
                allocations: {},
                hours: {},
            }));
            setWorkAllocations(initialAllocations);
        }
    };

    const handleAddWorker = () => {
        if (!newWorkerName.trim()) return;
        const newWorker: Worker = {
            id: `worker-${Date.now()}`,
            name: newWorkerName.trim(),
            ratePerHour: 0,
            ratePerDay: 0,
            rateType: 'hour',
        };
        const updatedWorkers = [...workers, newWorker];
        setWorkers(updatedWorkers);
        setNewWorkerName('');

        if (mode === 'percent') {
            if (updatedWorkers.length <= 2) {
                const eq = 100 / updatedWorkers.length;
                setWorkAllocations(workAllocations.map(wa => ({
                    ...wa,
                    allocations: Object.fromEntries(updatedWorkers.map(w => [w.id, eq])),
                })));
            } else {
                setWorkAllocations(workAllocations.map(wa => ({
                    ...wa,
                    allocations: { ...wa.allocations, [newWorker.id]: 0 },
                })));
            }
        } else {
            setWorkAllocations(workAllocations.map(wa => ({
                ...wa,
                hours: { ...wa.hours, [newWorker.id]: 0 },
            })));
        }
    };

    const handleRemoveWorker = (workerId: string) => {
        if (!window.confirm('Удалить работника?')) return;
        const updated = workers.filter(w => w.id !== workerId);
        setWorkers(updated);
        setWorkAllocations(workAllocations.map(wa => {
            const newA = { ...wa.allocations };
            delete newA[workerId];
            const newH = { ...wa.hours };
            delete newH[workerId];
            return { ...wa, allocations: newA, hours: newH };
        }));
    };

    const handleAllocationChange = (workItemId: string, workerId: string, value: string) => {
        const num = Math.max(0, Math.min(100, parseFloat(value) || 0));
        setWorkAllocations(workAllocations.map(wa => {
            if (wa.workItemId !== workItemId) return wa;
            if (mode === 'percent') {
                const newAlloc = { ...wa.allocations, [workerId]: num };
                if (workers.length <= 2) {
                    const other = workers.filter(w => w.id !== workerId);
                    const remaining = 100 - num;
                    other.forEach(w => { newAlloc[w.id] = remaining / other.length; });
                }
                return { ...wa, allocations: newAlloc };
            }
            return wa;
        }));
    };

    const handleHoursChange = (workItemId: string, workerId: string, value: string) => {
        const num = Math.max(0, parseFloat(value) || 0);
        setWorkAllocations(workAllocations.map(wa => {
            if (wa.workItemId !== workItemId) return wa;
            return { ...wa, hours: { ...wa.hours, [workerId]: num } };
        }));
    };

    const handleRateChange = (workerId: string, field: 'ratePerHour' | 'ratePerDay', value: string) => {
        const num = Math.max(0, parseFloat(value) || 0);
        setWorkers(workers.map(w => w.id === workerId ? { ...w, [field]: num } : w));
    };

    const handleRateTypeChange = (workerId: string, rateType: 'hour' | 'day') => {
        setWorkers(workers.map(w => w.id === workerId ? { ...w, rateType } : w));
    };

    // ─── Calculations ───────────────────────────────────────────────────────

    const workerTotals = useMemo(() => {
        const totals: { [workerId: string]: number } = {};
        workers.forEach(w => { totals[w.id] = 0; });

        if (mode === 'percent') {
            workAllocations.forEach(wa => {
                Object.entries(wa.allocations).forEach(([wid, pct]) => {
                    totals[wid] = (totals[wid] || 0) + (wa.workItemTotal * (Number(pct) || 0) / 100);
                });
            });
        } else {
            workAllocations.forEach(wa => {
                Object.entries(wa.hours || {}).forEach(([wid, hrs]) => {
                    const worker = workers.find(w => w.id === wid);
                    if (!worker) return;
                    const rate = worker.rateType === 'day' ? (worker.ratePerDay || 0) : (worker.ratePerHour || 0);
                    totals[wid] = (totals[wid] || 0) + (Number(hrs) || 0) * rate;
                });
            });
        }
        return totals;
    }, [workers, workAllocations, mode]);

    const workerHours = useMemo(() => {
        if (mode !== 'rate') return {};
        const hours: { [workerId: string]: number } = {};
        workers.forEach(w => { hours[w.id] = 0; });
        workAllocations.forEach(wa => {
            Object.entries(wa.hours || {}).forEach(([wid, hrs]) => {
                hours[wid] = (hours[wid] || 0) + (Number(hrs) || 0);
            });
        });
        return hours;
    }, [workers, workAllocations, mode]);

    const workTotalPercentages = useMemo(() => {
        const p: { [id: string]: number } = {};
        workAllocations.forEach(wa => {
            p[wa.workItemId] = Object.values(wa.allocations).reduce((s, v) => s + (Number(v) || 0), 0);
        });
        return p;
    }, [workAllocations]);

    const totalWorks = useMemo(() => workItems.reduce((s, i) => s + i.total, 0), [workItems]);
    const totalDistributed = useMemo(() => Object.values(workerTotals).reduce((s, v) => s + (Number(v) || 0), 0), [workerTotals]);

    // ─── Render ─────────────────────────────────────────────────────────────

    return (
        <div className="container mx-auto px-3 sm:px-4 py-6 sm:py-8">
            <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-text-primary">Калькулятор Зарплаты</h1>

            {/* Выбор сметы */}
            <div className="mb-6 bg-surface p-4 rounded-lg shadow">
                <label className="block text-sm font-medium text-text-primary mb-2">Выберите смету:</label>
                <select
                    value={selectedEstimateId}
                    onChange={(e) => handleEstimateChange(e.target.value)}
                    className="w-full min-h-[44px] p-2 border border-border rounded-md bg-background text-text-primary"
                >
                    <option value="">-- Выберите смету --</option>
                    {activeEstimates.map(e => (
                        <option key={e.id} value={e.id}>{e.estimateNumber} - {e.client} ({new Date(e.date).toLocaleDateString()})</option>
                    ))}
                </select>
            </div>

            {selectedEstimate && (
                <>
                    {/* Переключатель режима */}
                    <div className="mb-6 bg-surface p-4 rounded-lg shadow">
                        <div className="flex items-center gap-4">
                            <span className="text-sm font-medium text-text-primary">Режим расчёта:</span>
                            <div className="inline-flex rounded-lg border border-border bg-background overflow-hidden">
                                <button
                                    onClick={() => setMode('percent')}
                                    className={`min-h-[44px] px-4 py-2 text-sm transition ${mode === 'percent' ? 'bg-primary text-white' : 'text-text-primary hover:bg-background/70'}`}
                                >
                                    Проценты
                                </button>
                                <button
                                    onClick={() => setMode('rate')}
                                    className={`min-h-[44px] px-4 py-2 text-sm transition ${mode === 'rate' ? 'bg-primary text-white' : 'text-text-primary hover:bg-background/70'}`}
                                >
                                    Ставка (₽/час или ₽/день)
                                </button>
                            </div>
                        </div>
                        <div className="text-xs text-text-secondary mt-2">
                            {mode === 'percent'
                                ? 'Укажите процент выполнения работы каждым работником (сумма = 100%)'
                                : 'Укажите ставку работника и количество часов/дней на каждую работу'}
                        </div>
                    </div>

                    {/* Информация о смете */}
                    <div className="mb-6 bg-surface p-4 rounded-lg shadow">
                        <h2 className="text-xl font-semibold mb-2 text-text-primary">Смета: {selectedEstimate.estimateNumber}</h2>
                        <p className="text-text-secondary">Клиент: {selectedEstimate.client}</p>
                        <p className="text-text-secondary">Общая стоимость работ: {formatPrice(totalWorks)}</p>
                        <p className="text-text-secondary">Количество видов работ: {workItems.length}</p>
                    </div>

                    {/* Работники */}
                    <div className="mb-6 bg-surface p-4 rounded-lg shadow">
                        <h2 className="text-xl font-semibold mb-4 text-text-primary">Работники</h2>
                        <div className="flex gap-2 mb-4">
                            <input
                                type="text"
                                value={newWorkerName}
                                onChange={(e) => setNewWorkerName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddWorker()}
                                placeholder="Имя работника"
                                className="flex-1 min-h-[44px] p-2 border border-border rounded-md bg-background text-text-primary"
                            />
                            <button onClick={handleAddWorker} className="min-h-[44px] px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark transition active:scale-95">
                                Добавить
                            </button>
                        </div>

                        {workers.length > 0 && (
                            <div className="space-y-3">
                                {workers.map(worker => (
                                    <div key={worker.id} className="bg-background p-3 rounded-lg border border-border">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-text-primary font-medium">{worker.name}</span>
                                            <div className="flex items-center gap-3">
                                                <span className="text-lg font-semibold text-primary">{formatPrice(workerTotals[worker.id] || 0)}</span>
                                                <button onClick={() => handleRemoveWorker(worker.id)} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-red-500 hover:text-red-700 font-bold active:scale-95">✕</button>
                                            </div>
                                        </div>
                                        {mode === 'rate' && (
                                            <div className="flex items-center gap-3 mt-2">
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => handleRateTypeChange(worker.id, 'hour')}
                                                        className={`min-h-[36px] px-3 py-1 text-xs rounded transition ${worker.rateType === 'hour' ? 'bg-primary text-white' : 'bg-background border border-border text-text-secondary'}`}
                                                    >
                                                        ₽/час
                                                    </button>
                                                    <button
                                                        onClick={() => handleRateTypeChange(worker.id, 'day')}
                                                        className={`min-h-[36px] px-3 py-1 text-xs rounded transition ${worker.rateType === 'day' ? 'bg-primary text-white' : 'bg-background border border-border text-text-secondary'}`}
                                                    >
                                                        ₽/день
                                                    </button>
                                                </div>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="10"
                                                    value={worker.rateType === 'day' ? (worker.ratePerDay || '') : (worker.ratePerHour || '')}
                                                    onChange={(e) => handleRateChange(worker.id, worker.rateType === 'day' ? 'ratePerDay' : 'ratePerHour', e.target.value)}
                                                    placeholder="Ставка ₽"
                                                    className="w-28 min-h-[36px] p-1 text-center border border-border rounded bg-background text-text-primary text-sm"
                                                />
                                                {workerHours[worker.id] !== undefined && (
                                                    <span className="text-xs text-text-secondary">
                                                        Итого: {workerHours[worker.id].toFixed(1)} ч × {formatPrice(worker.rateType === 'day' ? (worker.ratePerDay || 0) : (worker.ratePerHour || 0))}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                        {workers.length === 0 && (
                            <p className="text-text-secondary text-center py-4">Добавьте работников для расчёта зарплаты</p>
                        )}
                    </div>

                    {/* Таблица распределения */}
                    {workers.length > 0 && workItems.length > 0 && (
                        <div className="bg-surface p-4 rounded-lg shadow overflow-x-auto">
                            <h2 className="text-xl font-semibold mb-4 text-text-primary">
                                {mode === 'percent' ? 'Распределение работ (%)' : 'Распределение времени (часы/дни)'}
                            </h2>
                            {/* Desktop table */}
                            <table className="w-full text-sm hidden md:table">
                                <thead>
                                    <tr className="border-b border-border">
                                        <th className="text-left p-2 text-text-primary font-semibold">Вид работы</th>
                                        <th className="text-right p-2 text-text-primary font-semibold">Стоимость</th>
                                        {workers.map(w => (
                                            <th key={w.id} className="text-center p-2 text-text-primary font-semibold">
                                                {w.name}
                                                {mode === 'rate' && <div className="text-[10px] text-text-secondary font-normal">{w.rateType === 'day' ? '₽/день' : '₽/час'}</div>}
                                            </th>
                                        ))}
                                        {mode === 'percent' && <th className="text-center p-2 text-text-primary font-semibold">Всего %</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {workAllocations.map(wa => {
                                        const totalPct = workTotalPercentages[wa.workItemId] || 0;
                                        return (
                                            <tr key={wa.workItemId} className={`border-b border-border ${mode === 'percent' && totalPct > 100 ? 'bg-red-900/20' : mode === 'percent' && totalPct === 100 ? 'bg-green-900/20' : ''}`}>
                                                <td className="p-2 text-text-primary">{wa.workItemName}</td>
                                                <td className="p-2 text-right text-text-secondary">{formatPrice(wa.workItemTotal)}</td>
                                                {workers.map(w => (
                                                    <td key={w.id} className="p-2">
                                                        {mode === 'percent' ? (
                                                            <input
                                                                type="number" min="0" max="100" step="0.1"
                                                                value={wa.allocations[w.id] || ''}
                                                                onChange={(e) => handleAllocationChange(wa.workItemId, w.id, e.target.value)}
                                                                placeholder="0"
                                                                className="w-full p-1 text-center border border-border rounded bg-background text-text-primary"
                                                            />
                                                        ) : (
                                                            <input
                                                                type="number" min="0" step="0.5"
                                                                value={wa.hours?.[w.id] || ''}
                                                                onChange={(e) => handleHoursChange(wa.workItemId, w.id, e.target.value)}
                                                                placeholder="0"
                                                                className="w-full p-1 text-center border border-border rounded bg-background text-text-primary"
                                                            />
                                                        )}
                                                    </td>
                                                ))}
                                                {mode === 'percent' && (
                                                    <td className={`p-2 text-center font-semibold ${totalPct > 100 ? 'text-red-500' : totalPct === 100 ? 'text-green-500' : 'text-text-secondary'}`}>
                                                        {totalPct.toFixed(1)}%
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>

                            {/* Mobile card list */}
                            <div className="md:hidden space-y-3">
                                {workAllocations.map(wa => {
                                    const totalPct = workTotalPercentages[wa.workItemId] || 0;
                                    return (
                                        <div key={wa.workItemId} className={`rounded-lg border border-border bg-background/40 p-3 ${mode === 'percent' && totalPct > 100 ? 'border-red-500/40' : mode === 'percent' && totalPct === 100 ? 'border-green-500/40' : ''}`}>
                                            <div className="flex items-start justify-between gap-2 mb-2">
                                                <div className="min-w-0 flex-1">
                                                    <div className="font-semibold text-text-primary text-sm truncate">{wa.workItemName}</div>
                                                    <div className="text-xs text-text-secondary">{formatPrice(wa.workItemTotal)}</div>
                                                </div>
                                                {mode === 'percent' && (
                                                    <span className={`shrink-0 text-xs font-semibold ${totalPct > 100 ? 'text-red-500' : totalPct === 100 ? 'text-green-500' : 'text-text-secondary'}`}>
                                                        {totalPct.toFixed(1)}%
                                                    </span>
                                                )}
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                {workers.map(w => (
                                                    <div key={w.id}>
                                                        <label className="text-xs text-text-secondary block mb-1 truncate">{w.name}</label>
                                                        {mode === 'percent' ? (
                                                            <input
                                                                type="number" min="0" max="100" step="0.1"
                                                                value={wa.allocations[w.id] || ''}
                                                                onChange={(e) => handleAllocationChange(wa.workItemId, w.id, e.target.value)}
                                                                placeholder="0"
                                                                className="w-full min-h-[44px] p-2 text-center border border-border rounded bg-background text-text-primary text-sm"
                                                            />
                                                        ) : (
                                                            <input
                                                                type="number" min="0" step="0.5"
                                                                value={wa.hours?.[w.id] || ''}
                                                                onChange={(e) => handleHoursChange(wa.workItemId, w.id, e.target.value)}
                                                                placeholder="0"
                                                                className="w-full min-h-[44px] p-2 text-center border border-border rounded bg-background text-text-primary text-sm"
                                                            />
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Итоги */}
                            <div className="mt-6 pt-4 border-t border-border">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <h3 className="text-lg font-semibold text-text-primary mb-2">Итоги по работникам:</h3>
                                        {workers.map(w => (
                                            <div key={w.id} className="flex justify-between mb-1">
                                                <span className="text-text-primary">
                                                    {w.name}
                                                    {mode === 'rate' && (
                                                        <span className="text-xs text-text-secondary ml-2">
                                                            ({workerHours[w.id]?.toFixed(1) || 0} ч × {formatPrice(w.rateType === 'day' ? (w.ratePerDay || 0) : (w.ratePerHour || 0))})
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="font-semibold text-primary">{formatPrice(workerTotals[w.id] || 0)}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="sm:text-right">
                                        <div className="mb-2">
                                            <span className="text-text-secondary">Всего работ: </span>
                                            <span className="font-semibold text-text-primary">{formatPrice(totalWorks)}</span>
                                        </div>
                                        {mode === 'percent' && (
                                            <div className="mb-2">
                                                <span className="text-text-secondary">Распределено: </span>
                                                <span className="font-semibold text-primary">{formatPrice(totalDistributed)}</span>
                                            </div>
                                        )}
                                        <div className={`text-lg font-bold ${totalDistributed > totalWorks ? 'text-red-500' : totalDistributed === totalWorks ? 'text-green-500' : 'text-yellow-500'}`}>
                                            {mode === 'percent' ? (
                                                totalDistributed > totalWorks ? `⚠ Перерасход: ${formatPrice(totalDistributed - totalWorks)}` :
                                                totalDistributed === totalWorks ? '✓ Полностью распределено' :
                                                `Осталось: ${formatPrice(totalWorks - totalDistributed)}`
                                            ) : (
                                                `Итого к выплате: ${formatPrice(totalDistributed)}`
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {workers.length === 0 && (
                        <div className="bg-surface p-8 rounded-lg shadow text-center">
                            <p className="text-text-secondary text-lg">Добавьте работников, чтобы начать расчёт</p>
                        </div>
                    )}
                </>
            )}

            {!selectedEstimate && (
                <div className="bg-surface p-8 rounded-lg shadow text-center">
                    <p className="text-text-secondary text-lg">Выберите смету для начала расчёта зарплаты</p>
                </div>
            )}
        </div>
    );
};

export default React.memo(SalaryCalculator);
