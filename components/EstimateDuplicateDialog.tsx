import React, { useState } from 'react';
import type { EstimateDuplicateGroup } from '../services/estimateIntelligence';

interface EstimateDuplicateDialogProps {
    isOpen: boolean;
    onClose: () => void;
    duplicateGroups: EstimateDuplicateGroup[];
    onDelete: (estimateNumber: string, idsToDelete: string[]) => Promise<void>;
}

const EstimateDuplicateDialog: React.FC<EstimateDuplicateDialogProps> = ({
    isOpen,
    onClose,
    duplicateGroups,
    onDelete,
}) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteResult, setDeleteResult] = useState<{ success: boolean; message: string } | null>(null);

    // Initialize selection on open: select all duplicates (identicalToLatest + extras in identicalPairs)
    React.useEffect(() => {
        if (!isOpen || duplicateGroups.length === 0) return;
        const initial = new Set<string>();
        for (const group of duplicateGroups) {
            for (const e of group.identicalToLatest) {
                initial.add(e.id);
            }
            for (const pair of group.identicalPairs) {
                // Keep first in pair, select the rest for deletion
                for (let i = 1; i < pair.length; i++) {
                    initial.add(pair[i].id);
                }
            }
        }
        setSelectedIds(initial);
    }, [isOpen, duplicateGroups]);

    if (!isOpen) return null;

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const totalToDelete = Array.from(selectedIds).length;

    const handleDeleteAll = async () => {
        if (totalToDelete === 0) return;
        setIsDeleting(true);
        setDeleteResult(null);
        let totalDeleted = 0;
        try {
            for (const group of duplicateGroups) {
                const idsForGroup = group.identicalToLatest
                    .filter(e => selectedIds.has(e.id))
                    .map(e => e.id);
                for (const pair of group.identicalPairs) {
                    for (let i = 1; i < pair.length; i++) {
                        if (selectedIds.has(pair[i].id)) {
                            idsForGroup.push(pair[i].id);
                        }
                    }
                }
                if (idsForGroup.length > 0) {
                    await onDelete(group.estimateNumber, idsForGroup);
                    totalDeleted += idsForGroup.length;
                }
            }
            setDeleteResult({ success: true, message: `Удалено дублей: ${totalDeleted}` });
            setTimeout(() => {
                setDeleteResult(null);
                onClose();
            }, 1200);
        } catch {
            setDeleteResult({ success: false, message: 'Ошибка при удалении дублей' });
        } finally {
            setIsDeleting(false);
        }
    };

    const formatPrice = (total: number) =>
        new Intl.NumberFormat('ru-RU').format(total) + ' ₽';

    const Spinner = () => (
        <svg className="animate-spin h-4 w-4 inline-block mr-1" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="bg-surface p-6 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-text-primary">Дубли версий смет</h2>
                    <button onClick={onClose} className="text-text-secondary hover:text-text-primary text-2xl leading-none">&times;</button>
                </div>

                {deleteResult && (
                    <div className={`mb-4 p-3 rounded-lg text-sm font-semibold ${
                        deleteResult.success
                            ? 'bg-green-500/20 border border-green-500/40 text-green-300'
                            : 'bg-red-500/20 border border-red-500/40 text-red-300'
                    }`}>
                        {deleteResult.message}
                    </div>
                )}

                {duplicateGroups.length === 0 ? (
                    <div className="text-center py-8">
                        <div className="text-4xl mb-4">✅</div>
                        <p className="text-text-secondary text-lg">Дубли версий не найдены</p>
                    </div>
                ) : (
                    <>
                        <p className="text-text-secondary mb-2 text-sm">
                            Найдено групп: {duplicateGroups.length}. Все дубли автоматически выбраны на удаление.
                        </p>
                        <p className="text-text-secondary mb-4 text-sm">
                            <strong className="text-text-primary">Главная версия</strong> (самая последняя) всегда сохраняется.
                        </p>

                        <div className="flex gap-3 mb-4">
                            <button
                                onClick={handleDeleteAll}
                                disabled={isDeleting || totalToDelete === 0}
                                className="bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-md transition"
                            >
                                {isDeleting ? <><Spinner /> Удаление...</> : `Удалить выбранные (${totalToDelete})`}
                            </button>
                            <button
                                onClick={onClose}
                                disabled={isDeleting}
                                className="bg-border hover:bg-border/80 disabled:opacity-50 text-text-primary font-bold py-2 px-4 rounded-md transition"
                            >
                                Отмена
                            </button>
                        </div>

                        <div className="space-y-4">
                            {duplicateGroups.map(group => (
                                <div key={group.estimateNumber} className="bg-background rounded-lg p-4 border border-border">
                                    <h3 className="text-text-primary font-semibold mb-3">
                                        Смета №{group.estimateNumber}
                                        <span className="ml-2 text-sm text-text-secondary">
                                            (главная: v{group.latestVersion.version})
                                        </span>
                                    </h3>

                                    {/* Main version - always kept */}
                                    <div className="bg-green-500/10 border border-green-500/30 rounded-md p-3 mb-3">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <span className="text-green-400 font-semibold text-sm">✓ ГЛАВНАЯ ВЕРСИЯ</span>
                                                <span className="ml-2 text-text-primary">v{group.latestVersion.version}</span>
                                                <span className="ml-2 text-text-secondary text-sm">
                                                    {new Date(group.latestVersion.date).toLocaleDateString('ru-RU')}
                                                </span>
                                            </div>
                                            <span className="text-text-primary font-medium text-sm">
                                                {formatPrice(group.latestVersion.total)}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Identical to latest */}
                                    {group.identicalToLatest.length > 0 && (
                                        <div className="mb-3">
                                            <p className="text-text-secondary text-xs mb-2">
                                                Идентичны главной версии ({group.identicalToLatest.length} шт.) — будут удалены:
                                            </p>
                                            {group.identicalToLatest.map(e => (
                                                <label
                                                    key={e.id}
                                                    className={`flex items-center justify-between p-2 rounded-md mb-1 cursor-pointer transition ${
                                                        selectedIds.has(e.id) ? 'bg-red-500/10 border border-red-500/30' : 'opacity-50'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedIds.has(e.id)}
                                                            onChange={() => toggleSelect(e.id)}
                                                            className="accent-red-500"
                                                            disabled={isDeleting}
                                                        />
                                                        <span className="text-text-primary text-sm">v{e.version}</span>
                                                        <span className="text-text-secondary text-xs">
                                                            {new Date(e.date).toLocaleDateString('ru-RU')}
                                                        </span>
                                                    </div>
                                                    <span className="text-text-primary text-sm">{formatPrice(e.total)}</span>
                                                </label>
                                            ))}
                                        </div>
                                    )}

                                    {/* Identical pairs */}
                                    {group.identicalPairs.map((pair, pairIdx) => (
                                        <div key={pairIdx} className="mb-3">
                                            <p className="text-text-secondary text-xs mb-2">
                                                Одинаковые версии ({pair.length} шт.) — оставить одну, остальные удалить:
                                            </p>
                                            {pair.map((e, eIdx) => (
                                                <label
                                                    key={e.id}
                                                    className={`flex items-center justify-between p-2 rounded-md mb-1 cursor-pointer transition ${
                                                        selectedIds.has(e.id) ? 'bg-red-500/10 border border-red-500/30' : 'opacity-50'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedIds.has(e.id)}
                                                            onChange={() => toggleSelect(e.id)}
                                                            className="accent-red-500"
                                                            disabled={isDeleting}
                                                        />
                                                        <span className="text-text-primary text-sm">v{e.version}</span>
                                                        <span className="text-text-secondary text-xs">
                                                            {new Date(e.date).toLocaleDateString('ru-RU')}
                                                        </span>
                                                        {eIdx === 0 && (
                                                            <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded">
                                                                оставить
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-text-primary text-sm">{formatPrice(e.total)}</span>
                                                </label>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default EstimateDuplicateDialog;
