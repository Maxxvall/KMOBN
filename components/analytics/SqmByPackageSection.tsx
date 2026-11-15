import React, { useMemo, useState } from 'react';
import { type Estimate, type EstimateSqmAreaBase, type HousePackageId } from '../../types';
import {
  buildSqmAnalytics,
  createSqmFieldPatch,
  formatSqmProjectCount,
  SQM_AREA_BASE_LABELS,
  SQM_PACKAGE_LABELS,
  SQM_PACKAGE_ORDER,
  type SqmFieldPatch,
  type SqmGroupStats,
  type SqmObjectType,
} from '../../services/sqmAnalytics';
import { inputStyles, fieldLabelStyles } from '../estimate-editor/shared';
import { Badge } from '../ui/badge';

// Блок «Стоимость м² по комплектациям» (режим «Обзор» Аналитики). Вся логика —
// вызовы services/sqmAnalytics.ts; внутри только состояние фильтров и раскрытых
// панелей. Блок читает цены/площади/позиции смет и пишет ТОЛЬКО sqm-поля
// (sqmPackage/sqmAreaBase/sqmConfirmedAt) через колбэк App — total/area/items
// не меняются никогда.

export interface SqmByPackageSectionProps {
  estimates: Estimate[];
  /** Сохранение подтверждений — только sqm-поля, обычным путём сохранения смет (outbox-first). */
  onUpdateSqmFields: (id: string, patch: SqmFieldPatch) => void;
  /** Необязательный переход «Открыть смету» (кнопка скрыта, если колбэк не передан). */
  onOpenEstimate?: (id: string) => void;
  periodLabel?: string;
}

type RegionFilterValue = 'ALL' | 'NONE' | string;

const OBJECT_TYPE_OPTIONS: Array<{ value: SqmObjectType; label: string }> = [
  { value: 'houses', label: 'Дома' },
  { value: 'baths', label: 'Бани' },
  { value: 'utility', label: 'Хозблоки' },
  { value: 'other', label: 'Прочее' },
];

const NEEDS_CHECK_REASON_LABELS: Record<string, string> = {
  'no-area': 'нет площади',
  'no-total': 'нет итога',
  'needs-area-base': 'площадь без дополнений или с дополнениями?',
  ambiguous: 'неоднозначная комплектация',
  hint: 'предложено по фразе — подтвердите',
  none: 'комплектация не определена',
};

const formatSqmRub = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽/м²`;

const AREA_BASE_VALUES: EstimateSqmAreaBase[] = ['house', 'house-with-additions'];

const SqmByPackageSection: React.FC<SqmByPackageSectionProps> = ({
  estimates,
  onUpdateSqmFields,
  onOpenEstimate,
  periodLabel,
}) => {
  const [objectType, setObjectType] = useState<SqmObjectType>('houses');
  const [region, setRegion] = useState<RegionFilterValue>('ALL');
  const [areaMin, setAreaMin] = useState('');
  const [areaMax, setAreaMax] = useState('');
  const [drilledPackage, setDrilledPackage] = useState<HousePackageId | null>(null);
  const [preferredBase, setPreferredBase] = useState<Record<string, EstimateSqmAreaBase>>({});

  const areaBound = (value: string): number | undefined => {
    if (value === '') return undefined;
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const result = useMemo(() => buildSqmAnalytics(estimates, {
    objectType,
    region: region === 'ALL' ? undefined : region === 'NONE' ? null : region,
    areaMin: areaBound(areaMin),
    areaMax: areaBound(areaMax),
  }), [areaMax, areaMin, estimates, objectType, region]);

  const displayBaseOf = (group: SqmGroupStats): EstimateSqmAreaBase | null => {
    const preferred = preferredBase[group.package];
    if (preferred === 'house' && group.house) return 'house';
    if (preferred === 'house-with-additions' && group.houseWithAdditions) return 'house-with-additions';
    if (group.house) return 'house';
    if (group.houseWithAdditions) return 'house-with-additions';
    return null;
  };

  const confirmPackage = (id: string, pkg: HousePackageId) => {
    onUpdateSqmFields(id, createSqmFieldPatch({ package: pkg }));
  };

  const confirmAreaBase = (id: string, areaBase: EstimateSqmAreaBase) => {
    onUpdateSqmFields(id, createSqmFieldPatch({ areaBase }));
  };

  const drilledGroup = drilledPackage ? result.groups[drilledPackage] : null;
  const drilledBase = drilledGroup ? displayBaseOf(drilledGroup) : null;
  const drilledEntries = drilledBase
    ? (drilledBase === 'house' ? drilledGroup?.house : drilledGroup?.houseWithAdditions)?.entries ?? []
    : [];

  return (
    <section className="bg-surface border border-border rounded-xl p-4 sm:p-6 shadow" aria-label="Стоимость м² по комплектациям">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">Стоимость м² по комплектациям</h2>
          <div className="text-xs text-text-secondary mt-1">
            Ориентир по сметам с меткой «Типовые проекты»{periodLabel ? ` • ${periodLabel}` : ''}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div>
            <label className={`${fieldLabelStyles} mb-1`} htmlFor="sqm-object-type">Тип объекта</label>
            <div id="sqm-object-type" className="inline-flex flex-wrap rounded-lg border border-border bg-background overflow-hidden">
              {OBJECT_TYPE_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setObjectType(option.value)}
                  className={`min-h-[44px] md:min-h-9 px-3 text-sm transition ${
                    objectType === option.value ? 'bg-primary text-white' : 'text-text-primary hover:bg-background/70'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={`${fieldLabelStyles} mb-1`} htmlFor="sqm-region">Регион</label>
            <select
              id="sqm-region"
              value={region}
              onChange={event => setRegion(event.target.value)}
              className={`${inputStyles} min-h-[44px] md:min-h-9 sm:w-48 text-sm`}
            >
              <option value="ALL">Все регионы</option>
              <option value="NONE">Без региона</option>
              {result.regions.map(regionName => (
                <option key={regionName} value={regionName}>{regionName}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <div>
              <label className={`${fieldLabelStyles} mb-1`} htmlFor="sqm-area-min">Площадь от, м²</label>
              <input
                id="sqm-area-min"
                type="number"
                min={0}
                inputMode="numeric"
                value={areaMin}
                onChange={event => setAreaMin(event.target.value)}
                className={`${inputStyles} min-h-[44px] md:min-h-9 sm:w-28 tabular-nums`}
                placeholder="0"
              />
            </div>
            <div>
              <label className={`${fieldLabelStyles} mb-1`} htmlFor="sqm-area-max">до, м²</label>
              <input
                id="sqm-area-max"
                type="number"
                min={0}
                inputMode="numeric"
                value={areaMax}
                onChange={event => setAreaMax(event.target.value)}
                className={`${inputStyles} min-h-[44px] md:min-h-9 sm:w-28 tabular-nums`}
                placeholder="∞"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {SQM_PACKAGE_ORDER.map(pkg => {
          const group = result.groups[pkg];
          const base = displayBaseOf(group);
          const stats = base ? (base === 'house' ? group.house : group.houseWithAdditions) : null;
          const client = stats?.client ?? null;
          const cost = stats?.cost ?? null;
          const isDrilled = drilledPackage === pkg;
          return (
            <div key={pkg} className={`rounded-xl border p-4 transition ${isDrilled ? 'border-primary bg-background/70' : 'border-border bg-background/30'}`}>
              <button
                type="button"
                onClick={() => setDrilledPackage(isDrilled ? null : pkg)}
                className="w-full text-left"
                aria-expanded={isDrilled}
              >
                <div className="text-sm font-semibold text-text-primary">{SQM_PACKAGE_LABELS[pkg]}</div>
                {client ? (
                  <>
                    <div className="mt-2 text-lg font-bold text-text-primary tabular-nums">
                      {formatSqmRub(client.median)}
                      <span className="block text-[11px] font-medium text-text-secondary">
                        {(stats?.entries.length ?? 0) >= 2 ? 'медиана по цене для клиента' : 'цена проекта'}
                      </span>
                    </div>
                    {(stats?.entries.length ?? 0) >= 2 && (
                      <div className="mt-1 text-xs text-text-secondary tabular-nums">
                        диапазон: {formatSqmRub(client.min)} – {formatSqmRub(client.max)}
                      </div>
                    )}
                    <div className="text-xs text-text-secondary">{formatSqmProjectCount(stats?.entries.length ?? 0)}</div>
                    {(stats?.entries.length ?? 0) >= 2 && client && (
                      <div className="mt-1 text-xs text-text-secondary tabular-nums">
                        среднее: {formatSqmRub(client.average)}
                      </div>
                    )}
                    {cost && (
                      <div className="mt-1 text-xs text-text-secondary tabular-nums">
                        себестоимость: {formatSqmRub(cost.median)}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="mt-2 text-sm text-text-secondary">Нет данных</div>
                )}
              </button>
              {group.house && group.houseWithAdditions && (
                <div className="mt-2 inline-flex rounded-lg border border-border bg-surface overflow-hidden">
                  {AREA_BASE_VALUES.map(baseValue => (
                    <button
                      key={baseValue}
                      type="button"
                      onClick={() => setPreferredBase(prev => ({ ...prev, [pkg]: baseValue }))}
                      className={`min-h-[44px] md:min-h-9 px-2 text-[11px] transition ${
                        base === baseValue ? 'bg-primary text-white' : 'text-text-primary hover:bg-background/70'
                      }`}
                    >
                      {SQM_AREA_BASE_LABELS[baseValue]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-background/30 p-4">
          <h3 className="text-sm font-semibold text-text-primary">
            Требуют проверки
            <span className="ml-2 text-xs font-normal text-text-secondary">{result.needsCheck.length}</span>
          </h3>
          <div className="mt-3 space-y-2 max-h-80 overflow-y-auto pr-1">
            {result.needsCheck.map(entry => (
              <div key={entry.id} className="rounded-lg border border-border bg-surface p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-text-primary truncate">
                      {entry.estimateNumber} • {entry.client}
                    </div>
                    <div className="text-xs text-text-secondary mt-0.5">{NEEDS_CHECK_REASON_LABELS[entry.reason]}</div>
                    {entry.completion.state === 'hint' && entry.completion.package && (
                      <div className="mt-1">
                        <Badge tone="warning">предложено: {SQM_PACKAGE_LABELS[entry.completion.package]}</Badge>
                      </div>
                    )}
                    {entry.completion.state === 'ambiguous' && entry.completion.candidates?.length ? (
                      <div className="text-xs text-text-secondary mt-1">
                        варианты: {entry.completion.candidates.map(candidate => SQM_PACKAGE_LABELS[candidate]).join(', ')}
                      </div>
                    ) : null}
                  </div>
                  {onOpenEstimate && (
                    <button
                      type="button"
                      onClick={() => onOpenEstimate(entry.id)}
                      className="min-h-[44px] md:min-h-9 shrink-0 rounded-md border border-border bg-background px-3 text-xs text-text-primary hover:bg-background/70 transition"
                    >
                      Открыть смету
                    </button>
                  )}
                </div>
                {(entry.reason === 'hint' || entry.reason === 'ambiguous' || entry.reason === 'none') && (
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    {entry.reason === 'hint' && entry.completion.package && (
                      <button
                        type="button"
                        onClick={() => confirmPackage(entry.id, entry.completion.package as HousePackageId)}
                        className="min-h-[44px] md:min-h-9 rounded-md bg-primary px-3 text-xs font-semibold text-white transition hover:opacity-90"
                      >
                        Подтвердить
                      </button>
                    )}
                    <div className="flex-1 min-w-44">
                      <label className={`${fieldLabelStyles} mb-1`} htmlFor={`sqm-fix-${entry.id}`}>исправить</label>
                      <select
                        id={`sqm-fix-${entry.id}`}
                        value={entry.completion.state === 'hint' || entry.completion.state === 'explicit' ? entry.completion.package ?? '' : ''}
                        onChange={event => {
                          if (!event.target.value) return;
                          confirmPackage(entry.id, event.target.value as HousePackageId);
                        }}
                        className={`${inputStyles} min-h-[44px] md:min-h-9 text-xs`}
                      >
                        <option value="">выбрать комплектацию…</option>
                        {SQM_PACKAGE_ORDER.map(option => (
                          <option key={option} value={option}>{SQM_PACKAGE_LABELS[option]}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
                {entry.reason === 'needs-area-base' && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {AREA_BASE_VALUES.map(baseValue => (
                      <button
                        key={baseValue}
                        type="button"
                        onClick={() => confirmAreaBase(entry.id, baseValue)}
                        className="min-h-[44px] md:min-h-9 rounded-md border border-border bg-background px-3 text-xs text-text-primary hover:bg-background/70 transition"
                      >
                        {SQM_AREA_BASE_LABELS[baseValue]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {!result.needsCheck.length && (
              <div className="rounded-lg border border-border bg-surface p-3 text-sm text-text-secondary">
                Все подходящие сметы учтены.
              </div>
            )}
          </div>
        </div>

        {drilledGroup && (
          <div className="xl:col-span-2 rounded-xl border border-border bg-background/30 p-4">
            <h3 className="text-sm font-semibold text-text-primary">
              Проекты: {SQM_PACKAGE_LABELS[drilledGroup.package]}
              {drilledBase ? ` • ${SQM_AREA_BASE_LABELS[drilledBase]}` : ''}
            </h3>
            <div className="mt-3 space-y-2 max-h-80 overflow-y-auto pr-1">
              {drilledEntries.map(entry => (
                <div key={entry.id} className="rounded-lg border border-border bg-surface p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-text-primary truncate">
                        {entry.estimateNumber} • {entry.client}
                      </div>
                      <div className="text-xs text-text-secondary mt-0.5 tabular-nums">
                        {new Date(entry.date).toLocaleDateString('ru-RU')} • площадь {entry.area} м² ({SQM_AREA_BASE_LABELS[entry.areaBase]}{entry.areaBaseConfirmed ? ', подтверждена' : ', как указано'}) • итог {entry.total.toLocaleString('ru-RU')} ₽
                        {entry.region ? ` • ${entry.region}` : ''}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-text-primary tabular-nums">{formatSqmRub(entry.clientPricePerSqm)}</div>
                      {entry.costPerSqm != null && (
                        <div className="text-xs text-text-secondary tabular-nums">себестоимость: {formatSqmRub(entry.costPerSqm)}</div>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <div className="pb-1">
                      <Badge tone={entry.completion.state === 'explicit' ? 'info' : 'success'}>
                        {entry.completion.state === 'explicit' ? 'из расчёта дома' : 'подтверждено'}
                      </Badge>
                    </div>
                    <div className="w-44">
                      <label className={`${fieldLabelStyles} mb-1`} htmlFor={`sqm-entry-${entry.id}`}>исправить</label>
                      <select
                        id={`sqm-entry-${entry.id}`}
                        value={entry.completion.package ?? ''}
                        onChange={event => {
                          if (!event.target.value) return;
                          confirmPackage(entry.id, event.target.value as HousePackageId);
                        }}
                        className={`${inputStyles} min-h-[44px] md:min-h-9 text-xs`}
                      >
                        {SQM_PACKAGE_ORDER.map(option => (
                          <option key={option} value={option}>{SQM_PACKAGE_LABELS[option]}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
              {!drilledEntries.length && (
                <div className="rounded-lg border border-border bg-surface p-3 text-sm text-text-secondary">
                  В этой комплектации пока нет проектов.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-text-secondary">
        Это ориентиры по нашим сметам, а не гарантированная цена строительства
      </p>
    </section>
  );
};

export { SqmByPackageSection };
export default SqmByPackageSection;
