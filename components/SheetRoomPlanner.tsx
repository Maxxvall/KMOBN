import React, { useEffect, useMemo, useState } from 'react';
import {
    calculateRoomSheetLayout,
    SHEET_STOCK_PROFILES,
    SheetMaterialKind,
    SheetRoomInput,
} from '../services/cutting/sheetRoom';
import { generateSheetRoomPdf } from '../services/cutting/exportSheetRoomPdf';

type SheetRoom = SheetRoomInput;

const STORAGE_KEY = 'kmobn:sheet-rooms:v1';
const inputClass = 'min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-text-primary outline-none transition placeholder:text-text-secondary focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30';
const focusClass = 'outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background';
const formatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

const createRoom = (material: SheetMaterialKind, index = 1): SheetRoom => ({
    id: `sheet-room-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: `${material === 'osb' ? 'Помещение OSB' : 'Помещение фанеры'} ${index}`,
    material,
    length: 0,
    width: 0,
});

const loadRooms = (): SheetRoom[] => {
    if (typeof window === 'undefined') return [createRoom('osb')];
    try {
        const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]') as SheetRoom[];
        return stored.length ? stored : [createRoom('osb')];
    } catch {
        return [createRoom('osb')];
    }
};

const materialKindFromName = (name: string): SheetMaterialKind | null => {
    if (/osb|осб|осп/i.test(name)) return 'osb';
    if (/фанер|plywood/i.test(name)) return 'plywood';
    return null;
};

const SheetRoomPlanner: React.FC<{ detectedMaterials: string[] }> = ({ detectedMaterials }) => {
    const [rooms, setRooms] = useState<SheetRoom[]>(loadRooms);
    const [isExporting, setIsExporting] = useState(false);
    const [exportError, setExportError] = useState('');
    const detectedKey = detectedMaterials.join('|');

    useEffect(() => {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms));
        } catch (error) {
            console.error('Не удалось сохранить помещения для раскроя листов:', error);
        }
    }, [rooms]);

    useEffect(() => {
        const kinds = new Set(detectedKey.split('|').map(materialKindFromName).filter((kind): kind is SheetMaterialKind => kind !== null));
        setRooms(current => {
            const missing = [...kinds].filter(kind => !current.some(room => room.material === kind));
            if (!missing.length) return current;
            return [...current, ...missing.map((kind, index) => createRoom(kind, current.length + index + 1))];
        });
    }, [detectedKey]);

    const totals = useMemo(() => rooms.reduce((summary, room) => {
        const layout = calculateRoomSheetLayout(room.length, room.width, SHEET_STOCK_PROFILES[room.material]);
        if (!layout) return summary;
        summary.area += layout.roomAreaM2;
        summary[room.material] += layout.sheetCount;
        return summary;
    }, { area: 0, osb: 0, plywood: 0 }), [rooms]);

    const updateRoom = (id: string, patch: Partial<SheetRoom>) => {
        setRooms(current => current.map(room => room.id === id ? { ...room, ...patch } : room));
    };

    const addRoom = (material: SheetMaterialKind) => {
        const count = rooms.filter(room => room.material === material).length + 1;
        setRooms(current => [...current, createRoom(material, count)]);
    };

    const exportPdf = async () => {
        if (isExporting) return;
        setIsExporting(true);
        setExportError('');
        try {
            await generateSheetRoomPdf(rooms);
        } catch (reason) {
            setExportError(reason instanceof Error ? reason.message : 'Не удалось сформировать PDF листовых материалов.');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="rounded-xl border border-border bg-surface p-3 shadow-lg sm:p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-text-primary">OSB и фанера</h2>
                        <p className="mt-1 max-w-3xl text-sm text-text-secondary">
                            Отдельный расчёт покрытия помещений. Листы не входят в раскрой пиломатериала и не блокируют расчёт досок.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" disabled={isExporting || totals.osb + totals.plywood === 0} onClick={() => void exportPdf()} className={`min-h-11 rounded-lg bg-primary px-3 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40 ${focusClass}`}>{isExporting ? 'Формируем PDF…' : 'Скачать PDF листов'}</button>
                        <button type="button" onClick={() => addRoom('osb')} className={`min-h-11 rounded-lg border border-border bg-background px-3 text-sm font-medium text-text-primary transition hover:border-primary ${focusClass}`}>+ Помещение OSB</button>
                        <button type="button" onClick={() => addRoom('plywood')} className={`min-h-11 rounded-lg border border-border bg-background px-3 text-sm font-medium text-text-primary transition hover:border-primary ${focusClass}`}>+ Помещение фанеры</button>
                    </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <Summary label="Общая площадь" value={`${formatter.format(totals.area)} м²`} />
                    <Summary label="OSB 2500 × 1250" value={`${totals.osb} листов`} />
                    <Summary label="Фанера 1525 × 1525" value={`${totals.plywood} листов`} />
                </div>

                {detectedMaterials.length > 0 && (
                    <p className="mt-3 text-xs text-text-secondary">В загруженном файле обнаружено: {detectedMaterials.join(', ')}. Размеры помещений заполняются вручную.</p>
                )}
                {exportError && <p role="alert" className="mt-3 text-sm text-red-300">{exportError}</p>}
            </div>

            {rooms.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-background/20 p-6 text-center text-sm text-text-secondary">
                    Добавьте помещение для OSB или фанеры.
                </div>
            ) : rooms.map((room, index) => {
                const profile = SHEET_STOCK_PROFILES[room.material];
                const layout = calculateRoomSheetLayout(room.length, room.width, profile);
                return (
                    <section key={room.id} className="rounded-xl border border-border bg-surface p-3 shadow-lg sm:p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 items-center gap-3">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">{index + 1}</span>
                                <div className="min-w-0">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">{profile.label} · лист {profile.length} × {profile.width} мм</p>
                                    <input
                                        value={room.name}
                                        aria-label={`Название помещения ${index + 1}`}
                                        onChange={event => updateRoom(room.id, { name: event.target.value })}
                                        className="mt-0.5 w-full min-w-0 border-0 bg-transparent p-0 text-lg font-semibold text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                                    />
                                </div>
                            </div>
                            <button type="button" onClick={() => setRooms(current => current.filter(item => item.id !== room.id))} className={`min-h-11 rounded-lg px-3 text-sm font-medium text-red-300 transition hover:bg-red-500/10 ${focusClass}`}>Удалить</button>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <RoomNumberField label="Длина помещения, мм" value={room.length} onChange={length => updateRoom(room.id, { length })} />
                            <RoomNumberField label="Ширина помещения, мм" value={room.width} onChange={width => updateRoom(room.id, { width })} />
                            <label className="block">
                                <span className="mb-1.5 block text-sm font-medium text-text-secondary">Площадь помещения</span>
                                <output className={`${inputClass} flex items-center tabular-nums`} aria-live="polite">{layout ? `${formatter.format(layout.roomAreaM2)} м²` : '—'}</output>
                            </label>
                        </div>

                        {layout ? (
                            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                                <RoomGrid room={room} layout={layout} />
                                <div className="grid grid-cols-2 gap-2 self-start lg:grid-cols-1">
                                    <Summary label="Нужно листов" value={`${layout.sheetCount} шт.`} emphasized />
                                    <Summary label="Сетка укладки" value={`${layout.columns} × ${layout.rows}`} />
                                    <Summary label="Закупаемая площадь" value={`${formatter.format(layout.purchaseAreaM2)} м²`} />
                                    <Summary label="Краевые обрезки" value={`${formatter.format(layout.wasteAreaM2)} м²`} />
                                </div>
                            </div>
                        ) : (
                            <div className="mt-4 rounded-lg border border-dashed border-border bg-background/20 p-5 text-center text-sm text-text-secondary">
                                Укажите длину и ширину помещения — площадь, количество листов и схема появятся автоматически.
                            </div>
                        )}
                    </section>
                );
            })}

            <p className="text-xs leading-5 text-text-secondary">
                Расчёт показывает прямоугольную схему покрытия каждого помещения. Краевые остатки между разными помещениями автоматически не переносятся.
            </p>
        </div>
    );
};

const RoomGrid: React.FC<{
    room: SheetRoom;
    layout: NonNullable<ReturnType<typeof calculateRoomSheetLayout>>;
}> = ({ room, layout }) => {
    const canDrawGrid = layout.columns <= 100 && layout.rows <= 100;
    return (
        <figure className="min-w-0">
            <div className="overflow-hidden rounded-lg border border-border bg-background/40 p-3">
                <svg
                    viewBox={`0 0 ${room.length} ${room.width}`}
                    preserveAspectRatio="xMidYMid meet"
                    className="max-h-[430px] min-h-[220px] w-full"
                    role="img"
                    aria-label={`Схема листов для ${room.name}`}
                >
                    <rect x="0" y="0" width={room.length} height={room.width} fill="rgba(59,130,246,0.12)" stroke="currentColor" strokeWidth={Math.max(room.length, room.width) / 350} className="text-primary" />
                    {canDrawGrid && Array.from({ length: Math.max(0, layout.columns - 1) }, (_, index) => {
                        const x = Math.min(room.length, (index + 1) * layout.sheetLength);
                        return <line key={`x-${x}`} x1={x} y1="0" x2={x} y2={room.width} stroke="currentColor" strokeWidth={Math.max(room.length, room.width) / 700} className="text-primary/70" />;
                    })}
                    {canDrawGrid && Array.from({ length: Math.max(0, layout.rows - 1) }, (_, index) => {
                        const y = Math.min(room.width, (index + 1) * layout.sheetWidth);
                        return <line key={`y-${y}`} x1="0" y1={y} x2={room.length} y2={y} stroke="currentColor" strokeWidth={Math.max(room.length, room.width) / 700} className="text-primary/70" />;
                    })}
                </svg>
            </div>
            <figcaption className="mt-2 text-xs text-text-secondary">
                Раскладка листа {layout.sheetLength} × {layout.sheetWidth} мм{layout.rotated ? ' с поворотом относительно исходного формата' : ''}.
            </figcaption>
        </figure>
    );
};

const RoomNumberField: React.FC<{ label: string; value: number; onChange: (value: number) => void }> = ({ label, value, onChange }) => (
    <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-text-secondary">{label}</span>
        <input
            type="number"
            value={value > 0 ? value : ''}
            min="1"
            step="10"
            placeholder="Например, 6000"
            onChange={event => onChange(event.target.value === '' ? 0 : event.target.valueAsNumber)}
            className={`${inputClass} tabular-nums`}
        />
    </label>
);

const Summary: React.FC<{ label: string; value: string; emphasized?: boolean }> = ({ label, value, emphasized = false }) => (
    <div className={`rounded-lg border px-3 py-2 ${emphasized ? 'border-primary/50 bg-primary/10' : 'border-border bg-background/40'}`}>
        <div className="text-xs text-text-secondary">{label}</div>
        <div className={`mt-0.5 tabular-nums ${emphasized ? 'text-lg font-bold text-primary' : 'text-sm font-semibold text-text-primary'}`}>{value}</div>
    </div>
);

export default SheetRoomPlanner;
