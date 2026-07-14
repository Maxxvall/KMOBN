import { createContext, useContext } from 'react';
import { Estimate, ProjectTemplate, View } from '../types';
import type { EstimateValidationResult } from '../services/estimateValidation';
import type { EstimateDuplicateDeleteRequest } from '../services/estimateIntelligence';

type EstimateActions = {
  onCreateNew?: () => void;
  onEdit?: (estimate: Estimate) => void;
  onDelete?: (estimate: Estimate) => void;
  onDeleteVersion?: (estimate: Estimate) => void;
  onDeleteVersionDuplicates?: (requests: EstimateDuplicateDeleteRequest[]) => Promise<number>;
  onSetArchived?: (estimate: Estimate, archived: boolean) => void;
  onGeneratePdf?: (estimate: Estimate) => void;
  onRequestSave?: (estimate: Estimate) => void;
  onDraftChange?: (estimate: Estimate) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSaveAsTemplate?: (estimate: Estimate) => void;
  onDeleteTemplate?: (templateId: string) => void;
  onBack?: () => void;
};

type EstimateContextValue = {
  view: View;
  setView: React.Dispatch<React.SetStateAction<View>>;
  estimates: Estimate[];
  allEstimates: Estimate[];
  setEstimates: React.Dispatch<React.SetStateAction<Estimate[]>>;
  templates: ProjectTemplate[];
  setTemplates: React.Dispatch<React.SetStateAction<ProjectTemplate[]>>;
  currentEstimate: Estimate | null;
  setCurrentEstimate: React.Dispatch<React.SetStateAction<Estimate | null>>;
  validationResult: EstimateValidationResult | null;
  actions: EstimateActions;
};

const EstimateContext = createContext<EstimateContextValue | undefined>(undefined);

export const EstimateProvider = EstimateContext.Provider;

export const useOptionalEstimateContext = (): EstimateContextValue | undefined => {
  return useContext(EstimateContext);
};


