import { createContext, useContext } from 'react';
import { BoardSpec, DuplicateGroup, EstimateCategory, Material, Work, WorkBundle } from '../types';
import type { CatalogDuplicateDecision } from '../services/duplicateManagement';

type CatalogContextValue = {
  materials: Material[];
  materialsTotalCount: number;
  works: Work[];
  worksTotalCount: number;
  bundles: WorkBundle[];
  bundlesTotalCount: number;
  onAddMaterial: (name: string, category: EstimateCategory, price?: number, link?: string, boardSpec?: BoardSpec) => Promise<Material | null>;
  onForceAddMaterial: (material: Material) => Promise<void>;
  onUpdateMaterial: (material: Material) => Promise<Material | null>;
  onEditMaterialPrice: (materialId: string, newPrice: number) => Promise<void>;
  onEditMaterialLink: (materialId: string, link?: string) => Promise<void>;
  onDeleteMaterial: (materialId: string) => Promise<void>;
  onAddWork: (name: string, category: EstimateCategory, price: number) => Promise<void>;
  onForceAddWork: (work: Work) => Promise<void>;
  onUpdateWork: (work: Work) => Promise<void>;
  onDeleteWork: (workId: string) => Promise<void>;
  onAddBundle: (bundle: WorkBundle) => Promise<void>;
  onUpdateBundle: (bundle: WorkBundle) => Promise<void>;
  onDeleteBundle: (bundleId: string) => Promise<void>;
  findMaterialDuplicates: () => Promise<DuplicateGroup<Material>[]>;
  findWorkDuplicates: () => Promise<DuplicateGroup<Work>[]>;
  onMergeCatalogDuplicates: (type: 'material' | 'work', decisions: CatalogDuplicateDecision[]) => Promise<number>;
};

const CatalogContext = createContext<CatalogContextValue | undefined>(undefined);

export const CatalogProvider = CatalogContext.Provider;

export const useOptionalCatalogContext = (): CatalogContextValue | undefined => {
  return useContext(CatalogContext);
};


