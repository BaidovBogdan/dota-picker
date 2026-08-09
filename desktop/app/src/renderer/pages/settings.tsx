import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowCounterClockwiseIcon,
  ArrowSquareOutIcon,
  CheckCircleIcon,
  EyeIcon,
  FolderOpenIcon,
  KeyboardIcon,
  MonitorIcon,
  MoonIcon,
  PowerIcon,
  Radio,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  SunIcon,
  TranslateIcon,
  WarningCircleIcon,
  XIcon,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import { desktop } from '../bridge';
import { AppSelect } from '../components/app-select';
import {
  POSITION_VALUES,
  PositionLabel,
  RANK_VALUES,
  RankIcon,
  RankLabel,
} from '../components/dota-taxonomy';
import { AsyncState, Badge, Button, Page } from '../components/ui';
import { formatDateTime, rankName } from '../format';
import { useI18n } from '../i18n';
import { useAppStore } from '../store';
import type { Language, Preferences, ThemeMode } from '../types';

type ShortcutFeedback =
  | 'idle'
  | 'recording'
  | 'saving'
  | 'success'
  | 'invalid'
  | 'conflict'
  | 'error';

type UpdateCheckFeedback = 'idle' | 'checking' | 'current' | 'unsupported' | 'error';

const modifierKeys = new Set([
  'Alt',
  'AltGraph',
  'Control',
  'Meta',
  'OS',
  'Shift',
]);

const acceleratorByCode: Record<string, string> = {
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  Backquote: '`',
  Backslash: '\\',
  Backspace: 'Backspace',
  BracketLeft: '[',
  BracketRight: ']',
  CapsLock: 'Capslock',
  Comma: ',',
  Delete: 'Delete',
  End: 'End',
  Enter: 'Return',
  Equal: '=',
  Escape: 'Escape',
  Home: 'Home',
  Insert: 'Insert',
  MediaPlayPause: 'MediaPlayPause',
  MediaStop: 'MediaStop',
  Minus: '-',
  NumpadAdd: 'numadd',
  NumpadDecimal: 'numdec',
  NumpadDivide: 'numdiv',
  NumpadEnter: 'Return',
  NumpadMultiply: 'nummult',
  NumpadSubtract: 'numsub',
  NumLock: 'Numlock',
  PageDown: 'PageDown',
  PageUp: 'PageUp',
  Period: '.',
  PrintScreen: 'PrintScreen',
  ScrollLock: 'Scrolllock',
  Semicolon: ';',
  Slash: '/',
  Space: 'Space',
  Tab: 'Tab',
};

function keyForEvent(event: KeyboardEvent): string | null {
  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3);
  if (/^Digit[0-9]$/.test(event.code)) return event.code.slice(5);
  if (/^F([1-9]|1\d|2[0-4])$/.test(event.code)) return event.code;
  if (/^Numpad[0-9]$/.test(event.code)) return `num${event.code.slice(6)}`;
  if (event.code === 'Quote') return event.shiftKey ? '"' : null;
  if (acceleratorByCode[event.code]) return acceleratorByCode[event.code];
  if (event.key === 'AudioVolumeUp') return 'VolumeUp';
  if (event.key === 'AudioVolumeDown') return 'VolumeDown';
  if (event.key === 'AudioVolumeMute') return 'VolumeMute';
  if (event.key === 'MediaTrackNext') return 'MediaNextTrack';
  if (event.key === 'MediaTrackPrevious') return 'MediaPreviousTrack';
  return null;
}

function acceleratorForEvent(event: KeyboardEvent): string | null {
  const key = keyForEvent(event);
  if (!key) return null;
  const modifiers: string[] = [];
  if (event.getModifierState('AltGraph')) modifiers.push('AltGr');
  else {
    if (event.ctrlKey) modifiers.push('Control');
    if (event.altKey) modifiers.push('Alt');
  }
  if (event.shiftKey) modifiers.push('Shift');
  if (event.metaKey) modifiers.push('Super');
  return [...modifiers, key].join('+');
}

function formatShortcut(shortcut: string, platform: string | undefined): string {
  const labels: Record<string, string> = {
    CommandOrControl: platform === 'darwin' ? 'Cmd' : 'Ctrl',
    Command: 'Cmd',
    Control: 'Ctrl',
    Alt: 'Alt',
    AltGr: 'AltGr',
    Shift: 'Shift',
    Super: platform === 'darwin' ? 'Cmd' : 'Win',
    Return: 'Enter',
    Escape: 'Esc',
    PageUp: 'PgUp',
    PageDown: 'PgDn',
    Space: 'Space',
  };
  return shortcut
    .split('+')
    .map((part) => labels[part] ?? part.replace(/^num/, 'Num '))
    .join(' + ');
}

function errorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    if (typeof error.code === 'string') return error.code;
  }
  if (error instanceof Error) return /^\[([A-Z0-9_]+)]\s/.exec(error.message)?.[1] ?? null;
  return null;
}

export function SettingsPage() {
  const preferences = useAppStore((state) => state.preferences);
  const engine = useAppStore((state) => state.engine);
  const updateState = useAppStore((state) => state.update);
  const setPreferences = useAppStore((state) => state.setPreferences);
  const setEngine = useAppStore((state) => state.setEngine);
  const { language, text } = useI18n();
  const [recordingShortcut, setRecordingShortcut] = useState(false);
  const [shortcutFeedback, setShortcutFeedback] = useState<ShortcutFeedback>('idle');
  const [updateCheckFeedback, setUpdateCheckFeedback] = useState<UpdateCheckFeedback>('idle');
  const [updateCheckCoolingDown, setUpdateCheckCoolingDown] = useState(false);
  const infoQuery = useQuery({
    queryKey: ['app-info'],
    queryFn: desktop.app.getInfo,
    staleTime: Infinity,
  });
  const shortcutQuery = useQuery({
    queryKey: ['overlay-shortcut'],
    queryFn: desktop.shortcuts.getOverlay,
    staleTime: 30_000,
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
  const shortcutMutation = useMutation({
    mutationFn: desktop.shortcuts.setOverlay,
    onMutate: () => setShortcutFeedback('saving'),
    onSuccess: (status) => {
      const current = useAppStore.getState().preferences;
      if (current) setPreferences({ ...current, overlayShortcut: status.shortcut });
      setShortcutFeedback(status.available ? 'success' : 'conflict');
      void shortcutQuery.refetch();
    },
    onError: (error) => {
      const code = errorCode(error);
      if (code === 'INVALID_OVERLAY_SHORTCUT') setShortcutFeedback('invalid');
      else if (code === 'OVERLAY_SHORTCUT_UNAVAILABLE') setShortcutFeedback('conflict');
      else setShortcutFeedback('error');
    },
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
  const revokeOverwolfMutation = useMutation({
    mutationFn: async () => {
      const current = useAppStore.getState().preferences;
      if (engine?.enabled && current?.assistantMode === 'overwolf') {
        setEngine(await desktop.engine.setEnabled(false));
      }
      return desktop.preferences.update({
        ...(current?.assistantMode === 'overwolf' ? { assistantEnabled: false } : {}),
        overwolfConsent: { accepted: false, acceptedAt: null },
      });
    },
    onSuccess: setPreferences,
  });
  const updateCheckMutation = useMutation({
    mutationFn: desktop.updates.check,
    onMutate: () => setUpdateCheckFeedback('checking'),
    onSuccess: (nextUpdate) => {
      setUpdateCheckFeedback(
        !nextUpdate.supported
          ? 'unsupported'
          : nextUpdate.availableVersion
            ? 'idle'
            : 'current',
      );
    },
    onError: () => setUpdateCheckFeedback('error'),
    onSettled: () => setUpdateCheckCoolingDown(true),
  });

  const setOverlayShortcut = shortcutMutation.mutate;
  useEffect(() => {
    if (!recordingShortcut) return undefined;
    let pendingShortcut: { code: string; accelerator: string } | null = null;
    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      if (modifierKeys.has(event.key)) return;
      const accelerator = acceleratorForEvent(event);
      if (!accelerator) {
        setShortcutFeedback('invalid');
        return;
      }
      pendingShortcut = { code: event.code, accelerator };
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!pendingShortcut || event.code !== pendingShortcut.code) return;
      const { accelerator } = pendingShortcut;
      pendingShortcut = null;
      setRecordingShortcut(false);
      setOverlayShortcut(accelerator);
    };
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
    };
  }, [recordingShortcut, setOverlayShortcut]);

  useEffect(() => {
    if (updateCheckFeedback !== 'current' && updateCheckFeedback !== 'error') return undefined;
    const timeout = window.setTimeout(() => setUpdateCheckFeedback('idle'), 5_000);
    return () => window.clearTimeout(timeout);
  }, [updateCheckFeedback]);

  useEffect(() => {
    if (!updateCheckCoolingDown) return undefined;
    const timeout = window.setTimeout(() => setUpdateCheckCoolingDown(false), 2_500);
    return () => window.clearTimeout(timeout);
  }, [updateCheckCoolingDown]);

  const updateBusy = updateState
    ? ['downloading', 'downloaded', 'installing'].includes(updateState.status)
    : false;
  const updateChecking = updateCheckMutation.isPending || updateState?.status === 'checking';
  const updateCheckDisabled = !updateState
    || !updateState.supported
    || updateBusy
    || updateChecking
    || updateCheckCoolingDown;
  const updateCheckLabel = updateChecking
    ? text('Проверяем…', 'Checking…')
    : updateBusy
      ? text('Обновление выполняется', 'Update in progress')
      : updateCheckFeedback === 'error'
        ? text('Повторить проверку', 'Try again')
        : updateCheckFeedback === 'unsupported' || updateState?.supported === false
          ? text('Недоступно в этой сборке', 'Unavailable in this build')
          : updateState?.availableVersion || updateCheckFeedback === 'current'
            ? text('Проверить снова', 'Check again')
            : text('Проверить обновления', 'Check for updates');
  const updateCheckDetail = updateCheckFeedback === 'error'
    ? text('Не удалось подключиться к серверу обновлений', 'Could not reach the update server')
    : updateState?.availableVersion
      ? text(
          `Версия ${updateState.availableVersion} готова к загрузке`,
          `Version ${updateState.availableVersion} is ready to download`,
        )
      : updateCheckFeedback === 'current'
        ? text('Новых версий нет', 'No newer version found')
        : null;

  if (!preferences) {
    return (
      <main className="page" id="main-content">
        <AsyncState
          status="loading"
          title={text('Загружаем настройки', 'Loading settings')}
        />
      </main>
    );
  }

  const rankOptions = [
    {
      value: 'all',
      label: text('Все ранги', 'All ranks'),
      description: text('Общий срез', 'Overall sample'),
      icon: <RankIcon rank={null} />,
    },
    ...RANK_VALUES.map((rank) => ({
      value: String(rank),
      label: rankName(rank, language),
      icon: <RankIcon rank={rank} />,
    })),
  ];
  const currentShortcutAvailable = shortcutQuery.data?.available !== false;
  const shortcutStatus = recordingShortcut
    ? text('Нажмите клавишу или сочетание. Нажмите кнопку ещё раз для отмены.', 'Press a key or combination. Press the button again to cancel.')
    : shortcutFeedback === 'saving'
      ? text('Проверяем и сохраняем сочетание…', 'Checking and saving the shortcut…')
      : shortcutFeedback === 'success'
        ? text('Сочетание сохранено и уже работает.', 'Shortcut saved and active now.')
        : shortcutFeedback === 'invalid'
          ? text('Эта клавиша не поддерживается Electron.', 'This key is not supported by Electron.')
          : shortcutFeedback === 'conflict'
            ? text('Сочетание занято. Предыдущий бинд продолжает работать.', 'Shortcut is in use. Your previous binding still works.')
            : shortcutFeedback === 'error'
              ? text('Не удалось сохранить сочетание. Попробуйте ещё раз.', 'Could not save the shortcut. Try again.')
              : !currentShortcutAvailable
                ? text('Текущий бинд недоступен. Запишите другой.', 'The current binding is unavailable. Record another one.')
                : text('Работает глобально, даже когда Counterpick свёрнут.', 'Works globally, even when Counterpick is minimized.');
  const shortcutTone = shortcutFeedback === 'invalid'
    || shortcutFeedback === 'conflict'
    || shortcutFeedback === 'error'
    || (!currentShortcutAvailable && shortcutFeedback === 'idle')
    ? 'error'
    : shortcutFeedback === 'success'
      ? 'success'
      : recordingShortcut || shortcutFeedback === 'saving'
        ? 'active'
        : 'neutral';

  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    updateMutation.mutate({ [key]: value } as Pick<Preferences, K>);
  };
  const beginRecording = () => {
    shortcutMutation.reset();
    setShortcutFeedback('recording');
    setRecordingShortcut(true);
  };
  const cancelRecording = () => {
    setRecordingShortcut(false);
    setShortcutFeedback('idle');
  };

  return (
    <Page
      title={text('Настройки ассистента', 'Assistant settings')}
      description={text(
        'Настройте драфт, интерфейс и управление overlay. Изменения применяются сразу.',
        'Configure the draft, interface, and overlay controls. Changes apply immediately.',
      )}
      actions={
        updateMutation.isPending || shortcutMutation.isPending ? (
          <Badge tone="teal">{text('Сохраняем', 'Saving')}</Badge>
        ) : updateMutation.isError ? (
          <Badge tone="danger">{text('Не сохранено', 'Not saved')}</Badge>
        ) : updateMutation.isSuccess || shortcutFeedback === 'success' ? (
          <Badge tone="success">
            <CheckCircleIcon size={14} weight="duotone" aria-hidden />
            {text('Сохранено', 'Saved')}
          </Badge>
        ) : null
      }
      className="settings-page"
    >
      <section className="settings-grid" data-reveal>
        <section className="settings-panel" aria-labelledby="draft-settings-title">
          <header className="settings-panel__heading">
            <div>
              <h2 id="draft-settings-title">{text('Драфт и интерфейс', 'Draft and interface')}</h2>
              <p>{text('Основные параметры для рекомендаций и внешнего вида', 'Core recommendation and appearance preferences')}</p>
            </div>
            <SlidersHorizontalIcon size={20} weight="duotone" aria-hidden />
          </header>
          <div className="settings-group">
            <div className="settings-group__copy">
              <strong>{text('Позиция', 'Position')}</strong>
              <small>
                <PositionLabel position={preferences.position} variant="compact" />
              </small>
            </div>
            <div
              className="compact-options compact-options--five"
              role="group"
              aria-label={text('Позиция', 'Position')}
            >
              {POSITION_VALUES.map((value) => (
                <button
                  type="button"
                  key={value}
                  className={preferences.position === value ? 'is-active' : ''}
                  aria-pressed={preferences.position === value}
                  aria-label={text(`Позиция ${value}`, `Position ${value}`)}
                  onClick={() => update('position', value)}
                >
                  <PositionLabel position={value} variant="icon" />
                </button>
              ))}
            </div>
          </div>
          <div className="settings-group">
            <div className="settings-group__copy">
              <strong>{text('Ранг для меты', 'Meta rank')}</strong>
              <small>
                <RankLabel rank={preferences.rank} variant="compact" />
              </small>
            </div>
            <AppSelect
              className="settings-rank-select"
              label={text('Ранг для меты', 'Meta rank')}
              value={preferences.rank ? String(preferences.rank) : 'all'}
              options={rankOptions}
              onValueChange={(value) => update('rank', value === 'all' ? null : Number(value))}
            />
          </div>
          <div className="settings-group settings-group--stacked">
            <div className="settings-group__copy">
              <strong>{text('Тема', 'Theme')}</strong>
              <small>{text('Системная тема следует настройкам Windows', 'System theme follows Windows')}</small>
            </div>
            <div className="theme-options" role="group" aria-label={text('Тема', 'Theme')}>
              {[
                { value: 'system', label: text('Системная', 'System'), icon: MonitorIcon },
                { value: 'light', label: text('Светлая', 'Light'), icon: SunIcon },
                { value: 'dark', label: text('Тёмная', 'Dark'), icon: MoonIcon },
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
          <div className="settings-group settings-group--stacked settings-language">
            <div className="settings-group__copy">
              <strong>{text('Язык', 'Language')}</strong>
              <small>{text('Один язык для приложения и overlay', 'One language for the app and overlay')}</small>
            </div>
            <div className="language-options" role="group" aria-label={text('Язык', 'Language')}>
              {([
                { value: 'ru', label: 'Русский' },
                { value: 'en', label: 'English' },
              ] as const).map(({ value, label }) => (
                <button
                  type="button"
                  key={value}
                  className={preferences.language === value ? 'is-active' : ''}
                  aria-pressed={preferences.language === value}
                  onClick={() => update('language', value as Language)}
                >
                  <TranslateIcon size={15} weight="duotone" aria-hidden />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="settings-note">
            {text(
              'Matchup рассчитывается по rolling all-ranks. Выбранный ранг меняет только мета-срез и каталог.',
              'Matchups use the rolling all-ranks sample. The selected rank only changes the meta slice and catalog.',
            )}
          </p>
        </section>

        <section className="settings-panel privacy-panel" aria-labelledby="system-settings-title">
          <header className="settings-panel__heading">
            <div>
              <h2 id="system-settings-title">{text('Система и приватность', 'System and privacy')}</h2>
              <p>{text('Фоновая работа, overlay и доступ к окну Dota 2', 'Background behavior, overlay, and Dota 2 window access')}</p>
            </div>
            <ShieldCheckIcon size={20} weight="duotone" aria-hidden />
          </header>
          <div className="hotkey-setting">
            <span className="hotkey-setting__icon" aria-hidden>
              <KeyboardIcon size={19} weight="duotone" />
            </span>
            <div className="hotkey-setting__body">
              <strong>{text('Показать или скрыть overlay', 'Show or hide overlay')}</strong>
              <div className="hotkey-setting__controls">
                <button
                  type="button"
                  className={`hotkey-recorder${recordingShortcut ? ' is-recording' : ''}`}
                  disabled={shortcutMutation.isPending}
                  aria-pressed={recordingShortcut}
                  aria-describedby="overlay-shortcut-status"
                  title={preferences.overlayShortcut}
                  onClick={recordingShortcut ? cancelRecording : beginRecording}
                >
                  {recordingShortcut ? (
                    <>
                      <span>{text('Ждём ввод', 'Listening')}</span>
                      <XIcon size={14} weight="bold" aria-hidden />
                    </>
                  ) : (
                    <kbd>{formatShortcut(preferences.overlayShortcut, infoQuery.data?.platform)}</kbd>
                  )}
                </button>
                <button
                  type="button"
                  className="hotkey-reset"
                  disabled={
                    shortcutMutation.isPending
                    || recordingShortcut
                    || (preferences.overlayShortcut === 'PageUp' && currentShortcutAvailable)
                  }
                  title={text('Вернуть стандартный бинд PageUp', 'Restore the default PageUp binding')}
                  onClick={() => shortcutMutation.mutate('PageUp')}
                >
                  <ArrowCounterClockwiseIcon size={14} weight="bold" aria-hidden />
                  {text('Вернуть PgUp', 'Restore PgUp')}
                </button>
              </div>
              <small
                id="overlay-shortcut-status"
                className={`hotkey-setting__status is-${shortcutTone}`}
                role={shortcutTone === 'error' ? 'alert' : 'status'}
                aria-live="polite"
              >
                {shortcutTone === 'error' ? <WarningCircleIcon size={13} weight="fill" aria-hidden /> : null}
                {shortcutTone === 'success' ? <CheckCircleIcon size={13} weight="fill" aria-hidden /> : null}
                {shortcutStatus}
              </small>
            </div>
          </div>
          <SettingToggle
            icon={<PowerIcon size={18} weight="duotone" />}
            title={text('Запускать вместе с Windows', 'Start with Windows')}
            description={text('Counterpick будет ждать Dota в системном трее', 'Counterpick will wait for Dota in the system tray')}
            checked={preferences.startWithWindows}
            onChange={(value) => update('startWithWindows', value)}
          />
          <SettingToggle
            icon={<EyeIcon size={18} weight="duotone" />}
            title={text('Сворачивать в трей', 'Minimize to tray')}
            description={text('Закрытие окна не останавливает ассистента', 'Closing the window does not stop the assistant')}
            checked={preferences.minimizeToTray}
            onChange={(value) => update('minimizeToTray', value)}
          />
          <SettingToggle
            icon={<ShieldCheckIcon size={18} weight="duotone" />}
            title={text('Помогать находить ошибки', 'Help diagnose problems')}
            description={text(
              'Отправлять безопасные технические события, связанные с ID аккаунта Counterpick',
              'Send privacy-safe technical events linked to your Counterpick account ID',
            )}
            checked={preferences.diagnosticsConsent.accepted}
            onChange={(accepted) => update('diagnosticsConsent', {
              accepted,
              acceptedAt: accepted ? new Date().toISOString() : null,
              version: accepted ? 1 : null,
            })}
          />
          <p className="privacy-panel__note">
            {text(
              'Только с вашего разрешения сервер связывает события с ID аккаунта Counterpick и получает платформу, версию и сборку приложения, режим ассистента, случайные ID диагностической сессии, события и анализа, время, этап, статус и длительность обработки, номер ревизии, решение и расстояние проверки изменений, причины ожидания, ID распознанных и рекомендованных героев, сторону, слот, confidence, модель, признак ручной проверки, состояние overlay, количество пиков и безопасный код ошибки. Для диагностики overlay также передаются ID и слоты героев, которые действительно были видны в overlay, необходимость определения стороны, источник определения и группа союзников слева или справа. Скриншоты, имена игроков, Steam ID, токены, сырой GSI, изображения, пути, тексты и stack trace ошибок не отправляются. Сервер хранит события не более 30 дней. Выключение сразу удаляет неотправленную очередь и прекращает будущую отправку; локальный журнал остаётся на этом устройстве.',
              'Only with your permission, the server links events to your Counterpick account ID and receives the platform, app version and build, assistant mode, random diagnostic session, event, and analysis IDs, processing time, stage, status, and duration, revision, change-check decision and distance, waiting reasons, recognized and recommended hero IDs, side, slot, confidence, model, review flag, overlay state, pick count, and a safe error code. Overlay diagnostics also include the hero IDs and slots actually visible in the overlay, whether orientation was required, its source, and the left or right ally group. Screenshots, player names, Steam IDs, tokens, raw GSI, images, file paths, error text, and stack traces are never sent. Server events are retained for no more than 30 days. Turning this off immediately deletes the unsent queue and stops future uploads; the local log remains on this device.',
            )}
          </p>
          <Button variant="secondary" onClick={() => desktop.app.openLocalLogs()}>
            <FolderOpenIcon size={16} weight="duotone" aria-hidden />
            {text('Открыть папку локальных логов', 'Open local log folder')}
          </Button>
          <div className="privacy-panel__status">
            <span className={preferences.captureConsent.accepted ? 'is-accepted' : ''}>
              <ShieldCheckIcon size={19} weight="duotone" aria-hidden />
            </span>
            <div>
              <strong>
                {preferences.captureConsent.accepted
                  ? text('Draft Vision разрешён', 'Draft Vision allowed')
                  : text('Draft Vision не разрешён', 'Draft Vision not allowed')}
              </strong>
              <small>
                {preferences.captureConsent.acceptedAt
                  ? text(
                    `Принято ${formatDateTime(preferences.captureConsent.acceptedAt, language)}`,
                    `Accepted ${formatDateTime(preferences.captureConsent.acceptedAt, language)}`,
                  )
                  : text(
                    'Кадр окна и локальный GSI-сигнал не используются',
                    'Window frames and the local GSI signal are not used',
                  )}
              </small>
            </div>
            {preferences.captureConsent.accepted ? (
              <Button
                variant="secondary"
                loading={revokeMutation.isPending}
                onClick={() => revokeMutation.mutate()}
              >
                {text('Отозвать', 'Revoke')}
              </Button>
            ) : null}
          </div>
          <p className="privacy-panel__note">
            {text(
              'Draft Vision использует кадр окна Dota 2 и локальный GSI. Кадр уходит в API, когда изображение окна существенно изменилось, чтобы проверить новые пики; одинаковые кадры не отправляются. Сервер обрабатывает кадр в памяти и сначала сопоставляет портреты локально; при низкой уверенности выделенная область драфта может уйти настроенному внешнему провайдеру распознавания. Исходник не хранится. Из GSI Counterpick оставляет фазу, команду и ID/имя выбранного локальным игроком героя. Исходные ID/имя героя остаются в памяти, не отправляются и не сохраняются; вместе с кадром уходят вычисленная сторона визуальной группы и метка источника. Остальные поля сразу отбрасываются. Доступ к памяти игры не используется.',
              'Draft Vision uses a Dota 2 window frame and local GSI. A frame goes to the API when the window image changes substantially so it can check for new picks; identical frames are not sent. The server processes the frame in memory and first matches portraits locally; when confidence is low, the extracted draft region may go to the configured external recognition provider. The source image is not stored. Counterpick keeps GSI phase, team, and the local selected hero ID/name. The raw hero ID/name stay in memory and are not sent or stored; only the derived visual-group side and source label accompany the frame. All other fields are discarded immediately. Game memory is not accessed.',
            )}
          </p>
          <div className="privacy-panel__status">
            <span className={preferences.overwolfConsent.accepted ? 'is-accepted' : ''}>
              <Radio size={19} weight="duotone" aria-hidden />
            </span>
            <div>
              <strong>
                {preferences.overwolfConsent.accepted
                  ? text('Overwolf Live разрешён', 'Overwolf Live allowed')
                  : text('Overwolf Live не разрешён', 'Overwolf Live not allowed')}
              </strong>
              <small>
                {preferences.overwolfConsent.acceptedAt
                  ? text(
                      `Принято ${formatDateTime(preferences.overwolfConsent.acceptedAt, language)}`,
                      `Accepted ${formatDateTime(preferences.overwolfConsent.acceptedAt, language)}`,
                    )
                  : text('Локальный companion не подключается', 'The local companion does not connect')}
              </small>
            </div>
            {preferences.overwolfConsent.accepted ? (
              <Button
                variant="secondary"
                loading={revokeOverwolfMutation.isPending}
                onClick={() => revokeOverwolfMutation.mutate()}
              >
                {text('Отозвать', 'Revoke')}
              </Button>
            ) : null}
          </div>
          <p className="privacy-panel__note">
            {text(
              'Steam ID и имена не покидают companion. ID героев, стороны, позиция, баны и выбранный ранг отправляются в Counterpick API для расчёта; результат сохраняется в истории. Разрешение можно отозвать здесь в любой момент.',
              'Steam IDs and names never leave the companion. Hero IDs, sides, position, bans, and selected rank are sent to the Counterpick API for calculation; the result is stored in history. You can revoke permission here at any time.',
            )}
          </p>
        </section>
      </section>

      <section className="about-strip" data-reveal>
        <div>
          <span className="about-strip__mark">
            <ShieldCheckIcon size={20} weight="duotone" aria-hidden />
          </span>
          <span>
            <strong>{infoQuery.data?.version ? `Counterpick ${infoQuery.data.version}` : 'Counterpick'}</strong>
            <small>{infoQuery.data?.platform ?? 'Windows'} · {text('ассистент драфта', 'draft assistant')}</small>
          </span>
        </div>
        <div className="about-strip__actions">
          <span className="about-strip__update-check">
            <button
              type="button"
              disabled={updateCheckDisabled}
              onClick={() => updateCheckMutation.mutate()}
            >
              <ArrowCounterClockwiseIcon
                className={updateChecking ? 'is-spinning' : undefined}
                size={14}
                aria-hidden
              />
              {updateCheckLabel}
            </button>
            <small
              role={updateCheckFeedback === 'error' ? 'alert' : 'status'}
              aria-live={updateCheckFeedback === 'error' ? 'assertive' : 'polite'}
              aria-atomic="true"
            >
              {updateCheckDetail}
            </small>
          </span>
          <button
            type="button"
            onClick={() => desktop.app.openExternal('https://github.com/BaidovBogdan/dota-picker')}
          >
            {text('Репозиторий', 'Repository')}
            <ArrowSquareOutIcon size={14} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => desktop.app.openExternal('https://github.com/BaidovBogdan/dota-picker/issues')}
          >
            {text('Сообщить о проблеме', 'Report an issue')}
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
