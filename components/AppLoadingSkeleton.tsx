import React from 'react';
import Skeleton from 'react-loading-skeleton';

const AppLoadingSkeleton: React.FC = () => {
    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <Skeleton height={28} width={260} />
                <Skeleton height={16} width={360} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-xl border border-border bg-surface p-4">
                    <Skeleton height={20} width={140} />
                    <Skeleton height={14} width={220} className="mt-3" />
                    <Skeleton height={14} width={180} className="mt-2" />
                </div>
                <div className="rounded-xl border border-border bg-surface p-4">
                    <Skeleton height={20} width={160} />
                    <Skeleton height={14} width={200} className="mt-3" />
                    <Skeleton height={14} width={160} className="mt-2" />
                </div>
                <div className="rounded-xl border border-border bg-surface p-4">
                    <Skeleton height={20} width={150} />
                    <Skeleton height={14} width={210} className="mt-3" />
                    <Skeleton height={14} width={190} className="mt-2" />
                </div>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
                <Skeleton height={18} width={180} />
                <Skeleton height={14} className="mt-3" />
                <Skeleton height={14} className="mt-2" />
                <Skeleton height={14} className="mt-2" />
            </div>
        </div>
    );
};

export default AppLoadingSkeleton;