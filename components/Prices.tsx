import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import FocusLock from 'react-focus-lock';
import { BoardMoisture, BoardSpec, Material, EstimateCategory, DuplicateGroup, findDuplicates } from '../types';
import { CATALOG_CATEGORIES, getSectionLabel } from '../services/estimateSections';

import { useOptionalCatalogContext } from '../contexts/CatalogContext';
import DuplicateCheckerDialog from './DuplicateCheckerDialog';
import type { CatalogDuplicateDecision } from '../services/duplicateManagement';
import { formatBoardDimensions, isValidBoardSpec, suggestBoardSpecFromName } from '../services/boardMaterialSwitch';

type BoardDraft = {
    moisture: BoardMoisture;
    widthMm: string;
    thicknessMm: string;
    lengthMm: string;
    pairGroupId?: string;
    pairedMaterialId?: string;
};

const boardDraftFromSpec = (spec?: BoardSpec, pairedMaterialId?: string): BoardDraft => ({
    moisture: spec?.moisture ?? 'dry-planed',
    widthMm: spec ? String(spec.widthMm) : '',
    thicknessMm: spec ? String(spec.thicknessMm) : '',
    lengthMm: spec ? String(spec.lengthMm) : '',
    pairGroupId: spec?.pairGroupId,
    pairedMaterialId,
});

const boardSpecFromDraft = (draft: BoardDraft): BoardSpec | null => {
    const widthMm = Number(draft.widthMm);
    const thicknessMm = Number(draft.thicknessMm);
    const lengthMm = Number(draft.lengthMm);
    if (![widthMm, thicknessMm, lengthMm].every(value => Number.isFinite(value) && value > 0)) return null;
    return { moisture: draft.moisture, widthMm, thicknessMm, lengthMm, pairGroupId: draft.pairGroupId };
};

interface PricesProps {
    materials?: Material[];
    onAddMaterial?: (
        name: string,
        category: EstimateCategory,
        price?: number,
        link?: string,
        boardSpec?: BoardSpec,
    ) => unknown;
    onUpdateMaterial?: (material: Material) => Material | null | void | Promise<Material | null | void>;
    onDeleteMaterial?: (materialId: string) => void | Promise<void>;
    onEditMaterialPrice?: (materialId: string, newPrice: number) => void | Promise<void>;
    onEditMaterialLink?: (materialId: string, link?: string) => void | Promise<void>;
}

const Prices: React.FC<PricesProps> = ({
    materials,
    onAddMaterial,
    onUpdateMaterial,
    onDeleteMaterial,
    onEditMaterialPrice,
    onEditMaterialLink,
}) => {
    const catalogContext = useOptionalCatalogContext();
    const materialList = useMemo(() => materials ?? catalogContext?.materials ?? [], [materials, catalogContext?.materials]);
    const totalMaterialCount = materials ? materialList.length : (catalogContext?.materialsTotalCount ?? materialList.length);
    const hiddenMaterialCount = Math.max(0, totalMaterialCount - materialList.length);
    const addMaterialAction = onAddMaterial ?? catalogContext?.onAddMaterial;
    const updateMaterialAction = onUpdateMaterial ?? catalogContext?.onUpdateMaterial;
    const deleteMaterialAction = onDeleteMaterial ?? catalogContext?.onDeleteMaterial;
    const editMaterialPriceAction = onEditMaterialPrice ?? catalogContext?.onEditMaterialPrice;
    const editMaterialLinkAction = onEditMaterialLink ?? catalogContext?.onEditMaterialLink;

    const [newMaterialName, setNewMaterialName] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<EstimateCategory>(EstimateCategory.FOUNDATION);
    const [newMaterialPrice, setNewMaterialPrice] = useState('');
    const [newMaterialLink, setNewMaterialLink] = useState('');
    const [isNewMaterialBoard, setIsNewMaterialBoard] = useState(false);
    const [newBoardDraft, setNewBoardDraft] = useState<BoardDraft>(() => boardDraftFromSpec());
    const [editingBoard, setEditingBoard] = useState<{ material: Material; draft: BoardDraft } | null>(null);
    const [isRecognizingBoards, setIsRecognizingBoards] = useState(false);
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
    const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);

    const handleCheckDuplicates = async () => {
        setIsCheckingDuplicates(true);
        try {
            const groups = catalogContext
                ? await catalogContext.findMaterialDuplicates()
                : findDuplicates(materialList);
            setDuplicateGroups(groups);
            setShowDuplicateDialog(true);
        } catch (error) {
            console.error('Failed to scan material duplicates:', error);
            alert('Не удалось проверить дубликаты материалов.');
        } finally {
            setIsCheckingDuplicates(false);
        }
    };

    const handleMergeMaterials = async (decisions: CatalogDuplicateDecision[]): Promise<number> => {
        if (catalogContext?.onMergeCatalogDuplicates) {
            return catalogContext.onMergeCatalogDuplicates('material', decisions);
        }
        return 0;
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

    const enableBoardFields = (enabled: boolean) => {
        setIsNewMaterialBoard(enabled);
        if (!enabled) return;
        const suggested = suggestBoardSpecFromName(newMaterialName);
        if (suggested) setNewBoardDraft(boardDraftFromSpec(suggested));
    };

    const handleRecognizeBoards = async () => {
        if (!updateMaterialAction) return;
        const suggestions = materialList
            .filter(material => !material.boardSpec)
            .map(material => ({ material, spec: suggestBoardSpecFromName(material.name) }))
            .filter((entry): entry is { material: Material; spec: BoardSpec } => Boolean(entry.spec));
        if (suggestions.length === 0) {
            alert('Подходящие названия досок не найдены. Параметры можно указать вручную в карточке материала.');
            return;
        }
        const preview = suggestions.slice(0, 8)
            .map(({ material, spec }) => `• ${material.name} → ${spec.moisture === 'dry-planed' ? 'СС' : 'ЕВ'} ${formatBoardDimensions(spec)}`)
            .join('\n');
        const remainder = suggestions.length > 8 ? `\n…и ещё ${suggestions.length - 8}` : '';
        if (!window.confirm(`Найдены параметры для ${suggestions.length} досок:\n\n${preview}${remainder}\n\nСохранить эти параметры?`)) return;
        setIsRecognizingBoards(true);
        try {
            const results = await Promise.all(suggestions.map(({ material, spec }) => Promise.resolve(updateMaterialAction({ ...material, boardSpec: spec }))));
            const failedCount = results.filter(result => result === null).length;
            if (failedCount > 0) alert(`Не удалось сохранить параметры для ${failedCount} материалов.`);
        } finally {
            setIsRecognizingBoards(false);
        }
    };

    const openBoardEditor = (material: Material) => {
        const suggested = material.boardSpec ?? suggestBoardSpecFromName(material.name) ?? undefined;
        const paired = material.boardSpec?.pairGroupId
            ? materialList.find(candidate => candidate.id !== material.id && candidate.boardSpec?.pairGroupId === material.boardSpec?.pairGroupId)
            : undefined;
        setEditingBoard({ material, draft: boardDraftFromSpec(suggested, paired?.id) });
    };

    const saveBoardSpec = async () => {
        if (!editingBoard || !updateMaterialAction) return;
        const spec = boardSpecFromDraft(editingBoard.draft);
        if (!spec) {
            alert('Укажите положительные ширину, толщину и длину доски.');
            return;
        }
        const pairedMaterial = editingBoard.draft.pairedMaterialId
            ? materialList.find(material => material.id === editingBoard.draft.pairedMaterialId)
            : undefined;
        const pairGroupId = pairedMaterial
            ? editingBoard.draft.pairGroupId || pairedMaterial.boardSpec?.pairGroupId || `board-pair-${Date.now()}`
            : editingBoard.draft.pairGroupId;
        const sourceResult = await Promise.resolve(updateMaterialAction({
            ...editingBoard.material,
            boardSpec: { ...spec, pairGroupId },
        }));
        if (sourceResult === null) {
            alert('Не удалось сохранить параметры доски. Проверьте подключение и повторите.');
            return;
        }
        if (pairedMaterial && isValidBoardSpec(pairedMaterial.boardSpec)) {
            const pairedResult = await Promise.resolve(updateMaterialAction({
                ...pairedMaterial,
                boardSpec: { ...pairedMaterial.boardSpec, pairGroupId },
            }));
            if (pairedResult === null) {
                alert('Параметры доски сохранены, но связать парный материал не удалось. Повторите сохранение.');
                return;
            }
        }
        setEditingBoard(null);
    };

    const handleAdd = () => {
        if (newMaterialName.trim()) {
            if (!addMaterialAction) return;
            const price = newMaterialPrice ? parseFloat(newMaterialPrice) : undefined;
            const link = newMaterialLink.trim() || undefined;
            const boardSpec = isNewMaterialBoard ? boardSpecFromDraft(newBoardDraft) : undefined;
            if (isNewMaterialBoard && !boardSpec) {
                alert('Укажите положительные ширину, толщину и длину доски.');
                return;
            }

            void addMaterialAction(
                newMaterialName.trim(),
                selectedCategory,
                !isNaN(Number(price)) ? price : undefined,
                link,
                boardSpec ?? undefined,
            );
            setNewMaterialName('');
            setNewMaterialPrice('');
            setNewMaterialLink('');
            setIsNewMaterialBoard(false);
            setNewBoardDraft(boardDraftFromSpec());
        }
    };

    return (
        <div className="bg-surface p-3 sm:p-4 md:p-6 rounded-lg shadow-2xl">
            <h2 className="text-xl sm:text-2xl font-bold text-text-primary mb-6">Цены материалов</h2>

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
                        {CATALOG_CATEGORIES.map(category => (
                            <option key={category} value={category}>{getSectionLabel(category)}</option>
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
                <div className="rounded-lg border border-border bg-background/35 p-3">
                    <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm font-semibold text-text-primary">
                        <input
                            type="checkbox"
                            checked={isNewMaterialBoard}
                            onChange={(event) => enableBoardFields(event.target.checked)}
                            className="h-5 w-5 accent-primary"
                        />
                        Это доска — использовать в переключателе СС / ЕВ
                    </label>
                    {isNewMaterialBoard && (
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <select
                                aria-label="Тип влажности доски"
                                value={newBoardDraft.moisture}
                                onChange={(event) => setNewBoardDraft(current => ({ ...current, moisture: event.target.value as BoardMoisture }))}
                                className="min-h-[44px] rounded-md border border-border bg-background p-2 text-text-primary"
                            >
                                <option value="dry-planed">СС — сухая строганая</option>
                                <option value="natural-moisture">ЕВ — естественной влажности</option>
                            </select>
                            {(['widthMm', 'thicknessMm', 'lengthMm'] as const).map((field, index) => (
                                <input
                                    key={field}
                                    type="number"
                                    min="1"
                                    aria-label={['Ширина доски в миллиметрах', 'Толщина доски в миллиметрах', 'Длина доски в миллиметрах'][index]}
                                    placeholder={['Ширина, мм', 'Толщина, мм', 'Длина, мм'][index]}
                                    value={newBoardDraft[field]}
                                    onChange={(event) => setNewBoardDraft(current => ({ ...current, [field]: event.target.value }))}
                                    className="min-h-[44px] min-w-0 rounded-md border border-border bg-background p-2 text-text-primary"
                                />
                            ))}
                        </div>
                    )}
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
                    {CATALOG_CATEGORIES.map(category => (
                        <option key={category} value={category}>{getSectionLabel(category)}</option>
                    ))}
                </select>
                <button
                    onClick={() => void handleCheckDuplicates()}
                    disabled={isCheckingDuplicates}
                    className="min-h-[44px] p-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:cursor-wait disabled:opacity-60 text-white font-bold rounded-md transition"
                >
                    {isCheckingDuplicates ? 'Проверяю…' : 'Дубликаты'}
                </button>
                <button
                    type="button"
                    onClick={() => void handleRecognizeBoards()}
                    disabled={isRecognizingBoards || !updateMaterialAction}
                    className="min-h-[44px] rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold text-text-primary transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {isRecognizingBoards ? 'Сохраняю…' : 'Распознать доски'}
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
                                <td className="text-left py-3 px-4">
                                    <div>{material.name}</div>
                                    {material.boardSpec && (
                                        <div className="mt-1 text-xs font-medium text-emerald-300">
                                            {material.boardSpec.moisture === 'dry-planed' ? 'СС' : 'ЕВ'} · {formatBoardDimensions(material.boardSpec)}
                                        </div>
                                    )}
                                </td>
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
                                                type="button"
                                                onClick={() => openBoardEditor(material)}
                                                className="rounded-md border border-border bg-background px-3 py-1 font-semibold text-text-primary transition hover:border-primary"
                                            >
                                                Доска
                                            </button>
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
                                {material.boardSpec && (
                                    <div className="mt-1 text-xs font-medium text-emerald-300">
                                        {material.boardSpec.moisture === 'dry-planed' ? 'СС' : 'ЕВ'} · {formatBoardDimensions(material.boardSpec)}
                                    </div>
                                )}
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
                            <div className="grid grid-cols-[1fr_1fr_44px] gap-2">
                                <button
                                    type="button"
                                    onClick={() => openBoardEditor(material)}
                                    className="min-h-[44px] rounded-md border border-border bg-background text-sm font-semibold text-text-primary transition hover:border-primary"
                                >
                                    Доска
                                </button>
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

            {editingBoard && (
                <div
                    className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 sm:items-center sm:p-4"
                    onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingBoard(null); }}
                >
                    <FocusLock returnFocus>
                        <section
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="board-spec-title"
                            onKeyDown={(event) => { if (event.key === 'Escape') setEditingBoard(null); }}
                            className="w-full rounded-t-2xl border border-border bg-surface p-4 shadow-2xl sm:max-w-xl sm:rounded-xl sm:p-5"
                        >
                            <div className="mb-4 flex items-start justify-between gap-3">
                                <div>
                                    <h3 id="board-spec-title" className="text-lg font-bold text-text-primary">Параметры доски</h3>
                                    <p className="mt-1 text-sm text-text-secondary">{editingBoard.material.name}</p>
                                </div>
                                <button type="button" onClick={() => setEditingBoard(null)} aria-label="Закрыть" className="min-h-[44px] min-w-[44px] rounded-md text-xl text-text-secondary hover:bg-background">×</button>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="text-sm text-text-secondary">
                                    Тип доски
                                    <select
                                        value={editingBoard.draft.moisture}
                                        onChange={(event) => setEditingBoard(current => current ? ({ ...current, draft: { ...current.draft, moisture: event.target.value as BoardMoisture, pairedMaterialId: undefined, pairGroupId: undefined } }) : current)}
                                        className="mt-1 min-h-[44px] w-full rounded-md border border-border bg-background p-2 text-text-primary"
                                    >
                                        <option value="dry-planed">СС — сухая строганая</option>
                                        <option value="natural-moisture">ЕВ — естественной влажности</option>
                                    </select>
                                </label>
                                {(['widthMm', 'thicknessMm', 'lengthMm'] as const).map((field, index) => (
                                    <label key={field} className="text-sm text-text-secondary">
                                        {['Ширина, мм', 'Толщина, мм', 'Длина, мм'][index]}
                                        <input
                                            type="number"
                                            min="1"
                                            value={editingBoard.draft[field]}
                                            onChange={(event) => setEditingBoard(current => current ? ({ ...current, draft: { ...current.draft, [field]: event.target.value } }) : current)}
                                            className="mt-1 min-h-[44px] w-full rounded-md border border-border bg-background p-2 text-text-primary"
                                        />
                                    </label>
                                ))}
                                <label className="text-sm text-text-secondary sm:col-span-2">
                                    Парная доска для нестандартной замены
                                    <select
                                        value={editingBoard.draft.pairedMaterialId ?? ''}
                                        onChange={(event) => {
                                            const pairedMaterialId = event.target.value || undefined;
                                            const paired = pairedMaterialId ? materialList.find(material => material.id === pairedMaterialId) : undefined;
                                            const currentPairGroupId = editingBoard.material.boardSpec?.pairGroupId;
                                            const selectedPairGroupId = paired?.boardSpec?.pairGroupId;
                                            setEditingBoard(current => current ? ({
                                                ...current,
                                                draft: {
                                                    ...current.draft,
                                                    pairedMaterialId,
                                                    pairGroupId: pairedMaterialId
                                                        ? (selectedPairGroupId === currentPairGroupId ? currentPairGroupId : selectedPairGroupId)
                                                        : undefined,
                                                },
                                            }) : current);
                                        }}
                                        className="mt-1 min-h-[44px] w-full rounded-md border border-border bg-background p-2 text-text-primary"
                                    >
                                        <option value="">Стандартная пара по правилу ±5 мм</option>
                                        {materialList
                                            .filter(material => {
                                                if (material.id === editingBoard.material.id || !isValidBoardSpec(material.boardSpec) || material.boardSpec.moisture === editingBoard.draft.moisture) return false;
                                                const groupId = material.boardSpec.pairGroupId;
                                                if (!groupId || groupId === editingBoard.material.boardSpec?.pairGroupId) return true;
                                                return materialList.filter(candidate => candidate.boardSpec?.pairGroupId === groupId).length <= 1;
                                            })
                                            .map(material => (
                                                <option key={material.id} value={material.id}>
                                                    {material.name} — {material.boardSpec ? formatBoardDimensions(material.boardSpec) : ''}
                                                </option>
                                            ))}
                                    </select>
                                    <span className="mt-1 block text-xs">Выберите материал только если пара отличается от стандартного правила размеров.</span>
                                </label>
                            </div>
                            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                                {editingBoard.material.boardSpec ? (
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            if (!updateMaterialAction) return;
                                            const result = await Promise.resolve(updateMaterialAction({ ...editingBoard.material, boardSpec: undefined }));
                                            if (result === null) {
                                                alert('Не удалось убрать параметры доски. Повторите попытку.');
                                                return;
                                            }
                                            setEditingBoard(null);
                                        }}
                                        className="min-h-[44px] rounded-md border border-red-500/40 px-3 text-sm font-semibold text-red-300 hover:bg-red-500/10"
                                    >
                                        Не считать доской
                                    </button>
                                ) : <span />}
                                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                                    <button type="button" onClick={() => setEditingBoard(null)} className="min-h-[44px] rounded-md border border-border px-4 font-semibold text-text-secondary hover:bg-background">Отмена</button>
                                    <button type="button" onClick={() => void saveBoardSpec()} className="min-h-[44px] rounded-md bg-primary px-4 font-bold text-white hover:bg-primary-hover">Сохранить параметры</button>
                                </div>
                            </div>
                        </section>
                    </FocusLock>
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
