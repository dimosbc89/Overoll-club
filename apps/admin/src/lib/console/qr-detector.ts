/**
 * QR reading from a <video> frame: the browser's BarcodeDetector where it
 * exists (Chrome on Android / ChromeOS), otherwise jsQR (pure JS, loaded only
 * when needed, e.g. on iPad Safari).
 */

export type FrameReader = (video: HTMLVideoElement) => Promise<string | null>;

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorClass {
  new (options: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

async function nativeReader(): Promise<FrameReader | null> {
  const Detector = (globalThis as { BarcodeDetector?: BarcodeDetectorClass }).BarcodeDetector;
  if (!Detector) return null;
  try {
    const formats = (await Detector.getSupportedFormats?.()) ?? ['qr_code'];
    if (!formats.includes('qr_code')) return null;
    const detector = new Detector({ formats: ['qr_code'] });
    return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
  } catch {
    return null;
  }
}

/** Frames are scaled down to this many pixels on the long side before decoding. */
const MAX_SIDE = 800;

async function jsqrReader(): Promise<FrameReader> {
  const { default: jsQR } = await import('jsqr');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    const { videoWidth, videoHeight } = video;
    if (!context || !videoWidth || !videoHeight) return null;
    const scale = Math.min(1, MAX_SIDE / Math.max(videoWidth, videoHeight));
    const width = Math.round(videoWidth * scale);
    const height = Math.round(videoHeight * scale);
    canvas.width = width;
    canvas.height = height;
    context.drawImage(video, 0, 0, width, height);
    const image = context.getImageData(0, 0, width, height);
    return jsQR(image.data, width, height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
  };
}

export async function createFrameReader(): Promise<FrameReader> {
  return (await nativeReader()) ?? (await jsqrReader());
}
