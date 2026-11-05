import React, { useEffect, useId, useRef, useState } from 'react';
import { useOptionalEstimateSections } from '../contexts/EstimateSectionsContext';
import { MAX_ESTIMATE_LABEL_NAME_LENGTH, TYPICAL_PROJECT_LABEL_ID } from '../services/estimateLabels';

interface EstimateLabelsPickerProps {
    selectedIds: string[];
    onChange: (ids: string[]) => void;
    maxSelected?: number;
    withoutLabels?: boolean;
    onWithoutLabelsChange?: (value: boolean) => void;
}

export const EstimateLabelsPicker: React.FC<EstimateLabelsPickerProps> = ({ selectedIds, onChange, maxSelected, withoutLabels, onWithoutLabelsChange }) => {
    const context = useOptionalEstimateSections();
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState<{ id?: string; name: string } | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [error, setError] = useState('');
    const root = useRef<HTMLDivElement>(null);
    const button = useRef<HTMLButtonElement>(null);
    const id = useId();
    useEffect(() => {
        if (!open) return;
        const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
        const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); button.current?.focus(); } };
        document.addEventListener('pointerdown', outside);
        document.addEventListener('keydown', escape);
        return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
    }, [open]);
    if (!context) return null;
    const { activeLabels, saving, isLoading, pending } = context;
    const disabled = saving || isLoading || Boolean(context.document.syncConflict);
    const selected = activeLabels.filter(label => selectedIds.includes(label.id));
    const actionClass = 'min-h-11 rounded-md px-2 text-sm text-text-secondary hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50';
    const run = async (action: () => Promise<void>) => {
        setError('');
        try { await action(); setForm(null); setDeleting(null); }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось сохранить метку. Повторите попытку.'); }
    };
    return (
        <div ref={root} className="relative min-w-0">
            <span id={`${id}-label`} className="mb-1 block text-xs font-semibold text-text-secondary">Метки</span>
            <button ref={button} type="button" aria-labelledby={`${id}-label ${id}-value`} aria-expanded={open} aria-controls={`${id}-panel`} onClick={() => setOpen(value => !value)} className="min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-left text-sm text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <span id={`${id}-value`} className="block truncate">{withoutLabels ? 'Без метки' : selected.length ? selected.map(label => label.name).join(', ') : onWithoutLabelsChange ? 'Все метки' : 'Выбрать метки'}</span>
            </button>
            {maxSelected && <p className="mt-1 text-xs text-text-secondary">До {maxSelected} меток</p>}
            {open && (
                <div id={`${id}-panel`} className="absolute left-0 right-0 z-30 mt-1 max-h-[60vh] min-w-0 overflow-y-auto rounded-lg border border-border bg-surface p-2 text-text-primary">
                    {onWithoutLabelsChange && <label className="flex min-h-11 items-center gap-2 px-2 text-sm"><input type="checkbox" checked={Boolean(withoutLabels)} onChange={event => { onWithoutLabelsChange(event.target.checked); if (event.target.checked) onChange([]); }} className="h-4 w-4 accent-primary focus-visible:ring-2 focus-visible:ring-primary" />Без метки</label>}
                    {activeLabels.map(label => (
                        <div key={label.id} className="flex flex-wrap items-center gap-x-1 border-b border-border last:border-0">
                            <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-2 text-sm">
                                <input type="checkbox" checked={selectedIds.includes(label.id)} disabled={disabled || Boolean(maxSelected && selected.length >= maxSelected && !selectedIds.includes(label.id))} onChange={event => { onWithoutLabelsChange?.(false); onChange(event.target.checked ? [...selectedIds, label.id] : selectedIds.filter(value => value !== label.id)); }} className="h-4 w-4 shrink-0 accent-primary focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50" />
                                <span className="min-w-0 break-words">{label.name}</span>
                            </label>
                            {label.id !== TYPICAL_PROJECT_LABEL_ID && <div className="flex flex-wrap pl-2">
                                <button type="button" disabled={disabled} aria-label={`Переименовать метку «${label.name}»`} className={actionClass} onClick={() => { setForm({ id: label.id, name: label.name }); setDeleting(null); setError(''); }}>Изменить</button>
                                <button type="button" disabled={disabled} aria-label={`Удалить метку «${label.name}»`} className={`${actionClass} text-red-400`} onClick={() => { setDeleting(label.id); setForm(null); setError(''); }}>Удалить</button>
                            </div>}
                        </div>
                    ))}
                    {deleting && <div className="p-2 text-sm"><p>Снять метку «{activeLabels.find(label => label.id === deleting)?.name}» со всех смет? Сметы сохранятся.</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={disabled} className={`${actionClass} text-red-400`} onClick={() => void run(() => context.deleteLabel(deleting))}>Удалить метку</button><button type="button" className={actionClass} disabled={saving} onClick={() => setDeleting(null)}>Отмена</button></div></div>}
                    {form ? <div className="p-2">
                        <label className="block text-sm">Название метки<input autoFocus value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary" /></label>
                        <p className="mt-1 text-xs text-text-secondary">До {MAX_ESTIMATE_LABEL_NAME_LENGTH} символов</p>
                        <div className="flex flex-wrap gap-2"><button type="button" disabled={disabled} className={actionClass} onClick={() => void run(() => form.id ? context.renameLabel(form.id, form.name) : context.addLabel(form.name))}>{saving ? 'Сохранение…' : form.id ? 'Сохранить' : 'Добавить'}</button><button type="button" disabled={saving} className={actionClass} onClick={() => setForm(null)}>Отмена</button></div>
                    </div> : <button type="button" disabled={disabled} className={`${actionClass} w-full text-left`} onClick={() => { setForm({ name: '' }); setDeleting(null); setError(''); }}>Добавить метку</button>}
                    {(selected.length > 0 || withoutLabels) && <button type="button" className={`${actionClass} w-full text-left`} onClick={() => { onChange([]); onWithoutLabelsChange?.(false); }}>Сбросить выбор</button>}
                    {context.document.syncConflict && <p role="alert" className="p-2 text-sm text-amber-200">Разрешите конфликт справочника в разделе «Разделы».</p>}
                    {(error || context.error) && <p role="alert" className="p-2 text-sm text-red-400">{error || context.error}</p>}
                    {pending && <p role="status" className="p-2 text-xs text-text-secondary">Сохранено на устройстве · ожидает синхронизации</p>}
                </div>
            )}
        </div>
    );
};
