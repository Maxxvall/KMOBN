import { createContext, useContext } from 'react';
import type {
  CustomSectionId,
  EstimateSectionsDocument,
  SectionId,
} from '../types';
import type { ResolvedEstimateSection } from '../services/estimateSections';

export interface EstimateSectionsContextValue {
  document: EstimateSectionsDocument;
  activeSections: ResolvedEstimateSection[];
  allSections: ResolvedEstimateSection[];
  isLoading: boolean;
  pending: boolean;
  error: string | null;
  addSection: (label: string) => Promise<void>;
  renameSection: (id: CustomSectionId, label: string) => Promise<void>;
  setArchived: (id: CustomSectionId, archived: boolean) => Promise<void>;
  reorderSections: (order: SectionId[]) => Promise<void>;
  resolveConflict: (choice: 'local' | 'remote') => Promise<void>;
}

const EstimateSectionsContext = createContext<EstimateSectionsContextValue | undefined>(undefined);

export const EstimateSectionsProvider = EstimateSectionsContext.Provider;

export const useEstimateSections = (): EstimateSectionsContextValue => {
  const value = useContext(EstimateSectionsContext);
  if (!value) throw new Error('EstimateSectionsProvider is missing');
  return value;
};

export const useOptionalEstimateSections = (): EstimateSectionsContextValue | undefined => (
  useContext(EstimateSectionsContext)
);
