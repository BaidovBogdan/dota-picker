import type {
  AdminDiagnosticEvent,
  DiagnosticEventStatus,
  DiagnosticEventType,
  DiagnosticMode,
  DiagnosticSessionStatus,
} from '../types';

export function mergeDiagnosticEvents(current: AdminDiagnosticEvent[], incoming: AdminDiagnosticEvent[]) {
  const eventsById = new Map(current.map((event) => [event.id, event]));
  for (const event of incoming) eventsById.set(event.id, event);
  return [...eventsById.values()].sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id));
}

export const diagnosticModeLabel = (mode: DiagnosticMode) => mode === 'vision' ? 'Draft Vision' : 'Overwolf Live';

export const diagnosticSessionStatusLabel = (status: DiagnosticSessionStatus) => ({
  active: 'Активна',
  completed: 'Завершена',
  error: 'С ошибкой',
})[status];

export const diagnosticSessionStatusTone = (status: DiagnosticSessionStatus) => ({
  active: 'info',
  completed: 'positive',
  error: 'negative',
} as const)[status];

export const diagnosticEventStatusTone = (status: DiagnosticEventStatus) => ({
  info: 'info',
  success: 'positive',
  warning: 'warning',
  error: 'negative',
} as const)[status];

export const diagnosticEventLabel = (type: DiagnosticEventType) => ({
  app_started: 'Приложение запущено',
  mode_changed: 'Режим изменён',
  draft_started: 'Драфт начался',
  capture_decision: 'Решение по кадру',
  request_started: 'Запрос начат',
  request_completed: 'Запрос завершён',
  recognition_result: 'Распознавание завершено',
  overlay_state: 'Overlay обновлён',
  engine_error: 'Ошибка движка',
  draft_ended: 'Драфт завершён',
  app_stopped: 'Приложение остановлено',
})[type];

export const diagnosticWaitingReasonLabel = (reason: string) => ({
  not_dota_draft: 'Окно не похоже на драфт Dota 2',
  image_unclear: 'Изображение недостаточно чёткое',
  uncertain_picks: 'Пики распознаны неуверенно',
  insufficient_enemy_picks: 'Недостаточно вражеских пиков',
  no_enemy_picks: 'Вражеские пики ещё не появились',
})[reason] ?? reason;

export const diagnosticSessionLabel = (id: string) => `Сессия ${id.slice(0, 8)}`;
