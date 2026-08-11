import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const componentUrl = new URL('../renderer/components/startup-loader.tsx', import.meta.url);
const appUrl = new URL('../renderer/app.tsx', import.meta.url);
const stylesUrl = new URL('../renderer/styles.css', import.meta.url);
const mediaUrl = new URL('../renderer/assets/startup-loader-ping-pong.webm', import.meta.url);

describe('startup loader media and completion gate', () => {
  it('ships a local WebM asset and uses media-safe playback attributes', async () => {
    const [component, media] = await Promise.all([
      readFile(componentUrl, 'utf8'),
      readFile(mediaUrl),
    ]);

    assert.equal(media.subarray(0, 4).toString('hex'), '1a45dfa3');
    assert.ok(media.byteLength > 1_000_000);
    assert.ok(media.byteLength < 2_000_000);
    assert.match(component, /import startupLoaderVideo from '..\/assets\/startup-loader-ping-pong\.webm'/);
    assert.match(component, /<video[\s\S]*?src=\{startupLoaderVideo\}[\s\S]*?autoPlay[\s\S]*?muted[\s\S]*?playsInline[\s\S]*?preload="auto"/);
    assert.equal(component.includes('loop'), false);
  });

  it('completes once on media end and has decode-error and hard-timeout escape paths', async () => {
    const component = await readFile(componentUrl, 'utf8');

    assert.match(component, /const startupMediaFallbackMs = 12_000/);
    assert.match(component, /if \(cycleCompleteRef\.current\) return;/);
    assert.match(component, /window\.setTimeout\(completeCycle, startupMediaFallbackMs\)/);
    assert.match(component, /window\.clearTimeout\(timeout\)/);
    assert.match(component, /onEnded=\{completeCycle\}/);
    assert.match(component, /onError=\{\(\) => \{[\s\S]*?setMediaState\('error'\);[\s\S]*?completeCycle\(\);/);
  });

  it('keeps successful bootstrap behind the completed media cycle', async () => {
    const app = await readFile(appUrl, 'utf8');
    const cycleGate = app.indexOf('if (!startupCycleComplete)');
    const authenticatedRoute = app.lastIndexOf('if (!sessionQuery.data?.authenticated');

    assert.match(app, /const \[startupCycleComplete, setStartupCycleComplete\] = useState\(false\)/);
    assert.match(app, /<StartupLoader phase="route" onCycleComplete=\{onStartupCycleComplete\} \/>/);
    assert.match(app, /<Router[\s\S]*?startupCycleComplete=\{startupCycleComplete\}[\s\S]*?onStartupCycleComplete=\{\(\) => setStartupCycleComplete\(true\)\}/);
    assert.ok(cycleGate > 0);
    assert.ok(authenticatedRoute > cycleGate);
  });

  it('uses the video layout while preserving accessible phase status and stable fallback', async () => {
    const [component, styles] = await Promise.all([
      readFile(componentUrl, 'utf8'),
      readFile(stylesUrl, 'utf8'),
    ]);

    assert.match(component, /const phaseOrder: StartupPhase\[\] = \['preferences', 'session', 'route'\]/);
    assert.match(component, /role="status" aria-live="polite" aria-atomic="true"/);
    assert.match(component, /<BrandMark \/>/);
    assert.match(styles, /\.startup-loader\s*\{[\s\S]*?width:\s*min\(100%, 660px\);[\s\S]*?background:\s*#000;/);
    assert.match(styles, /\.startup-loader__media\s*\{[\s\S]*?aspect-ratio:\s*16 \/ 9;/);
    assert.match(styles, /\.startup-loader__video\s*\{[\s\S]*?object-fit:\s*cover;[\s\S]*?opacity:\s*0;/);
    assert.match(styles, /\.startup-loader__media--ready \.startup-loader__video\s*\{[\s\S]*?opacity:\s*1;/);
  });
});
