import React from 'react';
import { Estimate, EstimateStatus } from '../../types';
import { fieldLabelStyles, inputStyles } from './shared';

interface EstimateMetaFieldsProps {
    estimate: Estimate;
    setEstimate: (estimate: Estimate) => void;
}

// Компактный ряд полей сметы: Клиент, Дата, Статус, Тип строения, Площадь.
// Тач-таргеты сохранены (min-h-[44px] … md:min-h-9).
export const EstimateMetaFields: React.FC<EstimateMetaFieldsProps> = ({ estimate, setEstimate }) => {
    const fieldClass = `${inputStyles} min-h-[44px] min-w-0 focus:outline-none focus:ring-2 focus:ring-primary/50 md:min-h-9`;

    return (
        <div className="mb-2.5 grid grid-cols-6 gap-2 xl:grid-cols-[minmax(200px,1.5fr)_145px_160px_minmax(200px,1fr)_100px]">
            <label className="col-span-6 min-w-0 xl:col-auto">
                <span className={`mb-1 ${fieldLabelStyles}`}>Клиент</span>
                <input
                    type="text"
                    value={estimate.client}
                    onChange={(e) => setEstimate({ ...estimate, client: e.target.value })}
                    placeholder="Имя клиента"
                    className={fieldClass}
                />
            </label>
            <label className="col-span-3 min-w-0 xl:col-auto">
                <span className={`mb-1 ${fieldLabelStyles}`}>Дата</span>
                <input
                    type="date"
                    value={estimate.date}
                    onChange={(e) => setEstimate({ ...estimate, date: e.target.value })}
                    className={`${fieldClass} tabular-nums`}
                />
            </label>
            <label className="col-span-3 min-w-0 xl:col-auto">
                <span className={`mb-1 ${fieldLabelStyles}`}>Статус</span>
                <select
                    value={estimate.status}
                    onChange={(e) => setEstimate({ ...estimate, status: e.target.value as EstimateStatus })}
                    className={fieldClass}
                >
                    {Object.values(EstimateStatus).map((s) => (
                        <option key={s} value={s}>{s}</option>
                    ))}
                </select>
            </label>
            <label className="col-span-4 min-w-0 xl:col-auto">
                <span className={`mb-1 ${fieldLabelStyles}`}>Тип строения</span>
                <input
                    type="text"
                    value={estimate.buildingType}
                    onChange={(e) => setEstimate({ ...estimate, buildingType: e.target.value })}
                    placeholder="Например, дачный дом"
                    className={fieldClass}
                />
            </label>
            <label className="col-span-2 min-w-0 xl:col-auto">
                <span className={`mb-1 ${fieldLabelStyles}`}>Площадь, м²</span>
                <input
                    type="number"
                    value={estimate.area || ''}
                    onChange={(e) => setEstimate({ ...estimate, area: +e.target.value || 0 })}
                    placeholder="0"
                    className={`${fieldClass} tabular-nums`}
                />
            </label>
        </div>
    );
};
