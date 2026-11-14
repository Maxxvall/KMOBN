import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { IconArrowLeft, IconArrowRight, IconCalendar, IconChevronDown } from '@devigner-ui/icons';

// Adapted from the devignerui "date-range-picker" recipe for this project's
// dark theme (R05.1): full month calendar with range preview before commit and
// built-in presets. The ISO contract (yyyy-mm-dd, '' = not set) and the prop
// API of the previous native-input version are unchanged, so EstimateHistory
// keeps working without prop changes. Native <input type="date"> removed.

export interface DateRangePickerProps {
    /** Начало периода, ISO yyyy-mm-dd; '' — не задано. */
    from?: string;
    /** Конец периода, ISO yyyy-mm-dd; '' — не задано. */
    to?: string;
    onFromChange: (value: string) => void;
    onToChange: (value: string) => void;
    /** Доступные имена полей «с»/«по» (aria-имя триггера и диалога). */
    fromLabel?: string;
    toLabel?: string;
    className?: string;
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;
const MONTHS_NOMINATIVE = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'] as const;
const MONTHS_GENITIVE = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'] as const;

const pad2 = (value: number): string => String(value).padStart(2, '0');

const toISODate = (date: Date): string => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const parseISODate = (value: string): Date | null => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
};

const formatRuDate = (value: string): string => {
    const date = parseISODate(value);
    return date ? `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()}` : value;
};

const addDays = (iso: string, days: number): string => {
    const date = parseISODate(iso);
    if (!date) return iso;
    date.setDate(date.getDate() + days);
    return toISODate(date);
};

interface PresetRange {
    from: string;
    to: string;
}

const buildPresetRange = (id: string): PresetRange => {
    const today = toISODate(new Date());
    switch (id) {
        case 'today':
            return { from: today, to: today };
        case 'yesterday': {
            const yesterday = addDays(today, -1);
            return { from: yesterday, to: yesterday };
        }
        case 'week':
            return { from: addDays(today, -6), to: today };
        case 'month': {
            const now = new Date();
            return { from: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
        }
        case 'year': {
            const now = new Date();
            return { from: toISODate(new Date(now.getFullYear(), 0, 1)), to: today };
        }
        case 'all':
        default:
            return { from: '', to: '' };
    }
};

const PRESETS = [
    { id: 'today', label: 'Сегодня' },
    { id: 'yesterday', label: 'Вчера' },
    { id: 'week', label: 'Неделя' },
    { id: 'month', label: 'Месяц' },
    { id: 'year', label: 'Год' },
    { id: 'all', label: 'Всё' },
] as const;

interface CalendarDay {
    iso: string;
    label: string;
    inMonth: boolean;
}

const buildMonthDays = (cursor: Date): CalendarDay[] => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstOffset = (new Date(year, month, 1).getDay() + 6) % 7; // неделя с понедельника
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: CalendarDay[] = [];
    for (let day = 1; day <= daysInMonth; day += 1) {
        const date = new Date(year, month, day);
        days.push({
            iso: toISODate(date),
            label: `${day} ${MONTHS_GENITIVE[month]} ${year}`,
            inMonth: true,
        });
    }
    // Пустые ячейки перед первым днём (декоративные).
    for (let blank = 0; blank < firstOffset; blank += 1) {
        days.unshift({ iso: '', label: '', inMonth: false });
    }
    return days;
};

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
    from = '',
    to = '',
    onFromChange,
    onToChange,
    fromLabel = 'Период с',
    toLabel = 'Период по',
    className,
}) => {
    const [isOpen, setIsOpen] = React.useState(false);
    // Черновик диапазона — превью до подтверждения; null = календарь закрыт.
    const [draft, setDraft] = React.useState<PresetRange>({ from: '', to: '' });
    const [cursorMonth, setCursorMonth] = React.useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1);
    });
    const [hoveredDate, setHoveredDate] = React.useState('');
    const containerRef = React.useRef<HTMLDivElement | null>(null);

    const openPanel = () => {
        setDraft({ from, to });
        const anchor = parseISODate(from || to);
        const now = new Date();
        setCursorMonth(anchor ? new Date(anchor.getFullYear(), anchor.getMonth(), 1) : new Date(now.getFullYear(), now.getMonth(), 1));
        setHoveredDate('');
        setIsOpen(true);
    };

    const closePanel = () => setIsOpen(false);

    // Клик мимо и Esc закрывают календарь без подтверждения черновика.
    React.useEffect(() => {
        if (!isOpen) return undefined;
        const handlePointerDown = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) closePanel();
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') closePanel();
        };
        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    const applyDraft = () => {
        onFromChange(draft.from);
        onToChange(draft.to);
        closePanel();
    };

    const handleDayClick = (iso: string) => {
        if (!draft.from || (draft.from && draft.to)) {
            setDraft({ from: iso, to: '' });
            return;
        }
        if (iso < draft.from) {
            setDraft({ from: iso, to: '' });
            return;
        }
        setDraft({ from: draft.from, to: iso });
    };

    // Границы подсветки: черновик целиком, а при незавершённом выборе — превью до дня под курсором.
    const rangeStart = draft.from && draft.to
        ? (draft.from <= draft.to ? draft.from : draft.to)
        : draft.from;
    const rangeEnd = draft.from && draft.to
        ? (draft.from <= draft.to ? draft.to : draft.from)
        : (draft.from && !draft.to && hoveredDate && hoveredDate >= draft.from ? hoveredDate : '');

    const days = buildMonthDays(cursorMonth);
    const triggerText = from && to
        ? `${formatRuDate(from)} – ${formatRuDate(to)}`
        : from
            ? `с ${formatRuDate(from)}`
            : 'Все даты';
    const activePresetId = PRESETS.find((preset) => {
        const range = buildPresetRange(preset.id);
        return range.from === draft.from && range.to === draft.to;
    })?.id;

    return (
        <div ref={containerRef} className={`relative ${className ?? ''}`}>
            <button
                type="button"
                onClick={() => (isOpen ? closePanel() : openPanel())}
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                aria-label={`${fromLabel} — ${toLabel}`}
                className={`flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border bg-background/60 px-2.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 md:min-h-9 ${
                    isOpen ? 'border-primary ring-2 ring-primary/30' : 'hover:border-primary'
                }`}
            >
                <IconCalendar aria-hidden="true" className="size-4 shrink-0 text-text-secondary" />
                <span className={from || to ? 'text-text-primary tabular-nums' : 'text-text-secondary'}>{triggerText}</span>
                <IconChevronDown aria-hidden="true" className={`size-3.5 shrink-0 text-text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        role="dialog"
                        aria-label={`${fromLabel} — ${toLabel}`}
                        initial={{ opacity: 0, y: -4, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.98 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        className="absolute left-0 top-full z-40 mt-1 w-[288px] rounded-xl border border-border bg-surface p-3 shadow-xl"
                    >
                        <div className="mb-2 flex flex-wrap gap-1" role="group" aria-label="Пресеты периода">
                            {PRESETS.map((preset) => (
                                <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => setDraft(buildPresetRange(preset.id))}
                                    className={`min-h-7 rounded-full border px-2.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                                        activePresetId === preset.id
                                            ? 'border-primary bg-primary text-white'
                                            : 'border-border bg-background/60 text-text-secondary hover:border-primary hover:text-text-primary'
                                    }`}
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>
                        <div className="mb-1 flex items-center justify-between">
                            <button
                                type="button"
                                onClick={() => setCursorMonth(new Date(cursorMonth.getFullYear(), cursorMonth.getMonth() - 1, 1))}
                                aria-label="Предыдущий месяц"
                                className="flex size-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                            >
                                <IconArrowLeft aria-hidden="true" className="size-4" />
                            </button>
                            <span className="text-sm font-semibold text-text-primary" aria-live="polite">
                                {MONTHS_NOMINATIVE[cursorMonth.getMonth()]} {cursorMonth.getFullYear()}
                            </span>
                            <button
                                type="button"
                                onClick={() => setCursorMonth(new Date(cursorMonth.getFullYear(), cursorMonth.getMonth() + 1, 1))}
                                aria-label="Следующий месяц"
                                className="flex size-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                            >
                                <IconArrowRight aria-hidden="true" className="size-4" />
                            </button>
                        </div>
                        <div className="grid grid-cols-7 gap-0.5 text-center" aria-hidden="true">
                            {WEEKDAYS.map((weekday) => (
                                <span key={weekday} className="py-1 text-[10px] font-medium text-text-secondary">{weekday}</span>
                            ))}
                        </div>
                        <div className="grid grid-cols-7 gap-0.5">
                            {days.map((day, index) => (
                                day.inMonth ? (
                                    <button
                                        key={day.iso}
                                        type="button"
                                        onClick={() => handleDayClick(day.iso)}
                                        onMouseEnter={() => setHoveredDate(day.iso)}
                                        onMouseLeave={() => setHoveredDate('')}
                                        aria-label={day.label}
                                        aria-pressed={rangeStart !== '' && day.iso >= rangeStart && day.iso <= rangeEnd}
                                        className={`flex size-9 items-center justify-center rounded-full text-xs tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                                            rangeStart !== '' && day.iso >= rangeStart && day.iso <= rangeEnd
                                                ? (day.iso === rangeStart || day.iso === rangeEnd)
                                                    ? 'bg-primary font-semibold text-white'
                                                    : 'bg-primary/15 text-text-primary'
                                                : 'text-text-primary hover:bg-white/10'
                                        }`}
                                    >
                                        {Number(day.iso.slice(8, 10))}
                                    </button>
                                ) : (
                                    <span key={`blank-${index}`} aria-hidden="true" />
                                )
                            ))}
                        </div>
                        <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                            <span className="text-xs tabular-nums text-text-secondary">
                                {rangeStart && rangeEnd
                                    ? `${formatRuDate(rangeStart)} – ${formatRuDate(rangeEnd)}`
                                    : 'Выберите диапазон'}
                            </span>
                            <span className="flex gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => setDraft({ from: '', to: '' })}
                                    className="min-h-9 rounded-md px-2.5 text-xs font-semibold text-text-secondary transition-colors hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                                >
                                    Сбросить
                                </button>
                                <button
                                    type="button"
                                    onClick={applyDraft}
                                    className="min-h-9 rounded-md bg-primary px-3 text-xs font-semibold text-white transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                                >
                                    Применить
                                </button>
                            </span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
