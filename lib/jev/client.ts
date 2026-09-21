import { experimental_evaluate as evaluate } from "ai";
import { typeSafeAi } from "@ai-sdk/typesafe-ai";

export const JEV_MODEL = "jev-latest";

export function jevConfigured(): boolean {
  return Boolean(process.env.TYPESAFE_AI_API_KEY);
}

export type JevFeature = "search" | "classify" | "similar" | "smoke";

export type JevChoiceAnswer = {
  type: "choice";
  choice: string;
  probabilities?: Record<string, number>;
};
export type JevScoreAnswer = {
  type: "score";
  score: number;
  probabilities?: Record<string, number>;
};
export type JevBooleanAnswer = {
  type: "boolean";
  probability: number;
};
export type JevAnswer = JevChoiceAnswer | JevScoreAnswer | JevBooleanAnswer;

export async function jevEvaluate(opts: {
  state: unknown;
  questions: Record<string, unknown>;
  feature: JevFeature;
}): Promise<{ answers: Record<string, JevAnswer> } | null> {
  if (!jevConfigured()) return null;
  try {
    const result = await evaluate({
      model: typeSafeAi.evaluationModel(JEV_MODEL),
      state: opts.state as Parameters<typeof evaluate>[0]["state"],
      questions: opts.questions as Parameters<typeof evaluate>[0]["questions"],
    });
    return { answers: result.answers as Record<string, JevAnswer> };
  } catch (error) {
    console.warn("[jev] evaluate failed", opts.feature, error);
    return null;
  }
}

export function asChoice(answer: JevAnswer | undefined): JevChoiceAnswer | undefined {
  return answer?.type === "choice" ? answer : undefined;
}

export function asScore(answer: JevAnswer | undefined): JevScoreAnswer | undefined {
  return answer?.type === "score" ? answer : undefined;
}

export function asBoolean(answer: JevAnswer | undefined): JevBooleanAnswer | undefined {
  return answer?.type === "boolean" ? answer : undefined;
}

export function choiceProbability(answer: JevChoiceAnswer | undefined): number {
  if (!answer) return 0;
  return answer.probabilities?.[answer.choice] ?? 0;
}

export function pickChoice(
  answer: JevChoiceAnswer | undefined,
  floor = 0.55,
): string | null {
  if (!answer) return null;
  if (answer.choice === "none") return null;
  if (choiceProbability(answer) < floor) return null;
  return answer.choice;
}
