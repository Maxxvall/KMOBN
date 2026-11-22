import { Estimate, EstimateItem, EstimateSubgroup, Material, Work, normalizeKey } from '../types';

// Single owner of the estimate total: the estimate total is always the sum
// of item totals, never a second quantity × price pass over the rows.
export const calculateEstimateTotal = (items: EstimateItem[]): number =>
  items.reduce((sum, item) => sum + item.total, 0);

export type MaterialPriceCheck =
  | { status: 'missing' }
  | { status: 'ambiguous' }
  | {
      status: 'current' | 'outdated';
      material: Material;
      catalogPrice: number;
      matchedBy: 'id' | 'name';
    };

// Precomputed lookup for repeated price checks over the same catalog:
// one Map per normalizeKey of the material name, one Map per id.
export interface MaterialPriceIndex {
  byId: Map<string, Material>;
  byName: Map<string, Material[]>;
}

export const buildMaterialPriceIndex = (materials: Material[]): MaterialPriceIndex => {
  const byId = new Map(materials.map(material => [material.id, material]));
  const byName = new Map<string, Material[]>();
  for (const material of materials) {
    const key = normalizeKey(material.name);
    byName.set(key, [...(byName.get(key) ?? []), material]);
  }
  return { byId, byName };
};

export const checkMaterialPriceIndexed = (
  item: Pick<EstimateItem, 'name' | 'price' | 'catalogMaterialId'>,
  index: MaterialPriceIndex,
): MaterialPriceCheck => {
  if (item.catalogMaterialId) {
    const linkedMaterial = index.byId.get(item.catalogMaterialId);
    if (linkedMaterial) {
      return {
        status: item.price === linkedMaterial.price ? 'current' : 'outdated',
        material: linkedMaterial,
        catalogPrice: linkedMaterial.price,
        matchedBy: 'id',
      };
    }
  }

  const normalizedName = normalizeKey(item.name);
  if (!normalizedName) return { status: 'missing' };

  const matches = index.byName.get(normalizedName) ?? [];
  if (matches.length === 0) return { status: 'missing' };
  if (matches.length > 1) return { status: 'ambiguous' };

  const material = matches[0];
  return {
    status: item.price === material.price ? 'current' : 'outdated',
    material,
    catalogPrice: material.price,
    matchedBy: 'name',
  };
};

export const checkMaterialPrice = (
  item: Pick<EstimateItem, 'name' | 'price' | 'catalogMaterialId'>,
  materials: Material[],
): MaterialPriceCheck => checkMaterialPriceIndexed(item, buildMaterialPriceIndex(materials));

export type ApplyMaterialPriceResult = {
  estimate: Estimate;
  check: MaterialPriceCheck;
  changed: boolean;
};

export const applyCatalogMaterialPrice = (
  estimate: Estimate,
  itemId: string,
  materials: Material[],
): ApplyMaterialPriceResult => {
  const target = estimate.items.find(item => item.id === itemId);
  if (!target) {
    return { estimate, check: { status: 'missing' }, changed: false };
  }

  const check = checkMaterialPrice(target, materials);
  if (check.status === 'missing' || check.status === 'ambiguous') {
    return { estimate, check, changed: false };
  }

  const shouldUpdateItem = target.price !== check.catalogPrice
    || target.catalogMaterialId !== check.material.id;
  if (!shouldUpdateItem) {
    return { estimate, check, changed: false };
  }

  const items = estimate.items.map(item => item.id === itemId
    ? {
        ...item,
        price: check.catalogPrice,
        total: item.quantity * check.catalogPrice,
        catalogMaterialId: check.material.id,
      }
    : item);

  return {
    estimate: {
      ...estimate,
      items,
      total: items.reduce((sum, item) => sum + item.total, 0),
    },
    check,
    changed: true,
  };
};

export const recalculateEstimateWorkPrices = (estimate: Estimate, works: Work[]): Estimate => {
  const workById = new Map(works.map(work => [work.id, work]));
  const worksByName = new Map<string, Work[]>();
  for (const work of works) {
    const key = normalizeKey(work.name);
    worksByName.set(key, [...(worksByName.get(key) ?? []), work]);
  }

  const items = estimate.items.map(item => {
    if (item.subgroup !== EstimateSubgroup.WORKS) return item;

    const linkedWork = item.catalogWorkId ? workById.get(item.catalogWorkId) : undefined;
    const nameMatches = worksByName.get(normalizeKey(item.name)) ?? [];
    const work = linkedWork ?? (nameMatches.length === 1 ? nameMatches[0] : undefined);
    if (!work) return item;

    return {
      ...item,
      price: work.price,
      total: item.quantity * work.price,
      catalogWorkId: work.id,
    };
  });

  return {
    ...estimate,
    items,
    total: items.reduce((sum, item) => sum + item.total, 0),
    needsPriceUpdate: false,
  };
};
