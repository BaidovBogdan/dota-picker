import { CornersOutIcon, MinusIcon, SquareIcon, XIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import { desktop } from '../bridge';

export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    void desktop.window.isMaximized().then(setMaximized).catch(() => undefined);
    return desktop.window.subscribe(setMaximized);
  }, []);

  return (
    <div className="window-controls" role="group" aria-label="Управление окном">
      <button type="button" aria-label="Свернуть" onClick={() => desktop.window.minimize()}>
        <MinusIcon size={15} weight="bold" aria-hidden />
      </button>
      <button
        type="button"
        aria-label={maximized ? 'Восстановить размер' : 'Развернуть'}
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
        aria-label="Закрыть"
        onClick={() => desktop.window.close()}
      >
        <XIcon size={15} weight="bold" aria-hidden />
      </button>
    </div>
  );
}
