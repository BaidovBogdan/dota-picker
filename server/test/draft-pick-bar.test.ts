import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import {
  BoundedJobRunner,
  prepareDraftPickBar,
  prepareDraftVisionInput,
} from '../src/modules/photo/draft-pick-bar.js';

async function image(width: number, height: number, background = '#17202A') {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background,
    },
  }).jpeg().toBuffer();
}

function deferred() {
  let resolve: () => void = () => void 0;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe('prepareDraftPickBar', () => {
  it('keeps a direct narrow pick-bar image as one high-reliability candidate', async () => {
    const input = await image(1_600, 100);

    const result = await prepareDraftVisionInput(input);

    expect(result).toMatchObject({
      sourceWidth: 1_600,
      sourceHeight: 100,
      sourceKind: 'narrow',
      candidates: [{
        id: 'A',
        mimeType: 'image/jpeg',
        sourceTopRatio: 0,
        sourceBottomRatio: 1,
        strategy: 'whole_pick_bar',
        reliability: 'high',
      }],
    });
    expect(result.candidates).toHaveLength(1);
    await expect(sharp(result.candidates[0]?.image).metadata()).resolves.toMatchObject({
      format: 'jpeg',
      width: 1_840,
      height: 115,
    });
  });

  it('extracts only the screen top from a full screenshot instead of the hero grid', async () => {
    const input = await sharp({
      create: {
        width: 1_920,
        height: 1_080,
        channels: 3,
        background: '#18A558',
      },
    })
      .composite([{
        input: await image(1_920, 190, '#D5222A'),
        top: 0,
        left: 0,
      }])
      .png()
      .toBuffer();

    const result = await prepareDraftVisionInput(input);
    const first = result.candidates[0];
    const stats = await sharp(first?.image).stats();

    expect(result.sourceKind).toBe('screenshot');
    expect(result.candidates).toHaveLength(1);
    expect(first).toMatchObject({
      strategy: 'screen_top',
      reliability: 'high',
      sourceTopRatio: 0,
    });
    expect(first?.sourceBottomRatio).toBeLessThan(0.18);
    expect(stats.channels[0]?.mean).toBeGreaterThan(stats.channels[1]?.mean ?? 255);
  });

  it('finds a letterboxed content top instead of assuming y=0', async () => {
    const redBar = await image(1_920, 180, '#D5222A');
    const greenGrid = await image(1_920, 800, '#18A558');
    const input = await sharp({
      create: {
        width: 1_920,
        height: 1_080,
        channels: 3,
        background: '#000000',
      },
    })
      .composite([
        { input: redBar, top: 100, left: 0 },
        { input: greenGrid, top: 280, left: 0 },
      ])
      .png()
      .toBuffer();

    const result = await prepareDraftVisionInput(input);
    const first = result.candidates[0];

    expect(first?.strategy).toBe('content_top');
    expect(first?.sourceTopRatio).toBeGreaterThan(0.07);
    expect(first?.sourceTopRatio).toBeLessThan(0.12);
  });

  it('adds a salient candidate when a client-normalized camera photo has a busy background', async () => {
    const width = 800;
    const height = 600;
    const data = Buffer.alloc(width * height * 3);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const inPickBar = y >= 240 && y < 340;
        const value = inPickBar
          ? Math.floor(x / 8) % 2 === 0 ? 230 : 20
          : Math.floor(x / 8) % 2 === 0 ? 70 : 30;
        const offset = (y * width + x) * 3;
        data[offset] = value;
        data[offset + 1] = value;
        data[offset + 2] = value;
      }
    }

    const input = await sharp(data, {
      raw: {
        width,
        height,
        channels: 3,
      },
    })
      .jpeg({ quality: 82 })
      .toBuffer();

    const result = await prepareDraftVisionInput(input);

    expect(result.sourceKind).toBe('unknown');
    expect(result.candidates.length).toBeGreaterThan(1);
    expect(result.candidates.some((candidate) => (
      candidate.sourceTopRatio <= 290 / height
      && candidate.sourceBottomRatio >= 290 / height
    ))).toBe(true);
  });

  it('produces bounded horizontal candidates for a portrait monitor photo', async () => {
    const pickBar = await image(1_080, 130, '#C82E35');
    const grid = await image(1_080, 700, '#23435C');
    const input = await sharp({
      create: {
        width: 1_080,
        height: 1_920,
        channels: 3,
        background: '#141414',
      },
    })
      .composite([
        { input: pickBar, top: 420, left: 0 },
        { input: grid, top: 550, left: 0 },
      ])
      .jpeg({ quality: 80 })
      .toBuffer();

    const result = await prepareDraftVisionInput(input);

    expect(result.candidates.length).toBeGreaterThanOrEqual(1);
    expect(result.candidates.length).toBeLessThanOrEqual(4);
    expect(result.candidates.some((candidate) => (
      candidate.sourceTopRatio <= 420 / 1_920
      && candidate.sourceBottomRatio >= 550 / 1_920
    ))).toBe(true);
    for (const candidate of result.candidates) {
      expect(candidate.width).toBeLessThanOrEqual(2_048);
      expect(candidate.height).toBeLessThan(candidate.width);
    }
  });

  it('enhances a very dark pick-bar candidate', async () => {
    const input = await image(1_600, 100, '#090D12');

    const result = await prepareDraftVisionInput(input);

    expect(result.candidates[0]?.enhanced).toBe(true);
  });

  it('keeps the compatibility helper on the first adaptive candidate', async () => {
    const input = await image(800, 450);

    const result = await prepareDraftPickBar(input);
    const metadata = await sharp(result.image).metadata();

    expect(result).toMatchObject({
      mimeType: 'image/jpeg',
      width: 1_200,
      height: 108,
    });
    expect(result.image.equals(input)).toBe(false);
    expect(metadata).toMatchObject({
      format: 'jpeg',
      width: 1_200,
      height: 108,
    });
  });

  it('auto-orients an EXIF-rotated landscape screenshot before cropping', async () => {
    const input = await sharp({
      create: {
        width: 450,
        height: 800,
        channels: 3,
        background: '#17202A',
      },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const result = await prepareDraftPickBar(input);

    expect(result).toMatchObject({
      mimeType: 'image/jpeg',
      width: 1_200,
      height: 108,
    });
  });

  it.each([
    ['broken bytes', async () => Buffer.from('not-an-image')],
    ['too small', async () => image(240, 120)],
  ])('rejects %s before Gemini', async (_name, createInput) => {
    const input = await createInput();
    await expect(prepareDraftPickBar(input)).rejects.toMatchObject({
      statusCode: 422,
      code: 'IMAGE_RECOGNITION_FAILED',
      message: 'A valid Dota draft image is required',
    });
  });
});

describe('BoundedJobRunner', () => {
  it('runs no more than the configured number of jobs concurrently', async () => {
    const runner = new BoundedJobRunner(2, 8);
    const gates = [deferred(), deferred(), deferred()];
    const started: number[] = [];
    let active = 0;
    let peakActive = 0;

    const jobs = gates.map((gate, index) => runner.run(async () => {
      started.push(index);
      active += 1;
      peakActive = Math.max(peakActive, active);
      await gate.promise;
      active -= 1;
      return index;
    }));

    await vi.waitFor(() => expect(started).toEqual([0, 1]));
    expect(peakActive).toBe(2);

    gates[0]?.resolve();
    await expect(jobs[0]).resolves.toBe(0);
    await vi.waitFor(() => expect(started).toEqual([0, 1, 2]));
    expect(peakActive).toBe(2);

    gates[1]?.resolve();
    gates[2]?.resolve();
    await expect(Promise.all(jobs)).resolves.toEqual([0, 1, 2]);
  });

  it('releases a permit when a job rejects', async () => {
    const runner = new BoundedJobRunner(1, 1);
    const gate = deferred();
    const failed = runner.run(async () => {
      await gate.promise;
      throw new Error('job failed');
    });
    const next = runner.run(async () => 'next job');

    gate.resolve();

    await expect(failed).rejects.toThrow('job failed');
    await expect(next).resolves.toBe('next job');
  });

  it('rejects deterministically when the waiting queue is full', async () => {
    const runner = new BoundedJobRunner(1, 1);
    const firstGate = deferred();
    const secondGate = deferred();
    const first = runner.run(async () => {
      await firstGate.promise;
    });
    const second = runner.run(async () => {
      await secondGate.promise;
    });
    const overflow = runner.run(async () => undefined);

    await expect(overflow).rejects.toMatchObject({
      statusCode: 503,
      code: 'EXTERNAL_SERVICE_UNAVAILABLE',
      message: 'Image processing is at capacity',
      details: {
        maxConcurrent: 1,
        maxQueued: 1,
      },
    });

    firstGate.resolve();
    await first;
    secondGate.resolve();
    await second;
  });
});
