import sharp from 'sharp';
import { AppError } from '../../lib/errors.js';

const MAX_INPUT_PIXELS = 16_000_000;
const MIN_INPUT_WIDTH = 320;
const MIN_INPUT_HEIGHT = 72;
const MAX_NORMALIZED_EDGE = 2_560;
const ANALYSIS_WIDTH = 320;
const MAX_CANDIDATES = 4;
const MAX_CANDIDATE_WIDTH = 2_048;
const MIN_CANDIDATE_WIDTH = 1_280;
const MAX_CONCURRENT_JOBS = 2;
const MAX_QUEUED_JOBS = 8;
const NARROW_ASPECT_RATIO = 5;
const LOW_LIGHT_LUMA = 32;

sharp.cache({ memory: 16, files: 0, items: 16 });
sharp.concurrency(1);

export const draftVisionCandidateIds = ['A', 'B', 'C', 'D'] as const;

export type DraftVisionCandidateId = typeof draftVisionCandidateIds[number];

export type DraftVisionCandidate = {
  id: DraftVisionCandidateId;
  image: Buffer;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
  sourceTopRatio: number;
  sourceBottomRatio: number;
  strategy: 'whole_pick_bar' | 'screen_top' | 'content_top' | 'salient_band';
  reliability: 'high' | 'medium' | 'low';
  enhanced: boolean;
};

export type DraftVisionInput = {
  candidates: DraftVisionCandidate[];
  sourceWidth: number;
  sourceHeight: number;
  sourceKind: 'narrow' | 'screenshot' | 'camera_photo' | 'unknown';
};

type Permit = () => void;
type PermitWaiter = (permit: Permit) => void;
type CropPlan = Omit<
  DraftVisionCandidate,
  'id' | 'image' | 'mimeType' | 'width' | 'height' | 'enhanced'
> & {
  top: number;
  height: number;
};

export class BoundedJobRunner {
  private active = 0;

  private readonly waiters: PermitWaiter[] = [];

  public constructor(
    private readonly maxConcurrent: number,
    private readonly maxQueued: number,
  ) {}

  public async run<T>(job: () => Promise<T>) {
    const release = await this.acquire();
    try {
      return await job();
    } finally {
      release();
    }
  }

  private acquire(): Promise<Permit> {
    if (this.active < this.maxConcurrent) {
      this.active += 1;
      return Promise.resolve(this.createPermit());
    }

    if (this.waiters.length >= this.maxQueued) {
      return Promise.reject(new AppError(
        503,
        'EXTERNAL_SERVICE_UNAVAILABLE',
        'Image processing is at capacity',
        {
          maxConcurrent: this.maxConcurrent,
          maxQueued: this.maxQueued,
        },
      ));
    }

    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  private createPermit(): Permit {
    let released = false;
    return () => {
      if (released) return;
      released = true;

      const next = this.waiters.shift();
      if (next) {
        next(this.createPermit());
        return;
      }

      this.active -= 1;
    };
  }
}

const pickBarJobs = new BoundedJobRunner(MAX_CONCURRENT_JOBS, MAX_QUEUED_JOBS);

function invalidDraftImage() {
  return new AppError(
    422,
    'IMAGE_RECOGNITION_FAILED',
    'A valid Dota draft image is required',
  );
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function rowActivity(
  pixels: Buffer,
  width: number,
  height: number,
) {
  const activity = new Array<number>(height).fill(0);
  const means = new Array<number>(height).fill(0);

  for (let y = 0; y < height; y += 1) {
    const offset = y * width;
    let sum = 0;
    let horizontalEdges = 0;
    for (let x = 0; x < width; x += 1) {
      const value = pixels[offset + x] ?? 0;
      sum += value;
      if (x > 0) {
        horizontalEdges += Math.abs(value - (pixels[offset + x - 1] ?? value));
      }
    }

    const currentMean = sum / width;
    means[y] = currentMean;
    const horizontal = horizontalEdges / Math.max(1, width - 1);
    const vertical = y > 0 ? Math.abs(currentMean - (means[y - 1] ?? currentMean)) : 0;
    activity[y] = horizontal + vertical * 0.6;
  }

  return { activity, means };
}

function movingWindowScores(activity: number[], windowHeight: number) {
  const scores: number[] = [];
  let sum = 0;
  for (let index = 0; index < activity.length; index += 1) {
    sum += activity[index] ?? 0;
    if (index >= windowHeight) sum -= activity[index - windowHeight] ?? 0;
    if (index >= windowHeight - 1) scores.push(sum / windowHeight);
  }
  return scores;
}

function estimateContentTop(activity: number[]) {
  if (activity.length === 0) return 0;
  const sorted = [...activity].sort((left, right) => left - right);
  const baseline = sorted[Math.floor(sorted.length * 0.55)] ?? 0;
  const threshold = Math.max(4, baseline * 0.72);
  const requiredRun = Math.max(2, Math.round(activity.length * 0.012));
  let run = 0;

  for (let index = 0; index < Math.floor(activity.length * 0.75); index += 1) {
    run = (activity[index] ?? 0) >= threshold ? run + 1 : 0;
    if (run >= requiredRun) return Math.max(0, index - run + 1);
  }

  return 0;
}

function deduplicatePlans(plans: CropPlan[], sourceHeight: number) {
  const accepted: CropPlan[] = [];
  for (const plan of plans) {
    const overlaps = accepted.some((existing) => (
      Math.abs(existing.top - plan.top) < Math.min(existing.height, plan.height) * 0.55
    ));
    if (!overlaps) accepted.push(plan);
    if (accepted.length >= MAX_CANDIDATES) break;
  }

  return accepted.map((plan) => ({
    ...plan,
    sourceTopRatio: plan.top / sourceHeight,
    sourceBottomRatio: (plan.top + plan.height) / sourceHeight,
  }));
}

function planCandidateCrops(
  width: number,
  height: number,
  activity: number[],
  analysisHeight: number,
  sourceKind: DraftVisionInput['sourceKind'],
) {
  const aspectRatio = width / height;
  if (aspectRatio >= NARROW_ASPECT_RATIO || (aspectRatio >= 3 && height <= 260)) {
    return [{
      top: 0,
      height,
      sourceTopRatio: 0,
      sourceBottomRatio: 1,
      strategy: 'whole_pick_bar',
      reliability: 'high',
    }] satisfies CropPlan[];
  }

  const landscape = width >= height;
  const cropHeight = clamp(
    Math.round(Math.min(height * (landscape ? 0.16 : 0.12), width / (landscape ? 8 : 5.5))),
    Math.min(72, height),
    height,
  );
  const scaleY = height / analysisHeight;
  const analysisWindowHeight = clamp(
    Math.round(cropHeight / scaleY),
    1,
    analysisHeight,
  );
  const windowScores = movingWindowScores(activity, analysisWindowHeight);
  const searchBottom = Math.max(
    0,
    Math.floor((height - cropHeight) * (landscape ? 0.62 : 0.78) / scaleY),
  );
  const rankedStarts = windowScores
    .map((score, top) => ({
      score: score * (1 - (top / Math.max(1, analysisHeight)) * 0.18),
      top,
    }))
    .filter(({ top }) => top <= searchBottom)
    .sort((left, right) => right.score - left.score);
  const contentTop = clamp(
    Math.round(estimateContentTop(activity) * scaleY),
    0,
    height - cropHeight,
  );
  const primaryAnalysisTop = clamp(
    Math.round(contentTop / scaleY),
    0,
    Math.max(0, windowScores.length - 1),
  );
  const primaryScore = windowScores[primaryAnalysisTop] ?? 0;
  const peakScore = Math.max(0, ...windowScores);
  const primaryLooksUseful = primaryScore >= Math.max(3.5, peakScore * 0.55);
  const primaryStrategy = contentTop > cropHeight * 0.2 ? 'content_top' : 'screen_top';
  const looksLikeDirectScreenshot = landscape
    && aspectRatio >= 1.45
    && aspectRatio <= 2.2
    && primaryStrategy === 'screen_top'
    && sourceKind !== 'camera_photo';
  const primaryReliability = (sourceKind === 'screenshot' && primaryStrategy === 'screen_top')
    || looksLikeDirectScreenshot
    ? 'high'
    : 'medium';
  const plans: CropPlan[] = [{
    top: contentTop,
    height: cropHeight,
    sourceTopRatio: 0,
    sourceBottomRatio: 0,
    strategy: primaryStrategy,
    reliability: primaryReliability,
  }];

  const hasMeaningfulActivity = (rankedStarts[0]?.score ?? 0) >= 3.5;
  const salientLimit = primaryStrategy === 'content_top'
    ? 0
    : !landscape
      ? 3
      : sourceKind === 'camera_photo' || !primaryLooksUseful
        ? 2
        : 0;
  if (hasMeaningfulActivity && salientLimit > 0) {
    for (const candidate of rankedStarts) {
      const top = clamp(Math.round(candidate.top * scaleY), 0, height - cropHeight);
      if (plans.some((plan) => Math.abs(plan.top - top) < cropHeight * 0.55)) continue;
      plans.push({
        top,
        height: cropHeight,
        sourceTopRatio: 0,
        sourceBottomRatio: 0,
        strategy: 'salient_band',
        reliability: sourceKind === 'camera_photo' ? 'medium' : 'low',
      });
      if (plans.length >= salientLimit + 1) break;
    }
  }

  if (!landscape && primaryStrategy === 'screen_top' && plans.length < MAX_CANDIDATES) {
    const fallbackRatios = [0.22, 0.44, 0.66];
    for (const ratio of fallbackRatios) {
      const top = clamp(Math.round((height - cropHeight) * ratio), 0, height - cropHeight);
      if (plans.some((plan) => Math.abs(plan.top - top) < cropHeight * 0.55)) continue;
      plans.push({
        top,
        height: cropHeight,
        sourceTopRatio: 0,
        sourceBottomRatio: 0,
        strategy: 'salient_band',
        reliability: 'low',
      });
      if (plans.length >= MAX_CANDIDATES) break;
    }
  }

  return deduplicatePlans(plans, height);
}

function inferSourceKind(
  format: string | undefined,
  width: number,
  height: number,
  originalWidth: number,
  originalHeight: number,
): DraftVisionInput['sourceKind'] {
  if (width / height >= NARROW_ASPECT_RATIO || (width / height >= 3 && height <= 260)) {
    return 'narrow';
  }
  if (format === 'png' || format === 'webp') return 'screenshot';
  if (Math.max(originalWidth, originalHeight) > MAX_NORMALIZED_EDGE) return 'camera_photo';
  return 'unknown';
}

export async function prepareDraftVisionInput(image: Buffer): Promise<DraftVisionInput> {
  return pickBarJobs.run(async () => {
    try {
      const input = sharp(image, {
        failOn: 'error',
        limitInputPixels: MAX_INPUT_PIXELS,
        sequentialRead: true,
        animated: false,
      });
      const metadata = await input.metadata();
      if (
        !metadata.width
        || !metadata.height
        || (metadata.pages ?? 1) !== 1
      ) {
        throw invalidDraftImage();
      }

      const normalized = await input
        .autoOrient()
        .resize({
          width: MAX_NORMALIZED_EDGE,
          height: MAX_NORMALIZED_EDGE,
          fit: 'inside',
          withoutEnlargement: true,
          kernel: sharp.kernel.lanczos3,
        })
        .toColourspace('srgb')
        .jpeg({
          quality: 92,
          chromaSubsampling: '4:4:4',
        })
        .toBuffer({ resolveWithObject: true });
      const width = normalized.info.width;
      const height = normalized.info.height;

      if (width < MIN_INPUT_WIDTH || height < MIN_INPUT_HEIGHT) {
        throw invalidDraftImage();
      }

      const analysis = await sharp(normalized.data)
        .resize({
          width: Math.min(ANALYSIS_WIDTH, width),
          withoutEnlargement: true,
        })
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const metrics = rowActivity(
        analysis.data,
        analysis.info.width,
        analysis.info.height,
      );
      const sourceKind = inferSourceKind(
        metadata.format,
        width,
        height,
        metadata.width,
        metadata.height,
      );
      const plans = planCandidateCrops(
        width,
        height,
        metrics.activity,
        analysis.info.height,
        sourceKind,
      );
      const candidates: DraftVisionCandidate[] = [];

      for (let index = 0; index < plans.length; index += 1) {
        const plan = plans[index];
        const id = draftVisionCandidateIds[index];
        if (!plan || !id) continue;

        const targetWidth = clamp(
          Math.round(width * 1.15),
          Math.min(MIN_CANDIDATE_WIDTH, Math.round(width * 1.5)),
          MAX_CANDIDATE_WIDTH,
        );
        const analysisTop = clamp(
          Math.floor(plan.sourceTopRatio * analysis.info.height),
          0,
          analysis.info.height - 1,
        );
        const analysisBottom = clamp(
          Math.ceil(plan.sourceBottomRatio * analysis.info.height),
          analysisTop + 1,
          analysis.info.height,
        );
        const candidateMeans = metrics.means.slice(analysisTop, analysisBottom);
        const candidateMeanLuma = candidateMeans.reduce((sum, value) => sum + value, 0)
          / Math.max(1, candidateMeans.length);
        const shouldEnhance = candidateMeanLuma < LOW_LIGHT_LUMA;
        let pipeline = sharp(normalized.data, {
          sequentialRead: true,
        })
          .extract({
            left: 0,
            top: plan.top,
            width,
            height: plan.height,
          })
          .resize({
            width: targetWidth,
            withoutEnlargement: false,
            kernel: sharp.kernel.lanczos3,
          });

        if (shouldEnhance) {
          pipeline = pipeline.normalise({ lower: 1, upper: 99 });
        }

        const output = await pipeline
          .sharpen()
          .jpeg({
            quality: 90,
            chromaSubsampling: '4:4:4',
          })
          .toBuffer({ resolveWithObject: true });

        candidates.push({
          ...plan,
          id,
          image: output.data,
          mimeType: 'image/jpeg',
          width: output.info.width,
          height: output.info.height,
          enhanced: shouldEnhance,
        });
      }

      if (candidates.length === 0) throw invalidDraftImage();

      return {
        candidates,
        sourceWidth: width,
        sourceHeight: height,
        sourceKind,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw invalidDraftImage();
    }
  });
}

export async function prepareDraftPickBar(image: Buffer) {
  const prepared = await prepareDraftVisionInput(image);
  const first = prepared.candidates[0];
  if (!first) throw invalidDraftImage();
  return first;
}
