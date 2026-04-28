/**
 * 이미지 압축 / 썸네일 생성 유틸.
 * - IndexedDB 저장 용량 절감 + AI 업로드 속도 개선
 */

export interface CompressOptions {
  maxDimension?: number;
  quality?: number;
  mimeType?: "image/jpeg" | "image/webp";
  /** true 면 짧은 쪽 기준 가운데 정사각형으로 잘라낸 뒤 압축. (식사 사진용) */
  square?: boolean;
}

async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // 사용 후 url revoke - 단 decode 후엔 src 가 캐시되므로 안전
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export async function compressImage(
  file: Blob,
  opts: CompressOptions = {},
): Promise<Blob> {
  const {
    maxDimension = 1280,
    quality = 0.85,
    mimeType = "image/jpeg",
    square = false,
  } = opts;
  const img = await loadImage(file);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;

  if (square) {
    const side = Math.min(img.width, img.height);
    const sx = Math.round((img.width - side) / 2);
    const sy = Math.round((img.height - side) / 2);
    const target = Math.min(maxDimension, side);
    canvas.width = target;
    canvas.height = target;
    ctx.drawImage(img, sx, sy, side, side, 0, 0, target, target);
  } else {
    const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(img, 0, 0, w, h);
  }

  return await new Promise<Blob>((resolve) => {
    canvas.toBlob(
      (b) => resolve(b ?? file),
      mimeType,
      quality,
    );
  });
}

export async function makeThumbnail(file: Blob): Promise<Blob> {
  return compressImage(file, { maxDimension: 320, quality: 0.7 });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await blobToDataUrl(blob);
  return dataUrl.split(",")[1] ?? "";
}

/** Firestore 동기화 등 — Base64 → Blob */
export function base64ToBlob(base64: string, mimeType: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

/** 안전한 object URL 캐시 - 컴포넌트 unmount 시 revoke 필요 */
const urlCache = new WeakMap<Blob, string>();
export function blobUrl(blob: Blob | undefined): string | undefined {
  if (!blob) return undefined;
  let url = urlCache.get(blob);
  if (!url) {
    url = URL.createObjectURL(blob);
    urlCache.set(blob, url);
  }
  return url;
}
