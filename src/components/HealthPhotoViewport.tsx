import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";

const VIEW_H_PX = 260;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.15;

function clampPan(
  panX: number,
  panY: number,
  cw: number,
  ch: number,
  dispW: number,
  dispH: number,
) {
  const maxX = Math.max(0, (dispW - cw) / 2);
  const maxY = Math.max(0, (dispH - ch) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, panX)),
    y: Math.min(maxY, Math.max(-maxY, panY)),
  };
}

type Props = {
  src: string;
};

/**
 * 고정 크기(높이 260px) 뷰포트 안에서만 사진 표시·확대·이동.
 * 첫 표시는 뷰에 맞추되 작은 원본은 1:1에 가깝게(과대 확대 없음).
 */
export default function HealthPhotoViewport({ src }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [nw, setNw] = useState(0);
  const [nh, setNh] = useState(0);
  const [cw, setCw] = useState(0);
  const [ch, setCh] = useState(VIEW_H_PX);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    panX: number;
    panY: number;
  } | null>(null);
  const pinchRef = useRef<{ dist: number; startZoom: number } | null>(null);
  /** 모바일 한 손가락 팬(포인터 이벤트는 마우스만 쓰고 터치는 여기서 처리) */
  const touchPanRef = useRef<{
    identifier: number;
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);

  const onImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const im = e.currentTarget;
    setNw(im.naturalWidth);
    setNh(im.naturalHeight);
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setCw(r.width);
      setCh(r.height);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit =
    nw > 0 && nh > 0 && cw > 0 && ch > 0 ? Math.min(1, cw / nw, ch / nh) : 1;
  const basisW = nw * fit;
  const basisH = nh * fit;
  const dispW = basisW * zoom;
  const dispH = basisH * zoom;
  const ready = nw > 0 && nh > 0 && cw > 0 && ch > 0;

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    if (!ready) return;
    setPan((p) => clampPan(p.x, p.y, cw, ch, dispW, dispH));
  }, [zoom, ready, cw, ch, dispW, dispH]);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setNw(0);
    setNh(0);
  }, [src]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoom((z) =>
        Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z + delta) * 100) / 100)),
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  /** 안드로이드 등에서 확대 후 팬/핀치 시 페이지 스크롤을 막으려면 passive: false 필요 */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const blockScrollIfHandling = (e: TouchEvent) => {
      const z = zoomRef.current;
      const pinching = e.touches.length === 2 && pinchRef.current !== null;
      const panning =
        e.touches.length === 1 &&
        z > MIN_ZOOM &&
        touchPanRef.current !== null &&
        e.touches[0]?.identifier === touchPanRef.current.identifier;
      if (pinching || panning) e.preventDefault();
    };
    el.addEventListener("touchmove", blockScrollIfHandling, { passive: false });
    return () => el.removeEventListener("touchmove", blockScrollIfHandling);
  }, []);

  const bumpZoom = (delta: number) => {
    setZoom((z) =>
      Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z + delta) * 100) / 100)),
    );
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    if (zoomRef.current <= MIN_ZOOM) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = panRef.current;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      panX: p.x,
      panY: p.y,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    setPan(clampPan(d.panX + dx, d.panY + dy, cw, ch, dispW, dispH));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (d?.pointerId === e.pointerId) dragRef.current = null;
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      touchPanRef.current = null;
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinchRef.current = { dist, startZoom: zoomRef.current };
      return;
    }
    if (e.touches.length === 1 && zoomRef.current > MIN_ZOOM) {
      const t = e.touches[0];
      const p = panRef.current;
      touchPanRef.current = {
        identifier: t.identifier,
        startX: t.clientX,
        startY: t.clientY,
        startPanX: p.x,
        startPanY: p.y,
      };
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const ratio = dist / pinchRef.current.dist;
      const nz = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, Math.round(pinchRef.current.startZoom * ratio * 100) / 100),
      );
      setZoom(nz);
      return;
    }
    const tp = touchPanRef.current;
    if (e.touches.length !== 1 || !tp) return;
    const t = e.touches[0];
    if (t.identifier !== tp.identifier) return;
    const dx = t.clientX - tp.startX;
    const dy = t.clientY - tp.startY;
    setPan(clampPan(tp.startPanX + dx, tp.startPanY + dy, cw, ch, dispW, dispH));
  };

  const endTouchPan = (e: React.TouchEvent) => {
    const tp = touchPanRef.current;
    if (!tp) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === tp.identifier) {
        touchPanRef.current = null;
        break;
      }
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchRef.current = null;
    endTouchPan(e);
  };

  const onTouchCancel = () => {
    pinchRef.current = null;
    touchPanRef.current = null;
  };

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
      <div
        ref={wrapRef}
        className="relative h-[260px] w-full touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
        style={{ cursor: zoom > MIN_ZOOM ? "grab" : "default" }}
      >
        {!ready && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-slate-500">
            불러오는 중…
          </div>
        )}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2"
          style={{
            width: ready ? dispW : 1,
            height: ready ? dispH : 1,
            opacity: ready ? 1 : 0,
            transform: ready
              ? `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))`
              : "translate(-50%, -50%)",
          }}
        >
          <img
            src={src}
            alt=""
            onLoad={onImgLoad}
            decoding="async"
            draggable={false}
            className="block h-full w-full object-contain [image-rendering:high-quality]"
          />
        </div>
      </div>

      <div className="pointer-events-auto absolute bottom-9 right-2 flex items-center gap-0.5 rounded-lg border border-slate-700/80 bg-slate-900/95 p-0.5 shadow-lg">
        <button
          type="button"
          onClick={() => bumpZoom(ZOOM_STEP)}
          className="rounded-md p-1.5 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
          aria-label="확대"
        >
          <ZoomIn size={16} />
        </button>
        <button
          type="button"
          onClick={() => bumpZoom(-ZOOM_STEP)}
          className="rounded-md p-1.5 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
          aria-label="축소"
        >
          <ZoomOut size={16} />
        </button>
        <button
          type="button"
          onClick={resetView}
          className="rounded-md p-1.5 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
          aria-label="처음 배율로"
        >
          <RotateCcw size={16} />
        </button>
      </div>

      <p className="pointer-events-none px-2 pb-2 pt-1 text-center text-[10px] leading-tight text-slate-500">
        휠·버튼 확대 · 드래그 이동 · 모바일 한 손 이동·두 손 확대 · ↺ 처음 배율
      </p>
    </div>
  );
}
