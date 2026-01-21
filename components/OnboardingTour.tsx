import React from 'react';
import { View } from '../types';

export type TourStep = {
    id: string;
    title: string;
    description: string;
    hint?: string;
    view: View;
};

type OnboardingTourProps = {
    isOpen: boolean;
    steps: TourStep[];
    stepIndex: number;
    onStepChange: (index: number) => void;
    onOpenView: (view: View) => void;
    onClose: (mode: 'skip' | 'later' | 'complete') => void;
};

const OnboardingTour: React.FC<OnboardingTourProps> = ({
    isOpen,
    steps,
    stepIndex,
    onStepChange,
    onOpenView,
    onClose,
}) => {
    if (!isOpen || steps.length === 0) return null;

    const step = steps[Math.min(stepIndex, steps.length - 1)];
    const isLast = stepIndex >= steps.length - 1;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface p-6 shadow-2xl">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-semibold text-text-primary">Быстрый тур по вкладкам</h2>
                        <div className="text-xs text-text-secondary">Шаг {stepIndex + 1} из {steps.length}</div>
                    </div>
                    <div className="rounded-xl border border-border bg-background/60 p-4">
                        <div className="text-sm text-text-secondary">{step.title}</div>
                        <div className="mt-2 text-base font-semibold text-text-primary">{step.description}</div>
                        {step.hint && (
                            <div className="mt-3 text-sm text-text-secondary">{step.hint}</div>
                        )}
                    </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                    <button
                        type="button"
                        onClick={() => onOpenView(step.view)}
                        className="px-4 py-2 rounded-md border border-border text-sm text-text-primary hover:bg-background/70"
                    >
                        Открыть вкладку
                    </button>
                    <div className="flex-1" />
                    <button
                        type="button"
                        onClick={() => onClose('later')}
                        className="px-4 py-2 rounded-md border border-border text-sm text-text-secondary hover:text-text-primary"
                    >
                        Позже
                    </button>
                    <button
                        type="button"
                        onClick={() => onClose('skip')}
                        className="px-4 py-2 rounded-md border border-border text-sm text-text-secondary hover:text-text-primary"
                    >
                        Пропустить
                    </button>
                    {stepIndex > 0 && (
                        <button
                            type="button"
                            onClick={() => onStepChange(stepIndex - 1)}
                            className="px-4 py-2 rounded-md border border-border text-sm text-text-primary hover:bg-background/70"
                        >
                            Назад
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => {
                            if (isLast) {
                                onClose('complete');
                            } else {
                                onStepChange(stepIndex + 1);
                            }
                        }}
                        className="px-4 py-2 rounded-md bg-primary text-white text-sm hover:bg-primary-hover"
                    >
                        {isLast ? 'Завершить' : 'Далее'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default OnboardingTour;
