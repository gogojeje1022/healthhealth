/**
 * Google Gemini API 래퍼.
 * - 사용자가 본인 API 키를 설정에 입력 → 클라이언트에서 직접 호출 (서버 불필요)
 * - 식단 사진 분석, 건강검진/인바디 OCR + 점수화에 사용
 *
 * Gemini Free Tier:
 *   모델/일별·분당 한도는 Google 정책에 따라 변동됩니다. 429면 한도 초과입니다.
 *   기본 모델은 무료 티어에서 상대적으로 여유 있는 flash-lite 계열을 씁니다.
 */
import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";
import { blobToBase64, compressImage } from "./image";

/** AI Studio 무료 한도 표가 보통 2.5 Flash Lite 기준이므로, 2.0 계열과 쿼터 풀이 다를 수 있음 */
export const DEFAULT_MODEL = "gemini-2.5-flash-lite";

/** 429 등 Google 쿼터/속도 제한 시 사용자 안내 */
function formatGeminiFailure(prefix: string, e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const quota =
    /\b429\b/.test(raw) ||
    /quota|rate limit|exceeded your current quota/i.test(raw);
  if (quota) {
    return `${prefix}: Google API 무료(또는 현재 요금제) 한도를 넘었습니다(429). 한도는 사진 파일 크기보다 하루·분당 요청 횟수와 토큰으로 정해지는 경우가 많습니다. 몇 분~몇 시간 뒤 다시 시도하거나, 설정에서 모델을 gemini-2.5-flash-lite 등(AI Studio 비율 제한에 나온 모델)으로 맞춰 보세요. 사용량: https://ai.dev/rate-limit · 한도 안내: https://ai.google.dev/gemini-api/docs/rate-limits`;
  }
  return `${prefix}: ${raw}`;
}

/** 주 키 한도 초과 시에만 대체 키로 재시도할지 판별 */
function isQuotaLikeError(e: unknown): boolean {
  const parts: string[] = [];
  if (e instanceof AIError) {
    parts.push(e.message);
    if (e.cause instanceof Error) parts.push(e.cause.message);
  } else if (e instanceof Error) {
    parts.push(e.message);
  } else {
    parts.push(String(e));
  }
  const raw = parts.join(" ");
  return (
    /\b429\b/.test(raw) ||
    /quota|rate limit|exceeded your current quota|resource_exhausted/i.test(raw)
  );
}

export class AIError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "AIError";
  }
}

function getModel(apiKey: string, modelName?: string): GenerativeModel {
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: modelName || DEFAULT_MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.4,
    },
  });
}

/** JSON 응답 안전 파싱 (모델이 마크다운으로 감싸도 처리) */
function safeParseJson<T>(text: string): T {
  let t = text.trim();
  // ```json ... ``` 형태 제거
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  }
  // 앞뒤로 붙은 잡문 제거
  const start = t.indexOf("{");
  const startArr = t.indexOf("[");
  const realStart =
    start === -1 ? startArr : startArr === -1 ? start : Math.min(start, startArr);
  if (realStart > 0) t = t.slice(realStart);
  const end = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (end !== -1) t = t.slice(0, end + 1);
  try {
    return JSON.parse(t) as T;
  } catch (e) {
    throw new AIError("AI 응답을 해석하지 못했습니다.", e);
  }
}

// ---------- 식단 분석 ----------

export interface MealAnalysis {
  menuText: string;
  rating: number; // 1~5
  aiComment: string;
  nutrition?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    healthTags?: string[];
  };
}

const MEAL_PROMPT = `당신은 친절한 한국인 영양사입니다. 사용자가 보낸 식사 사진을 분석해 다음 JSON을 한국어로 반환하세요.

규칙:
- 메뉴 이름은 한국식 명칭 우선, 보이는 모든 음식을 콤마로 나열.
- 별점(rating)은 영양 균형/건강도/적정 양 기준 1~5 정수.
- 간단한 한 줄평(aiComment, 30자 내외, 다정한 말투).
- 영양(nutrition)은 1인분 기준 추정치. 모르면 생략 가능.
- healthTags 예: ["고단백","탄수과다","채소부족","가공식품","균형잡힘"] 등 1~4개.

반드시 다음 JSON 스키마만 반환:
{
  "menuText": string,
  "rating": number(1~5),
  "aiComment": string,
  "nutrition": {
    "calories": number?,
    "protein": number?,
    "carbs": number?,
    "fat": number?,
    "healthTags": string[]?
  }
}`;

async function analyzeMealImageOnce(
  apiKey: string,
  forApi: Blob,
  modelName?: string,
): Promise<MealAnalysis> {
  const model = getModel(apiKey, modelName);
  const base64 = await blobToBase64(forApi);
  try {
    const res = await model.generateContent([
      { text: MEAL_PROMPT },
      {
        inlineData: {
          mimeType: forApi.type || "image/jpeg",
          data: base64,
        },
      },
    ]);
    const text = res.response.text();
    const parsed = safeParseJson<MealAnalysis>(text);
    parsed.rating = Math.max(1, Math.min(5, Math.round(Number(parsed.rating) || 3)));
    parsed.menuText = String(parsed.menuText ?? "분석 결과 없음");
    parsed.aiComment = String(parsed.aiComment ?? "");
    return parsed;
  } catch (e) {
    if (e instanceof AIError) throw e;
    throw new AIError(formatGeminiFailure("식단 분석 실패", e), e);
  }
}

export async function analyzeMealImage(
  apiKey: string,
  image: Blob,
  modelName?: string,
  /** 429 등 쿼터 한도일 때만 한 번 더 시도 */
  backupApiKey?: string,
): Promise<MealAnalysis> {
  if (!apiKey.trim()) {
    throw new AIError("Gemini API 키가 설정되지 않았습니다. 설정 화면에서 입력해주세요.");
  }
  const forApi = await compressImage(image, {
    maxDimension: 768,
    quality: 0.78,
    mimeType: "image/jpeg",
  });
  const primary = apiKey.trim();
  const backup = backupApiKey?.trim();
  try {
    return await analyzeMealImageOnce(primary, forApi, modelName);
  } catch (e1) {
    if (!backup || backup === primary || !isQuotaLikeError(e1)) {
      throw e1;
    }
    return await analyzeMealImageOnce(backup, forApi, modelName);
  }
}

// ---------- 건강기록 분석 ----------

export interface HealthAnalysis {
  extractedText: string;
  metrics: Record<string, string | number>;
  healthScore: number; // 0~100
  summary: string;
  strengths: string[];
  concerns: string[];
  recommendations: string[];
}

const HEALTH_PROMPT = `당신은 한국 가정의학과 전문의입니다. 사용자가 보낸 건강검진표 또는 인바디 결과지 사진을 분석하세요.
모든 텍스트를 OCR로 정확히 추출하고, 핵심 측정값(metrics)을 구조화하며, 100점 만점 종합 건강 점수를 매기고, 한국어로 친절하게 코멘트하세요.

규칙:
- extractedText: 사진의 모든 글자를 그대로 (줄바꿈 포함) 옮겨 적기.
- metrics: 키-값 객체. 예: {"체중":"68kg","체지방률":"22%","골격근량":"30kg","BMI":24.1,"공복혈당":"98mg/dL","총콜레스테롤":190,...}
- healthScore: 0~100 정수. 정상범위/경계/위험 항목 고려해 종합 평가.
- summary: 80자 내외 한 줄 종합.
- strengths: 잘하고 있는 점 1~3개 (간결).
- concerns: 주의가 필요한 점 1~3개 (간결).
- recommendations: 실천 가능한 조언 1~3개 (간결, 구체적).
- 의학적 진단은 피하고, 일반 건강 가이드 톤으로.

반드시 다음 JSON 스키마만 반환:
{
  "extractedText": string,
  "metrics": object,
  "healthScore": number(0~100),
  "summary": string,
  "strengths": string[],
  "concerns": string[],
  "recommendations": string[]
}`;

async function analyzeHealthImageOnce(
  apiKey: string,
  forApi: Blob,
  recordType: string,
  modelName?: string,
): Promise<HealthAnalysis> {
  const model = getModel(apiKey, modelName);
  const base64 = await blobToBase64(forApi);
  const prompt = `${HEALTH_PROMPT}\n\n참고: 이 사진의 종류는 "${recordType}" 입니다.`;
  try {
    const res = await model.generateContent([
      { text: prompt },
      {
        inlineData: {
          mimeType: forApi.type || "image/jpeg",
          data: base64,
        },
      },
    ]);
    const text = res.response.text();
    const parsed = safeParseJson<HealthAnalysis>(text);
    parsed.healthScore = Math.max(
      0,
      Math.min(100, Math.round(Number(parsed.healthScore) || 70)),
    );
    parsed.extractedText = String(parsed.extractedText ?? "");
    parsed.summary = String(parsed.summary ?? "");
    parsed.strengths = Array.isArray(parsed.strengths) ? parsed.strengths : [];
    parsed.concerns = Array.isArray(parsed.concerns) ? parsed.concerns : [];
    parsed.recommendations = Array.isArray(parsed.recommendations)
      ? parsed.recommendations
      : [];
    parsed.metrics =
      parsed.metrics && typeof parsed.metrics === "object" ? parsed.metrics : {};
    return parsed;
  } catch (e) {
    if (e instanceof AIError) throw e;
    throw new AIError(formatGeminiFailure("건강기록 분석 실패", e), e);
  }
}

export async function analyzeHealthImage(
  apiKey: string,
  image: Blob,
  recordType: string,
  modelName?: string,
  backupApiKey?: string,
): Promise<HealthAnalysis> {
  if (!apiKey.trim()) {
    throw new AIError("Gemini API 키가 설정되지 않았습니다. 설정 화면에서 입력해주세요.");
  }
  const forApi = await compressImage(image, {
    maxDimension: 1200,
    quality: 0.82,
    mimeType: "image/jpeg",
  });
  const primary = apiKey.trim();
  const backup = backupApiKey?.trim();
  try {
    return await analyzeHealthImageOnce(primary, forApi, recordType, modelName);
  } catch (e1) {
    if (!backup || backup === primary || !isQuotaLikeError(e1)) {
      throw e1;
    }
    return await analyzeHealthImageOnce(backup, forApi, recordType, modelName);
  }
}

// ---------- API 키 검증 ----------

async function pingGeminiOnce(apiKey: string, modelName?: string): Promise<void> {
  const m = new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: modelName || DEFAULT_MODEL,
  });
  try {
    const r = await m.generateContent("ping");
    if (!r.response.text) throw new AIError("응답이 비어있습니다.");
  } catch (e) {
    if (e instanceof AIError) throw e;
    throw new AIError(formatGeminiFailure("API 키 확인 실패", e), e);
  }
}

export interface PingResult {
  /** 실제 호출에 사용된 Gemini 모델명 */
  model: string;
  /** 주 키가 한도(429 등)로 막혀 보조 키로 성공한 경우 true */
  usedBackup: boolean;
}

export async function pingGemini(
  apiKey: string,
  modelName?: string,
  backupApiKey?: string,
): Promise<PingResult> {
  if (!apiKey.trim()) {
    throw new AIError("Gemini API 키가 비어 있습니다.");
  }
  const primary = apiKey.trim();
  const backup = backupApiKey?.trim();
  const model = modelName || DEFAULT_MODEL;
  try {
    await pingGeminiOnce(primary, model);
    return { model, usedBackup: false };
  } catch (e1) {
    if (!backup || backup === primary || !isQuotaLikeError(e1)) {
      throw e1;
    }
    await pingGeminiOnce(backup, model);
    return { model, usedBackup: true };
  }
}
