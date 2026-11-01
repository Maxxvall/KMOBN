import React from 'react';
import { ProjectTemplate } from '../../types';
import { IconDocumentText, IconRobot, IconStarsSparkles } from '@devigner-ui/icons';
import { DeleteButton } from '../ui/delete-button';
import { inputStyles } from './shared';

interface EstimateTemplateRowProps {
    templates: ProjectTemplate[];
    projectTemplateId: string;
    onTemplateChange: (templateId: string) => void;
    onDeleteTemplateAction?: (templateId: string) => void;
    handleGenerate: () => void;
    /** Проверки ключа/типа/площади и открытие AI-модалки остаются в EstimateEditor. */
    onAiGenerate: () => void;
    handleAnalyzeEstimate: () => void;
    isLoading: boolean;
}

// Ряд шаблона генерации (юнит 1, interfaces.md): select + delete-button,
// «По шаблону» — outline с иконкой, «AI» — icon-only, «AI-анализ» — иконка + текст.
export const EstimateTemplateRow: React.FC<EstimateTemplateRowProps> = ({
    templates,
    projectTemplateId,
    onTemplateChange,
    onDeleteTemplateAction,
    handleGenerate,
    onAiGenerate,
    handleAnalyzeEstimate,
    isLoading,
}) => {
    const outlineBtn =
        'flex min-h-[44px] min-w-0 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-2 text-sm font-semibold text-text-primary transition-colors hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50 md:min-h-9';

    return (
        <div className="mb-2.5 flex min-w-0 flex-wrap items-center gap-2">
            <span className="flex min-w-0 flex-1 basis-56 items-center gap-1">
                <label htmlFor="estimate-template" className="sr-only">Шаблон генерации</label>
                <select
                    id="estimate-template"
                    value={projectTemplateId}
                    onChange={(e) => onTemplateChange(e.target.value)}
                    className={`${inputStyles} min-h-[44px] min-w-0 flex-1 focus:outline-none focus:ring-2 focus:ring-primary/50 md:min-h-9`}
                >
                    {templates.map((template) => (
                        <option key={template.id} value={template.id}>{template.name}</option>
                    ))}
                </select>
                <DeleteButton
                    label="Удалить выбранный шаблон"
                    onConfirm={() => onDeleteTemplateAction?.(projectTemplateId)}
                />
            </span>
            <button onClick={handleGenerate} disabled={isLoading} className={outlineBtn}>
                <IconDocumentText aria-hidden="true" className="size-4 shrink-0" />
                {isLoading ? 'Генерация...' : 'По шаблону'}
            </button>
            <button
                onClick={onAiGenerate}
                disabled={isLoading}
                aria-label="AI-генерация"
                title="AI-генерация"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border bg-background px-2 text-sm font-semibold text-text-primary transition-colors hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50 md:min-h-9 md:min-w-9"
            >
                <IconStarsSparkles aria-hidden="true" className="size-4" />
            </button>
            <button onClick={handleAnalyzeEstimate} disabled={isLoading} className={outlineBtn}>
                <IconRobot aria-hidden="true" className="size-4 shrink-0" />
                AI-анализ
            </button>
        </div>
    );
};
