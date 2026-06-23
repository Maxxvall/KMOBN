import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Work, EstimateCategory, DuplicateGroup, findDuplicates } from '../types';
import TabDescription from './TabDescription';
import { useOptionalCatalogContext } from '../contexts/CatalogContext';
import DuplicateCheckerDialog from './DuplicateCheckerDialog';

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
    const debounceTimer = useRef<ReturnType<typeof setTimeout>>();

    const handleSearchChange = useCallback((value: string) => {
        setSearchInput(value);
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => setSearchTerm(value), 250);
    }, []);

    useEffect(() => {
        return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
    }, []);
    const [editingWorkId, setEditingWorkId] = useState<string | null>(null);
    const [editingPrice, setEditingPrice] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 25;

    const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
    const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup<Work>[]>([]);

    const handleCheckDuplicates = () => {
        const groups = findDuplicates(worksList);
        setDuplicateGroups(groups);
        setShowDuplicateDialog(true);
    };

    const handleMergeWorks = async (keepId: string, deleteIds: string[]) => {
        if (catalogContext?.onMergeCatalogDuplicates) {
            await catalogContext.onMergeCatalogDuplicates('work', keepId, deleteIds);
        }
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
        <div className="bg-surface p-6 rounded-lg shadow-2xl">
            <TabDescription
                storageKey="works"
                summary="База всех видов работ с ценами. Создайте единый справочник работ для быстрого добавления в сметы."
                actions={[
                    'Добавить новый вид работы с ценой',
                    'Изменить цену работы',
                    'Фильтровать работы по категориям',
                    'Удалять неактуальные виды работ',
                ]}
                steps={[
                    'Добавьте работу: название, категория, цена.',
                    'При создании сметы выбирайте работы из этой базы.',
                    'Цены работ можно корректировать по необходимости.',
                    'Используйте категории для структурирования разделов.',
                ]}
                examples={[
                    'Создайте работу «Монтаж окон ПВХ» для быстрого выбора в смете.',
                    'Разнесите работы по категориям: фундамент, стены, кровля.',
                ]}
                quickLinks={[
                    {
                        id: 'works-walls',
                        label: 'Ошибки при сборке стен',
                        description: 'Частые дефекты и как их избежать.',
                        wikiArticleId: 'walls-1',
                    },
                    {
                        id: 'works-roof',
                        label: 'Вентиляция кровли',
                        description: 'Обязательные работы для кровли.',
                        wikiArticleId: 'roof-1',
                    },
                ]}
            />
            <h2 className="text-2xl font-bold text-text-primary mb-6">Виды работ</h2>

            {hiddenWorksCount > 0 && (
                <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    Показана часть данных по текущему тарифу: {worksList.length} из {totalWorksCount} работ. Остальные записи не удалены и снова появятся после повышения лимита подписки.
                </div>
            )}

            {/* Добавление новой работы */}
            <div className="flex gap-4 mb-6">
                <input
                    type="text"
                    placeholder="Наименование работы"
                    className="flex-1 p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary"
                    value={newWorkName}
                    onChange={(e) => setNewWorkName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
                />
                <input
                    type="number"
                    placeholder="Цена (₽)"
                    className="w-32 p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary"
                    value={newWorkPrice}
                    onChange={(e) => setNewWorkPrice(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
                />
                <select
                    className="p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value as EstimateCategory)}
                >
                    {Object.values(EstimateCategory).map(category => (
                        <option key={category} value={category}>{category}</option>
                    ))}
                </select>
                <button
                    onClick={handleAdd}
                    className="bg-primary hover:bg-primary-hover text-white font-bold py-2 px-4 rounded-md shadow-md transition duration-300"
                >
                    Добавить
                </button>
            </div>

            {/* Фильтр по категориям */}
            <div className="flex gap-4 mb-6">
                <input
                    type="text"
                    placeholder="Поиск по наименованию..."
                    className="flex-1 p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary"
                    value={searchInput}
                    onChange={(e) => handleSearchChange(e.target.value)}
                />
                <select
                    className="p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary"
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value as EstimateCategory | 'all')}
                >
                    <option value="all">Все категории</option>
                    {Object.values(EstimateCategory).map(category => (
                        <option key={category} value={category}>{category}</option>
                    ))}
                </select>
                <button
                    onClick={handleCheckDuplicates}
                    className="p-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-md transition"
                >
                    Проверить дубликаты
                </button>
            </div>

            {/* Список работ */}
            <div className="overflow-x-auto">
                <table className="min-w-full">
                    <thead>
                        <tr className="border-b border-border">
                            <th className="text-left py-3 px-4 uppercase font-semibold text-sm text-text-secondary">Категория</th>
                            <th className="text-left py-3 px-4 uppercase font-semibold text-sm text-text-secondary">Наименование</th>
                            <th className="text-right py-3 px-4 uppercase font-semibold text-sm text-text-secondary">Цена (₽)</th>
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
                                <td colSpan={4} className="text-center py-8 text-text-secondary">
                                    Нет работ. Добавьте первую работу выше.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            {totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 mt-6">
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1 bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white rounded"
                    >
                        ← Назад
                    </button>

                    <div className="flex gap-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                            <button
                                key={page}
                                onClick={() => setCurrentPage(page)}
                                className={`px-3 py-1 rounded ${
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
                        className="px-3 py-1 bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white rounded"
                    >
                        Вперед →
                    </button>

                    <span className="ml-4 text-text-secondary">
                        Показано {Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, filteredWorks.length)}-
                        {Math.min(currentPage * ITEMS_PER_PAGE, filteredWorks.length)} из {filteredWorks.length}
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
        </div>
    );
};

export default React.memo(Works);