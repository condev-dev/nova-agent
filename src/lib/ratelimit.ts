import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const enabled = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = enabled ? Redis.fromEnv() : null;

const perIp = redis
  ? new Ratelimit({ redis, prefix: "rl:ip", limiter: Ratelimit.slidingWindow(15, "1 h") })
  : null;
const perDay = redis
  ? new Ratelimit({ redis, prefix: "rl:day", limiter: Ratelimit.fixedWindow(300, "1 d") })
  : null;

export async function checkLimits(ip: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!perIp || !perDay) return { ok: true };
  if (!(await perIp.limit(ip)).success) {
    return {
      ok: false,
      message: "درخواست از این شبکه زیاد شده است. لطفاً کمی بعد دوباره تلاش کنید.",
    };
  }
  if (!(await perDay.limit("global")).success) {
    return {
      ok: false,
      message: "سهمیه امروزِ دموی رایگان تمام شد. لطفاً فردا دوباره امتحان کنید.",
    };
  }
  return { ok: true };
}
