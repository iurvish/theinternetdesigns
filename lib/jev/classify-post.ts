import { asBoolean, asChoice, jevEvaluate, pickChoice } from "./client";
import {
  SEARCH_CATEGORIES,
  SEARCH_ELEMENTS,
  SEARCH_INDUSTRIES,
  SEARCH_STYLES,
} from "./taxonomy";

export type PostTagState = {
  title: string | null;
  caption: string | null;
  categories: string[];
  styles: string[];
  industries: string[];
  elements: string[];
};

export type PostClassification = {
  isUi: boolean;
  isUiProbability: number;
  category: string | null;
  style: string | null;
  industry: string | null;
  element: string | null;
  applyCategory: boolean;
  applyStyle: boolean;
  applyIndustry: boolean;
  applyElement: boolean;
};

export async function classifyPost(
  post: PostTagState,
): Promise<PostClassification | null> {
  const result = await jevEvaluate({
    feature: "classify",
    state: {
      title: post.title ?? "",
      caption: (post.caption ?? "").slice(0, 1200),
      existingCategories: post.categories,
      existingStyles: post.styles,
      existingIndustries: post.industries,
      existingElements: post.elements,
    },
    questions: {
      isUi: {
        type: "boolean",
        instructions:
          "Is this a UI, product, brand, type, 3D, or illustration design worth tagging in a design gallery?",
        criteria: {
          true: "A designed interface, landing page, brand, logo, type, 3D, or illustration piece.",
          false: "A meme, selfie, photo dump, or caption with no design artifact.",
        },
      },
      category: {
        type: "choice",
        instructions:
          "Pick the single best public gallery category from the design itself. Override an existing tag if it is wrong.",
        criteria: SEARCH_CATEGORIES,
      },
      style: {
        type: "choice",
        instructions: "Pick the dominant visual style, or none if mixed/unclear.",
        criteria: SEARCH_STYLES,
      },
      industry: {
        type: "choice",
        instructions: "Pick the product industry if the caption or UI makes it clear, else none.",
        criteria: SEARCH_INDUSTRIES,
      },
      element: {
        type: "choice",
        instructions:
          "Pick the primary screen, section, or component shown. none if it is a whole product or not a specific pattern.",
        criteria: SEARCH_ELEMENTS,
      },
    },
  });
  if (!result) return null;

  const isUiProbability = asBoolean(result.answers.isUi)?.probability ?? 0;
  const isUi = isUiProbability >= 0.45;
  const category = pickChoice(asChoice(result.answers.category), 0.62);
  const style = pickChoice(asChoice(result.answers.style), 0.6);
  const industry = pickChoice(asChoice(result.answers.industry), 0.6);
  const element = pickChoice(asChoice(result.answers.element), 0.68);

  return {
    isUi,
    isUiProbability,
    category,
    style,
    industry,
    element,
    applyCategory: Boolean(isUi && category),
    applyStyle: Boolean(isUi && style),
    applyIndustry: Boolean(isUi && industry && industry !== "other"),
    applyElement: Boolean(isUi && element),
  };
}
