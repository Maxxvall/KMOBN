import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Estimate, EstimateStatus, ProjectTemplate } from '../types';
import { exportData, importData } from '../services/database';

interface EstimateHistoryProps {
    estimates: Estimate[];
    templates: ProjectTemplate[];
    onCreateNew: () => void;
    onEdit: (estimate: Estimate) => void;
    onDelete: (estimate: Estimate) => void;
    onDeleteVersion: (estimate: Estimate) => void;
    onGeneratePdf: (estimate: Estimate) => void;
}

const statusColors: { [key in EstimateStatus]: string } = {
    [EstimateStatus.DRAFT]: 'bg-yellow-900 text-yellow-200 border border-yellow-700',
    [EstimateStatus.SENT]: 'bg-blue-900 text-blue-200 border border-blue-700',
    [EstimateStatus.APPROVED]: 'bg-green-900 text-green-200 border border-green-700',
    [EstimateStatus.ARCHIVED]: 'bg-gray-700 text-gray-300 border border-gray-600',
};

const VersionDropdown: React.FC<{
    versions: Estimate[];
    selectedId: string;
    onSelect: (id: string) => void;
    onDelete: (estimate: Estimate) => void;
}> = ({ versions, selectedId, onSelect, onDelete }) => {
    const [open, setOpen] = useState(false);
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

    const selected = versions.find(v => v.id === selectedId) ?? versions[0];

    return (
        <div ref={rootRef} className="relative inline-flex">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="min-w-[180px] p-1 bg-background border border-border rounded-md text-sm text-left flex items-center justify-between gap-2 hover:border-primary transition"
                aria-haspopup="listbox"
                aria-expanded={open}
            >
                <span className="truncate">
                    {selected ? `v${selected.version} (${new Date(selected.date).toLocaleDateString()})` : 'Выбрать версию'}
                </span>
                <span className="text-text-secondary">▾</span>
            </button>

            {open && (
                <div className="absolute z-30 mt-2 w-full bg-surface border border-border rounded-xl shadow-2xl overflow-hidden">
                    <div role="listbox" className="max-h-72 overflow-auto">
                        {versions.map(v => (
                            <div
                                key={v.id}
                                className={`flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-background/50 transition ${v.id === selectedId ? 'bg-background/40' : ''}`}
                            >
                                <button
                                    type="button"
                                    className="flex-1 text-left truncate"
                                    onClick={() => {
                                        onSelect(v.id);
                                        setOpen(false);
                                    }}
                                >
                                    <span className="font-semibold">v{v.version}</span>{' '}
                                    <span className="text-text-secondary">({new Date(v.date).toLocaleDateString()})</span>
                                </button>
                                <button
                                    type="button"
                                    className="text-text-secondary hover:text-red-400 transition-transform hover:scale-110"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDelete(v);
                                    }}
                                    aria-label={`Удалить версию v${v.version}`}
                                >
                                    ✖
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const EstimateHistory: React.FC<EstimateHistoryProps> = ({ estimates, templates, onCreateNew, onEdit, onDelete, onDeleteVersion, onGeneratePdf }) => {
    const [filterClient, setFilterClient] = useState('');
    const [filterStatus, setFilterStatus] = useState<EstimateStatus | 'all'>('all');
    const [filterBuildingType, setFilterBuildingType] = useState<string>('');
    const [filterAreaMin, setFilterAreaMin] = useState('');
    const [filterAreaMax, setFilterAreaMax] = useState('');
    const [selectedVersions, setSelectedVersions] = useState<Record<string, string>>({});

    const handleExportData = async () => {
        try {
            const data = await exportData();
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            alert('Данные экспортированы успешно!');
        } catch (error) {
            console.error('Export failed:', error);
            alert('Ошибка при экспорте данных.');
        }
    };

    const handleImportData = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            try {
                const text = await file.text();
                await importData(text);
                alert('Данные импортированы успешно! Перезагрузите страницу для обновления.');
                window.location.reload();
            } catch (error) {
                console.error('Import failed:', error);
                alert('Ошибка при импорте данных. Проверьте файл.');
            }
        };
        input.click();
    };

    const filteredEstimates = useMemo(() => {
        return estimates
            .filter(e => !e.isArchived)
            .filter(e => filterClient === '' || e.client.toLowerCase().includes(filterClient.toLowerCase()))
            .filter(e => filterStatus === 'all' || e.status === filterStatus)
            .filter(e => filterBuildingType === '' || e.buildingType.toLowerCase().includes(filterBuildingType.toLowerCase()))
            .filter(e => {
                const min = filterAreaMin === '' ? 0 : parseFloat(filterAreaMin);
                const max = filterAreaMax === '' ? Infinity : parseFloat(filterAreaMax);
                return e.area >= min && e.area <= max;
            })
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [estimates, filterClient, filterStatus, filterBuildingType, filterAreaMin, filterAreaMax]);
    
    const getVersionHistory = (estimate: Estimate) => {
        const parentId = estimate.parentId || estimate.id;
        return estimates
            .filter(e => e.parentId === parentId || e.id === parentId)
            .sort((a, b) => b.version - a.version);
    }

    const getSelectedVersionEstimate = (estimate: Estimate): Estimate => {
        const parentId = estimate.parentId || estimate.id;
        const selectedVersionId = selectedVersions[parentId];
        
        if (selectedVersionId) {
            const selectedEstimate = estimates.find(e => e.id === selectedVersionId);
            if (selectedEstimate) return selectedEstimate;
        }
        
        return estimate;
    }

    const handleVersionChange = (parentId: string, versionId: string) => {
        setSelectedVersions(prev => ({
            ...prev,
            [parentId]: versionId
        }));
    }

    useEffect(() => {
        setSelectedVersions(prev => {
            let changed = false;
            const next = { ...prev };

            Object.entries(prev).forEach(([parentId, selectedId]) => {
                const exists = estimates.some(e => e.id === selectedId);
                if (exists) return;
                const versionHistory = estimates
                    .filter(e => (e.parentId || e.id) === parentId)
                    .sort((a, b) => b.version - a.version);
                if (versionHistory.length > 0) {
                    next[parentId] = versionHistory[0].id;
                } else {
                    delete next[parentId];
                }
                changed = true;
            });

            return changed ? next : prev;
        });
    }, [estimates]);

    return (
        <div className="bg-surface p-4 rounded-lg shadow-2xl">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                <h2 className="text-2xl font-bold text-text-primary">История смет</h2>
                <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                    <input
                        type="text"
                        placeholder="Фильтр по клиенту..."
                        className="p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary w-full sm:w-auto"
                        value={filterClient}
                        onChange={(e) => setFilterClient(e.target.value)}
                    />
                    <select
                        className="p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary w-full sm:w-auto"
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value as EstimateStatus | 'all')}
                    >
                        <option value="all">Все статусы</option>
                        {Object.values(EstimateStatus).filter(s => s !== EstimateStatus.ARCHIVED).map(status => (
                            <option key={status} value={status}>{status}</option>
                        ))}
                    </select>
                    <input
                        type="text"
                        placeholder="Тип строения"
                        className="p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary w-full sm:w-auto"
                        value={filterBuildingType}
                        onChange={(e) => setFilterBuildingType(e.target.value)}
                    />
                    <div className="flex gap-2 w-full sm:w-auto">
                        <input
                            type="number"
                            placeholder="Площадь от"
                            className="p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary w-full"
                            value={filterAreaMin}
                            onChange={(e) => setFilterAreaMin(e.target.value)}
                        />
                        <input
                            type="number"
                            placeholder="до"
                            className="p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary w-full"
                            value={filterAreaMax}
                            onChange={(e) => setFilterAreaMax(e.target.value)}
                        />
                    </div>
                    <button onClick={handleExportData} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md shadow-md transition duration-300 w-full sm:w-auto">
                        Экспорт данных
                    </button>
                    <button onClick={handleImportData} className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-md shadow-md transition duration-300 w-full sm:w-auto">
                        Импорт данных
                    </button>
                    <button onClick={onCreateNew} className="bg-primary hover:bg-primary-hover text-white font-bold py-2 px-4 rounded-md shadow-md transition duration-300 w-full sm:w-auto">
                       Создать новую
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full">
                    <thead>
                        <tr className="border-b border-border">
                            <th className="text-left py-2 px-3 uppercase font-semibold text-sm text-text-secondary">Номер</th>
                            <th className="text-left py-2 px-3 uppercase font-semibold text-sm text-text-secondary">Клиент</th>
                            <th className="text-left py-2 px-3 uppercase font-semibold text-sm text-text-secondary">Дата</th>
                            <th className="text-center py-2 px-3 uppercase font-semibold text-sm text-text-secondary">Версия</th>
                            <th className="text-center py-2 px-3 uppercase font-semibold text-sm text-text-secondary">Статус</th>
                            <th className="text-center py-2 px-3 uppercase font-semibold text-sm text-text-secondary">Вид Стр.</th>
                            <th className="text-center py-2 px-3 uppercase font-semibold text-sm text-text-secondary">Площадь</th>
                            <th className="text-right py-2 px-3 uppercase font-semibold text-sm text-text-secondary">Сумма</th>
                            <th className="text-center py-2 px-3 uppercase font-semibold text-sm text-text-secondary">Действия</th>
                        </tr>
                    </thead>
                    <tbody className="text-text-primary">
                        {filteredEstimates.map(estimate => {
                            const parentId = estimate.parentId || estimate.id;
                            const selectedEstimate = getSelectedVersionEstimate(estimate);
                            const versionHistory = getVersionHistory(estimate);
                            
                            return (
                                <tr key={estimate.id} className="border-b border-border hover:bg-gray-700/50 transition-colors">
                                    <td className="text-left py-2 px-3">{estimate.estimateNumber}</td>
                                    <td className="text-left py-2 px-3">{estimate.client}</td>
                                    <td className="text-left py-2 px-3">{new Date(estimate.date).toLocaleDateString()}</td>
                                    <td className="text-center py-2 px-3">
                                        <VersionDropdown
                                            versions={versionHistory}
                                            selectedId={selectedVersions[parentId] || estimate.id}
                                            onSelect={(versionId) => handleVersionChange(parentId, versionId)}
                                            onDelete={onDeleteVersion}
                                        />
                                    </td>
                                    <td className="text-center py-3 px-4">
                                        <span className={`py-1 px-3 rounded-full text-xs font-semibold ${statusColors[estimate.status]}`}>
                                            {estimate.status}
                                        </span>
                                    </td>
                                    <td className="text-center py-2 px-3">{estimate.buildingType}</td>
                                    <td className="text-center py-2 px-3">{estimate.area} м²</td>
                                    <td className="text-right py-2 px-3 font-medium">{selectedEstimate.total.toLocaleString('ru-RU')} ₽</td>
                                    <td className="text-center py-2 px-3">
                                        <div className="flex item-center justify-center gap-3">
                                            <button onClick={() => onEdit(selectedEstimate)} className="text-blue-400 hover:text-blue-300 font-semibold transition-colors">Просмотр</button>
                                            <button onClick={() => onGeneratePdf(selectedEstimate)} className="text-purple-400 hover:text-purple-300 font-semibold transition-colors">PDF</button>
                                            <button onClick={() => onDelete(estimate)} className="text-red-500 hover:text-red-400 font-semibold transition-colors">Удалить</button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default EstimateHistory;