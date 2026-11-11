import { generateText, stepCountIs } from "ai";
import { google } from "@ai-sdk/google";
import { tools } from "../src/lib/tools";
import { SYSTEM_PROMPT } from "../src/lib/prompt";
import { MODEL_ID, THINKING_OFF } from "../src/lib/model";

type Case = {
  q: string;
  must?: string[];
  mustNot?: string[];

  expectNotFound?: boolean;
};

const CASES: Case[] = [
  { q: "می‌توانم کالا را بعد از ۱۰ روز پس بدهم؟", must: ["۷ روز"] },
  {
    q: "ارسال به شیراز چقدر طول می‌کشد و هزینه‌اش چقدر است؟",
    must: ["پیشتاز", "۸۹"],
  },
  { q: "آیا پرداخت در محل برای شیراز هم دارید؟", must: ["تهران", "کرج"] },
  {
    q: "کاپشن قله سایز XXL همین الان موجود است؟",
    expectNotFound: true,
  },
];

const NOT_FOUND =
  /(could not|couldn't|not (?:been )?found|no information|does not (?:mention|contain)|don'?t have|do not have|no access|cannot (?:see|check|verify|confirm|find)|unable to (?:check|verify|confirm|find)|not able to (?:check|verify|find)|پیدا نکردم|ندارم|ذکر نشده)/i;

async function runOne(c: Case) {
  const started = Date.now();
  const { text, steps } = await generateText({
    model: google(MODEL_ID),
    system: SYSTEM_PROMPT,
    prompt: c.q,
    tools,
    stopWhen: stepCountIs(6),
    maxOutputTokens: 1000,
    temperature: 0.2,
    providerOptions: THINKING_OFF,
  });

  const usedTools = steps.flatMap((s) => s.toolCalls.map((t) => t.toolName));
  const haystack = text.toLowerCase().replace(/[-–—]/g, " ");
  const missing = (c.must ?? []).filter(
    (m) => !haystack.includes(m.toLowerCase().replace(/[-–—]/g, " "))
  );
  const forbidden = (c.mustNot ?? []).filter((m) => text.toLowerCase().includes(m.toLowerCase()));
  const notFoundOk = c.expectNotFound ? NOT_FOUND.test(text) : true;
  const passed = missing.length === 0 && forbidden.length === 0 && notFoundOk;

  return { passed, text, usedTools, missing, forbidden, notFoundOk, ms: Date.now() - started };
}

const PACE_MS = Number(process.env.EVAL_PACE_MS ?? 15000);

async function main() {
  let pass = 0;
  for (const [i, c] of CASES.entries()) {
    if (i > 0) await new Promise((res) => setTimeout(res, PACE_MS));
    const r = await runOne(c);
    if (r.passed) pass++;
    const reasons = [
      r.missing.length ? `missing: ${r.missing.join(", ")}` : "",
      r.forbidden.length ? `forbidden: ${r.forbidden.join(", ")}` : "",
      r.notFoundOk ? "" : "expected a not-found answer",
    ].filter(Boolean);

    console.log(
      `${r.passed ? "PASS" : "FAIL"}  ${r.ms}ms  tools=[${r.usedTools.join(",")}]  ${c.q}`
    );
    if (!r.passed) console.log(`      ${reasons.join(" | ")}\n      answer: ${r.text.slice(0, 240)}`);
  }
  console.log(`\n${pass}/${CASES.length} passed`);
  if (pass !== CASES.length) process.exit(1);
}

main().catch((e) => {
  console.error("Eval crashed:", e);
  process.exit(1);
});
