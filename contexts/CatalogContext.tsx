import { createContext, useContext } from 'react';
import { EstimateCategory, Material, Work, WorkBundle } from '../types';

type CatalogContextValue = {
  materials: Material[];
  materialsTotalCount: number;
  works: Work[];
  worksTotalCount: number;
  bundles: WorkBundle[];
  bundlesTotalCount: number;
  onAddMaterial: (name: string, category: EstimateCategory, price?: number, link?: string) => Promise<void>;
  onForceAddMaterial: (material: Material) => Promise<void>;
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
  onMergeCatalogDuplicates: (type: 'material' | 'work', keepId: string, deleteIds: string[]) => Promise<void>;
};

const CatalogContext = createContext<CatalogContextValue | undefined>(undefined);

export const CatalogProvider = CatalogContext.Provider;

export const useOptionalCatalogContext = (): CatalogContextValue | undefined => {
  return useContext(CatalogContext);
};


