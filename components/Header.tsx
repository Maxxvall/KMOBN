import React from 'react';
import { View } from '../types';

interface HeaderProps {
    currentView: View;
    onViewChange: (view: View) => void;
    userName?: string | null;
    onLogout?: () => void;
    onUserNameClick?: () => void;
}

const Header: React.FC<HeaderProps> = ({ currentView, onViewChange, userName, onLogout, onUserNameClick }) => {
    return (
        <header className="bg-surface shadow-lg">
            <div className="max-w-8xl mx-auto py-3 px-3 sm:px-4 lg:px-6 flex items-center justify-between">
                <div className="flex items-center">
                    <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">
                        KARKAS MASTER <span className="text-primary font-light">| Генератор Смет</span>
                    </h1>
                </div>
                <div className="flex items-center gap-4">
                    <nav className="flex gap-4">
                        <button
                            onClick={() => onViewChange(View.HISTORY)}
                            className={`px-4 py-2 rounded-md font-semibold transition duration-300 ${
                                currentView === View.HISTORY ? 'bg-primary text-white' : 'bg-surface text-text-primary hover:bg-gray-700'
                            }`}
                        >
                            Сметы
                        </button>
                        <button
                            onClick={() => onViewChange(View.SALARY_CALCULATOR)}
                            className={`px-4 py-2 rounded-md font-semibold transition duration-300 ${
                                currentView === View.SALARY_CALCULATOR ? 'bg-primary text-white' : 'bg-surface text-text-primary hover:bg-gray-700'
                            }`}
                        >
                            Калькулятор
                        </button>
                        <button
                            onClick={() => onViewChange(View.PRICES)}
                            className={`px-4 py-2 rounded-md font-semibold transition duration-300 ${
                                currentView === View.PRICES ? 'bg-primary text-white' : 'bg-surface text-text-primary hover:bg-gray-700'
                            }`}
                        >
                            Цены
                        </button>
                        <button
                            onClick={() => onViewChange(View.WORKS)}
                            className={`px-4 py-2 rounded-md font-semibold transition duration-300 ${
                                currentView === View.WORKS ? 'bg-primary text-white' : 'bg-surface text-text-primary hover:bg-gray-700'
                            }`}
                        >
                            Работы
                        </button>
                        <button
                            onClick={() => onViewChange(View.BUNDLES)}
                            className={`px-4 py-2 rounded-md font-semibold transition duration-300 ${
                                currentView === View.BUNDLES ? 'bg-primary text-white' : 'bg-surface text-text-primary hover:bg-gray-700'
                            }`}
                        >
                            Комплекты
                        </button>
                        <button
                            onClick={() => onViewChange(View.ANALYTICS)}
                            className={`px-4 py-2 rounded-md font-semibold transition duration-300 ${
                                currentView === View.ANALYTICS ? 'bg-primary text-white' : 'bg-surface text-text-primary hover:bg-gray-700'
                            }`}
                        >
                            Аналитика
                        </button>
                        <button
                            onClick={() => onViewChange(View.WIKI)}
                            className={`px-4 py-2 rounded-md font-semibold transition duration-300 ${
                                currentView === View.WIKI ? 'bg-primary text-white' : 'bg-surface text-text-primary hover:bg-gray-700'
                            }`}
                        >
                            Wiki
                        </button>
                    </nav>
                    <div className="flex items-center gap-2">
                        {userName && (
                            onUserNameClick ? (
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
    );
};

export default React.memo(Header);
