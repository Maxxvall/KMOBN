import React, { useState, useCallback, useEffect } from 'react';
import { View } from '../types';

interface HeaderProps {
    currentView: View;
    onViewChange: (view: View) => void;
    userName?: string | null;
    onLogout?: () => void;
    onUserNameClick?: () => void;
    onProfileClick?: () => void;
    subscriptionSummary?: unknown;
    onUpgradeClick?: () => void;
    isElectron?: boolean;
}

const MOBILE_TABS = [
    { view: View.HISTORY, label: 'Сметы', icon: '📋' },
    { view: View.HOUSE_CALCULATOR, label: 'Дом', icon: '⌂' },
    { view: View.PRICES, label: 'Цены', icon: '💰' },
    { view: View.WORKS, label: 'Работы', icon: '🔨' },
    { view: 'MORE' as View, label: 'Ещё', icon: '⋯' },
] as const;

const DESKTOP_NAV_ITEMS = [
    { view: View.HISTORY, label: 'Сметы' },
    { view: View.HOUSE_CALCULATOR, label: 'Расчёт дома' },
    { view: View.SALARY_CALCULATOR, label: 'Зарплата' },
    { view: View.PRICES, label: 'Цены' },
    { view: View.WORKS, label: 'Работы' },
    { view: View.BUNDLES, label: 'Комплекты' },
    { view: View.ANALYTICS, label: 'Аналитика' },
    { view: View.WIKI, label: 'Wiki' },
];

const DESKTOP_NAV_ITEMS_ELECTRON = [
    { view: View.HISTORY, label: 'Сметы' },
    { view: View.HOUSE_CALCULATOR, label: 'Расчёт дома' },
    { view: View.PRICES, label: 'Цены' },
    { view: View.WORKS, label: 'Работы' },
    { view: View.BUNDLES, label: 'Комплекты' },
    { view: View.ANALYTICS, label: 'Аналитика' },
] as const;

const MORE_TABS = [
    { view: View.SALARY_CALCULATOR, label: 'Расчёт зарплаты' },
    { view: View.BUNDLES, label: 'Комплекты' },
    { view: View.ANALYTICS, label: 'Аналитика' },
    { view: View.WIKI, label: 'Wiki' },
];

const Header: React.FC<HeaderProps> = ({ currentView, onViewChange, userName, onLogout, onUserNameClick, onProfileClick, isElectron = false }) => {
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const desktopNavItems = isElectron ? DESKTOP_NAV_ITEMS_ELECTRON : DESKTOP_NAV_ITEMS;

    const handleMoreSelect = useCallback((view: View) => {
        onViewChange(view);
        setShowMoreMenu(false);
    }, [onViewChange]);

    useEffect(() => {
        if (!showMoreMenu) return;
        const close = () => setShowMoreMenu(false);
        const timer = setTimeout(() => window.addEventListener('click', close), 0);
        return () => { clearTimeout(timer); window.removeEventListener('click', close); };
    }, [showMoreMenu]);

    return (
        <>
            {/* Desktop header */}
            <header className="hidden lg:block bg-surface shadow-lg">
                <div className="max-w-8xl mx-auto py-3 px-6 flex items-center justify-between">
                    <div className="flex items-center">
                        <h1 className="text-3xl font-bold text-text-primary">
                            KARKAS MASTER <span className="text-primary font-light">| Генератор Смет</span>
                        </h1>
                    </div>
                    <div className="flex items-center gap-4">
                        <nav className="flex gap-4">
                            {desktopNavItems.map(({ view, label }) => (
                                <button
                                    key={view}
                                    onClick={() => onViewChange(view)}
                                    className={`px-4 py-2 rounded-md font-semibold transition duration-300 active:scale-95 ${
                                        currentView === view ? 'bg-primary text-white' : 'bg-surface text-text-primary hover:bg-gray-700'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </nav>
                        <div className="flex items-center gap-2">
                            {userName && (
                                onProfileClick ? (
                                    <button
                                        type="button"
                                        onClick={onProfileClick}
                                        className="text-sm text-text-secondary max-w-[180px] truncate hover:text-text-primary transition-colors"
                                        title="Профиль"
                                    >
                                        {userName}
                                    </button>
                                ) : onUserNameClick ? (
                                    <button
                                        type="button"
                                        onClick={onUserNameClick}
                                        className="text-sm text-text-secondary max-w-[180px] truncate hover:text-text-primary transition-colors"
                                        title="Сменить пароль"
                                    >
                                        {userName}
                                    </button>
                                ) : (
                                    <span className="text-sm text-text-secondary max-w-[180px] truncate" title={userName}>
                                        {userName}
                                    </span>
                                )
                            )}
                            {onLogout && (
                                <button
                                    onClick={onLogout}
                                    className="text-sm text-text-secondary hover:text-text-primary transition-colors px-3 py-1 rounded border border-border hover:border-primary"
                                >
                                    Выход
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {/* Mobile top bar */}
            <header className="lg:hidden bg-surface shadow-lg sticky top-0 z-40">
                <div className="flex items-center justify-between px-3 py-2">
                    <h1 className="text-base font-bold text-text-primary leading-tight min-w-0">
                        KARKAS MASTER
                        <span className="block text-xs font-normal text-primary">Генератор смет</span>
                    </h1>
                    <div className="flex items-center gap-2">
                        {userName && (
                            <span className="text-xs text-text-secondary max-w-[80px] truncate" title={userName}>
                                {userName}
                            </span>
                        )}
                        {onLogout && (
                            <button
                                onClick={onLogout}
                                className="text-xs text-text-secondary hover:text-text-primary transition-colors px-2 py-1 rounded border border-border min-h-[44px] min-w-[44px] flex items-center justify-center"
                            >
                                Выход
                            </button>
                        )}
                    </div>
                </div>
            </header>

            {/* Mobile bottom navigation */}
            <nav className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
                <div className="grid grid-cols-5">
                    {MOBILE_TABS.map(({ view, label, icon }) => {
                        const isMore = view === ('MORE' as View);
                        const isActive = isMore
                            ? MORE_TABS.some(t => t.view === currentView)
                            : currentView === view;

                        return (
                            <div key={label} className="relative">
                                {isMore && showMoreMenu && (
                                    <div className="absolute bottom-full right-0 mb-2 bg-surface border border-border rounded-lg shadow-2xl overflow-hidden min-w-[140px]">
                                        {MORE_TABS.map(moreTab => (
                                            <button
                                                key={moreTab.view}
                                                onClick={(e) => { e.stopPropagation(); handleMoreSelect(moreTab.view); }}
                                                className={`w-full text-left px-4 py-3 text-sm min-h-[44px] flex items-center ${
                                                    currentView === moreTab.view
                                                        ? 'bg-primary text-white'
                                                        : 'text-text-primary hover:bg-gray-700'
                                                }`}
                                            >
                                                {moreTab.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <button
                                    onClick={() => {
                                        if (isMore) {
                                            setShowMoreMenu(prev => !prev);
                                        } else {
                                            onViewChange(view);
                                        }
                                    }}
                                    className={`w-full flex flex-col items-center justify-center min-h-[56px] py-1 text-xs transition-colors active:scale-95 ${
                                        isActive
                                            ? 'text-primary'
                                            : 'text-text-secondary active:text-text-primary'
                                    }`}
                                >
                                    <span className="text-xl leading-none mb-0.5">{icon}</span>
                                    <span className="leading-tight">{label}</span>
                                </button>
                            </div>
                        );
                    })}
                </div>
            </nav>
        </>
    );
};

export default React.memo(Header);
