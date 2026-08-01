import { CornersOutIcon, MinusIcon, SquareIcon, XIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import { desktop } from '../bridge';
import { useI18n } from '../i18n';

export function WindowControls() {
  const [maximized, setMaximized] = useState(false);
  const { text } = useI18n();

  useEffect(() => {
    void desktop.window.isMaximized().then(setMaximized).catch(() => undefined);
    return desktop.window.subscribe(setMaximized);
  }, []);

  return (
    <div className="window-controls" role="group" aria-label={text('Управление окном', 'Window controls')}>
      <button type="button" aria-label={text('Свернуть', 'Minimize')} onClick={() => desktop.window.minimize()}>
        <MinusIcon size={15} weight="bold" aria-hidden />
      </button>
      <button
        type="button"
        aria-label={maximized ? text('Восстановить размер', 'Restore') : text('Развернуть', 'Maximize')}
        onClick={() => desktop.window.maximize()}
      >
        {maximized ? (
          <SquareIcon size={12} weight="bold" aria-hidden />
        ) : (
          <CornersOutIcon size={13} weight="bold" aria-hidden />
        )}
      </button>
      <button
        className="window-controls__close"
        type="button"
        aria-label={text('Закрыть', 'Close')}
        onClick={() => desktop.window.close()}
      >
        <XIcon size={15} weight="bold" aria-hidden />
      </button>
    </div>
  );
}
