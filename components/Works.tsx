import React, { useState, useMemo } from 'react';
import { Work, EstimateCategory } from '../types';

interface WorksProps {
    works: Work[];
    onAddWork: (name: string, category: EstimateCategory, price: number) => void;
    onUpdateWork: (work: Work) => void;
    onDeleteWork: (workId: string) => void;
}

const Works: React.FC<WorksProps> = ({ works, onAddWork, onUpdateWork, onDeleteWork }) => {
    const [newWorkName, setNewWorkName] = useState('');
    const [newWorkPrice, setNewWorkPrice] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<EstimateCategory>(EstimateCategory.FOUNDATION);
    const [filterCategory, setFilterCategory] = useState<EstimateCategory | 'all'>('all');
    const [editingWorkId, setEditingWorkId] = useState<string | null>(null);
    const [editingPrice, setEditingPrice] = useState('');

    const filteredWorks = useMemo(() => {
        return filterCategory === 'all' ? works : works.filter(w => w.category === filterCategory);
    }, [works, filterCategory]);

    const handleAdd = () => {
        const price = parseFloat(newWorkPrice);
        if (newWorkName.trim() && !isNaN(price) && price > 0) {
            onAddWork(newWorkName.trim(), selectedCategory, price);
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
            const work = works.find(w => w.id === editingWorkId);
            if (work) {
                const newPrice = parseFloat(editingPrice);
                if (!isNaN(newPrice) && newPrice > 0) {
                    onUpdateWork({ ...work, price: newPrice });
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
            <h2 className="text-2xl font-bold text-text-primary mb-6">Виды работ</h2>

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
                        {filteredWorks.map(work => (
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
                                                onClick={() => onDeleteWork(work.id)}
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
        </div>
    );
};

export default Works;