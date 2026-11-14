import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { IconAlertTriangle, IconCheck, IconClose, IconDocument, IconRefresh, IconUpload } from '@devigner-ui/icons';
import { formatBytes } from '../../services/format';

// Adapted from the devignerui "file upload" recipe for this project's dark
// theme (R13): dropzone with a per-file queue of cards. The recipe's "pause"
// state is not applicable — local import is instant — so cards carry
// validation/result status and a retry action instead. The service layer
// (services/dataTransfer.ts) stays untouched; the consumer's onFiles does the
// work and describeResult turns its outcome into the card message.

export interface FileUploadResult {
    status: 'ok' | 'error';
    message: string;
}

export interface FileDropzoneProps {
    /** Значение accept для скрытого input, например '.json,application/json'. */
    accept: string;
    multiple?: boolean;
    /** Обработка одного файла; reject помечает карточку ошибкой с «Повторить». */
    onFiles: (files: File[]) => Promise<void>;
    /** Итог обработки файла (сводка импорта) для статуса карточки. */
    describeResult?: (file: File) => FileUploadResult;
    className?: string;
}

interface QueueEntry {
    id: string;
    file: File;
    status: 'processing' | 'ok' | 'error';
    message: string;
}

const DEFAULT_OK_MESSAGE = 'Импорт выполнен успешно';
const DEFAULT_ERROR_MESSAGE = 'Ошибка при импорте данных';

const makeEntryId = (index: number): string => `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;

export const FileDropzone: React.FC<FileDropzoneProps> = ({
    accept,
    multiple = false,
    onFiles,
    describeResult,
    className,
}) => {
    const [entries, setEntries] = React.useState<QueueEntry[]>([]);
    const [isDragging, setIsDragging] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    // Идентификатор карточки → идентификатор её текущего запроса: отклоняет
    // устаревшие ответы (например, retry поверх ещё идущей обработки).
    const requestSeq = React.useRef(new Map<string, number>());

    const patchEntry = (id: string, patch: Partial<Omit<QueueEntry, 'id' | 'file'>>) => {
        setEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
    };

    const processFile = async (id: string, file: File) => {
        const seq = (requestSeq.current.get(id) ?? 0) + 1;
        requestSeq.current.set(id, seq);
        patchEntry(id, { status: 'processing', message: '' });
        try {
            await onFiles([file]);
            const described = describeResult?.(file) ?? { status: 'ok' as const, message: DEFAULT_OK_MESSAGE };
            if (requestSeq.current.get(id) === seq) {
                patchEntry(id, { status: described.status, message: described.message });
            }
        } catch (error) {
            console.error('Failed to import file:', error);
            if (requestSeq.current.get(id) === seq) {
                patchEntry(id, { status: 'error', message: DEFAULT_ERROR_MESSAGE });
            }
        }
    };

    const addFiles = (files: File[]) => {
        const accepted = multiple ? files : files.slice(0, 1);
        if (accepted.length === 0) return;
        const newEntries = accepted.map((file, index) => ({
            id: makeEntryId(index),
            file,
            status: 'processing' as const,
            message: '',
        }));
        setEntries((current) => [...current, ...newEntries]);
        newEntries.forEach((entry) => { void processFile(entry.id, entry.file); });
    };

    const removeEntry = (id: string) => {
        requestSeq.current.delete(id);
        setEntries((current) => current.filter((entry) => entry.id !== id));
    };

    const retryEntry = (id: string, file: File) => {
        void processFile(id, file);
    };

    return (
        <div className={className}>
            <input
                ref={inputRef}
                type="file"
                accept={accept}
                multiple={multiple}
                className="sr-only"
                onChange={(event) => {
                    addFiles(Array.from(event.target.files ?? []));
                    event.target.value = '';
                }}
            />
            <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => {
                    event.preventDefault();
                    setIsDragging(false);
                    addFiles(Array.from(event.dataTransfer.files ?? []));
                }}
                className={`flex min-h-[88px] w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-4 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                    isDragging
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-background/60 hover:border-primary'
                }`}
            >
                <IconUpload aria-hidden="true" className={`size-5 ${isDragging ? 'text-primary' : 'text-text-secondary'}`} />
                <span className="text-sm font-semibold text-text-primary">Перетащите файл сюда</span>
                <span className="text-xs text-text-secondary">или нажмите, чтобы выбрать</span>
            </button>
            {entries.length > 0 && (
                <ul role="list" aria-live="polite" className="mt-2 space-y-1.5">
                    <AnimatePresence initial={false}>
                        {entries.map((entry) => (
                            <motion.li
                                key={entry.id}
                                layout
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                transition={{ duration: 0.15, ease: 'easeOut' }}
                                className="flex min-h-[44px] items-center gap-2 rounded-lg border border-border bg-background/60 px-2.5 py-1.5 md:min-h-9"
                            >
                                <IconDocument aria-hidden="true" className="size-4 shrink-0 text-text-secondary" />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm text-text-primary">{entry.file.name}</span>
                                    <span
                                        className={`block truncate text-xs ${
                                            entry.status === 'error' ? 'text-red-400' : entry.status === 'ok' ? 'text-emerald-400' : 'text-text-secondary'
                                        }`}
                                    >
                                        {formatBytes(entry.file.size)}
                                        {entry.message ? ` — ${entry.message}` : ''}
                                    </span>
                                </span>
                                {entry.status === 'processing' ? (
                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 animate-spin text-text-secondary">
                                        <path d="M21 12a9 9 0 1 1-6.2-8.56" />
                                    </svg>
                                ) : entry.status === 'ok' ? (
                                    <IconCheck aria-hidden="true" className="size-4 shrink-0 text-emerald-400" />
                                ) : (
                                    <IconAlertTriangle aria-hidden="true" className="size-4 shrink-0 text-red-400" />
                                )}
                                {entry.status === 'error' && (
                                    <button
                                        type="button"
                                        onClick={() => retryEntry(entry.id, entry.file)}
                                        aria-label={`Повторить импорт файла ${entry.file.name}`}
                                        title="Повторить"
                                        className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-md border border-transparent text-text-secondary transition-colors hover:border-border hover:bg-white/5 hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 md:min-h-7 md:min-w-7"
                                    >
                                        <IconRefresh aria-hidden="true" className="size-4" />
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => removeEntry(entry.id)}
                                    aria-label={`Убрать файл ${entry.file.name} из списка`}
                                    title="Убрать"
                                    className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-md border border-transparent text-text-secondary transition-colors hover:border-border hover:bg-white/5 hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 md:min-h-7 md:min-w-7"
                                >
                                    <IconClose aria-hidden="true" className="size-4" />
                                </button>
                            </motion.li>
                        ))}
                    </AnimatePresence>
                </ul>
            )}
        </div>
    );
};
