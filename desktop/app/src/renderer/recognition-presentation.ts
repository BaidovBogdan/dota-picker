import type { EngineState, Preferences } from '../shared/contracts';

type RecognizedPick = NonNullable<EngineState['recognition']>['recognized'][number];

export function recognitionPickKey(pick: RecognizedPick): string {
  return [
    pick.side,
    pick.visualGroup ?? 'none',
    pick.slot,
    pick.heroId ?? 'none',
  ].join(':');
}

export function recognitionSideLabel(
  pick: RecognizedPick,
  language: Preferences['language'],
): string {
  if (pick.side === 'ally') return language === 'en' ? 'Ally' : 'Союзник';
  if (pick.side === 'enemy') return language === 'en' ? 'Enemy' : 'Противник';
  if (!pick.visualGroup) return language === 'en' ? 'Side unknown' : 'Сторона не определена';
  const group = language === 'en'
    ? pick.visualGroup === 'left' ? 'left group' : 'right group'
    : pick.visualGroup === 'left' ? 'слева' : 'справа';
  return language === 'en' ? `Side unknown · ${group}` : `Сторона не определена · ${group}`;
}
