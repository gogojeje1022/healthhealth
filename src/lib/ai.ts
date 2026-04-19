/**
 * Google Gemini API 래퍼.
 * - 사용자가 본인 API 키를 설정에 입력 → 클라이언트에서 직접 호출 (서버 불필요)
 * - 식단 사진 분석, 건강검진/인바디 OCR + 점수화에 사용
 *
 * Gemini Free Tier:
 *   gemini-2.0-flash 등 무료 사용량 충분 (개인/가족용으로 매우 여유)
 */
import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";
import { blobToBase64 } from "./image";

const DEFAULT_MODEL = "gemini-2.0-flash";

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

export async function analyzeMealImage(
  apiKey: string,
  image: Blob,
  modelName?: string,
): Promise<MealAnalysis> {
  if (!apiKey) throw new AIError("Gemini API 키가 설정되지 않았습니다. 설정 화면에서 입력해주세요.");
  const model = getModel(apiKey, modelName);
  const base64 = await blobToBase64(image);
  try {
    const res = await model.generateContent([
      { text: MEAL_PROMPT },
      {
        inlineData: {
          mimeType: image.type || "image/jpeg",
          data: base64,
        },
      },
    ]);
    const text = res.response.text();
    const parsed = safeParseJson<MealAnalysis>(text);
    // 정합성 보정
    parsed.rating = Math.max(1, Math.min(5, Math.round(Number(parsed.rating) || 3)));
    parsed.menuText = String(parsed.menuText ?? "분석 결과 없음");
    parsed.aiComment = String(parsed.aiComment ?? "");
    return parsed;
  } catch (e) {
    if (e instanceof AIError) throw e;
    throw new AIError(
      e instanceof Error ? `식단 분석 실패: ${e.message}` : "식단 분석 실패",
      e,
    );
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

export async function analyzeHealthImage(
  apiKey: string,
  image: Blob,
  recordType: string,
  modelName?: string,
): Promise<HealthAnalysis> {
  if (!apiKey) throw new AIError("Gemini API 키가 설정되지 않았습니다. 설정 화면에서 입력해주세요.");
  const model = getModel(apiKey, modelName);
  const base64 = await blobToBase64(image);
  const prompt = `${HEALTH_PROMPT}\n\n참고: 이 사진의 종류는 "${recordType}" 입니다.`;
  try {
    const res = await model.generateContent([
      { text: prompt },
      {
        inlineData: {
          mimeType: image.type || "image/jpeg",
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
    throw new AIError(
      e instanceof Error ? `건강기록 분석 실패: ${e.message}` : "건강기록 분석 실패",
      e,
    );
  }
}

// ---------- API 키 검증 ----------

export async function pingGemini(apiKey: string, modelName?: string): Promise<void> {
  const m = new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: modelName || DEFAULT_MODEL,
  });
  // 가장 가벼운 호출
  const r = await m.generateContent("ping");
  if (!r.response.text) throw new AIError("응답이 비어있습니다.");
}
