export const MODEL_ID = process.env.MODEL_ID!;

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export const THINKING_OFF: Record<string, Record<string, Json>> = /lite/i.test(MODEL_ID)
  ? {}
  : { google: { thinkingConfig: { thinkingBudget: 0 } } };
