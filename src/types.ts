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
  /** 활성 사용자 ID (마지막 선택) */
  activeUserId?: string;
  /** AI 모델 */
  model?: string;
  /** 온보딩 완료 여부 */
  onboarded?: boolean;
  /** 공개 설정(activeUserId·model·onboarded) 충돌 해결용 타임스탬프 */
  appSettingsUpdatedAt?: number;
  /** Gemini 키 충돌 해결용 — 계정별 Firestore config/private 동기화 */
  geminiSettingsUpdatedAt?: number;
  /** 마지막 클라우드 동기화 완료 시각 (로컬 전용) */
  lastCloudSyncAt?: number;
  /**
   * 로컬에서 삭제 후 Firestore 반영 전·병합 시 원격 부활 방지용 ID (로컬만, 동기화 후 정리)
   */
  cloudPendingDeletes?: {
    meals?: string[];
    health?: string[];
    members?: string[];
  };
}

/** 친구 공유 기능 — Firestore 전용 타입 (로컬 IndexedDB 에는 저장하지 않음) */

export interface ShareScope {
  /** 식사·달력 기록 공개 */
  calendar: boolean;
  /** 건강 기록 공개 */
  health: boolean;
}

/** /publicProfiles/{uid} — 로그인 사용자 전체가 읽을 수 있는 최소한의 공개 정보 */
export interface PublicProfile {
  uid: string;
  /** 소문자 정규화된 이메일 */
  email: string;
  displayName: string;
  photoURL?: string;
  updatedAt: number;
}

export type FriendRequestStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "cancelled";

/** /friendRequests/{id} */
export interface FriendRequest {
  id: string;
  fromUid: string;
  fromEmail: string;
  fromName: string;
  fromPhotoURL?: string;
  /** 소문자 정규화 */
  toEmail: string;
  /** 수락 전까지 비어 있을 수 있음 */
  toUid?: string;
  /** 신청자가 공개할 범위 */
  scopeFromRequester: ShareScope;
  status: FriendRequestStatus;
  createdAt: number;
  updatedAt: number;
}

/** /friendships/{`${min}_${max}`} */
export interface Friendship {
  id: string;
  /** 정렬된 두 UID */
  users: [string, string];
  /** 각 사용자(uid)가 상대에게 공개하는 범위 */
  shares: Record<string, ShareScope>;
  emails: Record<string, string>;
  names: Record<string, string>;
  photos?: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}
