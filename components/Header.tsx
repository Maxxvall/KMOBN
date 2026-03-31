import React, { useState } from 'react';
import { SubscriptionLimits, SubscriptionTier, SubscriptionUsage, View } from '../types';
import { getSubscriptionLabel } from '../services/subscriptionConfig';

type SubscriptionSummary = {
    tier: SubscriptionTier;
    usage: SubscriptionUsage;
    limits: SubscriptionLimits;
};

interface HeaderProps {
    currentView: View;
    onViewChange: (view: View) => void;
    userName?: string | null;
    onLogout?: () => void;
    onUserNameClick?: () => void;
    subscriptionSummary?: SubscriptionSummary;
    onUpgradeClick?: () => void;
}

const Header: React.FC<HeaderProps> = ({ currentView, onViewChange, userName, onLogout, onUserNameClick, subscriptionSummary, onUpgradeClick }) => {
    const [showVersionsModal, setShowVersionsModal] = useState(false);
    const [selectedVersion, setSelectedVersion] = useState<string | null>(null);

    const formatLimit = (value: number | null) => (value == null ? '∞' : String(value));

    const versions = {
        "v1.4": [
            "Аналитика: выбор двух смет для сравнения"
        ],
        "v1.3": [
            "Цветной PDF с фирменным дизайном и логотипом",
            "Модальное окно выбора стиля PDF",
            "Функциональный выбор версий смет",
            "Сохранение и загрузка пользовательских шаблонов",
            "Дублирование итога и кнопки сохранения",
            "Кнопка плавной прокрутки наверх",
            "Улучшенная компоновка многостраничных PDF"
        ],
        "v1.2": [
            "Добавлена новая вкладка 'Калькулятор' для расчета зарплаты работников по сметам",
            "Автоматическое распределение процентов работ между работниками",
            "Автосохранение расчетов зарплаты в локальное хранилище",
            "Улучшено форматирование цен (без копеек для целых чисел)"
        ],
        "v1.1": [
            "Добавлена вкладка 'Комплекты' для создания наборов работ и материалов",
            "Комплекты можно применять к сметам для быстрого добавления элементов",
            "Изменен тип строения с выпадающего списка на текстовое поле для свободного ввода"
        ],
        "v1.0": [
            "Добавлена автоматическая синхронизация цен материалов в сметах со статусом 'Черновик'",
            "Улучшен интерфейс редактора смет с подсказками материалов",
            "Добавлена категория общая для материалов и работ, в сметах они будут у каждого блока в списках"
        ]
    };

    const openVersionDetails = (version: string) => {
        setSelectedVersion(version);
    };

    const closeModal = () => {
        setShowVersionsModal(false);
        setSelectedVersion(null);
    };

    return (
        <>
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
                                onClick={() => onViewChange(View.SUBSCRIPTIONS)}
                                className={`px-4 py-2 rounded-md font-semibold transition duration-300 ${
                                    currentView === View.SUBSCRIPTIONS ? 'bg-primary text-white' : 'bg-surface text-text-primary hover:bg-gray-700'
                                }`}
                            >
                                Подписка
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
                            {subscriptionSummary && (
                                <div className="hidden lg:flex flex-col items-end gap-1 text-xs text-text-secondary mr-2">
                                    <div className="flex items-center gap-2">
                                        <span className="px-2 py-1 rounded border border-border text-text-primary">
                                            План: {getSubscriptionLabel(subscriptionSummary.tier)}
                                        </span>
                                        {onUpgradeClick && subscriptionSummary.tier !== 'premium' && (
                                            <button
                                                type="button"
                                                onClick={onUpgradeClick}
                                                className="px-2 py-1 rounded border border-primary text-primary hover:bg-primary hover:text-white transition-colors"
                                            >
                                                Upgrade
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <span>Сметы {subscriptionSummary.usage.estimatesCreated}/{formatLimit(subscriptionSummary.limits.estimates.max)}</span>
                                        <span>AI {subscriptionSummary.usage.aiRequestsToday}/{formatLimit(subscriptionSummary.limits.aiRequestsPerDay)}</span>
                                    </div>
                                </div>
                            )}
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
                            <button
                                onClick={() => setShowVersionsModal(true)}
                                className="text-sm text-text-secondary hover:text-text-primary transition-colors px-2 py-1 rounded border border-border hover:border-primary"
                            >
                                V
                            </button>
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

            {showVersionsModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-surface p-6 rounded-lg shadow-2xl max-w-md w-full mx-4">
                        {!selectedVersion ? (
                            <div>
                                <div className="flex justify-between items-center mb-4">
                                    <h2 className="text-xl font-bold text-text-primary">Версии</h2>
                                    <button
                                        onClick={closeModal}
                                        className="text-text-secondary hover:text-text-primary text-2xl"
                                    >
                                        ×
                                    </button>
                                </div>
                                <div className="space-y-3">
                                    {Object.keys(versions).map(version => (
                                        <button
                                            key={version}
                                            onClick={() => openVersionDetails(version)}
                                            className="w-full text-left p-3 bg-background hover:bg-background/80 border border-border rounded-lg transition-colors"
                                        >
                                            <div className="font-semibold text-text-primary">{version}</div>
                                            <div className="text-sm text-text-secondary mt-1">
                                                {versions[version as keyof typeof versions].length} обновлений
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div>
                                <div className="flex justify-between items-center mb-4">
                                    <h2 className="text-xl font-bold text-text-primary">Что нового в {selectedVersion}</h2>
                                    <button
                                        onClick={() => setSelectedVersion(null)}
                                        className="text-text-secondary hover:text-text-primary text-2xl"
                                    >
                                        ←
                                    </button>
                                </div>
                                <ul className="space-y-2 text-text-primary mb-6">
                                    {versions[selectedVersion as keyof typeof versions].map((item, index) => (
                                        <li key={index} className="flex items-start">
                                            <span className="text-primary mr-2">•</span>
                                            <span className="text-sm">{item}</span>
                                        </li>
                                    ))}
                                </ul>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setSelectedVersion(null)}
                                        className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-md transition-colors"
                                    >
                                        Назад
                                    </button>
                                    <button
                                        onClick={closeModal}
                                        className="flex-1 bg-primary hover:bg-primary-hover text-white font-bold py-2 px-4 rounded-md transition-colors"
                                    >
                                        Закрыть
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};

export default React.memo(Header);