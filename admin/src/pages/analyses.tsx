import { useEffect, useMemo, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, MousePointer2 } from 'lucide-react';
import type { PageResource } from '../App';
import {
  Button,
  CustomSelect,
  Drawer,
  EmptyState,
  IconButton,
  Panel,
  SearchInput,
  SegmentedControl,
  StatusBadge,
  TableRowButton,
} from '../components/ui';
import { formatDateTime, formatDuration, formatNumber, formatRelativeTime } from '../lib/format';
import type { AdminAnalysesResponse, AdminAnalysis, AnalysisSource, AnalysisStatus } from '../types';

const pageSize = 12;

const statusLabel: Record<AnalysisStatus, string> = { completed: 'Готово', failed: 'Ошибка', processing: 'В процессе' };
const statusTone: Record<AnalysisStatus, 'positive' | 'negative' | 'warning'> = { completed: 'positive', failed: 'negative', processing: 'warning' };

function numberArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number') : [];
}

function recommendations(analysis: AdminAnalysis) {
  const value = analysis.result?.recommendations;
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as { hero?: { localizedName?: unknown } };
    return typeof candidate.hero?.localizedName === 'string' ? [candidate.hero.localizedName] : [];
  });
}

function inputValue(analysis: AdminAnalysis, key: string) {
  return analysis.input[key];
}

function accountLabel(analysis: AdminAnalysis) {
  return analysis.account.email ?? `Гость ${analysis.account.id.slice(0, 8)}`;
}

export function AnalysesPage({ resource, onRetry }: { resource: PageResource<AdminAnalysesResponse>; onRetry: () => void }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | AnalysisStatus>('all');
  const [source, setSource] = useState<'all' | AnalysisSource>('all');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const items = resource.data?.items ?? [];

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return items.filter((analysis) => {
      const matchesQuery = !normalized
        || analysis.id.toLowerCase().includes(normalized)
        || analysis.accountId.toLowerCase().includes(normalized)
        || analysis.account.email?.toLowerCase().includes(normalized)
        || analysis.errorCode?.toLowerCase().includes(normalized)
        || recommendations(analysis).some((hero) => hero.toLowerCase().includes(normalized));
      return matchesQuery && (status === 'all' || analysis.status === status) && (source === 'all' || analysis.source === source);
    });
  }, [items, query, source, status]);

  useEffect(() => setPage(1), [query, source, status]);
  useEffect(() => {
    if (selectedId && !items.some((analysis) => analysis.id === selectedId)) setSelectedId(null);
  }, [items, selectedId]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selected = items.find((analysis) => analysis.id === selectedId) ?? null;
  const completed = items.filter((analysis) => analysis.status === 'completed');
  const averageDuration = completed.length
    ? completed.reduce((total, analysis) => total + (analysis.durationMs ?? 0), 0) / completed.length
    : null;

  if (resource.loading && !resource.data) return <div className="page-stack" aria-busy="true"><div className="page-skeleton page-skeleton--heading" /><div className="page-skeleton page-skeleton--table" /></div>;
  if (resource.error && !resource.data) return <EmptyState title="Проверки недоступны" text={resource.error} action={<Button onClick={onRetry}>Повторить</Button>} />;
  if (!resource.data) return <EmptyState title="Нет данных" text="API не вернул проверки." action={<Button onClick={onRetry}>Обновить</Button>} />;

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div><span className="eyebrow">Журнал production-анализов</span><h1>Проверки</h1><p>{formatNumber(resource.data.pagination.total)} записей · среднее время {formatDuration(averageDuration)}</p></div>
      </header>
      {resource.error ? <div className="inline-error"><span>{resource.error}</span><button type="button" onClick={onRetry}>Повторить</button></div> : null}

      <Panel className="table-panel">
        <div className="table-toolbar">
          <SearchInput value={query} onChange={setQuery} placeholder="ID, email, герой или ошибка" ariaLabel="Поиск проверок" />
          <div className="table-toolbar__filters">
            <SegmentedControl value={status} onChange={setStatus} ariaLabel="Статус" options={[{ value: 'all', label: 'Все' }, { value: 'completed', label: 'Готово' }, { value: 'failed', label: 'Ошибки' }, { value: 'processing', label: 'Процесс' }]} />
            <CustomSelect value={source} onChange={setSource} ariaLabel="Источник" label="Источник" options={[{ value: 'all', label: 'Все источники' }, { value: 'photo', label: 'Фото' }, { value: 'manual', label: 'Вручную' }]} />
          </div>
        </div>

        {visible.length ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>ID</th><th>Пользователь</th><th>Статус</th><th>Источник</th><th>Результат</th><th>Патч</th><th>Время</th><th>Создана</th><th><span className="sr-only">Открыть</span></th></tr></thead>
              <tbody>
                {visible.map((analysis) => {
                  const heroes = recommendations(analysis);
                  return (
                    <tr key={analysis.id} onClick={() => setSelectedId(analysis.id)}>
                      <td><code className="table-id">{analysis.id.slice(0, 8)}</code></td>
                      <td><strong>{accountLabel(analysis)}</strong></td>
                      <td><StatusBadge tone={statusTone[analysis.status]}>{statusLabel[analysis.status]}</StatusBadge></td>
                      <td><span className="source-label">{analysis.source === 'photo' ? <Camera size={14} /> : <MousePointer2 size={14} />}{analysis.source === 'photo' ? 'Фото' : 'Вручную'}</span></td>
                      <td>{analysis.errorCode ? <code className="error-code">{analysis.errorCode}</code> : heroes.length ? heroes.join(', ') : '—'}</td>
                      <td>{analysis.patch ?? '—'}</td>
                      <td>{formatDuration(analysis.durationMs)}</td>
                      <td><span className="table-date">{formatRelativeTime(analysis.createdAt)}</span></td>
                      <td onClick={(event) => event.stopPropagation()}><TableRowButton label={`Открыть ${analysis.id}`} onClick={() => setSelectedId(analysis.id)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="Проверок не найдено" text={items.length ? 'Измените фильтры или запрос.' : 'В production-базе пока нет анализов.'} />}

        <footer className="table-footer"><span>{filtered.length ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filtered.length)} из ${filtered.length}` : '0 записей'}{resource.data.pagination.total > items.length ? ` · всего в базе ${resource.data.pagination.total}` : ''}</span><div><IconButton label="Предыдущая страница" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={17} /></IconButton><span>{currentPage} / {pages}</span><IconButton label="Следующая страница" disabled={currentPage === pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}><ChevronRight size={17} /></IconButton></div></footer>
      </Panel>

      <Drawer open={Boolean(selected)} title={selected ? `Проверка ${selected.id.slice(0, 8)}` : 'Проверка'} eyebrow={selected?.id} onClose={() => setSelectedId(null)}>
        {selected ? (
          <div className="analysis-drawer">
            <div className="analysis-outcome"><span>{selected.status === 'completed' ? '✓' : selected.status === 'failed' ? '!' : '…'}</span><div><small>{statusLabel[selected.status]}</small><strong>{selected.errorCode ?? (recommendations(selected).join(', ') || 'Результат формируется')}</strong><p>{accountLabel(selected)} · {formatDateTime(selected.createdAt)}</p></div></div>
            <section className="drawer-section drawer-section--details"><h3>Входные данные</h3><dl><div><dt>Позиция</dt><dd>{String(inputValue(selected, 'position') ?? '—')}</dd></div><div><dt>Ранг</dt><dd>{String(inputValue(selected, 'rank') ?? 'Не указан')}</dd></div><div><dt>Союзники</dt><dd>{numberArray(inputValue(selected, 'allyHeroIds')).join(', ') || 'Нет'}</dd></div><div><dt>Противники</dt><dd>{numberArray(inputValue(selected, 'enemyHeroIds')).join(', ') || 'Нет'}</dd></div></dl></section>
            <section className="drawer-section drawer-section--details"><h3>Технические данные</h3><dl><div><dt>Источник</dt><dd>{selected.source}</dd></div><div><dt>Патч</dt><dd>{selected.patch ?? '—'}</dd></div><div><dt>Длительность</dt><dd>{formatDuration(selected.durationMs)}</dd></div><div><dt>Обновлена</dt><dd>{formatDateTime(selected.updatedAt)}</dd></div></dl></section>
            <section className="drawer-section unavailable-actions"><div className="drawer-section__heading"><h3>Повторить проверку</h3><StatusBadge tone="warning">Нет endpoint</StatusBadge></div><p>Команда retry отключена: backend не предоставляет безопасный административный endpoint для повторного запуска.</p></section>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
