import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from '../types';
import { IconBook, IconBriefcase, IconChartSquare, IconFileText, IconHome, IconLayers, IconLogout, IconMagnifier, IconMore, IconSledgehammer, IconTag } from '@devigner-ui/icons';

interface HeaderProps {
    currentView: View;
    onViewChange: (view: View) => void;
    onOpenCommandPalette?: () => void;
    userName?: string | null;
    onLogout?: () => void;
    onUserNameClick?: () => void;
    onProfileClick?: () => void;
    isElectron?: boolean;
    mobileStatus?: React.ReactNode;
}

type NavIconName = 'file-text' | 'house' | 'tag' | 'briefcase-business' | 'more-horizontal' | 'wrench' | 'layers' | 'chart' | 'book-open' | 'log-out';

// Иконки навигации — из пакета (раньше здесь было 10 inline-SVG).
// Соответствие «ближайшее по смыслу»: wrench → Sledgehammer, chart → ChartSquare.
const NAV_ICONS: Record<NavIconName, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
    'file-text': IconFileText,
    house: IconHome,
    tag: IconTag,
    'briefcase-business': IconBriefcase,
    'more-horizontal': IconMore,
    wrench: IconSledgehammer,
    layers: IconLayers,
    chart: IconChartSquare,
    'book-open': IconBook,
    'log-out': IconLogout,
};

const Icon: React.FC<{ name: NavIconName; size?: number }> = ({ name, size = 20 }) => {
    const Glyph = NAV_ICONS[name];
    return <Glyph aria-hidden="true" style={{ width: size, height: size }} />;
};

const SearchButton: React.FC<{ onOpenCommandPalette?: () => void; className?: string }> = ({ onOpenCommandPalette, className = '' }) => {
    if (!onOpenCommandPalette) return null;
    return (
        <button
            type="button"
            onClick={onOpenCommandPalette}
            aria-label="Поиск и команды"
            title="Поиск и команды (Ctrl+K)"
            className={`flex items-center justify-center rounded-lg border border-border text-text-primary transition hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-primary ${className}`}
        >
            <IconMagnifier aria-hidden="true" className="size-5" />
        </button>
    );
};

const MOBILE_TABS: ReadonlyArray<{ view: View | 'MORE'; label: string; icon: NavIconName }> = [
    { view: View.HISTORY, label: 'Сметы', icon: 'file-text' },
    { view: View.HOUSE_CALCULATOR, label: 'Дом', icon: 'house' },
    { view: View.PRICES, label: 'Материалы', icon: 'tag' },
    { view: View.WORKS, label: 'Работы', icon: 'briefcase-business' },
    { view: 'MORE', label: 'Ещё', icon: 'more-horizontal' },
];

const PRIMARY_DESKTOP_NAV_ITEMS = [
    { view: View.HISTORY, label: 'Сметы' },
    { view: View.PRICES, label: 'Материалы' },
    { view: View.WORKS, label: 'Работы' },
] as const;

// Все 9 разделов инлайн в шапке на широких экранах (xl+).
const XL_NAV_ITEMS = [
    { view: View.HISTORY, label: 'Сметы', icon: 'file-text' },
    { view: View.HOUSE_CALCULATOR, label: 'Расчёт дома', icon: 'house' },
    { view: View.PRICES, label: 'Материалы', icon: 'tag' },
    { view: View.WORKS, label: 'Работы', icon: 'briefcase-business' },
    { view: View.BUNDLES, label: 'Комплекты', icon: 'briefcase-business' },
    { view: View.ANALYTICS, label: 'Аналитика', icon: 'chart' },
    { view: View.CUTTING, label: 'Раскрой', icon: 'layers' },
    { view: View.WIKI, label: 'Wiki', icon: 'book-open' },
    { view: View.SECTIONS, label: 'Разделы смет', icon: 'layers' },
] as const;

const DRAWER_NAV_ITEMS = [
    { view: View.HOUSE_CALCULATOR, label: 'Расчёт дома', icon: 'house' },
    { view: View.BUNDLES, label: 'Комплекты', icon: 'briefcase-business' },
    { view: View.ANALYTICS, label: 'Аналитика', icon: 'more-horizontal' },
    { view: View.CUTTING, label: 'Раскрой', icon: 'layers' },
    { view: View.WIKI, label: 'Wiki', icon: 'file-text' },
    { view: View.SECTIONS, label: 'Разделы смет', icon: 'layers' },
] as const;

const MORE_TABS = DRAWER_NAV_ITEMS.filter(({ view }) => view !== View.HOUSE_CALCULATOR);

// Единый рецепт кнопки «Выйти» (шапка xl+ и drawer): нейтральный текст,
// красный hover — удаление красным. Layout-специфика остаётся на месте.
const LOGOUT_HOVER = 'text-text-secondary hover:bg-red-500/10 hover:text-red-300 focus:ring-2 focus:ring-primary';

const Header: React.FC<HeaderProps> = ({
    currentView,
    onViewChange,
    onOpenCommandPalette,
    userName,
    onLogout,
    onUserNameClick,
    onProfileClick,
    isElectron = false,
    mobileStatus,
}) => {
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [appVersion, setAppVersion] = useState('');
    const drawerRef = useRef<HTMLElement>(null);

    const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);
    const openDrawer = useCallback(() => setIsDrawerOpen(true), []);

    const handleDrawerSelect = useCallback((view: View) => {
        onViewChange(view);
        closeDrawer();
    }, [closeDrawer, onViewChange]);

    const handleMoreSelect = useCallback((view: View) => {
        onViewChange(view);
        setShowMoreMenu(false);
    }, [onViewChange]);

    const handleProfileClick = useCallback(() => {
        (onProfileClick ?? onUserNameClick)?.();
        closeDrawer();
    }, [closeDrawer, onProfileClick, onUserNameClick]);

    const handleLogout = useCallback(() => {
        onLogout?.();
        closeDrawer();
    }, [closeDrawer, onLogout]);

    useEffect(() => {
        if (!showMoreMenu) return;
        const close = () => setShowMoreMenu(false);
        const timer = setTimeout(() => window.addEventListener('click', close), 0);
        return () => { clearTimeout(timer); window.removeEventListener('click', close); };
    }, [showMoreMenu]);

    useEffect(() => {
        if (!isElectron || !window.electronAPI?.getAppVersion) return;
        let isMounted = true;
        window.electronAPI.getAppVersion()
            .then(version => { if (isMounted) setAppVersion(version); })
            .catch(() => { if (isMounted) setAppVersion(''); });
        return () => { isMounted = false; };
    }, [isElectron]);

    useEffect(() => {
        if (!isDrawerOpen) return;
        const previousOverflow = document.body.style.overflow;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') closeDrawer();
        };
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', onKeyDown);
        drawerRef.current?.focus();
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [closeDrawer, isDrawerOpen]);

    const isMoreActive = MORE_TABS.some(tab => tab.view === currentView);
    const versionLabel = isElectron ? (appVersion ? `v${appVersion}` : 'версия загружается') : 'Веб-версия';
    const logoUrl = `${import.meta.env.BASE_URL}navigation-logo.png`;

    return (
        <>
            <header className="hidden lg:block lg:sticky lg:top-0 lg:z-30 bg-surface shadow-lg">
                <div className="max-w-8xl mx-auto flex items-center justify-between px-6 py-3">
                    <div className="min-w-0 text-text-primary">
                        <p className="truncate text-lg font-bold tracking-tight">KARKAS MASTER <span className="font-normal text-primary">| Генератор смет</span></p>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* xl+: все 9 разделов инлайн с иконками */}
                        <nav className="hidden xl:flex items-center gap-1" aria-label="Основная навигация">
                            {XL_NAV_ITEMS.map(({ view, label, icon }) => (
                                <button
                                    key={view}
                                    type="button"
                                    onClick={() => onViewChange(view)}
                                    aria-current={currentView === view ? 'page' : undefined}
                                    className={`flex items-center gap-2 rounded-lg px-3 py-2 font-semibold transition duration-200 active:scale-95 ${
                                        currentView === view
                                            ? 'bg-primary text-white shadow-md shadow-primary/20'
                                            : 'text-text-primary hover:bg-white/5'
                                    }`}
                                >
                                    <Icon name={icon} size={16} />
                                    {label}
                                </button>
                            ))}
                        </nav>
                        {/* lg…xl: прежние три раздела, остальное в drawer */}
                        <nav className="xl:hidden flex items-center gap-1" aria-label="Основная навигация">
                            {PRIMARY_DESKTOP_NAV_ITEMS.map(({ view, label }) => (
                                <button
                                    key={view}
                                    type="button"
                                    onClick={() => onViewChange(view)}
                                    aria-current={currentView === view ? 'page' : undefined}
                                    className={`rounded-lg px-4 py-2 font-semibold transition duration-200 active:scale-95 ${
                                        currentView === view
                                            ? 'bg-primary text-white shadow-md shadow-primary/20'
                                            : 'text-text-primary hover:bg-white/5'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </nav>
                        <SearchButton onOpenCommandPalette={onOpenCommandPalette} className="h-10 w-10" />
                        <button
                            type="button"
                            onClick={openDrawer}
                            className="xl:hidden group relative h-12 w-12 overflow-hidden rounded-xl border border-transparent shadow-lg transition duration-200 hover:-translate-y-0.5 hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-surface"
                            aria-label="Открыть меню"
                            aria-haspopup="dialog"
                            aria-expanded={isDrawerOpen}
                        >
                            <img src={logoUrl} alt="" className="h-full w-full object-contain mix-blend-screen transition duration-200 group-hover:scale-110" />
                        </button>
                        {(onProfileClick || onUserNameClick || onLogout) && (
                            <button
                                type="button"
                                onClick={handleProfileClick}
                                className="hidden xl:flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-text-primary transition hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-primary"
                                aria-label="Профиль"
                            >
                                <span aria-hidden="true">◉</span>
                                <span className="max-w-[160px] truncate">{userName || 'Профиль'}</span>
                            </button>
                        )}
                        {/* xl+: drawer скрыт — выход из аккаунта дублируем в шапку рядом с профилем */}
                        {onLogout && (
                            <button
                                type="button"
                                onClick={handleLogout}
                                className={`hidden xl:flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold transition focus:outline-none ${LOGOUT_HOVER}`}
                            >
                                <Icon name="log-out" size={16} />
                                Выйти
                            </button>
                        )}
                    </div>
                </div>
            </header>

            <header className="lg:hidden sticky top-0 z-40 bg-surface shadow-lg">
                <div className="flex items-center justify-between px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                        <button
                            type="button"
                            onClick={openDrawer}
                            className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-transparent focus:outline-none focus:ring-2 focus:ring-primary"
                            aria-label="Открыть меню"
                            aria-haspopup="dialog"
                            aria-expanded={isDrawerOpen}
                        >
                            <img src={logoUrl} alt="" className="h-full w-full object-contain mix-blend-screen" />
                        </button>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-text-primary">KARKAS MASTER</p>
                            <p className="truncate text-xs text-primary">Генератор смет</p>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <SearchButton onOpenCommandPalette={onOpenCommandPalette} className="h-11 w-11" />
                        {mobileStatus && <div className="shrink-0">{mobileStatus}</div>}
                    </div>
                </div>
            </header>

            <nav className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]" aria-label="Мобильная навигация">
                <div className="grid grid-cols-5">
                    {MOBILE_TABS.map(({ view, label, icon }) => {
                        const isMore = view === 'MORE';
                        const isActive = isMore ? isMoreActive : currentView === view;

                        return (
                            <div key={label} className="relative">
                                {isMore && showMoreMenu && (
                                    <div className="absolute bottom-full right-0 mb-2 min-w-[160px] overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
                                        {MORE_TABS.map(moreTab => (
                                            <button
                                                key={moreTab.view}
                                                type="button"
                                                onClick={(event) => { event.stopPropagation(); handleMoreSelect(moreTab.view); }}
                                                className={`flex min-h-11 w-full items-center gap-2 px-4 py-3 text-left text-sm ${
                                                    currentView === moreTab.view ? 'bg-primary text-white' : 'text-text-primary hover:bg-white/5'
                                                }`}
                                            >
                                                <Icon name={moreTab.icon} size={18} />
                                                {moreTab.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (isMore) setShowMoreMenu(previous => !previous);
                                        else onViewChange(view);
                                    }}
                                    className={`flex min-h-14 w-full flex-col items-center justify-center py-1 text-xs transition-colors active:scale-95 ${
                                        isActive ? 'text-primary' : 'text-text-secondary active:text-text-primary'
                                    }`}
                                >
                                    <span className="mb-0.5 flex h-6 items-center justify-center text-primary" aria-hidden="true"><Icon name={icon} size={20} /></span>
                                    <span className="leading-tight">{label}</span>
                                </button>
                            </div>
                        );
                    })}
                </div>
            </nav>

            <div className={`fixed inset-0 z-50 ${isDrawerOpen ? 'pointer-events-auto' : 'pointer-events-none'}`} aria-hidden={!isDrawerOpen}>
                <div
                    className={`absolute inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity duration-300 ${isDrawerOpen ? 'opacity-100' : 'opacity-0'}`}
                    onClick={closeDrawer}
                />
                <aside
                    ref={drawerRef}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Меню приложения"
                    tabIndex={-1}
                    className={`absolute inset-y-0 right-0 flex w-full max-w-sm flex-col border-l border-border bg-surface shadow-2xl outline-none transition-transform duration-300 ease-out ${
                        isDrawerOpen ? 'translate-x-0' : 'translate-x-full'
                    }`}
                >
                    <div className="flex items-center justify-between border-b border-border px-5 py-4">
                        <div className="flex items-center gap-3">
                            <div className="h-11 w-11 overflow-hidden rounded-xl border border-transparent">
                                <img src={logoUrl} alt="Логотип Karkas Master" className="h-full w-full object-contain mix-blend-screen" />
                            </div>
                            <div>
                                <p className="text-sm font-bold tracking-wide text-text-primary">KARKAS MASTER</p>
                                <p className="text-xs text-text-secondary">Навигация</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={closeDrawer}
                            className="flex h-11 w-11 items-center justify-center rounded-lg text-xl text-text-secondary transition hover:bg-white/5 hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                            aria-label="Закрыть меню"
                        >
                            ×
                        </button>
                    </div>

                    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Разделы приложения">
                        {DRAWER_NAV_ITEMS.map(({ view, label, icon }) => (
                            <button
                                key={view}
                                type="button"
                                onClick={() => handleDrawerSelect(view)}
                                aria-current={currentView === view ? 'page' : undefined}
                                className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-4 text-left font-semibold transition ${
                                    currentView === view
                                        ? 'bg-primary text-white shadow-md shadow-primary/20'
                                        : 'text-text-primary hover:bg-white/5'
                                }`}
                            >
                                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-black/15 text-lg" aria-hidden="true"><Icon name={icon} size={18} /></span>
                                {label}
                            </button>
                        ))}
                    </nav>

                    <div className="border-t border-border p-3">
                        {userName && <p className="mb-2 truncate px-2 text-xs text-text-secondary" title={userName}>{userName}</p>}
                        {(onProfileClick || onUserNameClick) && (
                            <button
                                type="button"
                                onClick={handleProfileClick}
                                className="flex min-h-12 w-full items-center gap-3 rounded-xl px-4 text-left font-semibold text-text-primary transition hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-primary"
                            >
                                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white/5" aria-hidden="true">◉</span>
                                Профиль
                            </button>
                        )}
                        {onLogout && (
                            <button
                                type="button"
                                onClick={handleLogout}
                                className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-4 text-left font-semibold transition focus:outline-none ${LOGOUT_HOVER}`}
                            >
                                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white/5" aria-hidden="true">↪</span>
                                Выйти
                            </button>
                        )}
                        <p className="px-2 pt-3 text-xs text-text-secondary">{isElectron ? `Версия приложения ${versionLabel}` : versionLabel}</p>
                    </div>
                </aside>
            </div>
        </>
    );
};

export default React.memo(Header);
