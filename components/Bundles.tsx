import React, { useState, useMemo } from 'react';
import { WorkBundle, EstimateCategory, EstimateItem, EstimateSubgroup, Work, Material } from '../types';
import TabDescription from './TabDescription';
import { useOptionalCatalogContext } from '../contexts/CatalogContext';

interface BundlesProps {
    bundles?: WorkBundle[];
    works?: Work[];
    materials?: Material[];
    onAddBundle?: (bundle: WorkBundle) => void | Promise<void>;
    onUpdateBundle?: (bundle: WorkBundle) => void | Promise<void>;
    onDeleteBundle?: (bundleId: string) => void | Promise<void>;
}

const Bundles: React.FC<BundlesProps> = ({ bundles, works, materials, onAddBundle, onUpdateBundle, onDeleteBundle }) => {
    const catalogContext = useOptionalCatalogContext();
    const bundleList = useMemo(() => bundles ?? catalogContext?.bundles ?? [], [bundles, catalogContext?.bundles]);
    const worksList = useMemo(() => works ?? catalogContext?.works ?? [], [works, catalogContext?.works]);
    const materialList = useMemo(() => materials ?? catalogContext?.materials ?? [], [materials, catalogContext?.materials]);
    const addBundleAction = onAddBundle ?? catalogContext?.onAddBundle;
    const updateBundleAction = onUpdateBundle ?? catalogContext?.onUpdateBundle;
    const deleteBundleAction = onDeleteBundle ?? catalogContext?.onDeleteBundle;

    const [newBundleName, setNewBundleName] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<EstimateCategory>(EstimateCategory.FOUNDATION);
    const [filterCategory, setFilterCategory] = useState<EstimateCategory | 'all'>('all');
    const [editingBundleId, setEditingBundleId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [currentBundleItems, setCurrentBundleItems] = useState<EstimateItem[]>([]);
    const [showAddItem, setShowAddItem] = useState(false);
    const [expandedBundles, setExpandedBundles] = useState<Set<string>>(new Set());
    const [newItemName, setNewItemName] = useState('');
    const [newItemSubgroup, setNewItemSubgroup] = useState<EstimateSubgroup>(EstimateSubgroup.WORKS);

    const filteredBundles = useMemo(() => {
        return filterCategory === 'all' ? bundleList : bundleList.filter(b => b.category === filterCategory);
    }, [bundleList, filterCategory]);

    const handleAddBundle = () => {
        if (newBundleName.trim()) {
            const newBundle: WorkBundle = {
                id: `bundle-${Date.now()}`,
                name: newBundleName.trim(),
                items: [],
                category: selectedCategory,
            };
            if (addBundleAction) {
                void addBundleAction(newBundle);
            }
            setNewBundleName('');
        }
    };

    const handleEditBundle = (bundle: WorkBundle) => {
        setEditingBundleId(bundle.id);
        setEditingName(bundle.name);
        setCurrentBundleItems([...bundle.items]);
    };

    const handleSaveBundle = () => {
        if (editingBundleId) {
            const bundle = bundleList.find(b => b.id === editingBundleId);
            if (bundle) {
                if (updateBundleAction) {
                    void updateBundleAction({ ...bundle, name: editingName, items: currentBundleItems });
                }
            }
            setEditingBundleId(null);
            setEditingName('');
            setCurrentBundleItems([]);
        }
    };

    const handleCancelEdit = () => {
        setEditingBundleId(null);
        setEditingName('');
        setCurrentBundleItems([]);
        setShowAddItem(false);
    };

    const toggleBundleExpansion = (bundleId: string) => {
        setExpandedBundles(prev => {
            const newSet = new Set(prev);
            if (newSet.has(bundleId)) {
                newSet.delete(bundleId);
            } else {
                newSet.add(bundleId);
            }
            return newSet;
        });
    };

    const handleAddItem = () => {
        if (newItemName.trim()) {
            const quantity = 1; // По умолчанию
            const price = 0; // Цена не важна в комплекте
            const newItem: EstimateItem = {
                id: `item-${Date.now()}`,
                name: newItemName.trim(),
                unit: 'шт', // По умолчанию
                quantity,
                price,
                total: quantity * price,
                category: selectedCategory,
                subgroup: newItemSubgroup,
            };
            setCurrentBundleItems([...currentBundleItems, newItem]);
            setNewItemName('');
            setShowAddItem(false);
        }
    };

    const handleDeleteItem = (itemId: string) => {
        setCurrentBundleItems(currentBundleItems.filter(item => item.id !== itemId));
    };

    const handleSelectWork = (workName: string) => {
        const work = worksList.find(w => w.name === workName);
        if (work) {
            setNewItemName(work.name);
            setNewItemSubgroup(EstimateSubgroup.WORKS);
        }
    };

    const handleSelectMaterial = (materialName: string) => {
        const material = materialList.find(m => m.name === materialName);
        if (material) {
            setNewItemName(material.name);
            setNewItemSubgroup(EstimateSubgroup.MATERIALS);
        }
    };

    return (
        <div className="bg-surface p-6 rounded-lg shadow-2xl">
            <TabDescription
                storageKey="bundles"
                summary="Готовые наборы работ и материалов. Создавайте комплекты для типовых задач и добавляйте их в сметы одним кликом."
                actions={[
                    'Создать комплект работ и материалов',
                    'Добавить в комплект несколько позиций',
                    'Применить готовый комплект к смете',
                    'Редактировать состав комплекта',
                    'Удалять неактуальные комплекты',
                ]}
                steps={[
                    'Создайте комплект, например «Монтаж окна ПВХ».',
                    'Добавьте в него работы и материалы.',
                    'При создании сметы примените этот комплект одним кликом.',
                    'Все позиции добавятся в нужную категорию автоматически.',
                ]}
                examples={[
                    'Сделайте комплект для повторяющихся работ и ускорьте подготовку смет.',
                    'Создайте набор для типовой отделки и используйте его в проектах.',
                ]}
                quickLinks={[
                    {
                        id: 'bundles-windows',
                        label: 'Монтаж окон по уровню',
                        description: 'Сформируйте комплект работ и материалов.',
                        wikiArticleId: 'windows-1',
                    },
                    {
                        id: 'bundles-finishing',
                        label: 'Подготовка стен под чистовую отделку',
                        description: 'Добавьте отделочные этапы в комплект.',
                        wikiArticleId: 'finishing-1',
                    },
                ]}
            />
            <h2 className="text-2xl font-bold text-text-primary mb-6">Комплекты работ</h2>

            {/* Добавление нового комплекта */}
            <div className="flex gap-4 mb-6">
                <input
                    type="text"
                    placeholder="Название комплекта"
                    className="flex-1 p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary"
                    value={newBundleName}
                    onChange={(e) => setNewBundleName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddBundle()}
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
                    onClick={handleAddBundle}
                    className="bg-primary hover:bg-primary-hover text-white font-bold py-2 px-4 rounded-md shadow-md transition duration-300"
                >
                    Добавить
                </button>
            </div>

            {/* Фильтр по категориям */}
            <div className="flex gap-4 mb-6">
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
            </div>

            {/* Список комплектов */}
            <div className="space-y-4">
                {filteredBundles.map(bundle => (
                    <div key={bundle.id} className="border border-border rounded-lg bg-background/30">
                        <div className="flex justify-between items-center p-4 cursor-pointer" onClick={() => toggleBundleExpansion(bundle.id)}>
                            {editingBundleId === bundle.id ? (
                                <input
                                    type="text"
                                    value={editingName}
                                    onChange={(e) => setEditingName(e.target.value)}
                                    className="flex-1 p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary mr-4"
                                />
                            ) : (
                                <div className="flex items-center">
                                    <span className={`mr-2 transform transition-transform ${expandedBundles.has(bundle.id) ? 'rotate-90' : ''}`}>▶</span>
                                    <div>
                                        <h3 className="text-lg font-bold text-text-primary">{bundle.name}</h3>
                                        <p className="text-sm text-text-secondary">Категория: {bundle.category} | Элементов: {bundle.items.length}</p>
                                    </div>
                                </div>
                            )}
                            <div className="flex gap-2">
                                {editingBundleId === bundle.id ? (
                                    <>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleSaveBundle(); }}
                                            className="bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-3 rounded-md shadow-md transition duration-300"
                                        >
                                            Сохранить
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleCancelEdit(); }}
                                            className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-1 px-3 rounded-md shadow-md transition duration-300"
                                        >
                                            Отмена
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleEditBundle(bundle); }}
                                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded-md shadow-md transition duration-300"
                                        >
                                            Изменить
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (deleteBundleAction) {
                                                    void deleteBundleAction(bundle.id);
                                                }
                                            }}
                                            className="bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-3 rounded-md shadow-md transition duration-300"
                                        >
                                            Удалить
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {expandedBundles.has(bundle.id) && (
                            <div className="p-4 border-t border-border">
                                {editingBundleId === bundle.id ? (
                                    <div className="mb-4">
                                        <h4 className="text-md font-semibold text-text-primary mb-2">Элементы комплекта:</h4>
                                        <div className="space-y-2 mb-4">
                                            {currentBundleItems.map(item => (
                                                <div key={item.id} className="flex items-center gap-4 p-2 bg-background/50 rounded-md">
                                                    <span className="flex-1">{item.name} ({item.subgroup})</span>
                                                    <button
                                                        onClick={() => handleDeleteItem(item.id)}
                                                        className="bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-2 rounded-md"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            ))}
                                        </div>

                                        {showAddItem ? (
                                            <div className="flex gap-2 mb-4">
                                                <select
                                                    className="p-2 bg-background border border-border rounded-md text-text-primary"
                                                    value={newItemSubgroup}
                                                    onChange={(e) => setNewItemSubgroup(e.target.value as EstimateSubgroup)}
                                                >
                                                    <option value={EstimateSubgroup.WORKS}>Работы</option>
                                                    {selectedCategory === EstimateCategory.LOGISTICS ? (
                                                        <option value={EstimateSubgroup.DELIVERY}>Доставка</option>
                                                    ) : (
                                                        <option value={EstimateSubgroup.MATERIALS}>Материалы</option>
                                                    )}
                                                </select>
                                                {newItemSubgroup === EstimateSubgroup.WORKS ? (
                                                    <select
                                                        className="flex-1 p-2 bg-background border border-border rounded-md text-text-primary"
                                                        value={newItemName}
                                                        onChange={(e) => {
                                                            setNewItemName(e.target.value);
                                                            handleSelectWork(e.target.value);
                                                        }}
                                                    >
                                                        <option value="">Выберите работу</option>
                                                        {works.filter(w => w.category === selectedCategory || w.category === EstimateCategory.GENERAL).map(work => (
                                                            <option key={work.id} value={work.name}>{work.name} ({work.category})</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <select
                                                        className="flex-1 p-2 bg-background border border-border rounded-md text-text-primary"
                                                        value={newItemName}
                                                        onChange={(e) => {
                                                            setNewItemName(e.target.value);
                                                            handleSelectMaterial(e.target.value);
                                                        }}
                                                    >
                                                        <option value="">Выберите материал</option>
                                                        {materials.filter(m => m.category === selectedCategory || m.category === EstimateCategory.GENERAL).map(material => (
                                                            <option key={material.id} value={material.name}>{material.name} ({material.category})</option>
                                                        ))}
                                                    </select>
                                                )}
                                                <button
                                                    onClick={handleAddItem}
                                                    className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md"
                                                >
                                                    Добавить
                                                </button>
                                                <button
                                                    onClick={() => setShowAddItem(false)}
                                                    className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-md"
                                                >
                                                    Отмена
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setShowAddItem(true)}
                                                className="bg-primary hover:bg-primary-hover text-white font-bold py-2 px-4 rounded-md"
                                            >
                                                Добавить элемент
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <div>
                                        <h4 className="text-md font-semibold text-text-primary mb-2">Элементы ({bundle.items.length}):</h4>
                                        <div className="space-y-1">
                                            {bundle.items.map(item => (
                                                <div key={item.id} className="text-sm text-text-secondary">
                                                    {item.name} ({item.subgroup})
                                                </div>
                                            ))}
                                            {bundle.items.length === 0 && (
                                                <div className="text-sm text-text-secondary">Нет элементов</div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}
                {filteredBundles.length === 0 && (
                    <div className="text-center py-8 text-text-secondary">
                        Нет комплектов. Добавьте первый комплект выше.
                    </div>
                )}
            </div>
        </div>
    );
};

export default Bundles;