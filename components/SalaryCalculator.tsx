import React, { useState, useMemo, useEffect } from 'react';
import { Estimate, Worker, WorkAllocation, SalaryCalculation, EstimateSubgroup } from '../types';
import { saveSalaryCalculation, loadSalaryCalculationByEstimateId } from '../services/database';

interface SalaryCalculatorProps {
    estimates: Estimate[];
}

// Функция форматирования цены
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

    // Фильтруем только активные сметы (не архивные)
    const activeEstimates = useMemo(() => {
        return estimates.filter(e => !e.isArchived);
    }, [estimates]);

    // Получаем выбранную смету
    const selectedEstimate = useMemo(() => {
        return activeEstimates.find(e => e.id === selectedEstimateId);
    }, [activeEstimates, selectedEstimateId]);

    // Получаем только работы из выбранной сметы
    const workItems = useMemo(() => {
        if (!selectedEstimate) return [];
        return selectedEstimate.items.filter(item => item.subgroup === EstimateSubgroup.WORKS);
    }, [selectedEstimate]);

    // Загрузить сохраненный расчет при выборе сметы
    useEffect(() => {
        const loadSavedCalculation = async () => {
            if (selectedEstimateId) {
                const saved = await loadSalaryCalculationByEstimateId(selectedEstimateId);
                if (saved) {
                    setWorkers(saved.workers);
                    setWorkAllocations(saved.workAllocations);
                }
            }
        };
        loadSavedCalculation();
    }, [selectedEstimateId]);

    // Автосохранение при изменении работников или распределений
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
                };
                await saveSalaryCalculation(calculation);
            }
        };
        saveCalculation();
    }, [selectedEstimateId, selectedEstimate, workers, workAllocations]);

    // Обработчик выбора сметы
    const handleEstimateChange = (estimateId: string) => {
        setSelectedEstimateId(estimateId);
        
        // Инициализируем распределение работ только если нет сохраненных данных
        const estimate = activeEstimates.find(e => e.id === estimateId);
        if (estimate) {
            const works = estimate.items.filter(item => item.subgroup === EstimateSubgroup.WORKS);
            const initialAllocations: WorkAllocation[] = works.map(work => ({
                workItemId: work.id,
                workItemName: work.name,
                workItemTotal: work.total,
                allocations: {},
            }));
            setWorkAllocations(initialAllocations);
        }
    };

    // Добавить работника
    const handleAddWorker = () => {
        if (!newWorkerName.trim()) {
            alert('Введите имя работника');
            return;
        }
        
        const newWorker: Worker = {
            id: `worker-${Date.now()}`,
            name: newWorkerName.trim(),
        };
        
        const updatedWorkers = [...workers, newWorker];
        setWorkers(updatedWorkers);
        setNewWorkerName('');
        
        // Автоматически распределяем работы только для 1-2 работников
        if (updatedWorkers.length <= 2) {
            const equalPercentage = 100 / updatedWorkers.length;
            setWorkAllocations(workAllocations.map(wa => {
                const newAllocations: { [workerId: string]: number } = {};
                updatedWorkers.forEach(worker => {
                    newAllocations[worker.id] = equalPercentage;
                });
                return { ...wa, allocations: newAllocations };
            }));
        } else {
            // Для 3+ работников добавляем нового с 0% на все работы
            setWorkAllocations(workAllocations.map(wa => ({
                ...wa,
                allocations: {
                    ...wa.allocations,
                    [newWorker.id]: 0,
                },
            })));
        }
    };

    // Удалить работника
    const handleRemoveWorker = (workerId: string) => {
        const message = workers.length <= 2 
            ? 'Удалить работника? Проценты будут перераспределены между остальными.'
            : 'Удалить работника? Его распределения будут удалены.';
        
        if (window.confirm(message)) {
            const updatedWorkers = workers.filter(w => w.id !== workerId);
            setWorkers(updatedWorkers);
            
            if (updatedWorkers.length > 0) {
                if (updatedWorkers.length <= 2) {
                    // Перераспределяем работы равномерно между оставшимися работниками (только для 1-2 работников)
                    const equalPercentage = 100 / updatedWorkers.length;
                    setWorkAllocations(workAllocations.map(wa => {
                        const newAllocations: { [workerId: string]: number } = {};
                        updatedWorkers.forEach(worker => {
                            newAllocations[worker.id] = equalPercentage;
                        });
                        return { ...wa, allocations: newAllocations };
                    }));
                } else {
                    // Для 3+ работников просто удаляем распределения этого работника
                    setWorkAllocations(workAllocations.map(wa => {
                        const newAllocations = { ...wa.allocations };
                        delete newAllocations[workerId];
                        return { ...wa, allocations: newAllocations };
                    }));
                }
            } else {
                // Если не осталось работников, очищаем распределения
                setWorkAllocations(workAllocations.map(wa => ({
                    ...wa,
                    allocations: {},
                })));
            }
        }
    };

    // Обновить процент выполнения работы работником
    const handleAllocationChange = (workItemId: string, workerId: string, value: string) => {
        const numValue = parseFloat(value) || 0;
        
        // Ограничиваем значение от 0 до 100
        const clampedValue = Math.max(0, Math.min(100, numValue));
        
        setWorkAllocations(workAllocations.map(wa => {
            if (wa.workItemId === workItemId) {
                const newAllocations = { ...wa.allocations, [workerId]: clampedValue };
                
                // Автоматически распределяем остаток между другими работниками только для 2 работников
                if (workers.length <= 2) {
                    const otherWorkers = workers.filter(w => w.id !== workerId);
                    if (otherWorkers.length > 0) {
                        const remaining = 100 - clampedValue;
                        const perWorker = remaining / otherWorkers.length;
                        
                        otherWorkers.forEach(worker => {
                            newAllocations[worker.id] = perWorker;
                        });
                    }
                }
                
                return {
                    ...wa,
                    allocations: newAllocations,
                };
            }
            return wa;
        }));
    };

    // Рассчитать итоги по каждому работнику
    const workerTotals = useMemo(() => {
        const totals: { [workerId: string]: number } = {};
        
        workers.forEach(worker => {
            totals[worker.id] = 0;
        });
        
        workAllocations.forEach(wa => {
            Object.entries(wa.allocations).forEach(([workerId, percentage]) => {
                const currentTotal = totals[workerId] || 0;
                const percentageNum = Number(percentage) || 0;
                totals[workerId] = currentTotal + (wa.workItemTotal * percentageNum / 100);
            });
        });
        
        return totals;
    }, [workers, workAllocations]);

    // Рассчитать процент распределения по каждой работе
    const workTotalPercentages = useMemo(() => {
        const percentages: { [workItemId: string]: number } = {};
        
        workAllocations.forEach(wa => {
            const total: number = Object.values(wa.allocations).reduce<number>((sum, val) => sum + (Number(val) || 0), 0);
            percentages[wa.workItemId] = total;
        });
        
        return percentages;
    }, [workAllocations]);

    // Общая сумма работ
    const totalWorks = useMemo(() => {
        return workItems.reduce((sum, item) => sum + item.total, 0);
    }, [workItems]);

    // Общая сумма распределенных денег
    const totalDistributed = useMemo(() => {
        return Object.values(workerTotals).reduce((sum: number, val) => sum + (Number(val) || 0), 0);
    }, [workerTotals]);

    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold mb-6 text-text-primary">Калькулятор Зарплаты</h1>

            {/* Выбор сметы */}
            <div className="mb-6 bg-surface p-4 rounded-lg shadow">
                <label className="block text-sm font-medium text-text-primary mb-2">
                    Выберите смету:
                </label>
                <select
                    value={selectedEstimateId}
                    onChange={(e) => handleEstimateChange(e.target.value)}
                    className="w-full p-2 border border-border rounded-md bg-background text-text-primary"
                >
                    <option value="">-- Выберите смету --</option>
                    {activeEstimates.map(estimate => (
                        <option key={estimate.id} value={estimate.id}>
                            {estimate.estimateNumber} - {estimate.client} ({new Date(estimate.date).toLocaleDateString()})
                        </option>
                    ))}
                </select>
            </div>

            {selectedEstimate && (
                <>
                    {/* Информация о смете */}
                    <div className="mb-6 bg-surface p-4 rounded-lg shadow">
                        <h2 className="text-xl font-semibold mb-2 text-text-primary">
                            Смета: {selectedEstimate.estimateNumber}
                        </h2>
                        <p className="text-text-secondary">Клиент: {selectedEstimate.client}</p>
                        <p className="text-text-secondary">
                            Общая стоимость работ: {formatPrice(totalWorks)}
                        </p>
                        <p className="text-text-secondary">
                            Количество видов работ: {workItems.length}
                        </p>
                    </div>

                    {/* Добавление работников */}
                    <div className="mb-6 bg-surface p-4 rounded-lg shadow">
                        <h2 className="text-xl font-semibold mb-4 text-text-primary">Работники</h2>
                        
                        <div className="flex gap-2 mb-4">
                            <input
                                type="text"
                                value={newWorkerName}
                                onChange={(e) => setNewWorkerName(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleAddWorker()}
                                placeholder="Имя работника"
                                className="flex-1 p-2 border border-border rounded-md bg-background text-text-primary"
                            />
                            <button
                                onClick={handleAddWorker}
                                className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark transition"
                            >
                                Добавить
                            </button>
                        </div>

                        {workers.length > 0 && (
                            <div className="space-y-2">
                                {workers.map(worker => (
                                    <div key={worker.id} className="flex justify-between items-center bg-background p-3 rounded">
                                        <span className="text-text-primary font-medium">{worker.name}</span>
                                        <div className="flex items-center gap-4">
                                            <span className="text-lg font-semibold text-primary">
                                                {formatPrice(workerTotals[worker.id] || 0)}
                                            </span>
                                            <button
                                                onClick={() => handleRemoveWorker(worker.id)}
                                                className="text-red-500 hover:text-red-700 font-bold"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        
                        {workers.length === 0 && (
                            <p className="text-text-secondary text-center py-4">
                                Добавьте работников для расчета зарплаты
                            </p>
                        )}
                    </div>

                    {/* Таблица распределения работ */}
                    {workers.length > 0 && workItems.length > 0 && (
                        <div className="bg-surface p-4 rounded-lg shadow overflow-x-auto">
                            <h2 className="text-xl font-semibold mb-4 text-text-primary">
                                Распределение работ
                            </h2>
                            
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border">
                                        <th className="text-left p-2 text-text-primary font-semibold">Вид работы</th>
                                        <th className="text-right p-2 text-text-primary font-semibold">Стоимость</th>
                                        {workers.map(worker => (
                                            <th key={worker.id} className="text-center p-2 text-text-primary font-semibold">
                                                {worker.name}
                                            </th>
                                        ))}
                                        <th className="text-center p-2 text-text-primary font-semibold">Всего %</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {workAllocations.map(wa => {
                                        const totalPercentage = workTotalPercentages[wa.workItemId] || 0;
                                        const isComplete = totalPercentage === 100;
                                        const isOverallocated = totalPercentage > 100;
                                        
                                        return (
                                            <tr 
                                                key={wa.workItemId} 
                                                className={`border-b border-border ${
                                                    isOverallocated ? 'bg-red-900 bg-opacity-20' : 
                                                    isComplete ? 'bg-green-900 bg-opacity-20' : ''
                                                }`}
                                            >
                                                <td className="p-2 text-text-primary">{wa.workItemName}</td>
                                                <td className="p-2 text-right text-text-secondary">
                                                    {formatPrice(wa.workItemTotal)}
                                                </td>
                                                {workers.map(worker => (
                                                    <td key={worker.id} className="p-2">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="100"
                                                            step="0.1"
                                                            value={wa.allocations[worker.id] || ''}
                                                            onChange={(e) => handleAllocationChange(wa.workItemId, worker.id, e.target.value)}
                                                            placeholder="0"
                                                            className="w-full p-1 text-center border border-border rounded bg-background text-text-primary"
                                                        />
                                                    </td>
                                                ))}
                                                <td className={`p-2 text-center font-semibold ${
                                                    isOverallocated ? 'text-red-500' :
                                                    isComplete ? 'text-green-500' : 'text-text-secondary'
                                                }`}>
                                                    {totalPercentage.toFixed(1)}%
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>

                            {/* Итоги */}
                            <div className="mt-6 pt-4 border-t border-border">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <h3 className="text-lg font-semibold text-text-primary mb-2">
                                            Итоги по работникам:
                                        </h3>
                                        {workers.map(worker => (
                                            <div key={worker.id} className="flex justify-between mb-1">
                                                <span className="text-text-primary">{worker.name}:</span>
                                                <span className="font-semibold text-primary">
                                                    {formatPrice(workerTotals[worker.id] || 0)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="text-right">
                                        <div className="mb-2">
                                            <span className="text-text-secondary">Всего работ: </span>
                                            <span className="font-semibold text-text-primary">
                                                {formatPrice(totalWorks)}
                                            </span>
                                        </div>
                                        <div className="mb-2">
                                            <span className="text-text-secondary">Распределено: </span>
                                            <span className="font-semibold text-primary">
                                                {formatPrice(totalDistributed)}
                                            </span>
                                        </div>
                                        <div className={`text-lg font-bold ${
                                            totalDistributed > totalWorks ? 'text-red-500' :
                                            totalDistributed === totalWorks ? 'text-green-500' : 'text-yellow-500'
                                        }`}>
                                            {totalDistributed > totalWorks && '⚠ Перерасход: '}
                                            {totalDistributed === totalWorks && '✓ Полностью распределено'}
                                            {totalDistributed < totalWorks && `Осталось: ${formatPrice(totalWorks - totalDistributed)}`}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Подсказки */}
                            <div className="mt-4 p-3 bg-background rounded text-sm text-text-secondary">
                                <p className="mb-1">💡 <strong>Подсказки:</strong></p>
                                <ul className="list-disc list-inside space-y-1">
                                    <li>Автоматическое распределение работает только для 1-2 работников</li>
                                    <li>При 3+ работниках распределение процентов происходит вручную</li>
                                    <li className="text-green-500">Зеленая строка: работа полностью распределена (100%)</li>
                                    <li className="text-red-500">Красная строка: работа распределена больше чем на 100%</li>
                                    <li>Сумма процентов по каждой работе должна быть равна 100%</li>
                                </ul>
                            </div>
                        </div>
                    )}

                    {workers.length === 0 && (
                        <div className="bg-surface p-8 rounded-lg shadow text-center">
                            <p className="text-text-secondary text-lg">
                                Добавьте работников, чтобы начать распределение работ
                            </p>
                        </div>
                    )}
                </>
            )}

            {!selectedEstimate && (
                <div className="bg-surface p-8 rounded-lg shadow text-center">
                    <p className="text-text-secondary text-lg">
                        Выберите смету для начала расчета зарплаты
                    </p>
                </div>
            )}
        </div>
    );
};

export default SalaryCalculator;
