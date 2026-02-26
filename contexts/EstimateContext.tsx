import { createContext, useContext } from 'react';
import { Estimate, ProjectTemplate, View } from '../types';

type EstimateContextValue = {
  view: View;
  setView: React.Dispatch<React.SetStateAction<View>>;
  estimates: Estimate[];
  setEstimates: React.Dispatch<React.SetStateAction<Estimate[]>>;
  templates: ProjectTemplate[];
  setTemplates: React.Dispatch<React.SetStateAction<ProjectTemplate[]>>;
  currentEstimate: Estimate | null;
  setCurrentEstimate: React.Dispatch<React.SetStateAction<Estimate | null>>;
};

const EstimateContext = createContext<EstimateContextValue | undefined>(undefined);

export const EstimateProvider = EstimateContext.Provider;

export const useOptionalEstimateContext = (): EstimateContextValue | undefined => {
  return useContext(EstimateContext);
};

export const useEstimateContext = (): EstimateContextValue => {
  const context = useOptionalEstimateContext();
  if (!context) {
    throw new Error('useEstimateContext must be used within EstimateProvider');
  }
  return context;
};
