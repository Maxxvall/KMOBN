import React, { useMemo, useState } from 'react';
import { CrewToolPlan, CrewToolRequirement, Estimate, EstimateSubgroup, Work } from '../types';
import { aggregateToolRequirements, buildCrewToolPlan, normalizeToolKey } from '../services/toolPlanning';

type Props = {
    estimate: Estimate;
    works: Work[];
    onChange: (plan: CrewToolPlan) => void;
};

const emptyPlan = (): CrewToolPlan => ({ crewSize: 4, requirements: [] });

const CrewToolPlanPanel: React.FC<Props> = ({ estimate, works, onChange }) => {
    const plan = estimate.crewToolPlan ?? emptyPlan();
    const [manualName, setManualName] = useState('');
    const [manualQuantity, setManualQuantity] = useState(1);
    const [manualMode, setManualMode] = useState<'crew' | 'person'>('crew');
    const aggregated = useMemo(() => aggregateToolRequirements(plan), [plan]);
    const coverage = useMemo(() => buildCrewToolPlan({
        estimateItems: estimate.items,
        works,
        crewSize: plan.crewSize,
    }).coverage, [estimate.items, plan.crewSize, works]);
    const workItemNames = useMemo(() => new Map(estimate.items
        .filter(item => (item.subgroup || EstimateSubgroup.WORKS) === EstimateSubgroup.WORKS)
        .map(item => [item.id, item.name])), [estimate.items]);

    const setCrewSize = (value: number) => onChange({ ...plan, crewSize: Math.max(1, Math.min(30, Math.floor(value || 1))) });

    const applyFromWorks = () => {
        const manual = plan.requirements.filter(item => item.source !== 'work');
        const generated = buildCrewToolPlan({
            estimateItems: estimate.items,
            works,
            crewSize: plan.crewSize,
            quantityOverrides: plan.quantityOverrides,
        }).plan;
        onChange({ ...generated, requirements: [...generated.requirements, ...manual] });
    };

    const addManual = () => {
        const name = manualName.trim();
        if (!name || manualQuantity <= 0) return;
        const requirement: CrewToolRequirement = {
            name,
            toolKey: normalizeToolKey(name),
            quantity: manualQuantity,
            quantityMode: manualMode,
            source: 'manual',
        };
        onChange({ ...plan, requirements: [...plan.requirements, requirement] });
        setManualName('');
        setManualQuantity(1);
        setManualMode('crew');
    };

    const removeTool = (toolKey: string) => {
        const nextOverrides = { ...plan.quantityOverrides };
        delete nextOverrides[toolKey];
        onChange({
            ...plan,
            requirements: plan.requirements.filter(item => item.toolKey !== toolKey),
            quantityOverrides: nextOverrides,
        });
    };

    const setOverride = (toolKey: string, quantity: number) => onChange({
        ...plan,
        quantityOverrides: { ...plan.quantityOverrides, [toolKey]: Math.max(0, quantity || 0) },
    });

    return (
        <details className="mt-5 rounded-xl border border-border bg-background/30">
            <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <span className="min-w-0">
                    <span className="block font-bold text-text-primary">Инструмент{aggregated.length ? ` · ${aggregated.length} наименований` : ' · не указан'}</span>
                    <span className="mt-0.5 block text-xs text-text-secondary">Внутреннее · не попадёт в КП и клиентский PDF</span>
                </span>
                <span className="rounded-full border border-border px-2 py-1 text-xs text-text-secondary">Для бригады</span>
            </summary>

            <div className="border-t border-border p-3 sm:p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <label className="text-xs font-medium text-text-secondary">Размер бригады
                        <input type="number" min={1} max={30} value={plan.crewSize} onChange={event => setCrewSize(Number(event.target.value))} className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-text-primary sm:w-32" />
                    </label>
                    <button type="button" onClick={applyFromWorks} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/50">Подставить по работам</button>
                </div>

                <p className="mt-3 text-xs leading-5 text-text-secondary">
                    Настроено для {coverage.coveredWorkItems} из {coverage.totalWorkItems} работ.
                    {coverage.totalWorkItems > coverage.coveredWorkItems && ' Для остальных работ набор инструмента пока не задан.'}
                </p>

                <div className="mt-4 space-y-2">
                    {aggregated.map(tool => {
                        const sourceNames = tool.estimateItemIds.map(id => workItemNames.get(id)).filter(Boolean) as string[];
                        return (
                            <div key={tool.toolKey} className="grid gap-2 rounded-lg border border-border bg-surface/60 p-3 sm:grid-cols-[minmax(180px,1fr)_120px_44px] sm:items-center">
                                <div className="min-w-0">
                                    <div className="font-semibold text-text-primary">{tool.name}</div>
                                    <div className="mt-1 text-xs text-text-secondary">{sourceNames.length ? `Работы: ${sourceNames.join(', ')}` : 'Добавлено вручную'}</div>
                                </div>
                                <label className="text-xs text-text-secondary">На объект взять
                                    <input type="number" min={0} step={0.1} value={tool.quantity} onChange={event => setOverride(tool.toolKey, Number(event.target.value))} className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 text-right text-sm text-text-primary" />
                                </label>
                                <button type="button" onClick={() => removeTool(tool.toolKey)} aria-label={`Удалить ${tool.name}`} className="min-h-11 min-w-11 rounded-md border border-red-500/30 text-red-300 hover:bg-red-500/10">×</button>
                            </div>
                        );
                    })}
                    {aggregated.length === 0 && <div className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-text-secondary">Нажмите «Подставить по работам» или добавьте инструмент вручную.</div>}
                </div>

                <div className="mt-4 grid gap-2 rounded-lg border border-border bg-background/50 p-3 sm:grid-cols-[minmax(180px,1fr)_90px_150px_auto] sm:items-end">
                    <label className="text-xs font-medium text-text-secondary">Добавить вручную
                        <input value={manualName} onChange={event => setManualName(event.target.value)} placeholder="Название инструмента" className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-text-primary" />
                    </label>
                    <label className="text-xs font-medium text-text-secondary">Количество
                        <input type="number" min={0.1} step={0.1} value={manualQuantity} onChange={event => setManualQuantity(Number(event.target.value))} className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-text-primary" />
                    </label>
                    <label className="text-xs font-medium text-text-secondary">Расчёт
                        <select value={manualMode} onChange={event => setManualMode(event.target.value as 'crew' | 'person')} className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-text-primary">
                            <option value="crew">На бригаду</option>
                            <option value="person">На человека</option>
                        </select>
                    </label>
                    <button type="button" onClick={addManual} disabled={!manualName.trim() || manualQuantity <= 0} className="min-h-11 rounded-md border border-primary px-4 text-sm font-semibold text-primary hover:bg-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-40">Добавить</button>
                </div>
            </div>
        </details>
    );
};

export default CrewToolPlanPanel;
