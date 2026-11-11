import { google } from "@ai-sdk/google";
import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from "ai";
import { tools } from "@/lib/tools";
import { SYSTEM_PROMPT } from "@/lib/prompt";
import { MODEL_ID, THINKING_OFF } from "@/lib/model";
import { checkLimits } from "@/lib/ratelimit";

export const maxDuration = 60;

function textLength(m: UIMessage) {
  return m.parts.reduce((n, p) => n + (p.type === "text" ? p.text.length : 0), 0);
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limit = await checkLimits(ip);
  if (!limit.ok) return new Response(limit.message, { status: 429 });

  let messages: UIMessage[];
  try {
    ({ messages } = await req.json());
  } catch {
    return new Response("درخواست نامعتبر است.", { status: 400 });
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response("درخواست نامعتبر است.", { status: 400 });
  }

  const last = messages[messages.length - 1];
  if (last.role !== "user") {
    return new Response("درخواست نامعتبر است.", { status: 400 });
  }
  if (textLength(last) > 1000) {
    return new Response("پیام بیش از حد طولانی است (حداکثر ۱۰۰۰ کاراکتر).", {
      status: 400,
    });
  }

  let start = Math.max(0, messages.length - 11);
  while (start < messages.length - 1 && messages[start].role !== "user") start++;
  const recent = messages.slice(start);

  const result = streamText({
    model: google(MODEL_ID),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(recent),
    tools,
    stopWhen: stepCountIs(6), // سقف حلقه ایجنت
    maxOutputTokens: 1000,
    temperature: 0.2,
    providerOptions: THINKING_OFF,
    onFinish: ({ steps }) => {
      const used = steps.flatMap((s) => s.toolCalls.map((t) => t.toolName));
      console.log("[agent]", { steps: steps.length, tools: used });
    },
  });

  return result.toUIMessageStreamResponse({
    onError: (e) => {
      console.error("[stream error]", e);
      return "خطایی رخ داد. لطفاً چند لحظه بعد دوباره تلاش کنید.";
    },
  });
}
