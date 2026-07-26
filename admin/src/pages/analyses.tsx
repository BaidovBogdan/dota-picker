import { useEffect, useMemo, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  ImageOff,
  MousePointer2,
  RotateCcw,
  ScanSearch,
  Sparkles,
  Timer,
} from 'lucide-react';
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
  UserAvatar,
} from '../components/ui';
import {
  downloadCsv,
  formatDateTime,
  formatDuration,
  formatPercent,
  formatRelativeTime,
} from '../lib/format';
import type {
  AdminAnalysis,
  AdminUser,
  AnalysisSource,
  AnalysisStatus,
} from '../types';

type StatusFilter = 'all' | AnalysisStatus;
type SourceFilter = 'all' | AnalysisSource;

type AnalysesPageProps = {
  analyses: AdminAnalysis[];
  users: AdminUser[];
  selectedAnalysis: AdminAnalysis | null;
  onSelectAnalysis: (id: string) => void;
  onCloseAnalysis: () => void;
  onNotify: (message: string) => void;
};

const pageSize = 12;

const statusLabel: Record<AnalysisStatus, string> = {
  completed: 'Готово',
  failed: 'Ошибка',
  processing: 'В процессе',
};

const statusTone: Record<AnalysisStatus, 'positive' | 'negative' | 'warning'> = {
  completed: 'positive',
  failed: 'negative',
  processing: 'warning',
};

export function AnalysesPage({
  analyses,
  users,
  selectedAnalysis,
  onSelectAnalysis,
  onCloseAnalysis,
  onNotify,
}: AnalysesPageProps) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [source, setSource] = useState<SourceFilter>('all');
  const [page, setPage] = useState(1);
  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  const filteredAnalyses = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return analyses.filter((analysis) => {
      const user = usersById.get(analysis.userId);
      const matchesQuery = !normalizedQuery
        || analysis.id.toLowerCase().includes(normalizedQuery)
        || analysis.recommendation?.toLowerCase().includes(normalizedQuery)
        || analysis.errorCode?.toLowerCase().includes(normalizedQuery)
        || user?.displayName.toLowerCase().includes(normalizedQuery)
        || user?.email?.toLowerCase().includes(normalizedQuery);
      return matchesQuery
        && (status === 'all' || analysis.status === status)
        && (source === 'all' || analysis.source === source);
    });
  }, [analyses, query, source, status, usersById]);

  useEffect(() => {
    setPage(1);
  }, [query, source, status]);

  const pages = Math.max(1, Math.ceil(filteredAnalyses.length / pageSize));
  const visibleAnalyses = filteredAnalyses.slice((page - 1) * pageSize, page * pageSize);
  const completed = analyses.filter((analysis) => analysis.status === 'completed');
  const failed = analyses.filter((analysis) => analysis.status === 'failed');
  const averageDuration = completed.length
    ? completed.reduce((sum, analysis) => sum + (analysis.durationMs ?? 0), 0) / completed.length
    : 0;
  const selectedUser = selectedAnalysis ? usersById.get(selectedAnalysis.userId) ?? null : null;

  const exportAnalyses = () => {
    downloadCsv('counterpick-checks.csv', [
      ['ID', 'Пользователь', 'Статус', 'Источник', 'Рекомендация', 'Позиция', 'Патч', 'Длительность', 'Создан'],
      ...filteredAnalyses.map((analysis) => [
        analysis.id,
        usersById.get(analysis.userId)?.email ?? analysis.userId,
        analysis.status,
        analysis.source,
        analysis.recommendation ?? '',
        analysis.position,
        analysis.patch,
        analysis.durationMs ?? '',
        analysis.createdAt,
      ]),
    ]);
    onNotify('CSV проверок сохранён');
  };

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <span className="eyebrow">Результаты и качество распознавания</span>
          <h1>Проверки</h1>
          <p>Ручные и фото-анализы, завершившиеся рекомендацией.</p>
        </div>
        <Button icon={<Download size={16} />} onClick={exportAnalyses}>
          Экспорт CSV
        </Button>
      </header>

      <div className="compact-stat-grid">
        <article>
          <span className="compact-stat-grid__icon compact-stat-grid__icon--blue"><CheckCircle2 size={18} /></span>
          <div><span>Завершено</span><strong>{completed.length}</strong></div>
          <small>{formatPercent((completed.length / Math.max(1, analyses.length)) * 100, 1)}</small>
        </article>
        <article>
          <span className="compact-stat-grid__icon compact-stat-grid__icon--red"><CircleAlert size={18} /></span>
          <div><span>Ошибки</span><strong>{failed.length}</strong></div>
          <small>{formatPercent((failed.length / Math.max(1, analyses.length)) * 100, 1)}</small>
        </article>
        <article>
          <span className="compact-stat-grid__icon compact-stat-grid__icon--violet"><Timer size={18} /></span>
          <div><span>Среднее время</span><strong>{formatDuration(averageDuration)}</strong></div>
          <small>только готовые</small>
        </article>
      </div>

      <Panel className="table-panel">
        <div className="table-toolbar">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="ID, пользователь или герой"
            ariaLabel="Поиск проверок"
          />
          <div className="table-toolbar__filters">
            <SegmentedControl
              value={status}
              onChange={setStatus}
              ariaLabel="Статус проверки"
              options={[
                { value: 'all', label: 'Все' },
                { value: 'completed', label: 'Готово' },
                { value: 'failed', label: 'Ошибки' },
                { value: 'processing', label: 'В работе' },
              ]}
            />
            <CustomSelect
              value={source}
              onChange={setSource}
              ariaLabel="Источник"
              label="Источник"
              options={[
                { value: 'all', label: 'Все источники' },
                { value: 'photo', label: 'Фото' },
                { value: 'manual', label: 'Вручную' },
              ]}
            />
          </div>
        </div>

        {visibleAnalyses.length ? (
          <div className="data-table-wrap">
            <table className="data-table analyses-table">
              <thead>
                <tr>
                  <th>Проверка</th>
                  <th>Пользователь</th>
                  <th>Источник</th>
                  <th>Результат</th>
                  <th>Качество</th>
                  <th>Время</th>
                  <th>Создана</th>
                  <th><span className="sr-only">Действия</span></th>
                </tr>
              </thead>
              <tbody>
                {visibleAnalyses.map((analysis) => {
                  const user = usersById.get(analysis.userId);
                  return (
                    <tr key={analysis.id} onClick={() => onSelectAnalysis(analysis.id)}>
                      <td>
                        <div className="check-id">
                          {analysis.imageUrl ? (
                            <span className="analysis-thumbnail">
                              <img
                                src={analysis.imageUrl}
                                alt=""
                                loading="lazy"
                              />
                              <i className={`analysis-state analysis-state--${analysis.status}`} />
                            </span>
                          ) : (
                            <span className={`analysis-state analysis-state--${analysis.status}`} />
                          )}
                          <div>
                            <strong>{analysis.id}</strong>
                            <small>Патч {analysis.patch}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        {user ? (
                          <div className="table-user table-user--compact">
                            <UserAvatar name={user.displayName} size="sm" />
                            <span>
                              <strong>{user.displayName}</strong>
                              <small>{user.email ?? 'Гость'}</small>
                            </span>
                          </div>
                        ) : <span>Удалённый пользователь</span>}
                      </td>
                      <td>
                        <span className="source-cell">
                          {analysis.source === 'photo' ? <Camera size={15} /> : <MousePointer2 size={15} />}
                          {analysis.source === 'photo' ? 'Фото' : 'Вручную'}
                        </span>
                      </td>
                      <td>
                        <div className="result-cell">
                          <strong>{analysis.recommendation ?? analysis.errorCode ?? 'Обработка'}</strong>
                          <small>Позиция {analysis.position}</small>
                        </div>
                      </td>
                      <td>
                        <StatusBadge tone={statusTone[analysis.status]}>
                          {analysis.confidence
                            ? formatPercent(analysis.confidence * 100, 0)
                            : statusLabel[analysis.status]}
                        </StatusBadge>
                      </td>
                      <td><span className="table-date">{formatDuration(analysis.durationMs)}</span></td>
                      <td><span className="table-date">{formatRelativeTime(analysis.createdAt)}</span></td>
                      <td onClick={(event) => event.stopPropagation()}>
                        <TableRowButton label={`Открыть ${analysis.id}`} onClick={() => onSelectAnalysis(analysis.id)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Проверок нет"
            text="Измените запрос или сбросьте фильтры."
            action={<Button onClick={() => { setQuery(''); setStatus('all'); setSource('all'); }}>Сбросить фильтры</Button>}
          />
        )}

        <footer className="table-footer">
          <span>
            {filteredAnalyses.length
              ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filteredAnalyses.length)} из ${filteredAnalyses.length}`
              : '0 записей'}
          </span>
          <div>
            <IconButton label="Предыдущая страница" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>
              <ChevronLeft size={17} />
            </IconButton>
            <span>{page} / {pages}</span>
            <IconButton label="Следующая страница" disabled={page === pages} onClick={() => setPage((value) => value + 1)}>
              <ChevronRight size={17} />
            </IconButton>
          </div>
        </footer>
      </Panel>

      <Drawer
        open={Boolean(selectedAnalysis)}
        title={selectedAnalysis?.id ?? 'Проверка'}
        eyebrow={selectedAnalysis ? formatDateTime(selectedAnalysis.createdAt) : undefined}
        onClose={onCloseAnalysis}
      >
        {selectedAnalysis ? (
          <div className="analysis-drawer">
            <div className={`analysis-outcome analysis-outcome--${selectedAnalysis.status}`}>
              <span>
                {selectedAnalysis.status === 'completed'
                  ? <Sparkles size={22} />
                  : selectedAnalysis.status === 'failed'
                    ? <ImageOff size={22} />
                    : <Clock3 size={22} />}
              </span>
              <div>
                <small>{statusLabel[selectedAnalysis.status]}</small>
                <strong>{selectedAnalysis.recommendation ?? selectedAnalysis.errorCode ?? 'Распознаём драфт'}</strong>
                <p>
                  {selectedAnalysis.status === 'completed'
                    ? `Рекомендация для позиции ${selectedAnalysis.position}`
                    : selectedAnalysis.status === 'failed'
                      ? 'Результат не был создан, попытка возвращена.'
                      : 'Запрос ещё выполняется.'}
                </p>
              </div>
            </div>

            {selectedAnalysis.imageUrl ? (
              <section className="drawer-section analysis-image-section">
                <div className="drawer-section__heading">
                  <h3>Исходный скриншот</h3>
                  <StatusBadge tone="neutral">Фото</StatusBadge>
                </div>
                <figure className="analysis-image">
                  <img
                    src={selectedAnalysis.imageUrl}
                    alt={`Исходный скриншот драфта для проверки ${selectedAnalysis.id}`}
                  />
                  <figcaption>
                    <span>Распознано героев</span>
                    <strong>{selectedAnalysis.detectedHeroes.length}</strong>
                  </figcaption>
                </figure>
              </section>
            ) : null}

            {selectedUser ? (
              <section className="drawer-section">
                <h3>Пользователь</h3>
                <div className="drawer-user-card">
                  <UserAvatar name={selectedUser.displayName} />
                  <div><strong>{selectedUser.displayName}</strong><small>{selectedUser.email ?? selectedUser.id}</small></div>
                  <StatusBadge tone={selectedUser.plan === 'pro' ? 'info' : 'neutral'}>
                    {selectedUser.plan === 'pro' ? 'Pro' : 'Free'}
                  </StatusBadge>
                </div>
              </section>
            ) : null}

            <section className="drawer-section">
              <div className="drawer-section__heading">
                <h3>Распознанный драфт</h3>
                <span>{selectedAnalysis.detectedHeroes.length}</span>
              </div>
              <div className="hero-chip-grid">
                {selectedAnalysis.detectedHeroes.map((hero, index) => (
                  <div key={`${hero}-${index}`}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>{hero}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="drawer-section drawer-section--details">
              <h3>Технические данные</h3>
              <dl>
                <div><dt>Источник</dt><dd>{selectedAnalysis.source === 'photo' ? 'Фото' : 'Вручную'}</dd></div>
                <div><dt>Длительность</dt><dd>{formatDuration(selectedAnalysis.durationMs)}</dd></div>
                <div><dt>Уверенность</dt><dd>{selectedAnalysis.confidence ? formatPercent(selectedAnalysis.confidence * 100, 0) : '—'}</dd></div>
                <div><dt>Патч</dt><dd>{selectedAnalysis.patch}</dd></div>
                <div><dt>Модельная стоимость</dt><dd>${selectedAnalysis.costUsd.toFixed(4)}</dd></div>
                <div><dt>Ошибка</dt><dd>{selectedAnalysis.errorCode ?? '—'}</dd></div>
              </dl>
            </section>

            {selectedAnalysis.status === 'failed' ? (
              <Button
                className="drawer-wide-button"
                icon={<RotateCcw size={16} />}
                onClick={() => onNotify('Повторная проверка поставлена в очередь')}
              >
                Повторить проверку
              </Button>
            ) : (
              <Button
                className="drawer-wide-button"
                icon={<ScanSearch size={16} />}
                onClick={() => onNotify('Технический JSON скопирован')}
              >
                Скопировать технический JSON
              </Button>
            )}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
