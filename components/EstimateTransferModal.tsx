import React, { useEffect, useState } from 'react';
import FocusLock from 'react-focus-lock';
import type { Estimate } from '../types';
import { createEstimateTransfer, parseEstimateTransfer } from '../services/database';

type EstimateTransferModalProps = {
    mode: 'share' | 'import';
    estimate?: Estimate | null;
    onClose: () => void;
    onImport?: (payload: string) => Promise<void>;
};

const copyToClipboard = async (text: string): Promise<void> => {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (!copied) throw new Error('Не удалось скопировать данные. Скачайте файл и отправьте его.');
};

const downloadTransfer = (estimate: Estimate) => {
    const blob = new Blob([createEstimateTransfer(estimate)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeNumber = estimate.estimateNumber.replace(/[^a-zа-яё0-9_-]+/gi, '-');
    link.href = url;
    link.download = `смета-${safeNumber || 'обмен'}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

const EstimateTransferModal: React.FC<EstimateTransferModalProps> = ({ mode, estimate, onClose, onImport }) => {
    const [payload, setPayload] = useState('');
    const [preview, setPreview] = useState<Estimate | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        setPayload('');
        setPreview(null);
        setError(null);
        setNotice(null);
        setIsSubmitting(false);
    }, [mode, estimate?.id]);

    const updatePayload = (value: string) => {
        setPayload(value);
        setNotice(null);
        if (!value.trim()) {
            setPreview(null);
            setError(null);
            return;
        }
        try {
            setPreview(parseEstimateTransfer(value.trim()));
            setError(null);
        } catch (reason) {
            setPreview(null);
            setError(reason instanceof Error ? reason.message : 'Не удалось прочитать смету.');
        }
    };

    const handleCopy = async () => {
        if (!estimate) return;
        try {
            await copyToClipboard(createEstimateTransfer(estimate));
            setNotice('Смета скопирована. Отправьте этот код получателю в мессенджере.');
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Не удалось скопировать смету.');
        }
    };

    const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            updatePayload(await file.text());
        } catch {
            setError('Не удалось прочитать выбранный файл.');
        } finally {
            event.target.value = '';
        }
    };

    const handleImport = async () => {
        if (!onImport || !preview || isSubmitting) return;
        setIsSubmitting(true);
        setError(null);
        try {
            await onImport(payload.trim());
            onClose();
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Не удалось добавить смету.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const isShare = mode === 'share';
    const title = isShare ? 'Поделиться сметой' : 'Вставить смету';

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-4 sm:items-center"
            onClick={() => !isSubmitting && onClose()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="estimate-transfer-title"
        >
            <FocusLock returnFocus>
                <div
                    className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-2xl sm:p-6"
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="mb-5">
                        <div className="mb-2 h-1 w-14 rounded-full bg-primary" />
                        <h2 id="estimate-transfer-title" className="text-xl font-bold text-text-primary sm:text-2xl">{title}</h2>
                        <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                            {isShare
                                ? 'Передаётся только выбранная версия сметы — без каталога материалов, работ и других данных.'
                                : 'Вставьте код из сообщения или выберите файл. Перед добавлением вы увидите, какую смету получите.'}
                        </p>
                    </div>

                    {isShare && estimate && (
                        <div className="space-y-3">
                            <div className="rounded-xl border border-border bg-background/50 p-4 text-sm">
                                <p className="font-semibold text-text-primary">{estimate.client || 'Без клиента'}</p>
                                <p className="mt-1 text-text-secondary">{estimate.estimateNumber} · {estimate.area} м² · {estimate.total.toLocaleString('ru-RU')} ₽</p>
                            </div>
                            <button type="button" onClick={() => void handleCopy()} className="min-h-11 w-full rounded-lg bg-primary px-4 py-2 font-semibold text-white transition hover:bg-primary-hover">
                                Скопировать смету
                            </button>
                            <button type="button" onClick={() => downloadTransfer(estimate)} className="min-h-11 w-full rounded-lg border border-border bg-background px-4 py-2 font-semibold text-text-primary transition hover:bg-white/5">
                                Скачать файл
                            </button>
                        </div>
                    )}

                    {!isShare && (
                        <div className="space-y-4">
                            <label className="block text-sm font-medium text-text-primary">
                                Код сметы
                                <textarea
                                    value={payload}
                                    onChange={(event) => updatePayload(event.target.value)}
                                    placeholder="Вставьте сюда скопированный код…"
                                    className="mt-2 min-h-36 w-full rounded-lg border border-border bg-background p-3 font-mono text-xs text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                                />
                            </label>
                            <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-text-primary transition hover:bg-white/5">
                                Выбрать файл сметы
                                <input type="file" accept=".json,application/json" onChange={handleFile} className="sr-only" />
                            </label>
                            {preview && (
                                <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-4 text-sm">
                                    <p className="font-semibold text-emerald-200">Готово к добавлению</p>
                                    <p className="mt-2 text-text-primary">{preview.client || 'Без клиента'}</p>
                                    <p className="mt-1 text-text-secondary">{preview.estimateNumber} · {preview.area} м² · {preview.items.length} поз. · {preview.total.toLocaleString('ru-RU')} ₽</p>
                                    <p className="mt-2 text-xs text-text-secondary">Смета будет добавлена как новая копия. Другие данные не изменятся.</p>
                                </div>
                            )}
                            <button type="button" disabled={!preview || isSubmitting} onClick={() => void handleImport()} className="min-h-11 w-full rounded-lg bg-primary px-4 py-2 font-semibold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">
                                {isSubmitting ? 'Добавляем…' : 'Добавить смету'}
                            </button>
                        </div>
                    )}

                    {(error || notice) && (
                        <p className={`mt-4 rounded-lg border p-3 text-sm ${error ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'}`}>
                            {error || notice}
                        </p>
                    )}

                    <button type="button" onClick={onClose} disabled={isSubmitting} className="mt-5 min-h-11 w-full rounded-lg border border-border bg-background px-4 py-2 font-semibold text-text-primary transition hover:bg-white/5 disabled:opacity-50">
                        Закрыть
                    </button>
                </div>
            </FocusLock>
        </div>
    );
};

export default React.memo(EstimateTransferModal);
