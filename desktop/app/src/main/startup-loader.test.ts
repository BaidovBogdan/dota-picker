import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const componentUrl = new URL('../renderer/components/startup-loader.tsx', import.meta.url);
const stylesUrl = new URL('../renderer/styles.css', import.meta.url);

describe('startup loader motion and accessibility', () => {
  it('keeps the card, copy and stage geometry stable across every real phase', async () => {
    const styles = await readFile(stylesUrl, 'utf8');

    assert.match(styles, /\.startup-loader\s*\{[\s\S]*?height:\s*390px;[\s\S]*?grid-template-rows:\s*88px 140px 42px;/);
    assert.match(styles, /\.startup-loader__copy\s*\{[\s\S]*?height:\s*140px;[\s\S]*?grid-template-rows:\s*auto 82px 32px;/);
    assert.match(styles, /\.startup-loader__stages\s*\{[\s\S]*?height:\s*42px;/);
    assert.match(styles, /\.startup-loader__delay\s*\{[\s\S]*?min-height:\s*32px;/);
  });

  it('moves only from the current phase and cancels phase-scoped work', async () => {
    const component = await readFile(componentUrl, 'utf8');

    assert.match(component, /const phaseOrder: StartupPhase\[\] = \['preferences', 'session', 'route'\]/);
    assert.match(component, /'--startup-progress': `\$\{visualIndex \/ \(phaseOrder\.length - 1\)\}`/);
    assert.match(component, /'--startup-runner-position': `\$\{\(visualIndex \+ 0\.5\) \* \(100 \/ phaseOrder\.length\)\}%`/);
    assert.match(component, /requestAnimationFrame\(\(\) => setVisualIndex\(activeIndex\)\)/);
    assert.match(component, /cancelAnimationFrame\(frame\)/);
    assert.match(component, /clearTimeout\(timeout\)/);
    assert.match(component, /}, \[phase\]\);/);
    assert.equal(component.includes('role="progressbar"'), false);
  });

  it('transitions copy sequentially and keeps inactive copy out of the accessibility tree', async () => {
    const [component, styles] = await Promise.all([
      readFile(componentUrl, 'utf8'),
      readFile(stylesUrl, 'utf8'),
    ]);

    assert.match(styles, /\.startup-loader__copy-panel\s*\{[\s\S]*?opacity 160ms ease/);
    assert.match(styles, /\.startup-loader__copy-panel--active\s*\{[\s\S]*?transition-delay:\s*190ms, 190ms, 190ms, 0s;/);
    assert.match(component, /aria-hidden=\{index !== activeIndex\}/);
    assert.match(component, /role="status" aria-live="polite" aria-atomic="true"/);
    assert.match(component, /aria-current=\{state === 'active' \? 'step' : undefined\}/);
  });

  it('uses a clear completed state and removes motion without changing layout', async () => {
    const [component, styles] = await Promise.all([
      readFile(componentUrl, 'utf8'),
      readFile(stylesUrl, 'utf8'),
    ]);

    assert.match(component, /<CheckIcon size=\{15\} weight="bold" \/>/);
    assert.match(styles, /\.startup-loader__stage-marker\s*\{[\s\S]*?width:\s*20px;[\s\S]*?height:\s*20px;/);
    assert.match(styles, /\.startup-loader__stages::after\s*\{[\s\S]*?transform:\s*scaleX\(var\(--startup-progress\)\);[\s\S]*?transition:\s*transform 640ms var\(--ease-out\);/);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.startup-loader__copy-panel,[\s\S]*?\.startup-loader__stages::after,[\s\S]*?\.startup-loader__runner[\s\S]*?transition:\s*none;/);
  });
});
