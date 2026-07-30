import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowSquareOutIcon,
  CheckCircleIcon,
  EyeIcon,
  MonitorIcon,
  MoonIcon,
  PowerIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  SunIcon,
} from '@phosphor-icons/react';

import { desktop } from '../bridge';
import { AppSelect } from '../components/app-select';
import {
  POSITION_VALUES,
  PositionLabel,
  RANK_VALUES,
  RankIcon,
  RankLabel,
} from '../components/dota-taxonomy';
import { formatDateTime, rankName } from '../format';
import { AsyncState, Badge, Button, Page } from '../components/ui';
import { useAppStore } from '../store';
import type { Preferences, ThemeMode } from '../types';

const rankOptions = [
  {
    value: 'all',
    label: 'Все ранги',
    description: 'Общий срез',
    icon: <RankIcon rank={null} />,
  },
  ...RANK_VALUES.map((rank) => ({
    value: String(rank),
    label: rankName(rank),
    icon: <RankIcon rank={rank} />,
  })),
];

export function SettingsPage() {
  const preferences = useAppStore((state) => state.preferences);
  const engine = useAppStore((state) => state.engine);
  const setPreferences = useAppStore((state) => state.setPreferences);
  const setEngine = useAppStore((state) => state.setEngine);
  const infoQuery = useQuery({
    queryKey: ['app-info'],
    queryFn: desktop.app.getInfo,
    staleTime: Infinity,
  });

  const updateMutation = useMutation({
    mutationFn: (patch: Partial<Preferences>) => desktop.preferences.update(patch),
    scope: { id: 'preferences-update' },
    onMutate: (patch) => {
      const previous = useAppStore.getState().preferences;
      if (previous) setPreferences({ ...previous, ...patch });
      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) setPreferences(context.previous);
    },
    onSuccess: setPreferences,
  });
  const revokeMutation = useMutation({
    mutationFn: async () => {
      if (engine?.enabled) setEngine(await desktop.engine.setEnabled(false));
      return desktop.preferences.update({
        assistantEnabled: false,
        captureConsent: { accepted: false, acceptedAt: null },
      });
    },
    onSuccess: setPreferences,
  });

  if (!preferences) {
    return (
      <main className="page" id="main-content">
        <AsyncState status="loading" title="Загружаем настройки" />
      </main>
    );
  }

  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    updateMutation.mutate({ [key]: value } as Pick<Preferences, K>);
  };

  return (
    <Page
      title="Настройки ассистента"
      description="Задайте роль один раз. Во время драфта Counterpick использует эти значения автоматически."
      actions={
        updateMutation.isPending ? (
          <Badge tone="teal">Сохраняем</Badge>
        ) : updateMutation.isSuccess ? (
          <Badge tone="success">
            <CheckCircleIcon size={14} weight="duotone" aria-hidden />
            Сохранено
          </Badge>
        ) : null
      }
      className="settings-page"
    >
      <section className="settings-grid" data-reveal>
        <section className="settings-panel" aria-labelledby="draft-settings-title">
          <header className="settings-panel__heading">
            <div>
              <h2 id="draft-settings-title">Драфт и интерфейс</h2>
              <p>Параметры, которые применяются без лишних вопросов</p>
            </div>
            <SlidersHorizontalIcon size={20} weight="duotone" aria-hidden />
          </header>
          <div className="settings-group">
            <div className="settings-group__copy">
              <strong>Позиция</strong>
              <small>
                <PositionLabel position={preferences.position} variant="compact" />
              </small>
            </div>
            <div className="compact-options compact-options--five" aria-label="Позиция">
              {POSITION_VALUES.map((value) => (
                <button
                  type="button"
                  key={value}
                  className={preferences.position === value ? 'is-active' : ''}
                  aria-pressed={preferences.position === value}
                  aria-label={`Позиция ${value}`}
                  onClick={() => update('position', value)}
                >
                  <PositionLabel position={value} variant="icon" />
                </button>
              ))}
            </div>
          </div>
          <div className="settings-group">
            <div className="settings-group__copy">
              <strong>Ранг для меты</strong>
              <small>
                <RankLabel rank={preferences.rank} variant="compact" />
              </small>
            </div>
            <AppSelect
              className="settings-rank-select"
              label="Ранг для меты"
              value={preferences.rank ? String(preferences.rank) : 'all'}
              options={rankOptions}
              onValueChange={(value) =>
                update('rank', value === 'all' ? null : Number(value))
              }
            />
          </div>
          <div className="settings-group settings-group--stacked">
            <div className="settings-group__copy">
              <strong>Тема</strong>
              <small>Системная подстраивается под Windows</small>
            </div>
            <div className="theme-options">
              {[
                { value: 'system', label: 'Системная', icon: MonitorIcon },
                { value: 'light', label: 'Светлая', icon: SunIcon },
                { value: 'dark', label: 'Тёмная', icon: MoonIcon },
              ].map(({ value, label, icon: Icon }) => (
                <button
                  type="button"
                  key={value}
                  className={preferences.theme === value ? 'is-active' : ''}
                  aria-pressed={preferences.theme === value}
                  onClick={() => update('theme', value as ThemeMode)}
                >
                  <Icon size={17} weight="duotone" aria-hidden />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="settings-note">
            Matchup рассчитывается по rolling all-ranks. Выбранный ранг меняет
            только мета-срез и каталог.
          </p>
        </section>

        <section className="settings-panel privacy-panel" aria-labelledby="system-settings-title">
          <header className="settings-panel__heading">
            <div>
              <h2 id="system-settings-title">Система и приватность</h2>
              <p>Фоновая работа и доступ к окну Dota 2</p>
            </div>
            <ShieldCheckIcon size={20} weight="duotone" aria-hidden />
          </header>
          <SettingToggle
            icon={<PowerIcon size={18} weight="duotone" />}
            title="Запускать вместе с Windows"
            description="Counterpick будет ждать Dota в системном трее"
            checked={preferences.startWithWindows}
            onChange={(value) => update('startWithWindows', value)}
          />
          <SettingToggle
            icon={<EyeIcon size={18} weight="duotone" />}
            title="Сворачивать в трей"
            description="Закрытие окна не останавливает ассистента"
            checked={preferences.minimizeToTray}
            onChange={(value) => update('minimizeToTray', value)}
          />
          <div className="privacy-panel__status">
            <span className={preferences.captureConsent.accepted ? 'is-accepted' : ''}>
              <ShieldCheckIcon size={19} weight="duotone" aria-hidden />
            </span>
            <div>
              <strong>
                {preferences.captureConsent.accepted
                  ? 'Разрешение предоставлено'
                  : 'Разрешение не предоставлено'}
              </strong>
              <small>
                {preferences.captureConsent.acceptedAt
                  ? `Принято ${formatDateTime(preferences.captureConsent.acceptedAt)}`
                  : 'Приложение не может делать снимки окна Dota'}
              </small>
            </div>
            {preferences.captureConsent.accepted ? (
              <Button
                variant="secondary"
                loading={revokeMutation.isPending}
                onClick={() => revokeMutation.mutate()}
              >
                Отозвать
              </Button>
            ) : null}
          </div>
          <p className="privacy-panel__note">
            Исходный снимок используется только для распознавания текущего драфта и
            не сохраняется в истории.
          </p>
        </section>
      </section>

      <section className="about-strip" data-reveal>
        <div>
          <span className="about-strip__mark">
            <ShieldCheckIcon size={20} weight="duotone" aria-hidden />
          </span>
          <span>
            <strong>Counterpick {infoQuery.data?.version ?? '0.1.0'}</strong>
            <small>{infoQuery.data?.platform ?? 'Windows'} · ассистент драфта</small>
          </span>
        </div>
        <div>
          <button
            type="button"
            onClick={() =>
              desktop.app.openExternal('https://github.com/BaidovBogdan/dota-picker')
            }
          >
            Репозиторий
            <ArrowSquareOutIcon size={14} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() =>
              desktop.app.openExternal('https://github.com/BaidovBogdan/dota-picker/issues')
            }
          >
            Сообщить о проблеме
            <ArrowSquareOutIcon size={14} aria-hidden />
          </button>
        </div>
      </section>
    </Page>
  );
}

function SettingToggle({
  icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="setting-toggle">
      <span className="setting-toggle__icon" aria-hidden>
        {icon}
      </span>
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <i aria-hidden />
    </label>
  );
}
