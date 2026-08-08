import type { AssistantMode } from './contracts.js';

const navigationModes: Partial<Record<string, AssistantMode>> = {
  ArrowLeft: 'vision',
  ArrowUp: 'vision',
  Home: 'vision',
  ArrowRight: 'overwolf',
  ArrowDown: 'overwolf',
  End: 'overwolf',
};

export function resolveAssistantModeNavigation(key: string): AssistantMode | null {
  return navigationModes[key] ?? null;
}

export function assistantModeOptionA11y(
  option: AssistantMode,
  selected: AssistantMode,
  blocked: boolean,
) {
  return {
    'aria-checked': option === selected,
    'aria-disabled': blocked,
    tabIndex: option === selected ? 0 : -1,
  } as const;
}

export function focusAssistantModeOption(
  root: ParentNode | null,
  mode: AssistantMode,
): void {
  root
    ?.querySelector<HTMLElement>(`[data-assistant-mode="${mode}"]`)
    ?.focus();
}
