import { Estimate } from '../types';

export type ClientEstimate = Omit<Estimate, 'crewToolPlan'>;

/** Removes internal crew-only data before any client-facing export. */
export const toClientEstimate = (estimate: Estimate): ClientEstimate => {
    const { crewToolPlan: _crewToolPlan, ...clientEstimate } = estimate;
    return clientEstimate;
};
