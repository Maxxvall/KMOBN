import React, { useEffect, useMemo, useRef, useState } from 'react';
import FocusLock from 'react-focus-lock';
import type { CustomSectionId, SectionId } from '../types';
import { normalizeSectionName } from '../services/estimateSections';
import { useEstimateSections } from '../contexts/EstimateSectionsContext';

type FormState = { mode: 'add' } | { mode: 'rename'; id: CustomSectionId; initial: string };

const EstimateSectionsSettings: React.FC = () => {
  const {
    document,
    activeSections,
    allSections,
    isLoading,
    pending,
    error,
    addSection,
    renameSection,
    setArchived,
    reorderSections,
    resolveConflict,
  } = useEstimateSections();
  const [tab, setTab] = useState<'active' | 'archive'>('active');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<FormState | null>(null);
  const [label, setLabel] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [draggedId, setDraggedId] = useState<SectionId | null>(null);
  const [orderDraft, setOrderDraft] = useState<SectionId[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const archivedSections = useMemo(() => allSections.filter(section => section.archived), [allSections]);
  const activeManageableSections = useMemo(
    () => activeSections.filter(section => !section.catalogGlobal),
    [activeSections],
  );
  const orderedActiveSections = useMemo(() => {
    if (!orderDraft) return activeManageableSections;
    const byId = new Map(activeManageableSections.map(section => [section.id, section]));
    return orderDraft
      .map(id => byId.get(id))
      .filter((section): section is typeof activeManageableSections[number] => Boolean(section));
  }, [activeManageableSections, orderDraft]);
  const source = tab === 'active' ? orderedActiveSections : archivedSections;
  const normalizedSearch = normalizeSectionName(search);
  const archivedDuplicate = form?.mode === 'add'
    ? archivedSections.find(section => normalizeSectionName(section.label) === normalizeSectionName(label))
    : undefined;
  const filtered = normalizedSearch
    ? source.filter(section => normalizeSectionName(section.label).includes(normalizedSearch))
    : source;

  useEffect(() => {
    if (form) setTimeout(() => inputRef.current?.focus(), 0);
  }, [form]);

  useEffect(() => {
    const activeIds = activeManageableSections.map(section => section.id);
    setOrderDraft(current => {
      if (!current) return current;
      const next = [...current.filter(id => activeIds.includes(id)), ...activeIds.filter(id => !current.includes(id))];
      return next.length === current.length && next.every((id, index) => id === current[index]) ? current : next;
    });
  }, [activeManageableSections]);

  const openAdd = () => {
    setLabel('');
    setFormError('');
    setForm({ mode: 'add' });
  };

  const openRename = (id: CustomSectionId, initial: string) => {
    setLabel(initial);
    setFormError('');
    setForm({ mode: 'rename', id, initial });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form || saving) return;
    setSaving(true);
    setFormError('');
    try {
      if (form.mode === 'add') await addSection(label);
      else await renameSection(form.id, label);
      setForm(null);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Не удалось сохранить раздел.');
    } finally {
      setSaving(false);
    }
  };

  const move = (id: SectionId, delta: -1 | 1) => {
    const ids = [...(orderDraft ?? activeManageableSections.map(section => section.id))];
    const index = ids.indexOf(id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setOrderDraft(ids);
  };

  const dropBefore = (targetId: SectionId) => {
    if (!draggedId || draggedId === targetId) return setDraggedId(null);
    const ids = [...(orderDraft ?? activeManageableSections.map(section => section.id))];
    const from = ids.indexOf(draggedId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return setDraggedId(null);
    ids.splice(from, 1);
    ids.splice(to, 0, draggedId);
    setDraggedId(null);
    setOrderDraft(ids);
  };

  const beginOrdering = () => {
    setSearch('');
    setTab('active');
    setOrderDraft(activeManageableSections.map(section => section.id));
  };

  const finishOrdering = async () => {
    if (!orderDraft || saving) return;
    setSaving(true);
    try {
      await reorderSections(orderDraft);
      setOrderDraft(null);
    } catch {
      // The context keeps and displays the concrete persistence error.
    } finally {
      setSaving(false);
    }
  };

  const archive = async (id: CustomSectionId, label: string) => {
    if (!window.confirm(`Архивировать раздел «${label}»? Он останется в существующих сметах и справочниках.`)) return;
    await setArchived(id, true).catch(() => undefined);
  };

  return (
    <section className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Разделы смет</h1>
          <p className="mt-1 max-w-2xl text-sm text-text-secondary">
            Настройте порядок и создавайте свои разделы для работ, материалов и смет.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {orderDraft ? (
            <>
              <button type="button" disabled={saving} onClick={() => setOrderDraft(null)} className="min-h-11 rounded-lg border border-border px-4 font-semibold disabled:opacity-50">Отмена</button>
              <button type="button" disabled={saving} onClick={() => void finishOrdering()} className="min-h-11 rounded-lg bg-primary px-4 font-semibold text-white disabled:opacity-50">{saving ? 'Сохранение…' : 'Готово'}</button>
            </>
          ) : (
            <>
              <button type="button" onClick={beginOrdering} className="min-h-11 rounded-lg border border-border px-4 font-semibold text-text-primary">Изменить порядок</button>
              <button type="button" onClick={openAdd} className="min-h-11 rounded-lg bg-primary px-4 py-2 font-semibold text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary">Добавить раздел</button>
            </>
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-border bg-surface p-3 sm:flex-row sm:items-center">
        <div className="flex rounded-lg bg-background p-1" role="tablist" aria-label="Состояние разделов">
          <button type="button" role="tab" aria-selected={tab === 'active'} disabled={Boolean(orderDraft)} onClick={() => setTab('active')} className={`min-h-11 rounded-md px-4 text-sm font-semibold disabled:opacity-50 ${tab === 'active' ? 'bg-primary text-white' : 'text-text-secondary'}`}>Активные</button>
          <button type="button" role="tab" aria-selected={tab === 'archive'} disabled={Boolean(orderDraft)} onClick={() => setTab('archive')} className={`min-h-11 rounded-md px-4 text-sm font-semibold disabled:opacity-50 ${tab === 'archive' ? 'bg-primary text-white' : 'text-text-secondary'}`}>Архив</button>
        </div>
        <label className="min-w-0 flex-1">
          <span className="sr-only">Поиск разделов</span>
          <input value={search} disabled={Boolean(orderDraft)} onChange={event => setSearch(event.target.value)} placeholder={orderDraft ? 'Поиск недоступен при сортировке' : 'Найти раздел'} className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60" />
        </label>
        <span className="text-xs text-text-secondary">{pending ? 'Сохранено на устройстве · ожидает синхронизации' : typeof navigator !== 'undefined' && !navigator.onLine ? 'Сохранено на устройстве' : 'Синхронизировано'}</span>
      </div>

      {error && <div role="alert" className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
      {allSections.length > 0 && activeSections.length > 0 && (
        <span className="sr-only">Справочник разделов загружен</span>
      )}
      {document.syncConflict && (
        <div role="alert" className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="font-semibold text-amber-200">Разделы изменены на другом устройстве</div>
          <p className="mt-1 text-sm text-text-secondary">Выберите, какой вариант сохранить. Сметы и другие данные продолжают синхронизироваться.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void resolveConflict('local').catch(() => undefined)} className="min-h-11 rounded-lg bg-primary px-4 font-semibold text-white">Оставить этот вариант</button>
            <button type="button" onClick={() => void resolveConflict('remote').catch(() => undefined)} className="min-h-11 rounded-lg border border-border px-4">Принять вариант с другого устройства</button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {isLoading ? (
          <div className="p-8 text-center text-text-secondary">Загрузка разделов…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-text-secondary">
            {search ? 'По вашему запросу ничего не найдено.' : tab === 'archive' ? 'Архив пока пуст.' : 'Пользовательских разделов пока нет.'}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((section, index) => (
              <li
                key={section.id}
                draggable={Boolean(orderDraft)}
                onDragStart={() => setDraggedId(section.id)}
                onDragOver={event => event.preventDefault()}
                onDrop={() => dropBefore(section.id)}
                className={`flex min-w-0 items-center gap-2 px-3 py-3 sm:px-4 ${draggedId === section.id ? 'opacity-50' : ''}`}
              >
                {orderDraft && <span aria-hidden className="hidden cursor-grab select-none text-text-secondary sm:inline">⋮⋮</span>}
                <div className="min-w-0 flex-1">
                  <div className="break-words font-semibold text-text-primary">{section.label}</div>
                  <div className="mt-1 text-xs text-text-secondary">{section.builtIn ? 'Встроенный' : section.archived ? 'Мой · в архиве' : 'Мой'}</div>
                </div>
                {orderDraft && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" aria-label={`Поднять «${section.label}»`} disabled={index === 0} onClick={() => move(section.id, -1)} className="min-h-11 min-w-11 rounded-lg border border-border disabled:opacity-30">↑</button>
                    <button type="button" aria-label={`Опустить «${section.label}»`} disabled={index === filtered.length - 1} onClick={() => move(section.id, 1)} className="min-h-11 min-w-11 rounded-lg border border-border disabled:opacity-30">↓</button>
                  </div>
                )}
                {!orderDraft && !section.builtIn && (
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    {section.archived ? (
                      <button type="button" onClick={() => void setArchived(section.id as CustomSectionId, false).catch(() => undefined)} className="min-h-11 rounded-lg border border-border px-3 text-sm">Восстановить</button>
                    ) : (
                      <>
                        <button type="button" onClick={() => openRename(section.id as CustomSectionId, section.label)} className="min-h-11 rounded-lg border border-border px-3 text-sm">Изменить</button>
                        <button type="button" onClick={() => void archive(section.id as CustomSectionId, section.label)} className="min-h-11 rounded-lg border border-border px-3 text-sm text-text-secondary">В архив</button>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="section-form-title">
          <FocusLock returnFocus>
            <form onSubmit={submit} className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-2xl">
              <h2 id="section-form-title" className="text-lg font-bold text-text-primary">{form.mode === 'add' ? 'Новый раздел' : 'Переименовать раздел'}</h2>
              <p className="mt-1 text-sm text-text-secondary">{form.mode === 'add' ? 'В разделе будут доступны работы и материалы.' : 'Сохранённые сметы сохранят прежнее название.'}</p>
              <label className="mt-4 block text-sm font-semibold text-text-secondary">Название
                <input ref={inputRef} value={label} maxLength={80} onChange={event => setLabel(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </label>
              {formError && <p role="alert" className="mt-2 text-sm text-red-400">{formError}</p>}
              {archivedDuplicate && formError && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    setFormError('');
                    try {
                      await setArchived(archivedDuplicate.id as CustomSectionId, false);
                      setForm(null);
                      setTab('active');
                      setSearch('');
                    } catch (cause) {
                      setFormError(cause instanceof Error ? cause.message : 'Не удалось восстановить раздел.');
                    } finally {
                      setSaving(false);
                    }
                  }}
                  className="mt-3 min-h-11 rounded-lg border border-border px-3 text-sm font-semibold text-text-primary"
                >
                  Восстановить «{archivedDuplicate.label}»
                </button>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" disabled={saving} onClick={() => setForm(null)} className="min-h-11 rounded-lg border border-border px-4">Отмена</button>
                <button type="submit" disabled={saving} className="min-h-11 rounded-lg bg-primary px-4 font-semibold text-white disabled:opacity-50">{saving ? 'Сохранение…' : form.mode === 'add' ? 'Добавить' : 'Сохранить'}</button>
              </div>
            </form>
          </FocusLock>
        </div>
      )}
    </section>
  );
};

export default EstimateSectionsSettings;
