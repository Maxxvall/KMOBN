import {
  BoardMoisture,
  BoardSpec,
  Estimate,
  EstimateItem,
  EstimateSubgroup,
  Material,
  normalizeKey,
} from '../types';

export type BoardSwitchReplacement = {
  itemId: string;
  sourceMaterial: Material;
  targetMaterial: Material;
};

export type BoardSwitchMissing = {
  sourceMaterial: Material;
  targetSpec: BoardSpec;
  affectedItemIds: string[];
  suggestedName: string;
};

export type BoardSwitchUnpriced = {
  sourceMaterial: Material;
  targetMaterial: Material;
  affectedItemIds: string[];
};

export type BoardSwitchAmbiguous = {
  sourceMaterial: Material;
  targetSpec: BoardSpec;
  candidates: Material[];
  affectedItemIds: string[];
};

export type BoardSwitchPlan = {
  target: BoardMoisture;
  replacements: BoardSwitchReplacement[];
  missing: BoardSwitchMissing[];
  unpriced: BoardSwitchUnpriced[];
  ambiguous: BoardSwitchAmbiguous[];
  alreadyTarget: string[];
  ignored: string[];
};

export type BoardInventoryState = 'none' | 'dry-planed' | 'natural-moisture' | 'mixed';

const BOARD_SIZE_DELTA_MM = 5;

const isPositiveFinite = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value > 0
);

export const isValidBoardSpec = (spec?: BoardSpec): spec is BoardSpec => Boolean(
  spec
  && (spec.moisture === 'dry-planed' || spec.moisture === 'natural-moisture')
  && isPositiveFinite(spec.widthMm)
  && isPositiveFinite(spec.thicknessMm)
  && isPositiveFinite(spec.lengthMm)
);

const normalizedSection = (spec: Pick<BoardSpec, 'widthMm' | 'thicknessMm'>): [number, number] => (
  spec.widthMm <= spec.thicknessMm
    ? [spec.widthMm, spec.thicknessMm]
    : [spec.thicknessMm, spec.widthMm]
);

const specsHaveSameDimensions = (left: BoardSpec, right: BoardSpec): boolean => {
  const [leftA, leftB] = normalizedSection(left);
  const [rightA, rightB] = normalizedSection(right);
  return leftA === rightA && leftB === rightB && left.lengthMm === right.lengthMm;
};

export const buildTargetBoardSpec = (
  source: BoardSpec,
  target: BoardMoisture,
): BoardSpec | null => {
  if (!isValidBoardSpec(source)) return null;
  if (source.moisture === target) return { ...source };

  const delta = target === 'natural-moisture' ? BOARD_SIZE_DELTA_MM : -BOARD_SIZE_DELTA_MM;
  const widthMm = source.widthMm + delta;
  const thicknessMm = source.thicknessMm + delta;
  if (widthMm <= 0 || thicknessMm <= 0) return null;

  return {
    moisture: target,
    widthMm,
    thicknessMm,
    lengthMm: source.lengthMm,
    pairGroupId: source.pairGroupId,
  };
};

const moistureLabel = (moisture: BoardMoisture): string => (
  moisture === 'dry-planed' ? 'СС' : 'ЕВ'
);

export const formatBoardDimensions = (spec: BoardSpec): string => (
  `${spec.widthMm}×${spec.thicknessMm}×${spec.lengthMm}`
);

export const buildSuggestedBoardName = (spec: BoardSpec): string => (
  `Доска ${moistureLabel(spec.moisture)} ${formatBoardDimensions(spec)}`
);

const normalizeLengthMm = (value: number): number => (value <= 20 ? value * 1000 : value);

const hasToken = (value: string, token: string): boolean => {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[\\s._-])${escaped}(?:$|[\\s._-])`, 'i').test(value);
};

export const suggestBoardSpecFromName = (name: string): BoardSpec | null => {
  const normalized = String(name || '').trim().toLowerCase();
  if (!normalized || !/(доск|пиломат)/i.test(normalized)) return null;

  let moisture: BoardMoisture | null = null;
  if (
    hasToken(normalized, 'сс')
    || /сух[а-яё]*\s+строган[а-яё]*/i.test(normalized)
    || /строган[а-яё]*\s+сух[а-яё]*/i.test(normalized)
  ) {
    moisture = 'dry-planed';
  } else if (
    hasToken(normalized, 'ев')
    || hasToken(normalized, 'ес')
    || /естественн[а-яё]*\s+влажност[а-яё]*/i.test(normalized)
  ) {
    moisture = 'natural-moisture';
  }
  if (!moisture) return null;

  const dimensions = normalized.match(/(\d{1,4})\s*[xх×*]\s*(\d{1,4})(?:\s*[xх×*]\s*(\d{1,5}))?/i);
  if (!dimensions) return null;

  const widthMm = Number(dimensions[1]);
  const thicknessMm = Number(dimensions[2]);
  let lengthMm = dimensions[3] ? normalizeLengthMm(Number(dimensions[3])) : 0;
  if (!lengthMm) {
    const tail = normalized.slice((dimensions.index ?? 0) + dimensions[0].length);
    const meters = tail.match(/(\d+(?:[.,]\d+)?)\s*(?:м(?:\s|$|[.,])|метр[а-яё]*)/i);
    if (meters) lengthMm = Math.round(Number(meters[1].replace(',', '.')) * 1000);
  }

  const spec: BoardSpec = { moisture, widthMm, thicknessMm, lengthMm };
  return isValidBoardSpec(spec) ? spec : null;
};

const resolveSourceMaterial = (item: EstimateItem, materials: Material[]): Material | null => {
  if (item.catalogMaterialId) {
    const linked = materials.find(material => material.id === item.catalogMaterialId);
    if (linked) return linked;
  }

  const key = normalizeKey(item.name);
  if (!key) return null;
  const exactMatches = materials.filter(material => normalizeKey(material.name) === key);
  return exactMatches.length === 1 ? exactMatches[0] : null;
};

const findTargetCandidates = (
  source: Material,
  targetSpec: BoardSpec,
  materials: Material[],
): Material[] => {
  const validTargets = materials.filter(material => (
    material.id !== source.id
    && isValidBoardSpec(material.boardSpec)
    && material.boardSpec.moisture === targetSpec.moisture
  ));

  if (source.boardSpec?.pairGroupId) {
    const paired = validTargets.filter(material => (
      material.boardSpec?.pairGroupId === source.boardSpec?.pairGroupId
    ));
    if (paired.length > 0) return paired;
  }

  const dimensional = validTargets.filter(material => (
    material.boardSpec && specsHaveSameDimensions(material.boardSpec, targetSpec)
  ));
  const sameCategory = dimensional.filter(material => material.category === source.category);
  return sameCategory.length > 0 ? sameCategory : dimensional;
};

const groupKey = (source: Material, targetSpec: BoardSpec): string => (
  `${source.boardSpec?.pairGroupId || 'dimensions'}:${targetSpec.moisture}:${formatBoardDimensions(targetSpec)}`
);

export const planBoardMaterialSwitch = (
  estimate: Estimate,
  materials: Material[],
  target: BoardMoisture,
): BoardSwitchPlan => {
  const replacements: BoardSwitchReplacement[] = [];
  const missingByKey = new Map<string, BoardSwitchMissing>();
  const unpricedByKey = new Map<string, BoardSwitchUnpriced>();
  const ambiguousByKey = new Map<string, BoardSwitchAmbiguous>();
  const alreadyTarget: string[] = [];
  const ignored: string[] = [];

  for (const item of estimate.items) {
    if (item.subgroup !== EstimateSubgroup.MATERIALS || item.isActualOnly) continue;
    const sourceMaterial = resolveSourceMaterial(item, materials);
    if (!sourceMaterial || !isValidBoardSpec(sourceMaterial.boardSpec)) {
      ignored.push(item.id);
      continue;
    }
    if (sourceMaterial.boardSpec.moisture === target) {
      alreadyTarget.push(item.id);
      continue;
    }

    const targetSpec = buildTargetBoardSpec(sourceMaterial.boardSpec, target);
    if (!targetSpec) {
      ignored.push(item.id);
      continue;
    }

    const candidates = findTargetCandidates(sourceMaterial, targetSpec, materials);
    const key = groupKey(sourceMaterial, targetSpec);
    if (candidates.length === 0) {
      const current = missingByKey.get(key);
      if (current) current.affectedItemIds.push(item.id);
      else {
        missingByKey.set(key, {
          sourceMaterial,
          targetSpec,
          affectedItemIds: [item.id],
          suggestedName: buildSuggestedBoardName(targetSpec),
        });
      }
      continue;
    }
    if (candidates.length > 1) {
      const current = ambiguousByKey.get(key);
      if (current) current.affectedItemIds.push(item.id);
      else ambiguousByKey.set(key, { sourceMaterial, targetSpec, candidates, affectedItemIds: [item.id] });
      continue;
    }

    const targetMaterial = candidates[0];
    if (!Number.isFinite(targetMaterial.price) || targetMaterial.price <= 0) {
      const current = unpricedByKey.get(targetMaterial.id);
      if (current) current.affectedItemIds.push(item.id);
      else unpricedByKey.set(targetMaterial.id, { sourceMaterial, targetMaterial, affectedItemIds: [item.id] });
      continue;
    }
    replacements.push({ itemId: item.id, sourceMaterial, targetMaterial });
  }

  return {
    target,
    replacements,
    missing: [...missingByKey.values()],
    unpriced: [...unpricedByKey.values()],
    ambiguous: [...ambiguousByKey.values()],
    alreadyTarget,
    ignored,
  };
};

export const getEstimateBoardState = (estimate: Estimate, materials: Material[]): BoardInventoryState => {
  const moisture = new Set<BoardMoisture>();
  for (const item of estimate.items) {
    if (item.subgroup !== EstimateSubgroup.MATERIALS || item.isActualOnly) continue;
    const material = resolveSourceMaterial(item, materials);
    if (material && isValidBoardSpec(material.boardSpec)) moisture.add(material.boardSpec.moisture);
  }
  if (moisture.size === 0) return 'none';
  if (moisture.size > 1) return 'mixed';
  return [...moisture][0];
};

export type ApplyBoardSwitchOptions = {
  selectedItemIds?: ReadonlySet<string>;
  targetMaterialIdsByItemId?: Readonly<Record<string, string>>;
  materials?: Material[];
};

export const applyBoardMaterialSwitch = (
  estimate: Estimate,
  plan: BoardSwitchPlan,
  options: ApplyBoardSwitchOptions = {},
): Estimate => {
  const replacementByItemId = new Map(plan.replacements.map(replacement => [replacement.itemId, replacement.targetMaterial]));
  const materialsById = new Map((options.materials ?? []).map(material => [material.id, material]));
  const selected = options.selectedItemIds;

  const items = estimate.items.map(item => {
    if (selected && !selected.has(item.id)) return item;
    const overrideId = options.targetMaterialIdsByItemId?.[item.id];
    const targetMaterial = overrideId ? materialsById.get(overrideId) : replacementByItemId.get(item.id);
    if (!targetMaterial || !Number.isFinite(targetMaterial.price) || targetMaterial.price <= 0) return item;
    if (!isValidBoardSpec(targetMaterial.boardSpec) || targetMaterial.boardSpec.moisture !== plan.target) return item;

    return {
      ...item,
      name: targetMaterial.name,
      price: targetMaterial.price,
      total: item.quantity * targetMaterial.price,
      catalogMaterialId: targetMaterial.id,
      catalogWorkId: undefined,
    };
  });

  if (items.every((item, index) => item === estimate.items[index])) return estimate;
  return {
    ...estimate,
    items,
    total: items.reduce((sum, item) => sum + item.total, 0),
  };
};
