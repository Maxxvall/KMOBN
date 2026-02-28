import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Estimate, EstimateCategory, EstimateStatus, EstimateSubgroup, Material, Work } from '../types';

// ─── Building type presets ───────────────────────────────────────────────────

export type BuildingTypePreset = {
  id: string;
  icon: string;
  label: string;
  description: string;
  defaultArea: number;
  /** Sections typically included */
  defaultSections: EstimateCategory[];
  /** Prompt hint for AI */
  promptHint: string;
};

const BUILDING_PRESETS: BuildingTypePreset[] = [
  {
    id: 'frame-house',
    icon: '🏠',
    label: 'Каркасный дом',
    description: 'Жилой каркасный дом под ключ',
    defaultArea: 120,
    defaultSections: [
      EstimateCategory.FOUNDATION, EstimateCategory.GRILLAGE,
      EstimateCategory.WALLS, EstimateCategory.ROOF,
      EstimateCategory.WINDOWS, EstimateCategory.ELECTRICAL,
      EstimateCategory.LOGISTICS,
    ],
    promptHint: 'Каркасный жилой дом. Фундамент на сваях, силовой каркас стен, утепление, кровля металлочерепица, окна/двери.',
  },
  {
    id: 'brick-house',
    icon: '🧱',
    label: 'Кирпичный дом',
    description: 'Дом из кирпича/блоков',
    defaultArea: 150,
    defaultSections: [
      EstimateCategory.FOUNDATION, EstimateCategory.GRILLAGE,
      EstimateCategory.WALLS, EstimateCategory.ROOF,
      EstimateCategory.WINDOWS, EstimateCategory.ELECTRICAL,
      EstimateCategory.LOGISTICS,
    ],
    promptHint: 'Кирпичный/блочный дом. Ленточный/плитный фундамент, кладка стен, кровля, окна/двери.',
  },
  {
    id: 'bath-house',
    icon: '🛖',
    label: 'Баня',
    description: 'Баня / сауна',
    defaultArea: 24,
    defaultSections: [
      EstimateCategory.FOUNDATION, EstimateCategory.WALLS,
      EstimateCategory.ROOF, EstimateCategory.LOGISTICS,
    ],
    promptHint: 'Баня/сауна. Фундамент, каркас/брус стен, утепление парной, кровля. Без электрики и сантехники.',
  },
  {
    id: 'garage',
    icon: '🚗',
    label: 'Гараж',
    description: 'Гараж на 1-2 авто',
    defaultArea: 36,
    defaultSections: [
      EstimateCategory.FOUNDATION, EstimateCategory.WALLS,
      EstimateCategory.ROOF, EstimateCategory.LOGISTICS,
    ],
    promptHint: 'Гараж. Фундамент, стены (каркас или блоки), кровля, ворота. Без электрики.',
  },
  {
    id: 'shed',
    icon: '🏚️',
    label: 'Сарай / хозблок',
    description: 'Хозяйственная постройка',
    defaultArea: 18,
    defaultSections: [
      EstimateCategory.FOUNDATION, EstimateCategory.WALLS,
      EstimateCategory.ROOF, EstimateCategory.LOGISTICS,
    ],
    promptHint: 'Сарай/хозблок. Фундамент на сваях, каркас, обшивка, кровля. Базовый комплект.',
  },
  {
    id: 'roof-repair',
    icon: '🔨',
    label: 'Ремонт кровли',
    description: 'Замена / ремонт крыши',
    defaultArea: 80,
    defaultSections: [
      EstimateCategory.ROOF, EstimateCategory.DEMOLITION,
      EstimateCategory.LOGISTICS,
    ],
    promptHint: 'Ремонт/замена кровли. Демонтаж старого покрытия, гидро-/пароизоляция, подкладочный ковер, крепеж, монтаж.',
  },
  {
    id: 'custom',
    icon: '✏️',
    label: 'Свой вариант',
    description: 'Опишите объект вручную',
    defaultArea: 100,
    defaultSections: [
      EstimateCategory.FOUNDATION, EstimateCategory.GRILLAGE,
      EstimateCategory.WALLS, EstimateCategory.ROOF,
      EstimateCategory.WINDOWS, EstimateCategory.LOGISTICS,
    ],
    promptHint: '',
  },
];

const ALL_SECTIONS: { cat: EstimateCategory; label: string; icon: string }[] = [
  { cat: EstimateCategory.FOUNDATION, label: 'Фундамент', icon: '🧱' },
  { cat: EstimateCategory.GRILLAGE, label: 'Ростверк/Лаги/Полы', icon: '🪵' },
  { cat: EstimateCategory.WALLS, label: 'Стены', icon: '🏗️' },
  { cat: EstimateCategory.ROOF, label: 'Кровля/Потолок', icon: '🏠' },
  { cat: EstimateCategory.WINDOWS, label: 'Окна/Двери', icon: '🪟' },
  { cat: EstimateCategory.ELECTRICAL, label: 'Электрика', icon: '⚡' },
  { cat: EstimateCategory.DEMOLITION, label: 'Демонтаж', icon: '🔨' },
  { cat: EstimateCategory.LOGISTICS, label: 'Логистика', icon: '🚚' },
  { cat: EstimateCategory.GENERAL, label: 'Общая', icon: '📋' },
];

// ─── Similar estimate summary ───────────────────────────────────────────────

type SimilarEstimateSummary = {
  id: string;
  estimateNumber: string;
  client: string;
  area: number;
  buildingType: string;
  total: number;
  itemCount: number;
  status: EstimateStatus;
  date: string;
};

const findSimilarEstimates = (
  estimates: Estimate[],
  area: number,
  buildingType: string,
): SimilarEstimateSummary[] => {
  if (!estimates?.length || area <= 0) return [];

  const latestByRoot = new Map<string, Estimate>();
  for (const e of estimates) {
    if (e.isArchived) continue;
    const rootId = e.parentId || e.id;
    const prev = latestByRoot.get(rootId);
    if (!prev || e.version > prev.version) {
      latestByRoot.set(rootId, e);
    }
  }

  const candidates = Array.from(latestByRoot.values());
  const buildTypeNorm = (buildingType || '').toLowerCase().trim();

  const scored = candidates
    .map(e => {
      let score = 0;
      // Area closeness (max 50 points)
      const areaDiff = Math.abs(e.area - area) / Math.max(area, 1);
      score += Math.max(0, 50 - areaDiff * 100);
      // Building type match (30 points)
      const eType = (e.buildingType || '').toLowerCase().trim();
      if (buildTypeNorm && eType && eType.includes(buildTypeNorm)) score += 30;
      else if (buildTypeNorm && eType && buildTypeNorm.includes(eType)) score += 20;
      // Approved status bonus (20 points)
      if (e.status === EstimateStatus.APPROVED) score += 20;
      if (e.status === EstimateStatus.SENT) score += 10;
      return { e, score };
    })
    .filter(x => x.score > 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return scored.map(({ e }) => ({
    id: e.id,
    estimateNumber: e.estimateNumber,
    client: e.client,
    area: e.area,
    buildingType: e.buildingType,
    total: e.total,
    itemCount: e.items?.length ?? 0,
    status: e.status,
    date: e.date,
  }));
};

// ─── Stats from history ─────────────────────────────────────────────────────

type HistoryStats = {
  approvedCount: number;
  totalEstimates: number;
  avgItemsPerEstimate: number;
  topMaterials: string[];
  topWorks: string[];
};

const computeHistoryStats = (estimates: Estimate[]): HistoryStats => {
  if (!estimates?.length) return { approvedCount: 0, totalEstimates: 0, avgItemsPerEstimate: 0, topMaterials: [], topWorks: [] };

  const approved = estimates.filter(e => e.status === EstimateStatus.APPROVED && !e.isArchived);
  const materialFreq = new Map<string, number>();
  const workFreq = new Map<string, number>();

  for (const e of approved) {
    for (const item of e.items || []) {
      const name = (item.name || '').trim();
      if (!name) continue;
      if (item.subgroup === EstimateSubgroup.MATERIALS) {
        materialFreq.set(name, (materialFreq.get(name) || 0) + 1);
      } else if (!item.subgroup || item.subgroup === EstimateSubgroup.WORKS) {
        workFreq.set(name, (workFreq.get(name) || 0) + 1);
      }
    }
  }

  const topMaterials = Array.from(materialFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);
  const topWorks = Array.from(workFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);

  const totalItems = estimates.reduce((s, e) => s + (e.items?.length || 0), 0);

  return {
    approvedCount: approved.length,
    totalEstimates: estimates.length,
    avgItemsPerEstimate: estimates.length > 0 ? Math.round(totalItems / estimates.length) : 0,
    topMaterials,
    topWorks,
  };
};

// ─── DB coverage check ──────────────────────────────────────────────────────

type DbCoverage = {
  materialsCount: number;
  worksCount: number;
  categoryCoverage: { cat: EstimateCategory; materials: number; works: number }[];
};

const computeDbCoverage = (
  materials: Material[],
  works: Work[],
  sections: EstimateCategory[],
): DbCoverage => {
  const cats = sections.length > 0 ? sections : Object.values(EstimateCategory);
  const categoryCoverage = cats.map(cat => ({
    cat,
    materials: (materials || []).filter(m => m.category === cat).length,
    works: (works || []).filter(w => w.category === cat).length,
  }));
  return {
    materialsCount: materials?.length ?? 0,
    worksCount: works?.length ?? 0,
    categoryCoverage,
  };
};

// ─── Component ──────────────────────────────────────────────────────────────

export type AIGenerationPayload = {
  description: string;
  enableAiPriceSearch: boolean;
  selectedPreset: BuildingTypePreset;
  selectedSections: EstimateCategory[];
  area: number;
  buildingType: string;
  referenceEstimateId?: string;
};

const AIGenerationModal = ({
  isOpen,
  initialValue,
  initialEnableAiPriceSearch,
  onCancel,
  onConfirm,
  allEstimates,
  materials,
  works,
  currentArea,
  currentBuildingType,
}: {
  isOpen: boolean;
  initialValue?: string;
  initialEnableAiPriceSearch?: boolean;
  onCancel: () => void;
  onConfirm: (payload: AIGenerationPayload) => void;
  allEstimates?: Estimate[];
  materials?: Material[];
  works?: Work[];
  currentArea?: number;
  currentBuildingType?: string;
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [area, setArea] = useState(currentArea || 120);
  const [buildingType, setBuildingType] = useState(currentBuildingType || '');
  const [selectedSections, setSelectedSections] = useState<EstimateCategory[]>([]);
  const [customDescription, setCustomDescription] = useState(initialValue || '');
  const [enableAiPriceSearch, setEnableAiPriceSearch] = useState(Boolean(initialEnableAiPriceSearch));
  const [referenceEstimateId, setReferenceEstimateId] = useState<string | undefined>();

  const selectedPreset = useMemo(
    () => BUILDING_PRESETS.find(p => p.id === selectedPresetId) || null,
    [selectedPresetId],
  );

  const similarEstimates = useMemo(
    () => findSimilarEstimates(allEstimates || [], area, buildingType),
    [allEstimates, area, buildingType],
  );

  const historyStats = useMemo(
    () => computeHistoryStats(allEstimates || []),
    [allEstimates],
  );

  const dbCoverage = useMemo(
    () => computeDbCoverage(materials || [], works || [], selectedSections),
    [materials, works, selectedSections],
  );

  // Reset state when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setSelectedPresetId(null);
    setArea(currentArea || 120);
    setBuildingType(currentBuildingType || '');
    setSelectedSections([]);
    setCustomDescription(initialValue || '');
    setEnableAiPriceSearch(Boolean(initialEnableAiPriceSearch));
    setReferenceEstimateId(undefined);
  }, [isOpen, initialValue, initialEnableAiPriceSearch, currentArea, currentBuildingType]);

  const handlePresetSelect = useCallback((preset: BuildingTypePreset) => {
    setSelectedPresetId(preset.id);
    setArea(prev => prev || preset.defaultArea);
    if (preset.id !== 'custom') {
      setBuildingType(preset.label);
      setSelectedSections(preset.defaultSections);
    }
  }, []);

  const toggleSection = useCallback((cat: EstimateCategory) => {
    setSelectedSections(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat],
    );
  }, []);

  const handleConfirm = useCallback(() => {
    if (!selectedPreset) return;

    const descParts: string[] = [];
    if (selectedPreset.promptHint) descParts.push(selectedPreset.promptHint);
    if (customDescription.trim()) descParts.push(customDescription.trim());

    // Build section exclusion hints
    const allDefault = selectedPreset.defaultSections;
    const excluded = allDefault.filter(s => !selectedSections.includes(s));
    if (excluded.length > 0) {
      const sectionLabels = excluded.map(cat => ALL_SECTIONS.find(s => s.cat === cat)?.label || cat);
      descParts.push(`Без разделов: ${sectionLabels.join(', ')}.`);
    }
    const extra = selectedSections.filter(s => !allDefault.includes(s));
    if (extra.length > 0) {
      const sectionLabels = extra.map(cat => ALL_SECTIONS.find(s => s.cat === cat)?.label || cat);
      descParts.push(`Дополнительно включить: ${sectionLabels.join(', ')}.`);
    }

    onConfirm({
      description: descParts.join(' '),
      enableAiPriceSearch,
      selectedPreset,
      selectedSections,
      area,
      buildingType,
      referenceEstimateId,
    });
  }, [selectedPreset, customDescription, selectedSections, enableAiPriceSearch, area, buildingType, referenceEstimateId, onConfirm]);

  if (!isOpen) return null;

  // ─── Step 1: Choose Building Type ──────────────────────────────────────
  const renderStep1 = () => (
    <div className="space-y-4">
      <div className="text-sm text-text-secondary">
        Выберите тип объекта. AI проанализирует вашу историю смет и справочники, чтобы сгенерировать полную смету.
      </div>

      {/* History stats badge */}
      {historyStats.approvedCount > 0 && (
        <div className="flex items-center gap-2 p-2 bg-green-500/10 border border-green-500/20 rounded-md">
          <span className="text-green-400 text-sm">✓</span>
          <span className="text-sm text-green-300">
            {historyStats.approvedCount} согласованных смет в истории — AI будет учитывать реальные данные
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {BUILDING_PRESETS.map(preset => (
          <button
            key={preset.id}
            type="button"
            onClick={() => handlePresetSelect(preset)}
            className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all text-center ${
              selectedPresetId === preset.id
                ? 'border-primary bg-primary/10 shadow-lg shadow-primary/10'
                : 'border-border bg-background/40 hover:border-primary/50 hover:bg-background/60'
            }`}
          >
            <span className="text-3xl">{preset.icon}</span>
            <span className="font-semibold text-text-primary text-sm">{preset.label}</span>
            <span className="text-xs text-text-secondary">{preset.description}</span>
          </button>
        ))}
      </div>

      <div className="flex justify-end pt-2">
        <button
          onClick={() => selectedPreset && setStep(2)}
          disabled={!selectedPreset}
          className="bg-primary hover:bg-primary-hover text-white font-bold py-2 px-6 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Далее →
        </button>
      </div>
    </div>
  );

  // ─── Step 2: Configure Parameters ──────────────────────────────────────
  const renderStep2 = () => (
    <div className="space-y-4">
      {/* Area & building type */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-text-secondary mb-1">Площадь (м²)</label>
          <input
            type="number"
            value={area || ''}
            onChange={e => setArea(Number(e.target.value) || 0)}
            className="w-full p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary"
            min={1}
          />
        </div>
        <div>
          <label className="block text-sm text-text-secondary mb-1">Тип строения</label>
          <input
            type="text"
            value={buildingType}
            onChange={e => setBuildingType(e.target.value)}
            className="w-full p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary"
            placeholder="Каркасный дом"
          />
        </div>
      </div>

      {/* Section toggles */}
      <div>
        <label className="block text-sm text-text-secondary mb-2">Разделы сметы (включить/выключить)</label>
        <div className="grid grid-cols-3 gap-2">
          {ALL_SECTIONS.map(sec => {
            const active = selectedSections.includes(sec.cat);
            const covItem = dbCoverage.categoryCoverage.find(c => c.cat === sec.cat);
            const hasData = (covItem?.materials ?? 0) + (covItem?.works ?? 0) > 0;
            return (
              <button
                key={sec.cat}
                type="button"
                onClick={() => toggleSection(sec.cat)}
                className={`flex items-center gap-2 p-2 rounded-md border text-left text-sm transition-all ${
                  active
                    ? 'border-primary bg-primary/10 text-text-primary'
                    : 'border-border bg-background/30 text-text-secondary hover:border-primary/40'
                }`}
              >
                <span>{sec.icon}</span>
                <span className="flex-1 truncate">{sec.label}</span>
                {active && hasData && <span className="text-xs text-green-400">✓</span>}
                {active && !hasData && <span className="text-xs text-yellow-400">⚠</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* DB coverage warning */}
      {selectedSections.length > 0 && (() => {
        const emptySections = dbCoverage.categoryCoverage
          .filter(c => selectedSections.includes(c.cat) && c.materials === 0 && c.works === 0);
        if (emptySections.length === 0) return null;
        return (
          <div className="p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
            <span className="text-sm text-yellow-300">
              ⚠ Для разделов {emptySections.map(s => ALL_SECTIONS.find(a => a.cat === s.cat)?.label || s.cat).join(', ')} нет данных в справочниках.
              AI может добавить позиции, но их придётся заполнить вручную.
            </span>
          </div>
        );
      })()}

      {/* Custom description */}
      <div>
        <label className="block text-sm text-text-secondary mb-1">Дополнительные указания (необязательно)</label>
        <textarea
          value={customDescription}
          onChange={e => setCustomDescription(e.target.value)}
          rows={3}
          className="w-full p-2 bg-background border border-border rounded-md text-text-primary focus:ring-primary focus:border-primary text-sm"
          placeholder="Например: без сантехники, утепление 200мм, кровля из профлиста..."
        />
      </div>

      {/* AI price search toggle */}
      <label className="flex items-center gap-2 text-sm text-text-primary">
        <input
          type="checkbox"
          checked={enableAiPriceSearch}
          onChange={e => setEnableAiPriceSearch(e.target.checked)}
        />
        Проставлять цены материалов через AI (если цена = 0)
      </label>

      <div className="flex justify-between pt-2">
        <button
          onClick={() => setStep(1)}
          className="text-sm bg-gray-600 hover:bg-gray-500 text-text-primary font-bold py-2 px-4 rounded transition-colors"
        >
          ← Назад
        </button>
        <button
          onClick={() => setStep(3)}
          disabled={area <= 0 || !buildingType.trim()}
          className="bg-primary hover:bg-primary-hover text-white font-bold py-2 px-6 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Далее →
        </button>
      </div>
    </div>
  );

  // ─── Step 3: Review & Launch ───────────────────────────────────────────
  const renderStep3 = () => (
    <div className="space-y-4">
      {/* Summary */}
      <div className="p-3 bg-background/40 border border-border rounded-md space-y-2">
        <div className="text-sm font-semibold text-text-primary">Параметры генерации</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <span className="text-text-secondary">Тип объекта:</span>
          <span className="text-text-primary">{selectedPreset?.icon} {buildingType}</span>
          <span className="text-text-secondary">Площадь:</span>
          <span className="text-text-primary">{area} м²</span>
          <span className="text-text-secondary">Разделы:</span>
          <span className="text-text-primary">{selectedSections.length} из {ALL_SECTIONS.length}</span>
          <span className="text-text-secondary">Материалов в БД:</span>
          <span className="text-text-primary">{dbCoverage.materialsCount}</span>
          <span className="text-text-secondary">Работ в БД:</span>
          <span className="text-text-primary">{dbCoverage.worksCount}</span>
        </div>
        {customDescription.trim() && (
          <div className="text-xs text-text-secondary mt-1">
            Указания: <span className="text-text-primary">{customDescription.trim()}</span>
          </div>
        )}
      </div>

      {/* Similar estimates from history */}
      {similarEstimates.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold text-text-primary">
            📊 Похожие сметы из истории ({similarEstimates.length})
          </div>
          <div className="text-xs text-text-secondary mb-1">
            AI автоматически учтёт данные из истории. Можно выбрать эталон — AI будет ориентироваться на него.
          </div>
          <div className="space-y-1.5 max-h-40 overflow-auto">
            {similarEstimates.map(est => {
              const isRef = referenceEstimateId === est.id;
              return (
                <button
                  key={est.id}
                  type="button"
                  onClick={() => setReferenceEstimateId(isRef ? undefined : est.id)}
                  className={`w-full text-left p-2 rounded-md border text-sm transition-all ${
                    isRef
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-background/20 hover:border-primary/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isRef && <span className="text-primary text-xs">★ Эталон</span>}
                      <span className="font-medium text-text-primary">{est.estimateNumber}</span>
                      {est.client && <span className="text-text-secondary">— {est.client}</span>}
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      est.status === EstimateStatus.APPROVED
                        ? 'bg-green-500/20 text-green-300'
                        : est.status === EstimateStatus.SENT
                          ? 'bg-blue-500/20 text-blue-300'
                          : 'bg-gray-500/20 text-text-secondary'
                    }`}>{est.status}</span>
                  </div>
                  <div className="text-xs text-text-secondary mt-0.5">
                    {est.area} м² · {est.buildingType} · {est.itemCount} позиций · {est.total.toLocaleString('ru-RU')} ₽
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Info box */}
      <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-md">
        <div className="text-sm text-blue-300 space-y-1">
          <div>🤖 <strong>AI проанализирует:</strong></div>
          <ul className="list-disc pl-5 text-xs space-y-0.5">
            <li>Согласованные сметы из вашей истории для точных пропорций</li>
            <li>Справочники материалов и работ — использует только ваши данные</li>
            <li>Зависимости: если есть работа — добавит нужные материалы</li>
            <li>Масштабирует количества под площадь {area} м²</li>
          </ul>
          <div className="text-xs mt-1">
            Если какой-то материал/работа не найден в БД — AI покажет список для ручного добавления.
          </div>
        </div>
      </div>

      <div className="flex justify-between pt-2">
        <button
          onClick={() => setStep(2)}
          className="text-sm bg-gray-600 hover:bg-gray-500 text-text-primary font-bold py-2 px-4 rounded transition-colors"
        >
          ← Назад
        </button>
        <button
          onClick={handleConfirm}
          className="bg-primary hover:bg-primary-hover text-white font-bold py-2.5 px-8 rounded-md transition-colors text-base"
        >
          🤖 Сгенерировать смету
        </button>
      </div>
    </div>
  );

  // Step indicator labels
  const stepLabels = ['Тип объекта', 'Параметры', 'Запуск'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative w-full max-w-3xl mx-4 bg-surface border border-border rounded-lg shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
          <div className="font-bold text-text-primary">🤖 AI-конструктор сметы</div>
          <button onClick={onCancel} className="text-text-secondary hover:text-text-primary text-lg">✖</button>
        </div>

        {/* Step indicator */}
        <div className="px-4 pt-3 pb-2 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-2">
            {[1, 2, 3].map(s => (
              <React.Fragment key={s}>
                <div className="flex items-center gap-1.5">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    s === step
                      ? 'bg-primary text-white'
                      : s < step
                        ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                        : 'bg-background text-text-secondary border border-border'
                  }`}>
                    {s < step ? '✓' : s}
                  </div>
                  <span className={`text-xs hidden sm:inline ${s === step ? 'text-text-primary font-semibold' : 'text-text-secondary'}`}>
                    {stepLabels[s - 1]}
                  </span>
                </div>
                {s < 3 && <div className={`flex-1 h-px ${s < step ? 'bg-green-500/40' : 'bg-border'}`} />}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-4 overflow-auto flex-1">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </div>
      </div>
    </div>
  );
};

export default AIGenerationModal;
