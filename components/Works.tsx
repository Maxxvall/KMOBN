import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Work, EstimateCategory, DuplicateGroup, findDuplicates } from '../types';

import { useOptionalCatalogContext } from '../contexts/CatalogContext';
import DuplicateCheckerDialog from './DuplicateCheckerDialog';
import WorkToolRequirementsEditor from './WorkToolRequirementsEditor';
import type { CatalogDuplicateDecision } from '../services/duplicateManagement';

interface WorksProps {
    works?: Work[];
    onAddWork?: (name: string, category: EstimateCategory, price: number) => void | Promise<void>;
    onUpdateWork?: (work: Work) => void | Promise<void>;
    onDeleteWork?: (workId: string) => void | Promise<void>;
}

const Works: React.FC<WorksProps> = ({ works, onAddWork, onUpdateWork, onDeleteWork }) => {
    const catalogContext = useOptionalCatalogContext();
    const worksList = useMemo(() => works ?? catalogContext?.works ?? [], [works, catalogContext?.works]);
    const totalWorksCount = works ? worksList.length : (catalogContext?.worksTotalCount ?? worksList.length);
    const hiddenWorksCount = Math.max(0, totalWorksCount - worksList.length);
    const addWorkAction = onAddWork ?? catalogContext?.onAddWork;
    const updateWorkAction = onUpdateWork ?? catalogContext?.onUpdateWork;
    const deleteWorkAction = onDeleteWork ?? catalogContext?.onDeleteWork;

    const [newWorkName, setNewWorkName] = useState('');
    const [newWorkPrice, setNewWorkPrice] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<EstimateCategory>(EstimateCategory.FOUNDATION);
    const [filterCategory, setFilterCategory] = useState<EstimateCategory | 'all'>('all');
    const [searchInput, setSearchInput] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

    const handleSearchChange = useCallback((value: string) => {
        setSearchInput(value);
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => setSearchTerm(value), 250);
    }, []);

    useEffect(() => {
        return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
    }, []);
    const [editingWorkId, setEditingWorkId] = useState<string | null>(null);
    const [toolWork, setToolWork] = useState<Work | null>(null);
    const [editingPrice, setEditingPrice] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 25;

    const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
    const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup<Work>[]>([]);
    const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);

    const handleCheckDuplicates = async () => {
        setIsCheckingDuplicates(true);
        try {
            const groups = catalogContext
                ? await catalogContext.findWorkDuplicates()
                : findDuplicates(worksList);
            setDuplicateGroups(groups);
            setShowDuplicateDialog(true);
        } catch (error) {
            console.error('Failed to scan work duplicates:', error);
            alert('Не удалось проверить дубликаты работ.');
        } finally {
            setIsCheckingDuplicates(false);
        }
    };

    const handleMergeWorks = async (decisions: CatalogDuplicateDecision[]): Promise<number> => {
        if (catalogContext?.onMergeCatalogDuplicates) {
            return catalogContext.onMergeCatalogDuplicates('work', decisions);
        }
        return 0;
    };

    const filteredWorks = useMemo(() => {
        let result = filterCategory === 'all' ? worksList : worksList.filter(w => w.category === filterCategory);
        if (searchTerm.trim()) {
            const q = searchTerm.trim().toLowerCase();
            result = result.filter(w => w.name.toLowerCase().includes(q));
        }
        return result;
    }, [worksList, filterCategory, searchTerm]);

    const paginatedWorks = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        return filteredWorks.slice(startIndex, endIndex);
    }, [filteredWorks, currentPage]);

    const totalPages = Math.ceil(filteredWorks.length / ITEMS_PER_PAGE);
    const toolSuggestions = useMemo(() => worksList.flatMap(work => work.toolRequirements?.map(tool => tool.name) ?? []), [worksList]);

    useEffect(() => {
        setCurrentPage(1);
    }, [filterCategory]);

    useEffect(() => {
        if (totalPages <= 1) {
            if (currentPage !== 1) {
                setCurrentPage(1);
            }
            return;
        }

        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    const handleAdd = () => {
        const price = parseFloat(newWorkPrice);
        if (newWorkName.trim() && !isNaN(price) && price > 0) {
            if (!addWorkAction) return;
            void addWorkAction(newWorkName.trim(), selectedCategory, price);
            setNewWorkName('');
            setNewWorkPrice('');
        }
    };

    const handleEdit = (work: Work) => {
        setEditingWorkId(work.id);
        setEditingPrice(work.price.toString());
    };

    const handleSave = () => {
        if (editingWorkId) {
            const work = worksList.find(w => w.id === editingWorkId);
            if (work) {
                const newPrice = parseFloat(editingPrice);
                if (!isNaN(newPrice) && newPrice > 0) {
                    if (updateWorkAction) {
                        void updateWorkAction({ ...work, price: newPrice });
                    }
                }
            }
            setEditingWorkId(null);
            setEditingPrice('');
        }
    };

    const handleCancel = () => {
        setEditingWorkId(null);
        setEditingPrice('');
    };

    return (
        <div className="bg-surface p-3 sm:p-4 md:p-6 rounded-lg shadow-2xl">
            <h2 className="text-xl sm:text-2xl font-bold text-text-primary mb-6">Виды работ</h2>

            {hiddenWorksCount > 0 && (
                <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    Показана часть данных по текущему тарифу: {worksList.length} из {totalWorksCount} работ. Остальные записи не удалены и снова появятся после повышения лимита подписки.
                </div>
            )}

            {/* Добавление новой работы */}
            <div className="flex flex-col gap-3 mb-6">
                <input
                    type="text"
                    placeholder="Наименование работы"
                    className="w-full min-h-[44px] p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary"
                    value={newWorkName}
                    onChange={(e) => setNewWorkName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
                />
                <div className="flex gap-3">
                    <input
                        type="number"
                        placeholder="Цена (₽)"
                        className="flex-1 min-h-[44px] p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary"
                        value={newWorkPrice}
                        onChange={(e) => setNewWorkPrice(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
                    />
                    <select
                        className="flex-1 min-h-[44px] p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary"
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value as EstimateCategory)}
                    >
                        {Object.values(EstimateCategory).map(category => (
                            <option key={category} value={category}>{category}</option>
                        ))}
                    </select>
                </div>
                <button
                    onClick={handleAdd}
                    className="w-full min-h-[44px] bg-primary hover:bg-primary-hover active:bg-red-800 text-white font-bold py-2 px-4 rounded-md shadow-md transition duration-300"
                >
                    Добавить
                </button>
            </div>

            {/* Фильтр по категориям */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <input
                    type="text"
                    placeholder="Поиск по наименованию..."
                    className="flex-1 min-h-[44px] p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary"
                    value={searchInput}
                    onChange={(e) => handleSearchChange(e.target.value)}
                />
                <select
                    className="min-h-[44px] p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary"
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value as EstimateCategory | 'all')}
                >
                    <option value="all">Все категории</option>
                    {Object.values(EstimateCategory).map(category => (
                        <option key={category} value={category}>{category}</option>
                    ))}
                </select>
                <button
                    onClick={() => void handleCheckDuplicates()}
                    disabled={isCheckingDuplicates}
                    className="min-h-[44px] p-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:cursor-wait disabled:opacity-60 text-white font-bold rounded-md transition"
                >
                    {isCheckingDuplicates ? 'Проверяю…' : 'Дубликаты'}
                </button>
            </div>

            {/* Desktop table */}
            <div className="overflow-x-auto hidden md:block">
                <table className="min-w-full">
                    <thead>
                        <tr className="border-b border-border">
                            <th className="text-left py-3 px-4 uppercase font-semibold text-sm text-text-secondary">Категория</th>
                            <th className="text-left py-3 px-4 uppercase font-semibold text-sm text-text-secondary">Наименование</th>
                            <th className="text-right py-3 px-4 uppercase font-semibold text-sm text-text-secondary">Цена (₽)</th>
                            <th className="text-center py-3 px-4 uppercase font-semibold text-sm text-text-secondary">Инструмент</th>
                            <th className="text-center py-3 px-4 uppercase font-semibold text-sm text-text-secondary">Действия</th>
                        </tr>
                    </thead>
                    <tbody className="text-text-primary">
                        {paginatedWorks.map(work => (
                            <tr key={work.id} className="border-b border-border hover:bg-gray-700/50 transition-colors">
                                <td className="text-left py-3 px-4">{work.category}</td>
                                <td className="text-left py-3 px-4">{work.name}</td>
                                <td className="text-right py-3 px-4">
                                    {editingWorkId === work.id ? (
                                        <input
                                            type="number"
                                            value={editingPrice}
                                            onChange={(e) => setEditingPrice(e.target.value)}
                                            className="w-full p-1 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary text-right"
                                            onKeyPress={(e) => e.key === 'Enter' && handleSave()}
                                        />
                                    ) : (
                                        `${work.price.toLocaleString('ru-RU')} ₽`
                                    )}
                                </td>
                                <td className="text-center py-3 px-4">
                                    <button type="button" onClick={() => setToolWork(work)} className="min-h-9 rounded-md border border-border px-3 text-sm font-medium text-text-primary transition hover:border-primary hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/50">
                                        {work.toolRequirements?.length ? `${work.toolRequirements.length} поз.` : 'Настроить'}
                                    </button>
                                </td>
                                <td className="text-center py-3 px-4">
                                    {editingWorkId === work.id ? (
                                        <div className="flex gap-2 justify-center">
                                            <button
                                                onClick={handleSave}
                                                className="bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-3 rounded-md shadow-md transition duration-300"
                                            >
                                                Сохранить
                                            </button>
                                            <button
                                                onClick={handleCancel}
                                                className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-1 px-3 rounded-md shadow-md transition duration-300"
                                            >
                                                Отмена
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex gap-2 justify-center">
                                            <button
                                                onClick={() => handleEdit(work)}
                                                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded-md shadow-md transition duration-300"
                                            >
                                                Изменить
                                            </button>
                                            <button
                                                onClick={() => {
                                                    if (deleteWorkAction) {
                                                        void deleteWorkAction(work.id);
                                                    }
                                                }}
                                                className="bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-3 rounded-md shadow-md transition duration-300"
                                            >
                                                Удалить
                                            </button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {filteredWorks.length === 0 && (
                            <tr>
                                <td colSpan={5} className="text-center py-8 text-text-secondary">
                                    Нет работ. Добавьте первую работу выше.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Mobile card list */}
            <div className="md:hidden space-y-3">
                {paginatedWorks.map(work => (
                    <article key={work.id} className="rounded-lg border border-border bg-background/40 p-3">
                        <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="min-w-0 flex-1">
                                <div className="font-semibold text-text-primary text-sm truncate">{work.name}</div>
                                <div className="text-xs text-text-secondary">{work.category}</div>
                            </div>
                            {editingWorkId === work.id ? (
                                <input
                                    type="number"
                                    value={editingPrice}
                                    onChange={(e) => setEditingPrice(e.target.value)}
                                    className="w-24 min-h-[44px] p-1 bg-background border border-border rounded text-text-primary text-right"
                                    onKeyPress={(e) => e.key === 'Enter' && handleSave()}
                                />
                            ) : (
                                <span className="shrink-0 font-bold text-text-primary text-sm">{work.price.toLocaleString('ru-RU')} ₽</span>
                            )}
                        </div>
                        <button type="button" onClick={() => setToolWork(work)} className="mb-2 min-h-11 w-full rounded-md border border-border bg-background px-3 text-left text-sm text-text-secondary hover:border-primary hover:text-text-primary">
                            Инструмент: <span className="font-semibold text-text-primary">{work.toolRequirements?.length ? `${work.toolRequirements.length} позиций` : 'не настроен'}</span>
                        </button>
                        <div className="flex gap-2 mt-2">
                            {editingWorkId === work.id ? (
                                <>
                                    <button onClick={handleSave} className="flex-1 min-h-[44px] bg-green-600 hover:bg-green-700 active:bg-green-800 text-white text-sm font-semibold rounded-md transition-colors">
                                        Сохранить
                                    </button>
                                    <button onClick={handleCancel} className="flex-1 min-h-[44px] bg-gray-600 hover:bg-gray-700 active:bg-gray-800 text-white text-sm font-semibold rounded-md transition-colors">
                                        Отмена
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button onClick={() => handleEdit(work)} className="flex-1 min-h-[44px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold rounded-md transition-colors">
                                        Изменить
                                    </button>
                                    <button onClick={() => { if (deleteWorkAction) void deleteWorkAction(work.id); }} className="min-h-[44px] min-w-[44px] bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-sm font-semibold rounded-md transition-colors flex items-center justify-center">
                                        ✕
                                    </button>
                                </>
                            )}
                        </div>
                    </article>
                ))}
                {filteredWorks.length === 0 && (
                    <div className="text-center py-8 text-text-secondary">Нет работ</div>
                )}
            </div>
            {totalPages > 1 && (
                <div className="flex justify-center items-center gap-1 sm:gap-2 mt-4 sm:mt-6">
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-lg"
                    >
                        ‹
                    </button>

                    <div className="flex gap-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                            <button
                                key={page}
                                onClick={() => setCurrentPage(page)}
                                className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded text-sm ${
                                    currentPage === page
                                        ? 'bg-primary text-white'
                                        : 'bg-gray-700 hover:bg-gray-600 text-text-primary'
                                }`}
                            >
                                {page}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-lg"
                    >
                        ›
                    </button>

                    <span className="ml-2 sm:ml-4 text-xs sm:text-sm text-text-secondary">
                        {Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, filteredWorks.length)}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredWorks.length)}/{filteredWorks.length}
                    </span>
                </div>
            )}

            <DuplicateCheckerDialog
                isOpen={showDuplicateDialog}
                onClose={() => setShowDuplicateDialog(false)}
                title="Дубликаты работ"
                duplicateGroups={duplicateGroups}
                onMerge={handleMergeWorks}
            />
            {toolWork && (
                <WorkToolRequirementsEditor
                    work={worksList.find(work => work.id === toolWork.id) ?? toolWork}
                    suggestions={toolSuggestions}
                    onClose={() => setToolWork(null)}
                    onSave={requirements => updateWorkAction?.({ ...toolWork, toolRequirements: requirements })}
                />
            )}
        </div>
    );
};

export default React.memo(Works);
