import type { Estimate, EstimateItem } from '../types';
import { isActualComplete } from './estimateActuals';

export type EstimateValidationIssueCode = 'EMPTY_NAME' | 'ZERO_OR_NEGATIVE_QTY' | 'NEGATIVE_PRICE' | 'INCOMPLETE_ACTUAL';

export interface EstimateValidationIssue {
    code: EstimateValidationIssueCode;
    message: string;
    itemId?: string;
    field?: keyof Pick<EstimateItem, 'name' | 'quantity' | 'price'>;
}

export interface EstimateValidationResult {
    issues: EstimateValidationIssue[];
    invalidItemIds: Set<string>;
    invalidFieldsByItemId: Record<string, Partial<Record<'name' | 'quantity' | 'price', true>>>;
}

export function validateEstimate(estimate: Estimate): EstimateValidationResult {
    const issues: EstimateValidationIssue[] = [];
    const invalidItemIds = new Set<string>();
    const invalidFieldsByItemId: Record<string, Partial<Record<'name' | 'quantity' | 'price', true>>> = {};

    const mark = (itemId: string, field: 'name' | 'quantity' | 'price', issue: EstimateValidationIssue) => {
        invalidItemIds.add(itemId);
        invalidFieldsByItemId[itemId] ??= {};
        invalidFieldsByItemId[itemId][field] = true;
        issues.push(issue);
    };

    for (const item of estimate.items) {
        const name = String(item.name ?? '').trim();
        if (!name) {
            mark(item.id, 'name', {
                code: 'EMPTY_NAME',
                field: 'name',
                itemId: item.id,
                message: 'Пустое наименование позиции',
            });
        }

        if (item.isActualOnly) {
            if (!isActualComplete(item)) {
                mark(item.id, 'quantity', {
                    code: 'INCOMPLETE_ACTUAL',
                    field: 'quantity',
                    itemId: item.id,
                    message: 'Фактическая позиция должна иметь количество и цену',
                });
            }
            continue;
        }

        const quantity = Number(item.quantity ?? 0);
        if (!Number.isFinite(quantity) || quantity <= 0) {
            mark(item.id, 'quantity', {
                code: 'ZERO_OR_NEGATIVE_QTY',
                field: 'quantity',
                itemId: item.id,
                message: 'Количество должно быть больше 0',
            });
        }

        const price = Number(item.price ?? 0);
        if (!Number.isFinite(price) || price < 0) {
            mark(item.id, 'price', {
                code: 'NEGATIVE_PRICE',
                field: 'price',
                itemId: item.id,
                message: 'Цена не может быть отрицательной',
            });
        }
    }

    return { issues, invalidItemIds, invalidFieldsByItemId };
}
