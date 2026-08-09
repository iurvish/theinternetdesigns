/** Admin-selectable interaction labels for the post side panel. */
export const INTERACTION_TYPES = [
  "MicroInteraction",
  "Hover",
  "Scroll",
  "Click",
  "Drag",
  "Transition",
  "Animation",
] as const;

export type InteractionType = (typeof INTERACTION_TYPES)[number];
