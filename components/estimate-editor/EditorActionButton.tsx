import type { ButtonHTMLAttributes } from 'react';

export const EditorActionButton = ({ label, destructive = false, className = '', ...props }:
    ButtonHTMLAttributes<HTMLButtonElement> & { label: string; destructive?: boolean }) => (
    <button
        type="button"
        title={label}
        aria-label={label}
        className={`inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1 rounded-md px-2 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 md:min-h-9 md:min-w-9 ${destructive ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300' : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'} ${className}`}
        {...props}
    />
);
