import { EstimateCategory, EstimateItem, EstimateSubgroup, SectionId, normalizeKey } from '../types';

export type AIProjectScope = {
  selectedSections: SectionId[] | null;
  excludedSections: SectionId[];
  includeWorks: boolean;
  includeMaterials: boolean;
  includeDelivery: boolean;
  needsClarification: string[];
};

const SECTION_EXCLUSIONS: Array<{ section: EstimateCategory; markers: string[] }> = [
  { section: EstimateCategory.FOUNDATION, markers: ['без фундамента', 'фундамент не нужен'] },
  { section: EstimateCategory.GRILLAGE, markers: ['без полов', 'без ростверка', 'полы не нужны'] },
  { section: EstimateCategory.WALLS, markers: ['без стен', 'стены не нужны'] },
  { section: EstimateCategory.ROOF, markers: ['без кровли', 'без крыши', 'кровля не нужна', 'крыша не нужна'] },
  { section: EstimateCategory.WINDOWS, markers: ['без окон', 'без дверей', 'окна и двери не нужны'] },
  { section: EstimateCategory.ELECTRICAL, markers: ['без электрики', 'электрика не нужна'] },
  { section: EstimateCategory.WATER_SUPPLY, markers: ['без сантехники', 'без водоснабжения', 'сантехника не нужна'] },
  { section: EstimateCategory.SEWERAGE, markers: ['без канализации', 'канализация не нужна'] },
  { section: EstimateCategory.LOGISTICS, markers: ['без доставки', 'без логистики', 'доставка не нужна'] },
  { section: EstimateCategory.DEMOLITION, markers: ['без демонтажа', 'демонтаж не нужен'] },
];

export const deriveAIProjectScope = (
  scopeDescription?: string,
  selectedSections?: SectionId[],
): AIProjectScope => {
  const text = normalizeKey(scopeDescription || '').replace(/ё/g, 'е');
  const onlyWorks = /только\s+(?:монтажные\s+)?работы/.test(text) && !/работы\s+и\s+материал/.test(text);
  const onlyMaterials = /только\s+материал/.test(text) && !/материал\S*\s+и\s+работ/.test(text);
  const customerMaterials = /материал\S*\s+заказчик|материал\S*\s+предоставляет\s+заказчик|без\s+материал/.test(text);
  const noWorks = /без\s+работ|работы\s+не\s+нужны/.test(text);
  const needsClarification: string[] = [];

  if ((onlyWorks || customerMaterials) && (onlyMaterials || noWorks)) {
    needsClarification.push('Описание одновременно исключает работы и материалы. Уточните состав сметы.');
  }

  const excludedSections = SECTION_EXCLUSIONS
    .filter(rule => rule.markers.some(marker => text.includes(marker)))
    .map(rule => rule.section);
  const normalizedSelected = selectedSections && selectedSections.length > 0 ? [...new Set(selectedSections)] : null;
  if (normalizedSelected) {
    const conflictingSections = normalizedSelected.filter(section => excludedSections.includes(section as EstimateCategory));
    if (conflictingSections.length > 0) {
      needsClarification.push(`Выбранные разделы одновременно исключены в описании: ${conflictingSections.join(', ')}.`);
    }
  }

  return {
    selectedSections: normalizedSelected,
    excludedSections: [...new Set(excludedSections)],
    includeWorks: !(onlyMaterials || noWorks),
    includeMaterials: !(onlyWorks || customerMaterials),
    includeDelivery: !onlyWorks && !text.includes('без доставки') && !text.includes('без логистики'),
    needsClarification,
  };
};

export const filterItemsToAIProjectScope = <T extends Pick<EstimateItem, 'category' | 'subgroup'>>(
  items: T[],
  scope: AIProjectScope,
): { items: T[]; dropped: number } => {
  if (scope.needsClarification.length > 0) return { items: [], dropped: items.length };
  const selected = scope.selectedSections ? new Set(scope.selectedSections) : null;
  const excluded = new Set(scope.excludedSections);
  const filtered = (items || []).filter(item => {
    if (selected && !selected.has(item.category)) return false;
    if (excluded.has(item.category)) return false;
    const subgroup = item.subgroup || EstimateSubgroup.WORKS;
    if (subgroup === EstimateSubgroup.WORKS) return scope.includeWorks;
    if (subgroup === EstimateSubgroup.MATERIALS) return scope.includeMaterials;
    if (subgroup === EstimateSubgroup.DELIVERY) return scope.includeDelivery;
    return false;
  });
  return { items: filtered, dropped: Math.max(0, items.length - filtered.length) };
};
