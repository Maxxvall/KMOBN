import React from 'react';

const SkeletonBlock: React.FC<{ className?: string }> = ({ className }) => (
    <div className={`animate-pulse bg-surface border border-border rounded-xl ${className ?? ''}`} />
);

const WikiSkeleton: React.FC = () => (
    <div className="space-y-6">
        <SkeletonBlock className="h-16" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonBlock key={i} className="h-32" />
            ))}
        </div>
    </div>
);

export default WikiSkeleton;
