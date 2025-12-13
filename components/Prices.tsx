import React, { useState, useMemo } from 'react';
import { Material, EstimateCategory } from '../types';

interface PricesProps {
    materials: Material[];
    onAddMaterial: (name: string, category: EstimateCategory, price?: number, isManualPrice?: boolean) => void;
    onUpdatePrice: (materialId: string) => void;
    onUpdateAllPrices: () => void;
    onDeleteMaterial: (materialId: string) => void;
    onEditMaterialPrice: (materialId: string, newPrice: number) => void;
}

const Prices: React.FC<PricesProps> = ({ materials, onAddMaterial, onUpdatePrice, onUpdateAllPrices, onDeleteMaterial, onEditMaterialPrice }) => {
    const [newMaterialName, setNewMaterialName] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<EstimateCategory>(EstimateCategory.FOUNDATION);
    const [newMaterialPrice, setNewMaterialPrice] = useState('');
    const [isManualPrice, setIsManualPrice] = useState(false);
    const [filterCategory, setFilterCategory] = useState<EstimateCategory | 'all'>('all');
    const [editingPrice, setEditingPrice] = useState<{ id: string; price: string } | null>(null);

    const filteredMaterials = useMemo(() => {
        return filterCategory === 'all' ? materials : materials.filter(m => m.category === filterCategory);
    }, [materials, filterCategory]);

    const handleEditPrice = (materialId: string, currentPrice: number) => {
        setEditingPrice({ id: materialId, price: currentPrice.toString() });
    };

    const handleSavePrice = () => {
        if (editingPrice) {
            const newPrice = parseFloat(editingPrice.price);
            if (!isNaN(newPrice)) {
                onEditMaterialPrice(editingPrice.id, newPrice);
            }
            setEditingPrice(null);
        }
    };

    const handleCancelEdit = () => {
        setEditingPrice(null);
    };

    const handleAdd = () => {
        if (newMaterialName.trim()) {
            const price = isManualPrice && newMaterialPrice ? parseFloat(newMaterialPrice) : undefined;
            onAddMaterial(newMaterialName.trim(), selectedCategory, price, isManualPrice);
            setNewMaterialName('');
            setNewMaterialPrice('');
            setIsManualPrice(false);
        }
    };

    return (
        <div className="bg-surface p-6 rounded-lg shadow-2xl">
            <h2 className="text-2xl font-bold text-text-primary mb-6">Цены материалов</h2>

            {/* Добавление нового материала */}
            <div className="flex gap-4 mb-6">
                <input
                    type="text"
                    placeholder="Наименование материала"
                    className="flex-1 p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary"
                    value={newMaterialName}
                    onChange={(e) => setNewMaterialName(e.target.value)}
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
                <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-text-primary">
                        <input
                            type="checkbox"
                            checked={isManualPrice}
                            onChange={(e) => setIsManualPrice(e.target.checked)}
                        />
                        Ручная цена
                    </label>
                    {isManualPrice && (
                        <input
                            type="number"
                            placeholder="Цена (₽)"
                            className="w-24 p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary"
                            value={newMaterialPrice}
                            onChange={(e) => setNewMaterialPrice(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
                        />
                    )}
                </div>
                <button
                    onClick={handleAdd}
                    className="bg-primary hover:bg-primary-hover text-white font-bold py-2 px-4 rounded-md shadow-md transition duration-300"
                >
                    Добавить
                </button>
                <button
                    onClick={onUpdateAllPrices}
                    className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md shadow-md transition duration-300"
                >
                    Обновить все цены
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

            {/* Список материалов */}
            <div className="overflow-x-auto">
                <table className="min-w-full">
                    <thead>
                        <tr className="border-b border-border">
                            <th className="text-left py-3 px-4 uppercase font-semibold text-sm text-text-secondary">Категория</th>
                            <th className="text-left py-3 px-4 uppercase font-semibold text-sm text-text-secondary">Наименование</th>
                            <th className="text-right py-3 px-4 uppercase font-semibold text-sm text-text-secondary">Цена (₽)</th>
                            <th className="text-center py-3 px-4 uppercase font-semibold text-sm text-text-secondary">Последнее обновление</th>
                            <th className="text-center py-3 px-4 uppercase font-semibold text-sm text-text-secondary">Действия</th>
                        </tr>
                    </thead>
                    <tbody className="text-text-primary">
                        {filteredMaterials.map(material => (
                            <tr key={material.id} className="border-b border-border hover:bg-gray-700/50 transition-colors">
                                <td className="text-left py-3 px-4">{material.category}</td>
                                <td className="text-left py-3 px-4">{material.name}</td>
                                <td className="text-right py-3 px-4">{material.price.toLocaleString('ru-RU')} ₽</td>
                                <td className="text-center py-3 px-4">{new Date(material.lastUpdated).toLocaleDateString('ru-RU')}</td>
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
                                            {material.isManualPrice ? (
                                                <button
                                                    onClick={() => handleEditPrice(material.id, material.price)}
                                                    className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-1 px-3 rounded-md shadow-md transition duration-300"
                                                >
                                                    Изменить
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => onUpdatePrice(material.id)}
                                                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded-md shadow-md transition duration-300"
                                                >
                                                    Обновить
                                                </button>
                                            )}
                                            <button
                                                onClick={() => onDeleteMaterial(material.id)}
                                                className="bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-3 rounded-md shadow-md transition duration-300"
                                            >
                                                Удалить
                                            </button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {filteredMaterials.length === 0 && (
                            <tr>
                                <td colSpan={5} className="text-center py-8 text-text-secondary">
                                    Нет материалов. Добавьте первый материал выше.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Prices;