import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  AppWindow,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock3,
  Copy,
  Eye,
  FileLock2,
  MonitorCog,
  Radio,
  ScanSearch,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import type { PageResource } from '../App';
import {
  Button,
  CustomSelect,
  EmptyState,
  IconButton,
  Panel,
  SearchInput,
  StatusBadge,
} from '../components/ui';
import {
  diagnosticEventLabel,
  diagnosticModeLabel,
  diagnosticSessionLabel,
  diagnosticSessionStatusLabel,
  diagnosticSessionStatusTone,
  diagnosticWaitingReasonLabel,
} from '../lib/diagnostics';
import { formatDateTime, formatDuration, formatRelativeTime } from '../lib/format';
import { useDebouncedValue } from '../lib/use-debounced-value';
import type {
  AdminDiagnosticEvent,
  AdminDiagnosticSessionResponse,
  AdminDiagnosticSessionsQuery,
  AdminDiagnosticSessionsResponse,
  AdminHeroMeta,
  DiagnosticMode,
  DiagnosticSessionStatus,
  HeroCatalogResponse,
} from '../types';

const pageSize = 20;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function EventIcon({ event }: { event: AdminDiagnosticEvent }) {
  if (event.status === 'error') return <AlertTriangle size={15} />;
  if (event.type === 'recognition_result') return <ScanSearch size={15} />;
  if (event.type === 'overlay_state') return <Eye size={15} />;
  if (event.type === 'app_started' || event.type === 'app_stopped') return <AppWindow size={15} />;
  if (event.type === 'capture_decision') return <MonitorCog size={15} />;
  if (event.status === 'success') return <CheckCircle2 size={15} />;
  return <CircleDot size={15} />;
}

type HeroLookup = Map<number, AdminHeroMeta>;

function DiagnosticHero({ heroId, heroes, label }: { heroId: number; heroes: HeroLookup; label?: string }) {
  const hero = heroes.get(heroId);
  return (
    <span className="diagnostic-hero">
      {hero?.iconUrl || hero?.imageUrl ? <img src={hero.iconUrl || hero.imageUrl} alt="" loading="lazy" /> : <i aria-hidden="true">#{heroId}</i>}
      <span><strong>{hero?.localizedName ?? `Герой #${heroId}`}</strong><small>{label ? `${label} · ` : ''}ID {heroId}</small></span>
    </span>
  );
}

function DetailFacts({ event }: { event: AdminDiagnosticEvent }) {
  const details = event.details;
  if (!details) return null;
  const facts: Array<{ label: string; value: string }> = [];

  if (details.revision !== undefined) facts.push({ label: 'Ревизия', value: String(details.revision) });
  if (details.operation) facts.push({ label: 'Операция', value: details.operation });
  if (details.attempt !== undefined) facts.push({ label: 'Попытка', value: String(details.attempt) });
  if (details.decision) facts.push({ label: 'Кадр', value: details.decision });
  if (details.distance !== undefined && details.distance !== null) facts.push({ label: 'Дистанция', value: String(details.distance) });
  if (details.outcome) facts.push({ label: 'Результат', value: details.outcome });
  if (details.waitingReason) facts.push({ label: 'Ожидание', value: diagnosticWaitingReasonLabel(details.waitingReason) });
  if (details.latencyMs !== undefined) facts.push({ label: 'Задержка', value: formatDuration(details.latencyMs) });
  if (details.analysisId) facts.push({ label: 'Analysis ID', value: details.analysisId });
  if (details.quality) facts.push({ label: 'Качество', value: details.quality });
  if (details.model) facts.push({ label: 'Модель', value: details.model });
  if (details.recognizedCount !== undefined) facts.push({ label: 'Распознано', value: String(details.recognizedCount) });
  if (details.needsReviewCount !== undefined) facts.push({ label: 'На проверку', value: String(details.needsReviewCount) });
  if (details.phase) facts.push({ label: 'Фаза', value: details.phase });
  if (details.pickCount !== undefined) facts.push({ label: 'Пиков', value: String(details.pickCount) });
  if (details.draftActive !== undefined) facts.push({ label: 'Драфт активен', value: details.draftActive ? 'Да' : 'Нет' });
  if (details.visibleSlots) facts.push({ label: 'Показано в overlay', value: String(details.visibleSlots.length) });
  if (details.orientationRequired !== undefined) facts.push({ label: 'Нужна ориентация', value: details.orientationRequired ? 'Да' : 'Нет' });
  if (details.orientationSource !== undefined) facts.push({ label: 'Источник стороны', value: details.orientationSource ?? 'Не определён' });
  if (details.allyGroup !== undefined) facts.push({ label: 'Группа союзников', value: details.allyGroup ?? 'Не определена' });
  if (details.mode) facts.push({ label: 'Режим', value: diagnosticModeLabel(details.mode) });
  if (details.reason) facts.push({ label: 'Причина', value: details.reason });
  if (details.consentVersion) facts.push({ label: 'Consent', value: String(details.consentVersion) });
  if (details.draftSessionId) facts.push({ label: 'Draft ID', value: details.draftSessionId });
  if (details.errorCode) facts.push({ label: 'Код ошибки', value: details.errorCode });
  if (event.type === 'engine_error' && details.stage) facts.push({ label: 'Этап ошибки', value: details.stage });

  return facts.length ? (
    <dl className="diagnostic-event__facts">
      {facts.map((fact) => <div key={`${fact.label}-${fact.value}`}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
    </dl>
  ) : null;
}

function RecognitionSlots({ event, heroes }: { event: AdminDiagnosticEvent; heroes: HeroLookup }) {
  const slots = event.details?.slots;
  if (!slots?.length) return null;
  return (
    <div className="diagnostic-slot-grid" aria-label="Распознанные слоты">
      {slots.map((slot) => (
        <article className={slot.needsReview ? 'needs-review' : ''} key={`${slot.slot}-${slot.side}-${slot.visualGroup ?? 'none'}`}>
          <header><span>Слот {slot.slot + 1}</span>{slot.needsReview ? <i>Проверить</i> : null}</header>
          {slot.heroId === null ? <strong>Герой не определён</strong> : <DiagnosticHero heroId={slot.heroId} heroes={heroes} />}
          <small>{slot.side === 'ally' ? 'Союзник' : slot.side === 'enemy' ? 'Противник' : 'Сторона неизвестна'} · {slot.visualGroup ?? 'без группы'}</small>
          <footer>{slot.confidence === null ? 'Уверенность —' : `Уверенность ${(slot.confidence * 100).toFixed(0)}%`}</footer>
        </article>
      ))}
    </div>
  );
}

function RecommendationHeroes({ event, heroes }: { event: AdminDiagnosticEvent; heroes: HeroLookup }) {
  const heroIds = event.details?.recommendationHeroIds;
  if (!heroIds?.length) return null;
  return (
    <div className="diagnostic-hero-list" aria-label="Выданные рекомендации">
      {heroIds.map((heroId, index) => <DiagnosticHero key={heroId} heroId={heroId} heroes={heroes} label={`Рекомендация ${index + 1}`} />)}
    </div>
  );
}

function OverlayVisibleSlots({ event, heroes }: { event: AdminDiagnosticEvent; heroes: HeroLookup }) {
  const slots = event.details?.visibleSlots;
  if (!slots?.length) return null;
  return (
    <div className="diagnostic-hero-list diagnostic-hero-list--overlay" aria-label="Слоты, показанные в overlay">
      {slots.map((slot) => (
        <DiagnosticHero
          key={`${slot.side}-${slot.slot}-${slot.heroId}`}
          heroId={slot.heroId}
          heroes={heroes}
          label={`Слот ${slot.slot + 1} · ${slot.side === 'ally' ? 'Союзник' : 'Противник'}`}
        />
      ))}
    </div>
  );
}

function DiagnosticTimeline({ resource, heroCatalog, onRetry, onHeroCatalogRetry, onLoadOlder }: { resource: PageResource<AdminDiagnosticSessionResponse>; heroCatalog: PageResource<HeroCatalogResponse>; onRetry: () => void; onHeroCatalogRetry: () => void; onLoadOlder: () => void }) {
  const [copiedAccountId, setCopiedAccountId] = useState<string | null>(null);
  const currentSessionId = resource.data?.session.id ?? null;
  useEffect(() => setCopiedAccountId(null), [currentSessionId]);
  if (resource.loading && !resource.data) return <div className="diagnostic-detail-skeleton" aria-busy="true"><div className="page-skeleton page-skeleton--heading" /><div className="page-skeleton page-skeleton--panel" /></div>;
  if (resource.error && !resource.data) return <EmptyState title="Timeline недоступен" text={resource.error} action={<Button onClick={onRetry}>Повторить</Button>} />;
  if (!resource.data) return <div className="diagnostic-detail-placeholder"><Radio size={24} /><h3>Выберите сессию</h3><p>Справа появятся этапы, длительности, распознанные слоты и безопасные коды ошибок.</p></div>;

  const { session, events, pagination } = resource.data;
  const hasOlderEvents = pagination.nextBeforeSequence !== null;
  const heroes = new Map((heroCatalog.data?.heroes ?? []).map((hero) => [hero.id, hero]));
  return (
    <section className={`diagnostic-detail ${resource.loading ? 'is-loading' : ''}`} aria-busy={resource.loading}>
      <header className="diagnostic-detail__header">
        <div>
          <span>Timeline · {session.id}</span>
          <h2>{diagnosticSessionLabel(session.id)}</h2>
          <p>{diagnosticModeLabel(session.mode)} · Counterpick {session.app.version} ({session.app.build})</p>
          <button
            type="button"
            className="diagnostic-account-id"
            aria-label="Скопировать полный Account ID"
            onClick={() => {
              void navigator.clipboard.writeText(session.accountId)
                .then(() => setCopiedAccountId(session.accountId))
                .catch(() => setCopiedAccountId(null));
            }}
          >
            <code>{session.accountId}</code><Copy size={12} /><em>{copiedAccountId === session.accountId ? 'Скопировано' : 'Account ID'}</em>
          </button>
        </div>
        <StatusBadge tone={diagnosticSessionStatusTone(session.status)}>{diagnosticSessionStatusLabel(session.status)}</StatusBadge>
      </header>
      {resource.error ? <div className="inline-error" role="status"><TriangleAlert size={15} /><span>{resource.error}</span><button type="button" onClick={onRetry}>Повторить</button></div> : null}
      {heroCatalog.loading && !heroCatalog.data ? <div className="diagnostic-catalog-state" role="status">Загружаем имена и портреты героев…</div> : null}
      {heroCatalog.error && !heroCatalog.data ? <div className="diagnostic-catalog-state diagnostic-catalog-state--warning" role="status"><span>Каталог героев недоступен — показываем сохранённые ID.</span><button type="button" onClick={onHeroCatalogRetry}>Повторить</button></div> : null}
      <div className="diagnostic-timeline">
        {events.length ? (
          <div className="diagnostic-timeline__pagination">
            <span role="status">{hasOlderEvents ? `Показаны последние ${events.length} из ${pagination.total} на момент открытия` : `Показаны все ${pagination.total} событий на момент открытия`}</span>
            {hasOlderEvents ? <Button onClick={onLoadOlder} disabled={resource.loading}>{resource.loading ? 'Загрузка…' : 'Загрузить более ранние'}</Button> : null}
          </div>
        ) : null}
        {events.length ? events.map((event) => (
          <article className={`diagnostic-event diagnostic-event--${event.status}`} key={event.id}>
            <div className="diagnostic-event__rail"><span><EventIcon event={event} /></span></div>
            <div className="diagnostic-event__body">
              <header>
                <div><strong>{diagnosticEventLabel(event.type)}</strong><small>#{event.sequence} · {event.stage}</small></div>
                <time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
              </header>
              {event.durationMs !== null ? <span className="diagnostic-duration"><Clock3 size={12} />{formatDuration(event.durationMs)}</span> : null}
              {event.error ? <div className="diagnostic-error"><AlertTriangle size={14} /><span><strong>{event.error.code}</strong>{event.error.recoverable ? 'Можно повторить автоматически' : 'Требуется проверка'}</span></div> : null}
              <DetailFacts event={event} />
              <RecognitionSlots event={event} heroes={heroes} />
              <RecommendationHeroes event={event} heroes={heroes} />
              <OverlayVisibleSlots event={event} heroes={heroes} />
            </div>
          </article>
        )) : <div className="diagnostic-detail-placeholder"><Radio size={22} /><h3>Событий пока нет</h3><p>Сессия существует, но privacy-safe события ещё не поступили.</p></div>}
      </div>
    </section>
  );
}

export function DiagnosticsPage({
  resource,
  detailResource,
  heroCatalog,
  initialQuery,
  selectedSessionId,
  onSelectSession,
  onQueryChange,
  onRetry,
  onDetailRetry,
  onHeroCatalogRetry,
  onLoadOlder,
}: {
  resource: PageResource<AdminDiagnosticSessionsResponse>;
  detailResource: PageResource<AdminDiagnosticSessionResponse>;
  heroCatalog: PageResource<HeroCatalogResponse>;
  initialQuery: AdminDiagnosticSessionsQuery;
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string | null) => void;
  onQueryChange: (query: AdminDiagnosticSessionsQuery) => void;
  onRetry: () => void;
  onDetailRetry: () => void;
  onHeroCatalogRetry: () => void;
  onLoadOlder: () => void;
}) {
  const [query, setQuery] = useState(() => initialQuery.q ?? '');
  const [appVersion, setAppVersion] = useState(() => initialQuery.appVersion ?? '');
  const [mode, setMode] = useState<'all' | DiagnosticMode>(() => initialQuery.mode ?? 'all');
  const [status, setStatus] = useState<'all' | DiagnosticSessionStatus>(() => initialQuery.status ?? 'all');
  const [errors, setErrors] = useState<'all' | 'yes' | 'no'>(() => initialQuery.hasErrors === undefined ? 'all' : initialQuery.hasErrors ? 'yes' : 'no');
  const [page, setPage] = useState(() => Math.floor(initialQuery.offset / pageSize) + 1);
  const debouncedQuery = useDebouncedValue(query.trim(), 280);
  const queryIsValid = !debouncedQuery || uuidPattern.test(debouncedQuery);
  const debouncedVersion = useDebouncedValue(appVersion.trim(), 280);
  const items = resource.data?.items ?? [];
  const total = resource.data?.pagination.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pages);

  useEffect(() => {
    if (!queryIsValid) return;
    onQueryChange({
      limit: pageSize,
      offset: (currentPage - 1) * pageSize,
      q: debouncedQuery || undefined,
      appVersion: debouncedVersion || undefined,
      mode: mode === 'all' ? undefined : mode,
      status: status === 'all' ? undefined : status,
      hasErrors: errors === 'all' ? undefined : errors === 'yes',
    });
  }, [currentPage, debouncedQuery, debouncedVersion, errors, mode, onQueryChange, queryIsValid, status]);

  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);

  useEffect(() => {
    if (!items.length) {
      if (selectedSessionId) onSelectSession(null);
      return;
    }
    if (!selectedSessionId || !items.some((item) => item.id === selectedSessionId)) onSelectSession(items[0].id);
  }, [items, onSelectSession, selectedSessionId]);

  if (resource.loading && !resource.data) return <div className="page-stack" aria-busy="true"><div className="page-skeleton page-skeleton--heading" /><div className="page-skeleton page-skeleton--panel" /><div className="page-skeleton page-skeleton--table" /></div>;
  if (resource.error && !resource.data) return <EmptyState title="Диагностика недоступна" text={resource.error} action={<Button onClick={onRetry}>Повторить</Button>} />;
  if (!resource.data) return <EmptyState title="Нет диагностических данных" text="Backend не вернул список сессий." action={<Button onClick={onRetry}>Обновить</Button>} />;

  const filtered = Boolean(query || appVersion || mode !== 'all' || status !== 'all' || errors !== 'all');
  return (
    <div className="page-stack diagnostics-page">
      <header className="page-heading">
        <div><span className="eyebrow">Privacy-safe telemetry · хранение 30 дней</span><h1>Диагностика приложений</h1><p>Реальные этапы Draft Vision и Overwolf Live без имён, Steam ID и игровых идентификаторов; сессия связана с Counterpick Account ID.</p></div>
        <Button onClick={onRetry} disabled={resource.loading}>Обновить данные</Button>
      </header>

      <div className="diagnostic-privacy-note"><FileLock2 size={19} /><div><strong>Только явное согласие</strong><p>Здесь видны только удалённые сессии пользователей, включивших диагностику. Сессия связана только с Counterpick Account ID; локальные логи остаются на устройстве и в эту консоль не попадают.</p></div></div>
      {resource.error ? <div className="inline-error" role="status"><TriangleAlert size={16} /><span>{resource.error}</span><button type="button" onClick={onRetry}>Повторить</button></div> : null}

      <div className="diagnostic-summary-grid">
        <Panel><span><Radio size={17} /></span><div><small>Сессии</small><strong>{resource.data.summary.sessions}</strong></div></Panel>
        <Panel><span><ShieldCheck size={17} /></span><div><small>События</small><strong>{resource.data.summary.events}</strong></div></Panel>
        <Panel><span><AlertTriangle size={17} /></span><div><small>Ошибки</small><strong>{resource.data.summary.errors}</strong></div></Panel>
      </div>

      <Panel className="diagnostic-panel">
        <div className="table-toolbar diagnostic-toolbar">
          <div className="diagnostic-id-search">
            <SearchInput value={query} onChange={(value) => { setQuery(value); setPage(1); }} placeholder="Точный Session или Account UUID" ariaLabel="Поиск диагностических сессий по полному UUID" />
            {debouncedQuery && !queryIsValid ? <small role="status">Введите UUID целиком — частичный ID не отправляется.</small> : null}
          </div>
          <div className="table-toolbar__filters">
            <label className="diagnostic-version-filter"><span>Версия</span><input value={appVersion} onChange={(event) => { setAppVersion(event.target.value); setPage(1); }} placeholder="0.1.10" aria-label="Версия приложения" /></label>
            <CustomSelect value={mode} onChange={(value) => { setMode(value); setPage(1); }} ariaLabel="Режим диагностики" label="Режим" options={[{ value: 'all', label: 'Все режимы' }, { value: 'vision', label: 'Draft Vision' }, { value: 'overwolf', label: 'Overwolf Live' }]} />
            <CustomSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} ariaLabel="Статус сессии" label="Статус" options={[{ value: 'all', label: 'Все статусы' }, { value: 'active', label: 'Активные' }, { value: 'completed', label: 'Завершённые' }, { value: 'error', label: 'С ошибкой' }]} />
            <CustomSelect value={errors} onChange={(value) => { setErrors(value); setPage(1); }} ariaLabel="Наличие ошибок" label="Ошибки" options={[{ value: 'all', label: 'Все' }, { value: 'yes', label: 'Есть ошибки' }, { value: 'no', label: 'Без ошибок' }]} />
          </div>
        </div>

        {items.length ? (
          <div className="diagnostic-workspace">
            <section className={`diagnostic-session-pane ${resource.loading ? 'is-loading' : ''}`} aria-label="Список диагностических сессий" aria-busy={resource.loading}>
              <div className="diagnostic-session-list">
                {items.map((session) => (
                  <button type="button" className={session.id === selectedSessionId ? 'is-active' : ''} aria-pressed={session.id === selectedSessionId} onClick={() => onSelectSession(session.id)} key={session.id}>
                    <header><strong>{diagnosticSessionLabel(session.id)}</strong><StatusBadge tone={diagnosticSessionStatusTone(session.status)}>{diagnosticSessionStatusLabel(session.status)}</StatusBadge></header>
                    <p>{diagnosticModeLabel(session.mode)} · {session.app.platform} · {session.app.version}</p>
                    <dl><div><dt>Пользователь</dt><dd>{session.accountId.slice(0, 8)}</dd></div><div><dt>События</dt><dd>{session.eventCount}</dd></div><div><dt>Ошибки</dt><dd>{session.errorCount}</dd></div></dl>
                    <footer><span>{formatRelativeTime(session.lastEventAt)}</span><span>{formatDuration(session.durationMs)}</span></footer>
                  </button>
                ))}
              </div>
              <footer className="table-footer diagnostic-pagination">
                <span>{total ? `${resource.data.pagination.offset + 1}–${resource.data.pagination.offset + items.length} из ${total}` : '0 записей'}</span>
                <div><IconButton label="Предыдущая страница" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={17} /></IconButton><span>{currentPage} / {pages}</span><IconButton label="Следующая страница" disabled={currentPage === pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}><ChevronRight size={17} /></IconButton></div>
              </footer>
            </section>
            <DiagnosticTimeline resource={detailResource} heroCatalog={heroCatalog} onRetry={onDetailRetry} onHeroCatalogRetry={onHeroCatalogRetry} onLoadOlder={onLoadOlder} />
          </div>
        ) : <EmptyState title={filtered ? 'Сессии не найдены' : 'Удалённых сессий пока нет'} text={filtered ? 'Измените фильтры или поисковый запрос.' : 'Диагностика по умолчанию выключена. Локальные логи остаются у пользователей; здесь появятся только сессии с явным согласием.'} />}
      </Panel>
    </div>
  );
}
