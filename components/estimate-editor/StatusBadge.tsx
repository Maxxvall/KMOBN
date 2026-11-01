import React from 'react';
import { EstimateStatus } from '../../types';
import { Badge } from '../ui/badge';

// Общий бейдж статуса сметы (юнит 2, interfaces.md): маппинг EstimateStatus →
// цвет перенесён из EstimateHistory.tsx — Черновик: amber, Отправлена: sky,
// Согласована: emerald.

const STATUS_TONES: { [key in EstimateStatus]: 'warning' | 'info' | 'success' } = {
    [EstimateStatus.DRAFT]: 'warning',
    [EstimateStatus.SENT]: 'info',
    [EstimateStatus.APPROVED]: 'success',
};

interface StatusBadgeProps {
    status: EstimateStatus;
    className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className }) => (
    <Badge tone={STATUS_TONES[status]} size="md" className={className}>
        {status}
    </Badge>
);
