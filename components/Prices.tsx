import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Material, EstimateCategory, DuplicateGroup, findDuplicates } from '../types';
import TabDescription from './TabDescription';
import { useOptionalCatalogContext } from '../contexts/CatalogContext';
import DuplicateCheckerDialog from './DuplicateCheckerDialog';

interface PricesProps {
    materials?: Material[];
    onAddMaterial?: (
        name: string,
        category: EstimateCategory,
        price?: number,
        link?: string
    ) => void | Promise<void>;
    onDeleteMaterial?: (materialId: string) => void | Promise<void>;
    onEditMaterialPrice?: (materialId: string, newPrice: number) => void | Promise<void>;
    onEditMaterialLink?: (materialId: string, link?: string) => void | Promise<void>;
}

const Prices: React.FC<PricesProps> = ({
    materials,
    onAddMaterial,
    onDeleteMaterial,
    onEditMaterialPrice,
    onEditMaterialLink,
}) => {
    const catalogContext = useOptionalCatalogContext();
    const materialList = useMemo(() => materials ?? catalogContext?.materials ?? [], [materials, catalogContext?.materials]);
    const totalMaterialCount = materials ? materialList.length : (catalogContext?.materialsTotalCount ?? materialList.length);
    const hiddenMaterialCount = Math.max(0, totalMaterialCount - materialList.length);
    const addMaterialAction = onAddMaterial ?? catalogContext?.onAddMaterial;
    const deleteMaterialAction = onDeleteMaterial ?? catalogContext?.onDeleteMaterial;
    const editMaterialPriceAction = onEditMaterialPrice ?? catalogContext?.onEditMaterialPrice;
    const editMaterialLinkAction = onEditMaterialLink ?? catalogContext?.onEditMaterialLink;

    const [newMaterialName, setNewMaterialName] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<EstimateCategory>(EstimateCategory.FOUNDATION);
    const [newMaterialPrice, setNewMaterialPrice] = useState('');
    const [newMaterialLink, setNewMaterialLink] = useState('');
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
    const [editingPrice, setEditingPrice] = useState<{ id: string; price: string } | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 25;

    const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
    const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup<Material>[]>([]);

    const handleCheckDuplicates = () => {
        const groups = findDuplicates(materialList);
        setDuplicateGroups(groups);
        setShowDuplicateDialog(true);
    };

    const handleMergeMaterials = async (keepId: string, deleteIds: string[]) => {
        if (catalogContext?.onMergeCatalogDuplicates) {
            await catalogContext.onMergeCatalogDuplicates('material', keepId, deleteIds);
        }
    };

    const filteredMaterials = useMemo(() => {
        let result = filterCategory === 'all' ? materialList : materialList.filter(m => m.category === filterCategory);
        if (searchTerm.trim()) {
            const q = searchTerm.trim().toLowerCase();
            result = result.filter(m => m.name.toLowerCase().includes(q));
        }
        return result;
    }, [materialList, filterCategory, searchTerm]);

    const paginatedMaterials = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        return filteredMaterials.slice(startIndex, endIndex);
    }, [filteredMaterials, currentPage]);

    const totalPages = Math.ceil(filteredMaterials.length / ITEMS_PER_PAGE);

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

    const handleEditPrice = (materialId: string, currentPrice: number) => {
        setEditingPrice({ id: materialId, price: currentPrice.toString() });
    };

    const handleSavePrice = () => {
        if (editingPrice) {
            const newPrice = parseFloat(editingPrice.price);
            if (!isNaN(newPrice)) {
                if (editMaterialPriceAction) {
                    void editMaterialPriceAction(editingPrice.id, newPrice);
                }
            }
            setEditingPrice(null);
        }
    };

    const handleCancelEdit = () => {
        setEditingPrice(null);
    };

    const handleAdd = () => {
        if (newMaterialName.trim()) {
            if (!addMaterialAction) return;
            const price = newMaterialPrice ? parseFloat(newMaterialPrice) : undefined;
            const link = newMaterialLink.trim() || undefined;

            void addMaterialAction(
                newMaterialName.trim(),
                selectedCategory,
                !isNaN(Number(price)) ? price : undefined,
                link
            );
            setNewMaterialName('');
            setNewMaterialPrice('');
            setNewMaterialLink('');
        }
    };

    return (
        <div className="bg-surface p-3 sm:p-4 md:p-6 rounded-lg shadow-2xl">
            <TabDescription
                storageKey="prices"
                summary="Единая база цен на материалы. Обновляйте цены в одном месте — они автоматически применятся ко всем черновикам смет."
                actions={[
                    'Добавить новый материал с ценой',
                    'Изменить цену материала',
                    'Указать ссылку на поставщика',
                    'Фильтровать материалы по категориям',
                    'Удалять устаревшие материалы',
                    'Синхронизировать цены в черновиках автоматически',
                ]}
                steps={[
                    'Добавьте материал: название, категория, цена, ссылка.',
                    'При изменении цены здесь — она обновится во всех черновиках.',
                    'Используйте фильтры для быстрого поиска.',
                    'Согласованные сметы не меняются автоматически.',
                ]}
                examples={[
                    'Обновите цену OSB и проверьте черновики смет.',
                    'Добавьте ссылку на поставщика, чтобы ускорить закупку.',
                ]}
                notice={{
                    tone: 'warning',
                    text: 'Изменение цены не влияет на сметы со статусом «Отправлена» или «Согласована».',
                }}
                quickLinks={[
                    {
                        id: 'prices-foundation',
                        label: 'Чек-лист подготовки фундамента',
                        description: 'Сверьте базовые материалы и крепеж.',
                        wikiArticleId: 'foundation-1',
                    },
                    {
                        id: 'prices-windows',
                        label: 'Монтаж окон по уровню',
                        description: 'Подготовьте комплект материалов заранее.',
                        wikiArticleId: 'windows-1',
                    },
                ]}
            />
            <h2 className="text-2xl font-bold text-text-primary mb-6">Цены материалов</h2>

            {hiddenMaterialCount > 0 && (
                <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    Показана часть данных по текущему тарифу: {materialList.length} из {totalMaterialCount} материалов. Остальные записи не удалены и снова появятся после повышения лимита подписки.
                </div>
            )}

            {/* Добавление нового материала */}
            <div className="flex flex-col gap-3 mb-3">
                <input
                    type="text"
                    placeholder="Наименование материала"
                    className="w-full min-h-[44px] p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary"
                    value={newMaterialName}
                    onChange={(e) => setNewMaterialName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
                />
                <div className="flex gap-3">
                    <select
                        className="flex-1 min-h-[44px] p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary"
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value as EstimateCategory)}
                    >
                        {Object.values(EstimateCategory).map(category => (
                            <option key={category} value={category}>{category}</option>
                        ))}
                    </select>
                    <input
                        type="number"
                        placeholder="Цена (₽)"
                        className="w-28 min-h-[44px] p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary"
                        value={newMaterialPrice}
                        onChange={(e) => setNewMaterialPrice(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
                    />
                </div>
                <input
                    type="url"
                    placeholder="Ссылка (опционально)"
                    className="w-full min-h-[44px] p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary"
                    value={newMaterialLink}
                    onChange={(e) => setNewMaterialLink(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
                />
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
                    onClick={handleCheckDuplicates}
                    className="min-h-[44px] p-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold rounded-md transition"
                >
                    Дубликаты
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
                            <th className="text-left py-3 px-4 uppercase font-semibold text-sm text-text-secondary">Ссылка</th>
                            <th className="text-center py-3 px-4 uppercase font-semibold text-sm text-text-secondary">Дата добавления</th>
                            <th className="text-center py-3 px-4 uppercase font-semibold text-sm text-text-secondary">Действия</th>
                        </tr>
                    </thead>
                    <tbody className="text-text-primary">
                        {paginatedMaterials.map(material => (
                            (() => {
                                const lastUpdatedLabel = new Date(material.lastUpdated).toLocaleDateString('ru-RU');
                                return (
                            <tr key={material.id} className="border-b border-border hover:bg-gray-700/50 transition-colors">
                                <td className="text-left py-3 px-4">{material.category}</td>
                                <td className="text-left py-3 px-4">{material.name}</td>
                                <td className="text-right py-3 px-4">{material.price.toLocaleString('ru-RU')} ₽</td>
                                <td className="text-left py-3 px-4">
                                    <input
                                        key={`${material.id}-${material.link ?? ''}`}
                                        type="url"
                                        placeholder="https://"
                                        defaultValue={material.link ?? ''}
                                        onBlur={(e) => {
                                            if (editMaterialLinkAction) {
                                                void editMaterialLinkAction(material.id, e.target.value);
                                            }
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                (e.currentTarget as HTMLInputElement).blur();
                                            }
                                        }}
                                        className="w-full p-1 bg-background border border-border rounded text-text-primary"
                                    />
                                    {material.link && (
                                        <a
                                            href={material.link}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-xs text-primary hover:underline inline-block mt-1"
                                        >
                                            Открыть ссылку
                                        </a>
                                    )}
                                </td>
                                <td className="text-center py-3 px-4">
                                    <div>{lastUpdatedLabel}</div>
                                </td>
                                <td className="text-center py-3 px-4">
                                    {editingPrice && editingPrice.id === material.id ? (
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                className="w-20 p-1 bg-background border border-border rounded text-text-primary"
                                                value={editingPrice.price}
                                                onChange={(e) => setEditingPrice({ ...editingPrice, price: e.target.value })}
                                                onKeyPress={(e) => e.key === 'Enter' && handleSavePrice()}
                                            />
                                            <button
                                                onClick={handleSavePrice}
                                                className="bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-2 rounded text-sm"
                                            >
                                                ✓
                                            </button>
                                            <button
                                                onClick={handleCancelEdit}
                                                className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-1 px-2 rounded text-sm"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex item-center justify-center gap-3">
                                            <button
                                                onClick={() => handleEditPrice(material.id, material.price)}
                                                className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-1 px-3 rounded-md shadow-md transition duration-300"
                                            >
                                                Изменить
                                            </button>
                                            <button
                                                onClick={() => {
                                                    if (deleteMaterialAction) {
                                                        void deleteMaterialAction(material.id);
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
                                );
                            })()
                        ))}
                        {filteredMaterials.length === 0 && (
                            <tr>
                                <td colSpan={6} className="text-center py-8 text-text-secondary">
                                    Нет материалов. Добавьте первый материал выше.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Mobile card list */}
            <div className="md:hidden space-y-3">
                {paginatedMaterials.map(material => (
                    <article key={material.id} className="rounded-lg border border-border bg-background/40 p-3">
                        <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="min-w-0 flex-1">
                                <div className="font-semibold text-text-primary text-sm truncate">{material.name}</div>
                                <div className="text-xs text-text-secondary">{material.category}</div>
                            </div>
                            <span className="shrink-0 font-bold text-text-primary text-sm">{material.price.toLocaleString('ru-RU')} ₽</span>
                        </div>
                        <div className="text-xs text-text-secondary mb-2">
                            {new Date(material.lastUpdated).toLocaleDateString('ru-RU')}
                        </div>
                        {editingPrice && editingPrice.id === material.id ? (
                            <div className="flex items-center gap-2 mb-2">
                                <input
                                    type="number"
                                    className="flex-1 min-h-[44px] p-2 bg-background border border-border rounded text-text-primary"
                                    value={editingPrice.price}
                                    onChange={(e) => setEditingPrice({ ...editingPrice, price: e.target.value })}
                                    onKeyPress={(e) => e.key === 'Enter' && handleSavePrice()}
                                />
                                <button onClick={handleSavePrice} className="min-h-[44px] min-w-[44px] bg-green-600 hover:bg-green-700 text-white font-bold rounded flex items-center justify-center">✓</button>
                                <button onClick={handleCancelEdit} className="min-h-[44px] min-w-[44px] bg-gray-600 hover:bg-gray-700 text-white font-bold rounded flex items-center justify-center">✕</button>
                            </div>
                        ) : (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleEditPrice(material.id, material.price)}
                                    className="flex-1 min-h-[44px] bg-yellow-600 hover:bg-yellow-700 active:bg-yellow-800 text-white text-sm font-semibold rounded-md transition-colors"
                                >
                                    Изменить
                                </button>
                                <button
                                    onClick={() => { if (deleteMaterialAction) void deleteMaterialAction(material.id); }}
                                    className="min-h-[44px] min-w-[44px] bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-sm font-semibold rounded-md transition-colors flex items-center justify-center"
                                >
                                    ✕
                                </button>
                            </div>
                        )}
                        {material.link && (
                            <a href={material.link} target="_blank" rel="noreferrer" className="mt-2 block text-xs text-primary hover:underline">
                                Открыть ссылку
                            </a>
                        )}
                    </article>
                ))}
                {filteredMaterials.length === 0 && (
                    <div className="text-center py-8 text-text-secondary">Нет материалов</div>
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
                        {Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, filteredMaterials.length)}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredMaterials.length)}/{filteredMaterials.length}
                    </span>
                </div>
            )}

            <DuplicateCheckerDialog
                isOpen={showDuplicateDialog}
                onClose={() => setShowDuplicateDialog(false)}
                title="Дубликаты материалов"
                duplicateGroups={duplicateGroups}
                onMerge={handleMergeMaterials}
            />
        </div>
    );
};

export default React.memo(Prices);