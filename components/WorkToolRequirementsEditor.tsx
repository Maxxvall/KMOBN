import React, { useId, useMemo, useState } from 'react';
import { Work, WorkToolRequirement } from '../types';

type Props = {
    work: Work;
    suggestions: string[];
    onClose: () => void;
    onSave: (requirements: WorkToolRequirement[]) => void | Promise<void>;
};

const emptyRequirement = (): WorkToolRequirement => ({
    name: '',
    quantity: 1,
    quantityMode: 'crew',
});

const WorkToolRequirementsEditor: React.FC<Props> = ({ work, suggestions, onClose, onSave }) => {
    const [rows, setRows] = useState<WorkToolRequirement[]>(work.toolRequirements?.map(item => ({ ...item })) ?? []);
    const [saving, setSaving] = useState(false);
    const listId = useId();
    const valid = rows.every(row => row.name.trim() && Number.isFinite(row.quantity) && row.quantity > 0);
    const uniqueSuggestions = useMemo(() => [...new Set(suggestions)].sort((a, b) => a.localeCompare(b, 'ru')), [suggestions]);

    const update = (index: number, patch: Partial<WorkToolRequirement>) => {
        setRows(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
    };

    const save = async () => {
        if (!valid || saving) return;
        setSaving(true);
        try {
            await onSave(rows.map(row => ({ ...row, name: row.name.trim(), key: row.key || undefined, note: row.note?.trim() || undefined })));
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="work-tools-title">
            <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-surface p-4 shadow-2xl sm:max-w-2xl sm:rounded-2xl sm:p-5">
                <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
                    <div className="min-w-0">
                        <h3 id="work-tools-title" className="text-lg font-bold text-text-primary">Инструмент для работы</h3>
                        <p className="mt-1 truncate text-sm text-text-secondary">{work.name}</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Закрыть" className="min-h-11 min-w-11 rounded-lg border border-border text-text-secondary hover:bg-white/5 hover:text-text-primary">×</button>
                </div>

                <p className="mt-4 text-sm leading-6 text-text-secondary">Этот набор можно автоматически подставлять во все новые сметы, где используется данная работа.</p>
                <datalist id={listId}>{uniqueSuggestions.map(name => <option key={name} value={name} />)}</datalist>

                <div className="mt-4 space-y-3">
                    {rows.map((row, index) => (
                        <div key={index} className="grid gap-2 rounded-lg border border-border bg-background/40 p-3 sm:grid-cols-[minmax(180px,1fr)_90px_150px_44px] sm:items-end">
                            <label className="text-xs font-medium text-text-secondary">Название
                                <input list={listId} value={row.name} onChange={event => update(index, { name: event.target.value })} placeholder="Например, шуруповёрт" className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-text-primary" />
                            </label>
                            <label className="text-xs font-medium text-text-secondary">Количество
                                <input type="number" min={0.1} step={0.1} value={row.quantity} onChange={event => update(index, { quantity: Number(event.target.value) })} className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-text-primary" />
                            </label>
                            <label className="text-xs font-medium text-text-secondary">Расчёт
                                <select value={row.quantityMode} onChange={event => update(index, { quantityMode: event.target.value as WorkToolRequirement['quantityMode'] })} className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-text-primary">
                                    <option value="crew">На бригаду</option>
                                    <option value="person">На человека</option>
                                </select>
                            </label>
                            <button type="button" onClick={() => setRows(current => current.filter((_, rowIndex) => rowIndex !== index))} aria-label={`Удалить ${row.name || 'инструмент'}`} className="min-h-11 min-w-11 rounded-md border border-red-500/30 text-red-300 hover:bg-red-500/10">×</button>
                        </div>
                    ))}
                    {rows.length === 0 && <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-text-secondary">Для этой работы инструмент пока не настроен.</div>}
                </div>

                <button type="button" onClick={() => setRows(current => [...current, emptyRequirement()])} className="mt-3 min-h-11 w-full rounded-lg border border-border text-sm font-semibold text-text-primary hover:border-primary hover:bg-white/5">+ Добавить инструмент</button>
                <div className="mt-5 flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
                    <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-border px-4 font-semibold text-text-secondary hover:bg-white/5">Отмена</button>
                    <button type="button" onClick={() => void save()} disabled={!valid || saving} className="min-h-11 rounded-lg bg-primary px-5 font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Сохраняем…' : 'Сохранить набор'}</button>
                </div>
            </div>
        </div>
    );
};

export default WorkToolRequirementsEditor;
