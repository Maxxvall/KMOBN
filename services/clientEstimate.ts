import { Estimate } from '../types';

type InternalEstimateField = 'labelIds' | 'labelSnapshots' | 'crewToolPlan'
    | 'houseProjectId'
    | 'houseCalculationSnapshots'
    | 'houseExecutionStatus'
    | 'houseActualVerifiedAt'
    | 'houseActualBasis'
    | 'sqmPackage'
    | 'sqmAreaBase'
    | 'sqmConfirmedAt';

export type ClientEstimate = Omit<Estimate, InternalEstimateField>;

/** Removes internal crew-only data before any client-facing export. */
export const toClientEstimate = (estimate: Estimate): ClientEstimate => {
    const {
        crewToolPlan: _crewToolPlan,
        labelIds: _labelIds,
        labelSnapshots: _labelSnapshots,
        houseProjectId: _houseProjectId,
        houseCalculationSnapshots: _houseCalculationSnapshots,
        houseExecutionStatus: _houseExecutionStatus,
        houseActualVerifiedAt: _houseActualVerifiedAt,
        houseActualBasis: _houseActualBasis,
        sqmPackage: _sqmPackage,
        sqmAreaBase: _sqmAreaBase,
        sqmConfirmedAt: _sqmConfirmedAt,
        ...clientEstimate
    } = estimate;
    return clientEstimate;
};
