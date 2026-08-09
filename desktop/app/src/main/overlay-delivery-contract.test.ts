import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

describe('overlay render acknowledgement contract', () => {
  it('accepts acknowledgements only through the trusted overlay IPC schema', async () => {
    const source = await readFile(new URL('./overlay-ipc.ts', import.meta.url), 'utf8');
    assert.equal(source.includes('ensureTrustedOverlaySender(event, dependencies.getWindow())'), true);
    assert.equal(source.includes('z.tuple([z.number().int().positive(), overlayVisibleSlotsSchema])'), true);
  });

  it('acknowledges the committed renderer state after two animation frames', async () => {
    const source = await readFile(new URL('../renderer/pages/overlay.tsx', import.meta.url), 'utf8');
    assert.equal((source.match(/window\.requestAnimationFrame/g) ?? []).length >= 2, true);
    assert.equal(source.includes('bridge.presented(presentationId, visibleSlots)'), true);
  });

  it('shows the overlay before presentation delivery and verifies visibility on acknowledgement', async () => {
    const source = await readFile(new URL('./index.ts', import.meta.url), 'utf8');
    const showIndex = source.indexOf('window.showInactive();', source.indexOf('const prepareOverlayPresentation'));
    const publishIndex = source.indexOf('publishOverlayState(state, presentationId);', showIndex);
    assert.equal(showIndex > 0 && publishIndex > showIndex, true);
    assert.equal(source.includes('!window.isVisible()'), true);
  });

  it('records acknowledged slots and a bounded timeout failure instead of sent slots', async () => {
    const source = await readFile(new URL('./index.ts', import.meta.url), 'utf8');
    assert.equal(source.includes("recordOverlayDeliveryFailure('OVERLAY_RENDER_ACK_TIMEOUT')"), true);
    assert.equal(source.includes("recordOverlayDeliveryFailure('OVERLAY_RENDERER_GONE')"), true);
    assert.equal(source.includes("overlayLog.info('Overlay state rendered'"), true);
    assert.match(source, /details:\s*\{\s*\.\.\.delivery\.diagnostic,\s*visibleSlots,/);
  });
});
