import React from 'react';

type LandingPageProps = {
    onOpenLogin: () => void;
};

const LandingPage: React.FC<LandingPageProps> = ({ onOpenLogin }) => {
    return (
        <div className="min-h-screen bg-background text-text-primary">
            <header className="fixed top-0 left-0 right-0 z-40 border-b border-border bg-background/80 backdrop-blur">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary font-semibold">
                            K
                        </div>
                        <span className="text-lg font-semibold">KMOBN</span>
                    </div>
                    <button
                        type="button"
                        onClick={onOpenLogin}
                        className="rounded-md bg-primary px-5 py-2 text-text-primary font-medium hover:bg-primary-hover"
                    >
                        Войти
                    </button>
                </div>
            </header>

            <main className="pt-28">
                <section className="mx-auto max-w-5xl px-4 text-center">
                    <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1 text-xs uppercase tracking-[0.2em] text-text-secondary">
                        Управление сметами и ресурсами
                    </p>
                    <h1 className="mt-6 text-4xl font-semibold leading-tight sm:text-5xl">
                        Сметы, материалы и работы
                        <br />
                        в едином профессиональном пространстве
                    </h1>
                    <p className="mt-5 text-lg text-text-secondary">
                        Создавайте сметы быстрее, контролируйте цены и экспортируйте документы в один клик.
                    </p>
                    <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                        <button
                            type="button"
                            onClick={onOpenLogin}
                            className="rounded-md bg-primary px-8 py-3 text-base font-semibold text-text-primary hover:bg-primary-hover"
                        >
                            Начать работу
                        </button>
                        <span className="text-sm text-text-secondary">Бесплатный вход с Google или email</span>
                    </div>
                </section>

                <section className="mx-auto mt-16 grid max-w-6xl gap-6 px-4 md:grid-cols-3">
                    <div className="rounded-lg border border-border bg-surface p-6">
                        <div className="text-2xl">📊</div>
                        <h2 className="mt-4 text-lg font-semibold">История и версии смет</h2>
                        <p className="mt-2 text-sm text-text-secondary">Сравнивайте версии, возвращайтесь к прошлым расчетам и сохраняйте шаблоны.</p>
                    </div>
                    <div className="rounded-lg border border-border bg-surface p-6">
                        <div className="text-2xl">💰</div>
                        <h2 className="mt-4 text-lg font-semibold">Актуальные цены</h2>
                        <p className="mt-2 text-sm text-text-secondary">Автоматический поиск цен на материалы и быстрый пересчет сметы.</p>
                    </div>
                    <div className="rounded-lg border border-border bg-surface p-6">
                        <div className="text-2xl">📄</div>
                        <h2 className="mt-4 text-lg font-semibold">Экспорт документов</h2>
                        <p className="mt-2 text-sm text-text-secondary">Готовые PDF-документы и контракты для передачи заказчику.</p>
                    </div>
                </section>

                <section className="mx-auto mt-16 max-w-5xl px-4 pb-16">
                    <div className="rounded-xl border border-border bg-surface p-8 text-center">
                        <h3 className="text-2xl font-semibold">Войдите и начните работать за минуту</h3>
                        <p className="mt-3 text-sm text-text-secondary">Все данные защищены и видны только вашему аккаунту.</p>
                        <button
                            type="button"
                            onClick={onOpenLogin}
                            className="mt-6 rounded-md bg-primary px-8 py-3 text-base font-semibold text-text-primary hover:bg-primary-hover"
                        >
                            Войти в систему
                        </button>
                    </div>
                </section>
            </main>
        </div>
    );
};

export default LandingPage;
