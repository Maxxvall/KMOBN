import { Estimate } from '../types';

type InternalEstimateField = 'crewToolPlan'
    | 'houseProjectId'
    | 'houseCalculationSnapshots'
    | 'houseExecutionStatus'
    | 'houseActualVerifiedAt'
    | 'houseActualBasis';

export type ClientEstimate = Omit<Estimate, InternalEstimateField>;

/** Removes internal crew-only data before any client-facing export. */
export const toClientEstimate = (estimate: Estimate): ClientEstimate => {
    const {
        crewToolPlan: _crewToolPlan,
        houseProjectId: _houseProjectId,
        houseCalculationSnapshots: _houseCalculationSnapshots,
        houseExecutionStatus: _houseExecutionStatus,
        houseActualVerifiedAt: _houseActualVerifiedAt,
        houseActualBasis: _houseActualBasis,
        ...clientEstimate
    } = estimate;
    return clientEstimate;
};
