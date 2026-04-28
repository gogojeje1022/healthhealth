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

/** UI 강조색 테마 — :root[data-theme="..."] 와 매핑됨. */
export type ThemeId = "green" | "blue" | "pink" | "yellow";

/** 설정 페이지 노출 순서 — 사용자가 바라는 정렬 (그린→블루→핑크→옐로). */
export const THEME_IDS: ThemeId[] = ["green", "blue", "pink", "yellow"];

export const THEME_LABELS: Record<ThemeId, string> = {
  green: "그린",
  blue: "블루",
  pink: "핑크",
  yellow: "옐로",
};

/** 미지정·알 수 없는 값에 대한 폴백 테마. 첫 사용자는 그린을 보게 됩니다. */
export const DEFAULT_THEME: ThemeId = "green";

export interface AppSettings {
  id: "settings";
  geminiApiKey?: string;
  /** 활성 프로필 id (1인 앱이지만 Dexie users 테이블의 어떤 행을 쓰는지 식별) */
  activeUserId?: string;
  /** 온보딩 완료 여부 */
  onboarded?: boolean;
  /** UI 테마 (브랜드 강조색). 미지정이면 default(블랙). */
  theme?: ThemeId;
  /** 공개 설정(activeUserId·onboarded·theme) 충돌 해결용 타임스탬프 */
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

export type FollowRequestStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "cancelled";

/**
 * /followRequests/{id}
 *
 * 인스타그램 follow 신청과 동일한 의미입니다.
 * 신청자(fromUid)가 수신자(toEmail/toUid)에게 "당신의 기록을 보고 싶어요"라고 요청합니다.
 * 수락되면 수신자가 owner, 신청자가 viewer 인 단방향 share 문서가 만들어집니다.
 */
export interface FollowRequest {
  id: string;
  /** 신청자(viewer 후보) */
  fromUid: string;
  fromEmail: string;
  fromName: string;
  fromPhotoURL?: string;
  /** 수신자(owner 후보) — 소문자 정규화 */
  toEmail: string;
  /** 수락 시 채워짐 */
  toUid?: string;
  /** 신청자가 보고 싶은 범위 (수신자에게 공개를 요청하는 범위) */
  requestedScope: ShareScope;
  status: FollowRequestStatus;
  createdAt: number;
  updatedAt: number;
}

/**
 * /users/{ownerUid}/meals/{mealId}/comments/{commentId}
 *
 * 식단 댓글. 작성자(authorUid) 가 수정·삭제 가능, 식단 소유자(ownerUid) 도 삭제 가능.
 */
export interface MealComment {
  id: string;
  ownerUid: string;
  mealId: string;
  authorUid: string;
  authorName: string;
  authorPhotoURL?: string;
  text: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * /shares/{ownerUid}_{viewerUid}
 *
 * 한 방향당 한 문서. owner 의 데이터 중 scope 에 해당하는 부분이 viewer 에게 보입니다.
 * 맞팔이면 두 개의 share 문서(서로 owner/viewer 가 뒤집힌)가 존재합니다.
 */
export interface Share {
  id: string;
  ownerUid: string;
  viewerUid: string;
  scope: ShareScope;
  ownerEmail: string;
  ownerName: string;
  ownerPhotoURL?: string;
  viewerEmail: string;
  viewerName: string;
  viewerPhotoURL?: string;
  createdAt: number;
  updatedAt: number;
}
