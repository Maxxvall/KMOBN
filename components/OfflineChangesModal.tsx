import React, { useMemo, useState } from 'react';
import type { PendingChange } from '../services/offlineQueue';
import {
  acceptServerVersionForPendingChange,
  fetchPendingChangeServerRecord,
  prepareLocalVersionForPendingChange,
} from '../services/database';

type Props = {
  isOpen: boolean;
  isOnline: boolean;
  changes: PendingChange[];
  onClose: () => void;
  onSync: () => void;
  onEditEstimate?: (estimateId: string) => void;
  onOpenTable?: (table: PendingChange['table']) => void;
};

type Comparison = {
  sequence: number;
  operationId?: string;
  serverRecord: Record<string, unknown> | null;
  loadedAt: string;
};

const TABLE_LABELS: Record<string, string> = {
  estimates: 'Смета',
  templates: 'Шаблон',
  materials: 'Материал',
  works: 'Работа',
  bundles: 'Комплект',
  estimate_sections: 'Разделы смет',
};

const getRecordLabel = (change: PendingChange): string => {
  const data = change.data && typeof change.data === 'object'
    ? change.data as Record<string, unknown>
    : null;
  const title = data?.estimateNumber ?? data?.name ?? data?.title ?? data?.client;
  return typeof title === 'string' && title.trim() ? title : change.recordId;
};

const stringify = (value: unknown): string => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const formatValue = (value: unknown): string => {
  if (value === undefined) return '—';
  if (Array.isArray(value)) return `Массив · ${value.length} эл.`;
  if (value && typeof value === 'object') return 'Объект';
  if (typeof value === 'string') return value || 'Пусто';
  return String(value);
};

const changedFields = (localValue: unknown, serverValue: unknown): Array<{ path: string; local: unknown; server: unknown }> => {
  const ignored = new Set(['serverRevision', 'last_operation_id', 'user_id', 'updated_at', 'created_at']);
  const changes: Array<{ path: string; local: unknown; server: unknown }> = [];
  const visit = (local: unknown, server: unknown, path: string) => {
    if (changes.length >= 100 || stringify(local) === stringify(server)) return;
    if (Array.isArray(local) && Array.isArray(server)) {
      for (let index = 0; index < Math.max(local.length, server.length) && changes.length < 100; index += 1) {
        visit(local[index], server[index], `${path}[${index}]`);
      }
      return;
    }
    if (local && server && typeof local === 'object' && typeof server === 'object' && !Array.isArray(local) && !Array.isArray(server)) {
      const localObject = local as Record<string, unknown>;
      const serverObject = server as Record<string, unknown>;
      for (const key of [...new Set([...Object.keys(localObject), ...Object.keys(serverObject)])]) {
        if (!ignored.has(key)) visit(localObject[key], serverObject[key], path ? `${path}.${key}` : key);
        if (changes.length >= 100) break;
      }
      return;
    }
    changes.push({ path, local, server });
  };
  visit(localValue, serverValue, '');
  return changes;
};

const formatTime = (value: string): string => new Date(value).toLocaleString('ru-RU', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});

const OfflineChangesModal: React.FC<Props> = ({ isOpen, isOnline, changes, onClose, onSync, onEditEstimate, onOpenTable }) => {
  const [comparisons, setComparisons] = useState<Record<string, Comparison>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const preparedCount = useMemo(() => changes.filter(change => !change.lastError && change.failureKind !== 'permanent').length, [changes]);

  if (!isOpen) return null;

  const compare = async (change: PendingChange) => {
    setBusyId(change.id);
    setError(null);
    setNotice(null);
    try {
      const serverRecord = await fetchPendingChangeServerRecord(change);
      setComparisons(current => ({ ...current, [change.id]: {
        sequence: change.sequence,
        operationId: change.operationId,
        serverRecord,
        loadedAt: new Date().toISOString(),
      } }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyId(null);
    }
  };

  const acceptServer = async (change: PendingChange, comparison: Comparison) => {
    const label = getRecordLabel(change);
    if (!window.confirm(`Удалить локальное изменение «${label}» и заменить его текущей версией сервера? Это действие нельзя отменить.`)) return;
    setBusyId(change.id);
    setError(null);
    setNotice(null);
    try {
      await acceptServerVersionForPendingChange(change, comparison.serverRecord);
      setComparisons(current => {
        const next = { ...current };
        delete next[change.id];
        return next;
      });
      setNotice(`Для «${label}» оставлена версия сервера. Локальное изменение удалено из очереди.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyId(null);
    }
  };

  const prepareLocal = async (change: PendingChange, comparison: Comparison) => {
    setBusyId(change.id);
    setError(null);
    setNotice(null);
    try {
      await prepareLocalVersionForPendingChange(change, comparison.serverRecord);
      setComparisons(current => {
        const next = { ...current };
        delete next[change.id];
        return next;
      });
      setNotice(`«${getRecordLabel(change)}» подготовлена к отправке поверх текущей ревизии. Нажмите «Отправить подготовленные изменения», чтобы отправить её.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-3 sm:p-6" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="offline-changes-title"
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border p-4 sm:p-5">
          <div>
            <h2 id="offline-changes-title" className="text-lg font-bold text-text-primary">Локальные изменения · {changes.length}</h2>
            <p className="mt-1 max-w-3xl text-sm text-text-secondary">
              Изменения пока хранятся на этом устройстве. Сравнение обращается к серверу только после нажатия кнопки у конкретной записи.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-white/10" aria-label="Закрыть список локальных изменений">Закрыть</button>
        </header>

        {(error || notice) && (
          <p className={`border-b border-border px-4 py-3 text-sm ${error ? 'text-red-300' : 'text-emerald-300'}`} role={error ? 'alert' : 'status'}>
            {error ?? notice}
          </p>
        )}

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-5">
          {changes.length === 0 ? (
            <p className="rounded-lg border border-border bg-background/40 p-4 text-sm text-text-secondary">Очередь локальных изменений пуста.</p>
          ) : changes.map(change => {
            const savedComparison = comparisons[change.id];
            const comparison = savedComparison?.sequence === change.sequence
              && savedComparison.operationId === change.operationId
              ? savedComparison
              : undefined;
            const localRecord = change.data && typeof change.data === 'object' ? change.data as Record<string, unknown> : null;
            const remoteRecord = comparison?.serverRecord;
            const fields = comparison ? changedFields(localRecord, remoteRecord) : [];
            const isBusy = busyId === change.id;
            const label = getRecordLabel(change);

            return (
              <article key={change.id} className="rounded-lg border border-border bg-background/35 p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words font-semibold text-text-primary">{TABLE_LABELS[change.table] ?? change.table}: {label}</h3>
                    <p className="mt-1 text-xs text-text-secondary">
                      {change.operation === 'delete' ? 'Удаление' : 'Изменение'} · {formatTime(change.timestamp)} · ревизия при сохранении: {String(change.baseRevision ?? localRecord?.serverRevision ?? 0)}
                    </p>
                    {change.lastError && <p className="mt-2 break-words text-xs text-red-300">Ошибка: {change.lastError}</p>}
                  </div>
                  {change.table === 'estimates' && change.operation === 'upsert' && onEditEstimate && (
                    <button type="button" onClick={() => onEditEstimate(change.recordId)} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-white/10">
                      Открыть в редакторе
                    </button>
                  )}
                  {['materials', 'works', 'bundles', 'estimate_sections'].includes(change.table) && onOpenTable && (
                    <button type="button" onClick={() => onOpenTable(change.table)} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-white/10">
                      Перейти к разделу
                    </button>
                  )}
                </div>

                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-semibold text-primary">Показать локальную версию</summary>
                  {change.operation === 'delete' ? (
                    <p className="mt-2 text-sm text-text-secondary">В очереди сохранено удаление этой записи.</p>
                  ) : (
                    <pre className="mt-2 max-h-72 overflow-auto rounded-md border border-border bg-black/25 p-3 text-[11px] leading-relaxed text-text-primary">{JSON.stringify(change.data, null, 2)}</pre>
                  )}
                </details>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => void compare(change)} disabled={!isOnline || isBusy} className="rounded-md border border-primary/50 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-50">
                    {isBusy ? 'Загрузка…' : comparison ? 'Обновить сравнение' : 'Сравнить с сервером'}
                  </button>
                  {comparison && (
                    <span className="text-xs text-text-secondary">Проверено {formatTime(comparison.loadedAt)}</span>
                  )}
                </div>

                {comparison && (
                  <div className="mt-4 space-y-3 border-t border-border pt-3">
                    <h4 className="text-sm font-semibold text-text-primary">Сравнение</h4>
                    {!remoteRecord ? (
                      <p className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-200">Такой записи сейчас нет на сервере. Локальный вариант можно отправить как новую запись или убрать из очереди.</p>
                    ) : fields.length === 0 ? (
                      <p className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-200">Поля записи совпадают. Проверьте ревизии: серверная {String(remoteRecord.serverRevision ?? 0)}, локальная {String(localRecord?.serverRevision ?? change.baseRevision ?? 0)}.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-md border border-border">
                        <table className="w-full min-w-[520px] text-left text-xs">
                          <thead className="bg-white/5 text-text-secondary"><tr><th className="p-2">Поле</th><th className="p-2">Локально</th><th className="p-2">На сервере</th></tr></thead>
                          <tbody>{fields.map(field => (
                            <tr key={field.path} className="border-t border-border align-top">
                              <th className="max-w-48 break-words p-2 font-medium text-text-primary">{field.path || 'Запись'}</th>
                              <td className="max-w-64 break-words p-2 text-amber-200">{formatValue(field.local)}</td>
                              <td className="max-w-64 break-words p-2 text-emerald-200">{formatValue(field.server)}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    )}
                    {remoteRecord && (
                      <details>
                        <summary className="cursor-pointer text-xs font-semibold text-text-secondary">Показать полную версию сервера</summary>
                        <pre className="mt-2 max-h-72 overflow-auto rounded-md border border-border bg-black/25 p-3 text-[11px] leading-relaxed text-text-primary">{JSON.stringify(remoteRecord, null, 2)}</pre>
                      </details>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => void prepareLocal(change, comparison)} disabled={isBusy} className="rounded-md bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/25 disabled:opacity-50">
                        Подготовить локальную версию
                      </button>
                      <button type="button" onClick={() => void acceptServer(change, comparison)} disabled={isBusy} className="rounded-md border border-red-500/40 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/10 disabled:opacity-50">
                        Оставить серверную версию
                      </button>
                    </div>
                    <p className="text-[11px] text-text-secondary">
                      «Подготовить локальную» обновит базовую ревизию; серверные данные будут заменены вашей версией при следующей ручной отправке. «Оставить серверную» удалит эту локальную правку.
                    </p>
                  </div>
                )}
              </article>
            );
          })}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4 sm:px-5">
          <p className="text-xs text-text-secondary">Можно вручную отправить подготовленные записи: {preparedCount}. Автоматический повтор не запускается.</p>
          <button type="button" onClick={onSync} disabled={!isOnline || changes.length === 0} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
            Отправить подготовленные изменения
          </button>
        </footer>
      </section>
    </div>
  );
};

export default OfflineChangesModal;
