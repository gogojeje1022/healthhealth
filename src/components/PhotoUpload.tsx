import { useRef, useState } from "react";
import { Camera, ImagePlus, Loader2 } from "lucide-react";
import { compressImage, makeThumbnail } from "../lib/image";
import { cls } from "../lib/utils";

interface Props {
  /** 처리 후 호출 - photo / thumbnail 둘 다 압축된 Blob */
  onPicked: (photo: Blob, thumbnail: Blob) => void | Promise<void>;
  label?: string;
  className?: string;
  /** 기본 카메라 캡처 모드. 갤러리에서 선택도 가능 */
  preferCamera?: boolean;
  variant?: "primary" | "ghost";
  disabled?: boolean;
}

export default function PhotoUpload({
  onPicked,
  label = "사진 업로드",
  className,
  preferCamera = true,
  variant = "primary",
  disabled,
}: Props) {
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File | undefined | null) {
    if (!file) return;
    setBusy(true);
    try {
      const compressed = await compressImage(file, { maxDimension: 1280, quality: 0.85 });
      const thumb = await makeThumbnail(compressed);
      await onPicked(compressed, thumb);
    } catch (e) {
      console.error(e);
      alert("이미지를 처리하지 못했습니다.");
    } finally {
      setBusy(false);
      if (camRef.current) camRef.current.value = "";
      if (galRef.current) galRef.current.value = "";
    }
  }

  const btnClass =
    variant === "primary"
      ? "btn-primary"
      : "btn-secondary";

  return (
    <div className={cls("flex gap-2", className)}>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => camRef.current?.click()}
        className={cls(btnClass, "flex-1")}
      >
        {busy ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
        {busy ? "처리 중…" : label}
      </button>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => galRef.current?.click()}
        className="btn-secondary"
        aria-label="갤러리에서 선택"
      >
        <ImagePlus size={18} />
      </button>
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture={preferCamera ? "environment" : undefined}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <input
        ref={galRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
