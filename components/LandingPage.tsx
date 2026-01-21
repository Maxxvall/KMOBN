import React from 'react';

type LandingPageProps = {
    onOpenLogin: () => void;
};

const LandingPage: React.FC<LandingPageProps> = ({ onOpenLogin }) => {
    return (
        <div className="min-h-screen bg-background text-text-primary">
            <header className="fixed top-0 left-0 right-0 z-40 border-b border-border bg-background/80 backdrop-blur">
                <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
                    <a
                        href="https://kmobn.ru"
                        className="group flex items-center gap-3"
                        target="_blank"
                        rel="noreferrer"
                    >
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary font-semibold">
                            K
                        </div>
                        <span className="text-lg font-semibold text-text-primary group-hover:text-primary">
                            Сделано командой Каркас Мастер
                        </span>
                    </a>
                    <div className="flex items-center gap-3">
                        <nav className="hidden items-center gap-2 sm:flex" aria-label="Социальные сети">
                            <a
                                href="#"
                                className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-text-secondary transition hover:border-primary hover:text-text-primary"
                                aria-label="ВКонтакте"
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                    <path fill="currentColor" d="M12 0C5.373 0 0 5.373 0 12c0 6.627 5.373 12 12 12s12-5.373 12-12C24 5.373 18.627 0 12 0zm4.406 16.5c-.145.395-.52.649-.951.649-.844 0-1.628-.205-2.38-.614-.748-.406-1.182-.72-1.58-1.03-.31-.24-.488-.317-.66-.317-.092 0-.172.06-.172.317v1.4c0 .38-.177.556-.487.556h-.888c-.384 0-.6-.227-.6-.63V8.6c0-.384.14-.544.467-.544h1.107c.28 0 .397.097.462.33.274.9.97 1.66 1.756 2.076.344.2.528.244.658.244.071 0 .163-.03.163-.316V8.6c0-.384.129-.546.46-.546h1.06c.357 0 .495.172.35.493-.96 2.35-1.99 3.7-3.18 4.56.61.084 1.4.08 2.03-.08.6-.16 1.06-.43 1.42-.8.25-.25.47-.33.66-.33.086 0 .18.03.18.31v1.37c0 .37-.13.67-.33.98z" />
                                </svg>
                            </a>
                            <a
                                href="#"
                                className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-text-secondary transition hover:border-primary hover:text-text-primary"
                                aria-label="Telegram"
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                    <path fill="currentColor" d="M21.6 3.4c-.2-.8-.9-1.2-1.6-.9L3.4 10.1c-.7.3-.7 1.2.1 1.5l4.5 1.4 1.4 4.5c.3.8 1.1 1 1.6.6L21.6 5.1c.6-.5.7-1.2.4-1.7z" />
                                </svg>
                            </a>
                            <a
                                href="#"
                                className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-text-secondary transition hover:border-primary hover:text-text-primary"
                                aria-label="YouTube"
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                    <path
                                        fill="currentColor"
                                        d="M21.6 7.2c-.3-1.2-1.3-2.1-2.5-2.4-2.2-.5-7.1-.5-7.1-.5s-4.9 0-7.1.5C3.7 5.1 2.7 6 2.4 7.2c-.5 2.2-.5 4.8-.5 4.8s0 2.6.5 4.8c.3 1.2 1.3 2.1 2.5 2.4 2.2.5 7.1.5 7.1.5s4.9 0 7.1-.5c1.2-.3 2.2-1.2 2.5-2.4.5-2.2.5-4.8.5-4.8s0-2.6-.5-4.8zM10.2 15.5v-7l6.2 3.5-6.2 3.5z"
                                    />
                                </svg>
                            </a>
                        </nav>
                        <button
                            type="button"
                            onClick={onOpenLogin}
                            className="rounded-md bg-primary px-5 py-2 text-text-primary font-medium hover:bg-primary-hover"
                        >
                            Войти
                        </button>
                    </div>
                </div>
            </header>

            <main className="pt-28">
                <section className="relative overflow-hidden">
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.06),_transparent_55%)]" />
                    <div className="mx-auto max-w-6xl px-4 pb-14 pt-12 text-center">
                        <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 px-4 py-1 text-xs uppercase tracking-[0.2em] text-text-secondary">
                            Платформа для смет и знаний
                        </p>
                        <h1 className="mt-6 text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
                            Сметы, материалы и работы
                            <br />
                            в едином профессиональном пространстве
                        </h1>
                        <p className="mx-auto mt-5 max-w-3xl text-lg text-text-secondary">
                            Управляйте проектами, версиями и документами в одном интерфейсе. Встроенная Wiki помогает
                            стандартизировать решения и ускорять согласования без потери качества.
                        </p>
                        <div className="mt-8 flex items-center justify-center">
                            <button
                                type="button"
                                onClick={onOpenLogin}
                                className="rounded-md bg-primary px-8 py-3 text-base font-semibold text-text-primary hover:bg-primary-hover"
                            >
                                Начать работу
                            </button>
                        </div>
                        <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-text-secondary">
                            <span className="inline-flex items-center gap-2">✅ Надежная авторизация</span>
                            <span className="inline-flex items-center gap-2">✅ Полный контроль версий</span>
                            <span className="inline-flex items-center gap-2">✅ PDF и контракты за 1 клик</span>
                        </div>
                        <div className="mt-10 grid gap-4 rounded-2xl border border-border bg-surface/60 px-6 py-6 text-center sm:grid-cols-3">
                            <div className="flex flex-col items-center">
                                <div className="text-2xl font-semibold text-text-primary">60%+</div>
                                <p className="mt-2 text-sm text-text-secondary">Экономия времени на подготовку смет</p>
                            </div>
                            <div className="flex flex-col items-center">
                                <div className="text-2xl font-semibold text-text-primary">15+</div>
                                <p className="mt-2 text-sm text-text-secondary">Вариантов/типов экспорта документов</p>
                            </div>
                            <div className="flex flex-col items-center">
                                <div className="text-2xl font-semibold text-text-primary">24/7</div>
                                <p className="mt-2 text-sm text-text-secondary">Доступ к базе знаний</p>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="mx-auto mt-4 grid max-w-6xl gap-6 px-4 md:grid-cols-3">
                    <div className="rounded-xl border border-border bg-surface p-6 shadow-[0_20px_60px_rgba(0,0,0,0.15)]">
                        <div className="text-2xl">📊</div>
                        <h2 className="mt-4 text-lg font-semibold">История и версии смет</h2>
                        <p className="mt-2 text-sm text-text-secondary">Сравнивайте версии, возвращайтесь к прошлым расчетам и сохраняйте шаблоны.</p>
                    </div>
                    <div className="rounded-xl border border-border bg-surface p-6 shadow-[0_20px_60px_rgba(0,0,0,0.15)]">
                        <div className="text-2xl">📚</div>
                        <h2 className="mt-4 text-lg font-semibold">Wiki знаний</h2>
                        <p className="mt-2 text-sm text-text-secondary">Единая база регламентов, узлов и типовых решений для команды и подрядчиков.</p>
                    </div>
                    <div className="rounded-xl border border-border bg-surface p-6 shadow-[0_20px_60px_rgba(0,0,0,0.15)]">
                        <div className="text-2xl">📄</div>
                        <h2 className="mt-4 text-lg font-semibold">Экспорт документов</h2>
                        <p className="mt-2 text-sm text-text-secondary">Готовые PDF-документы и контракты для передачи заказчику.</p>
                    </div>
                </section>

                <section className="mx-auto mt-10 grid max-w-6xl gap-6 px-4 md:grid-cols-3">
                    <div className="rounded-xl border border-border bg-surface p-6">
                        <div className="text-2xl">🧠</div>
                        <h3 className="mt-4 text-lg font-semibold">Интеллект анализа сметы</h3>
                        <p className="mt-2 text-sm text-text-secondary">Подсказывает риски, недостающие позиции и оптимальные варианты комплектации.</p>
                    </div>
                    <div className="rounded-xl border border-border bg-surface p-6">
                        <div className="text-2xl">🧩</div>
                        <h3 className="mt-4 text-lg font-semibold">Бандлы работ и материалов</h3>
                        <p className="mt-2 text-sm text-text-secondary">Собирайте повторяемые пакеты и ускоряйте создание типовых проектов.</p>
                    </div>
                    <div className="rounded-xl border border-border bg-surface p-6">
                        <div className="text-2xl">🔒</div>
                        <h3 className="mt-4 text-lg font-semibold">Защита данных</h3>
                        <p className="mt-2 text-sm text-text-secondary">Контроль доступа и безопасное хранение всей истории изменений.</p>
                    </div>
                </section>

                <section className="mx-auto mt-16 max-w-6xl px-4">
                    <div className="grid gap-8 rounded-2xl border border-border bg-surface/70 p-8 md:grid-cols-2">
                        <div>
                            <h3 className="text-2xl font-semibold">Стандартизируйте экспертизу через Wiki</h3>
                            <p className="mt-3 text-sm text-text-secondary">
                                Предоставляйте всем участникам команды доступ к инструкциям, нормам и типовым узлам —
                                обновления становятся мгновенно доступны в рабочих процессах.
                            </p>
                            <div className="mt-5 space-y-3 text-sm text-text-secondary">
                                <div className="flex items-start gap-2">✅ Быстрый поиск по категориям</div>
                                <div className="flex items-start gap-2">✅ Обновления без потери контекста</div>
                                <div className="flex items-start gap-2">✅ Гибкая структура для ваших регламентов</div>
                            </div>
                        </div>
                        <div className="rounded-xl border border-border bg-background/40 p-6">
                            <div className="text-sm uppercase tracking-[0.2em] text-text-secondary">Премиальный контур</div>
                            <div className="mt-4 space-y-4">
                                <div className="rounded-lg border border-border bg-surface p-4">
                                    <div className="text-sm font-semibold">Единый стандарт качества</div>
                                    <p className="mt-2 text-xs text-text-secondary">Фиксируйте лучшие практики и контролируйте исполнение.</p>
                                </div>
                                <div className="rounded-lg border border-border bg-surface p-4">
                                    <div className="text-sm font-semibold">Актуальные шаблоны документов</div>
                                    <p className="mt-2 text-xs text-text-secondary">Сметы, КП и контракты всегда соответствуют регламентам.</p>
                                </div>
                                <div className="rounded-lg border border-border bg-surface p-4">
                                    <div className="text-sm font-semibold">Готовность к масштабированию</div>
                                    <p className="mt-2 text-xs text-text-secondary">Система растет вместе с вашей компанией.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="mx-auto mt-16 max-w-5xl px-4 pb-10">
                    <div className="rounded-2xl border border-border bg-surface p-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.25)]">
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

            <footer className="border-t border-border bg-surface/50">
                <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-6 text-sm text-text-secondary sm:flex-row">
                    <div>© 2026 Каркас Мастер. Премиальная платформа смет.</div>
                    <div className="flex items-center gap-3" aria-label="Социальные сети">
                        <a
                            href="#"
                            className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-text-secondary transition hover:border-primary hover:text-text-primary"
                            aria-label="ВКонтакте"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                <path fill="currentColor" d="M12 0C5.373 0 0 5.373 0 12c0 6.627 5.373 12 12 12s12-5.373 12-12C24 5.373 18.627 0 12 0zm4.406 16.5c-.145.395-.52.649-.951.649-.844 0-1.628-.205-2.38-.614-.748-.406-1.182-.72-1.58-1.03-.31-.24-.488-.317-.66-.317-.092 0-.172.06-.172.317v1.4c0 .38-.177.556-.487.556h-.888c-.384 0-.6-.227-.6-.63V8.6c0-.384.14-.544.467-.544h1.107c.28 0 .397.097.462.33.274.9.97 1.66 1.756 2.076.344.2.528.244.658.244.071 0 .163-.03.163-.316V8.6c0-.384.129-.546.46-.546h1.06c.357 0 .495.172.35.493-.96 2.35-1.99 3.7-3.18 4.56.61.084 1.4.08 2.03-.08.6-.16 1.06-.43 1.42-.8.25-.25.47-.33.66-.33.086 0 .18.03.18.31v1.37c0 .37-.13.67-.33.98z" />
                            </svg>
                        </a>
                        <a
                            href="#"
                            className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-text-secondary transition hover:border-primary hover:text-text-primary"
                            aria-label="Telegram"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                <path fill="currentColor" d="M21.6 3.4c-.2-.8-.9-1.2-1.6-.9L3.4 10.1c-.7.3-.7 1.2.1 1.5l4.5 1.4 1.4 4.5c.3.8 1.1 1 1.6.6L21.6 5.1c.6-.5.7-1.2.4-1.7z" />
                            </svg>
                        </a>
                        <a
                            href="#"
                            className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-text-secondary transition hover:border-primary hover:text-text-primary"
                            aria-label="YouTube"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                <path
                                    fill="currentColor"
                                    d="M21.6 7.2c-.3-1.2-1.3-2.1-2.5-2.4-2.2-.5-7.1-.5-7.1-.5s-4.9 0-7.1.5C3.7 5.1 2.7 6 2.4 7.2c-.5 2.2-.5 4.8-.5 4.8s0 2.6.5 4.8c.3 1.2 1.3 2.1 2.5 2.4 2.2.5 7.1.5 7.1.5s4.9 0 7.1-.5c1.2-.3 2.2-1.2 2.5-2.4.5-2.2.5-4.8.5-4.8s0-2.6-.5-4.8zM10.2 15.5v-7l6.2 3.5-6.2 3.5z"
                                />
                            </svg>
                        </a>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
