import React, { useState } from 'react';
import FocusLock from 'react-focus-lock';
import { EstimateItem, SectionId, Work } from '../types';
import { getSectionLabel } from '../services/estimateSections';

interface AddEstimateWorkModalProps {
    item: EstimateItem;
    sectionLabel?: string;
    onClose: () => void;
    onAdd: (name: string, category: SectionId, price: number) => Promise<Work | null>;
    onSaved: (work: Work) => void;
}

const AddEstimateWorkModal: React.FC<AddEstimateWorkModalProps> = ({ item, sectionLabel, onClose, onAdd, onSaved }) => {
    const [name, setName] = useState(item.name);
    const [price, setPrice] = useState(String(item.price || ''));
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const parsedPrice = Number(price.replace(',', '.'));
    const canSave = name.trim().length > 0 && price.trim().length > 0 && Number.isFinite(parsedPrice) && parsedPrice >= 0;

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!canSave || isSaving) return;
        setIsSaving(true);
        setError('');
        try {
            const work = await onAdd(name.trim(), item.category, parsedPrice);
            if (!work) {
                setError('Работа не сохранена. Проверьте лимит каталога или попробуйте ещё раз.');
                return;
            }
            onSaved(work);
        } catch {
            setError('Не удалось сохранить работу. Попробуйте ещё раз.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="add-estimate-work-title" aria-busy={isSaving} onClick={() => !isSaving && onClose()} onKeyDown={event => { if (event.key === 'Escape' && !isSaving) onClose(); }}>
            <FocusLock returnFocus>
                <div className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-2xl sm:p-6" onClick={event => event.stopPropagation()}>
                    <h2 id="add-estimate-work-title" className="text-xl font-bold text-text-primary">Добавить работу в базу</h2>
                    <p className="mt-1 text-sm text-text-secondary">Работа будет сохранена в каталоге и привязана к этой строке сметы.</p>
                    <form onSubmit={event => void handleSubmit(event)} className="mt-5 space-y-4">
                        <label className="block text-sm font-medium text-text-primary">Наименование
                            <input autoFocus value={name} onChange={event => setName(event.target.value)} required className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 text-text-primary focus:border-primary focus:outline-none" />
                        </label>
                        <div className="text-sm font-medium text-text-primary">Раздел
                            <div className="mt-1 rounded-md border border-border bg-background px-3 py-3 text-text-secondary">{sectionLabel || getSectionLabel(item.category)}</div>
                        </div>
                        <label className="block text-sm font-medium text-text-primary">Цена, ₽
                            <input type="number" min="0" step="any" value={price} onChange={event => setPrice(event.target.value)} required className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 text-text-primary focus:border-primary focus:outline-none" />
                        </label>
                        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
                        <div className="flex gap-3 pt-1">
                            <button type="button" onClick={onClose} disabled={isSaving} className="min-h-11 flex-1 rounded-md border border-border text-text-primary disabled:opacity-50">Отмена</button>
                            <button type="submit" disabled={!canSave || isSaving} className="min-h-11 flex-1 rounded-md bg-primary px-3 font-semibold text-white hover:bg-primary-hover disabled:opacity-50">{isSaving ? 'Сохраняем…' : 'Добавить'}</button>
                        </div>
                    </form>
                </div>
            </FocusLock>
        </div>
    );
};

export default AddEstimateWorkModal;
