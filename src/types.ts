export type MealSlot =
  | "breakfast"
  | "morningSnack"
  | "lunch"
  | "afternoonSnack"
  | "dinner"
  | "eveningSnack";

export const MEAL_SLOTS: MealSlot[] = [
  "breakfast",
  "morningSnack",
  "lunch",
  "afternoonSnack",
  "dinner",
  "eveningSnack",
];

export const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: "아침",
  morningSnack: "오전 간식",
  lunch: "점심",
  afternoonSnack: "오후 간식",
  dinner: "저녁",
  eveningSnack: "야식 / 간식",
};

export const MEAL_SLOT_EMOJI: Record<MealSlot, string> = {
  breakfast: "🌅",
  morningSnack: "☕",
  lunch: "🥗",
  afternoonSnack: "🍎",
  dinner: "🍚",
  eveningSnack: "🌙",
};

export type HealthRecordType = "checkup" | "inbody" | "other";

export const HEALTH_TYPE_LABELS: Record<HealthRecordType, string> = {
  checkup: "건강검진표",
  inbody: "인바디",
  other: "기타 건강기록",
};

export interface User {
  id: string;
  name: string;
  /** 사용자 식별 색상 (HEX) */
  color: string;
  /** 생년월일 (선택) */
  birthYear?: number;
  /** 성별 (선택) */
  gender?: "male" | "female" | "other";
  /** 키 cm (선택) */
  heightCm?: number;
  /** 목표 체중 kg (선택) */
  targetWeightKg?: number;
  createdAt: number;
  /** 클라우드 병합용 (없으면 createdAt 으로 간주) */
  updatedAt?: number;
}

export interface Meal {
  id: string;
  userId: string;
  /** YYYY-MM-DD */
  date: string;
  slot: MealSlot;
  /** 사진 (Blob, IndexedDB 저장) */
  photo?: Blob;
  /** 사진 썸네일 (Blob) - 빠른 표시용 */
  thumbnail?: Blob;
  /** AI 가 분석한 메뉴 텍스트 */
  menuText?: string;
  /** AI 별점 (1~5) */
  rating?: number;
  /** AI 한 줄 평 / 코멘트 */
  aiComment?: string;
  /** 상세 영양 분석 결과 */
  nutrition?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    healthTags?: string[];
  };
  /** 사용자 메모 */
  notes?: string;
  /** AI 분석 상태 */
  analysisStatus: "pending" | "analyzing" | "done" | "error" | "skipped";
  analysisError?: string;
  createdAt: number;
  updatedAt: number;
}

export interface HealthRecord {
  id: string;
  userId: string;
  type: HealthRecordType;
  /** YYYY-MM-DD - 검진/측정 일자 */
  recordDate: string;
  photo?: Blob;
  thumbnail?: Blob;
  /** OCR/AI 가 추출한 원문 */
  extractedText?: string;
  /** 구조화된 측정값 */
  metrics?: Record<string, string | number>;
  /** 100점 만점 건강 점수 */
  healthScore?: number;
  /** AI 의 종합 코멘트 */
  summary?: string;
  /** 강점 / 주의 항목 */
  strengths?: string[];
  concerns?: string[];
  recommendations?: string[];
  analysisStatus: "pending" | "analyzing" | "done" | "error" | "skipped";
  analysisError?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AppSettings {
  id: "settings";
  geminiApiKey?: string;
  /** 주 키가 429 등 쿼터 한도일 때만 사용 (별도 프로젝트에서 발급한 키 권장) */
  geminiApiKeyBackup?: string;
  /** 활성 사용자 ID (마지막 선택) */
  activeUserId?: string;
  /** AI 모델 */
  model?: string;
  /** 온보딩 완료 여부 */
  onboarded?: boolean;
  /** 공개 설정(activeUserId·model·onboarded) 충돌 해결용 타임스탬프 */
  appSettingsUpdatedAt?: number;
  /** 마지막 클라우드 동기화 완료 시각 (로컬 전용) */
  lastCloudSyncAt?: number;
}
