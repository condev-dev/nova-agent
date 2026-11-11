"use client";

import { useChat } from "@ai-sdk/react";
import {
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  ExternalLink,
  MessageSquarePlus,
  Moon,
  RefreshCcw,
  Square,
  Sun,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
  WifiOff,
} from "lucide-react";

const BRAND = "نوا";
const CHAR_LIMIT = 1000;

function toFaDigits(input: number | string): string {
  return String(input).replace(/[0-9]/g, (d) =>
    String.fromCharCode(0x06f0 + Number(d)),
  );
}

function isSafeHref(href: string): boolean {
  const trimmed = href.trim();

  if (trimmed.startsWith("#") || trimmed.startsWith("/")) return true;
  try {
    const u = new URL(trimmed, "https://x.local");
    const proto = u.protocol.toLowerCase();
    return proto === "http:" || proto === "https:" || proto === "mailto:";
  } catch {
    return false;
  }
}

function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

function renderWithCitations(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /\[([0-9۰-۹]{1,2})\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));

    const raw = m[1].replace(/[۰-۹]/g, (c) =>
      String(c.charCodeAt(0) - 0x06f0),
    );
    const n = Number(raw);
    const fa = toFaDigits(n);
    parts.push(
      <span key={`c-${key++}-${m.index}`} className="cite" aria-label={`منبع ${fa}`}>
        {fa}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

type ToolPart = {
  type: string;
  state?: string;
  input?: { query?: string; source?: string };
  output?: unknown;
};

type SearchResult = { source: string; similarity?: number; text?: string };
type SearchOutput = { found?: boolean; results?: SearchResult[] };

function extractSources(parts: ReadonlyArray<unknown>): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const p of parts) {
    const part = p as ToolPart;
    if (part?.type === "tool-search_knowledge" && part.output) {
      const out = part.output as SearchOutput;
      if (out?.results && Array.isArray(out.results)) {
        for (const r of out.results) {
          if (r?.source && !seen.has(r.source)) {
            seen.add(r.source);
            list.push(r.source);
          }
        }
      }
    }
    if (part?.type === "tool-read_document" && part.output) {
      const out = part.output as { source?: string };
      if (out?.source && !seen.has(out.source)) {
        seen.add(out.source);
        list.push(out.source);
      }
    }
  }
  return list;
}

function extractText(parts: ReadonlyArray<unknown>): string {
  let out = "";
  for (const p of parts) {
    const part = p as { type: string; text?: string };
    if (part?.type === "text" && typeof part.text === "string") {
      out += part.text;
    }
  }
  return out;
}

const SUGGESTIONS = [
  "ارسال به شیراز چقدر طول می‌کشد و هزینه‌اش چقدر است؟",
  "تا چند روز می‌توانم کالا را مرجوع کنم؟",
  "شرایط گارانتی کاپشن‌های نوا چیست؟",
  "راهنمای سایزبندی لباس‌ها را از کجا ببینم؟",
];

type Theme = "light" | "dark";

const THEME_EVENT = "nova-theme-change";

function subscribeTheme(cb: () => void) {
  window.addEventListener(THEME_EVENT, cb);
  return () => window.removeEventListener(THEME_EVENT, cb);
}
function getThemeSnapshot(): Theme {
  const t = document.documentElement.getAttribute("data-theme");
  return t === "dark" ? "dark" : "light";
}
function getServerTheme(): Theme {
  return "dark";
}

function useTheme() {
  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getServerTheme);

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("nova-theme", next);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return { theme, toggle };
}

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}
function getOnlineSnapshot(): boolean {
  return navigator.onLine;
}
function getServerOnline(): boolean {
  return true;
}

function useOnline() {
  return useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerOnline);
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function Header({
  onReset,
  canReset,
  onToggleTheme,
  theme,
}: {
  onReset: () => void;
  canReset: boolean;
  onToggleTheme: () => void;
  theme: Theme;
}) {
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <div className="brand">
          <span className="brand-mark" role="img" aria-label={BRAND} />
          <span className="brand-tag">دستیار اسناد</span>
        </div>
        <div className="ms-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onReset}
            className="icon-btn icon-btn-outline"
            disabled={!canReset}
            title="گفتگوی جدید"
            aria-label="شروع گفتگوی جدید"
          >
            <MessageSquarePlus size={16} aria-hidden />
            <span className="icon-btn-label">گفتگوی جدید</span>
          </button>
          <button
            type="button"
            onClick={onToggleTheme}
            className="icon-btn"
            title={theme === "dark" ? "تم روشن" : "تم تاریک"}
            aria-label={theme === "dark" ? "تغییر به تم روشن" : "تغییر به تم تاریک"}
          >
            {theme === "dark" ? (
              <Sun size={16} aria-hidden />
            ) : (
              <Moon size={16} aria-hidden />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}

function Welcome({ onPick, disabled }: { onPick: (q: string) => void; disabled: boolean }) {
  return (
    <div className="welcome">
      <div>
        <span className="welcome-logo" role="img" aria-label={BRAND} />
        <h1 className="welcome-title">سلام، به فروشگاه {BRAND} خوش آمدید</h1>
        <p className="welcome-sub">
          می‌توانم درباره‌ی ارسال، مرجوعی، گارانتی، سایزبندی و قوانین فروشگاه از روی اسناد
          رسمی پاسخ بدهم و منبع هر پاسخ را ذکر کنم.
        </p>
      </div>
      <div className="suggest-grid" role="list">
        {SUGGESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            role="listitem"
            className="suggest-card"
            onClick={() => onPick(q)}
            disabled={disabled}
            dir="auto"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(async () => {
    const ok = await copyText(children);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [children]);
  return (
    <div className="code-block">
      <button
        type="button"
        className="code-copy"
        onClick={onCopy}
        aria-label="کپی کد"
        title="کپی"
      >
        {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
        <span>{copied ? "کپی شد" : "کپی"}</span>
      </button>
      <pre dir="ltr">
        <code>{children}</code>
      </pre>
    </div>
  );
}

const MD_COMPONENTS: Components = {
  p({ children }) {
    return (
      <p dir="auto">
        {typeof children === "string" ? renderWithCitations(children) : children}
      </p>
    );
  },
  li({ children }) {
    return (
      <li dir="auto">
        {typeof children === "string" ? renderWithCitations(children) : children}
      </li>
    );
  },
  h1({ children }) {
    return <h1 dir="auto">{children}</h1>;
  },
  h2({ children }) {
    return <h2 dir="auto">{children}</h2>;
  },
  h3({ children }) {
    return <h3 dir="auto">{children}</h3>;
  },
  h4({ children }) {
    return <h4 dir="auto">{children}</h4>;
  },
  blockquote({ children }) {
    return <blockquote dir="auto">{children}</blockquote>;
  },
  table({ children }) {
    return (
      <div className="table-scroll scroll-area">
        <table>{children}</table>
      </div>
    );
  },
  th({ children }) {
    return <th dir="auto">{children}</th>;
  },
  td({ children }) {
    return <td dir="auto">{children}</td>;
  },
  a({ href, children }) {
    const url = href ?? "";
    if (!isSafeHref(url)) {

      return <span>{children}</span>;
    }
    const external = isExternal(url);
    return (
      <a
        href={url}
        className="link ltr-iso"
        {...(external
          ? { target: "_blank", rel: "noopener noreferrer" }
          : {})}
      >
        {children}
        {external && (
          <ExternalLink
            size={12}
            className="ext-icon"
            aria-label="لینک خارجی"
          />
        )}
      </a>
    );
  },
  code(props) {
    const { inline, className, children } = props as {
      inline?: boolean;
      className?: string;
      children?: ReactNode;
    };
    const text = String(children ?? "").replace(/\n$/, "");
    if (inline) {
      return (
        <code dir="ltr" className={className}>
          {text}
        </code>
      );
    }
    return <CodeBlock>{text}</CodeBlock>;
  },
  pre({ children }) {

    return <>{children}</>;
  },
};

const TOOL_LABEL: Record<string, string> = {
  "tool-search_knowledge": "جست‌وجو در اسناد",
  "tool-list_sources": "فهرست اسناد",
  "tool-read_document": "خواندن سند",
};

function ToolChip({ part }: { part: ToolPart }) {
  const label = TOOL_LABEL[part.type] ?? part.type;
  const done = part.state === "output-available";
  const q = part.input?.query ?? part.input?.source ?? "";
  return (
    <span className="tool-chip" data-done={done} dir="rtl">
      <span className="dot" aria-hidden />
      <span>{label}</span>
      {q && (
        <span className="q" dir="auto" title={q}>
          «{q}»
        </span>
      )}
    </span>
  );
}

type UIParts = ReadonlyArray<unknown>;

function Message({
  role,
  parts,
  isLast,
  busy,
  onRetry,
}: {
  role: string;
  parts: UIParts;
  isLast: boolean;
  busy: boolean;
  onRetry: () => void;
}) {
  const isUser = role === "user";
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  const text = useMemo(() => extractText(parts), [parts]);
  const sources = useMemo(() => (isUser ? [] : extractSources(parts)), [parts, isUser]);

  const onCopy = useCallback(async () => {
    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [text]);

  return (
    <div className={`msg ${isUser ? "msg-user" : "msg-bot"}`}>
      <div
        className={`msg-avatar ${isUser ? "msg-avatar-user" : "msg-avatar-bot"}`}
        aria-hidden
      />
      <div className="msg-body">
        <div className="msg-role">{isUser ? "شما" : BRAND}</div>

        {!isUser && (
          <div className="tool-row">
            {parts
              .map((p) => p as ToolPart)
              .filter((p) => typeof p?.type === "string" && p.type.startsWith("tool-"))
              .map((p, i) => (
                <ToolChip key={i} part={p} />
              ))}
          </div>
        )}

        <div className="msg-content">
          {parts.map((raw, i) => {
            const part = raw as { type: string; text?: string };
            if (part?.type === "text" && typeof part.text === "string" && part.text) {
              return (
                <div key={i} className="md" dir="auto">
                  <ReactMarkdown

                    remarkPlugins={[remarkGfm]}
                    components={MD_COMPONENTS}
                    skipHtml
                  >
                    {part.text}
                  </ReactMarkdown>
                </div>
              );
            }
            return null;
          })}
        </div>

        {!isUser && sources.length > 0 && (
          <div className="sources" aria-label="منابع">
            {sources.map((s, i) => (
              <span key={s} className="source-chip">
                <span className="n num-fa">{toFaDigits(i + 1)}</span>
                <span dir="auto">{s}</span>
              </span>
            ))}
          </div>
        )}

        {!isUser && text && !busy && (
          <div className="msg-actions">
            <button
              type="button"
              className="icon-btn"
              onClick={onCopy}
              aria-label="کپی پاسخ"
              title="کپی"
            >
              {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
            </button>
            {isLast && (
              <button
                type="button"
                className="icon-btn"
                onClick={onRetry}
                aria-label="تلاش دوباره برای پاسخ"
                title="تلاش دوباره"
              >
                <RefreshCcw size={14} aria-hidden />
              </button>
            )}
            <button
              type="button"
              className="icon-btn"
              onClick={() => setFeedback(feedback === "up" ? null : "up")}
              data-active={feedback === "up"}
              aria-label="این پاسخ مفید بود"
              aria-pressed={feedback === "up"}
              title="پسندیدم"
            >
              <ThumbsUp size={14} aria-hidden />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setFeedback(feedback === "down" ? null : "down")}
              data-active={feedback === "down"}
              aria-label="این پاسخ مفید نبود"
              aria-pressed={feedback === "down"}
              title="نپسندیدم"
            >
              <ThumbsDown size={14} aria-hidden />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Chat() {
  const { messages, sendMessage, status, error, stop, setMessages, regenerate } =
    useChat();
  const [input, setInput] = useState("");
  const [showFab, setShowFab] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottomRef = useRef(true);
  const userScrolledUpRef = useRef(false);

  const online = useOnline();
  const { theme, toggle } = useTheme();

  const busy = status === "submitted" || status === "streaming";
  const isEmpty = messages.length === 0;

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 180) + "px";
  }, [input]);

  const scrollToBottom = useCallback((smooth = false) => {
    stickToBottomRef.current = true;
    userScrolledUpRef.current = false;
    const el = scrollRef.current;
    if (!el) return;
    if (smooth) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distance <= 40) {
        stickToBottomRef.current = true;
        userScrolledUpRef.current = false;
      } else if (distance > 120) {
        stickToBottomRef.current = false;
        userScrolledUpRef.current = true;
      }
      setShowFab(distance > 240);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      if (!userScrolledUpRef.current && stickToBottomRef.current) {
        el.scrollTop = el.scrollHeight;
      }
    });

    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!userScrolledUpRef.current) {
      stickToBottomRef.current = true;
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages, status]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const send = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t || busy) return;
      sendMessage({ text: t });
      setInput("");
      scrollToBottom(false);
      requestAnimationFrame(() => {
        scrollToBottom(false);
        textareaRef.current?.focus();
      });
    },
    [busy, sendMessage, scrollToBottom],
  );

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {

      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        send(input);
      }
    },
    [input, send],
  );

  const onReset = useCallback(() => {
    if (busy) stop();
    setMessages([]);
    setInput("");
    stickToBottomRef.current = true;
    userScrolledUpRef.current = false;
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = 0;
      textareaRef.current?.focus();
    });
  }, [busy, stop, setMessages]);

  const onRetry = useCallback(() => {
    userScrolledUpRef.current = false;
    stickToBottomRef.current = true;
    regenerate();
  }, [regenerate]);

  const onFabClick = useCallback(() => {
    scrollToBottom(true);
  }, [scrollToBottom]);

  const charCount = input.length;
  const nearLimit = charCount > CHAR_LIMIT * 0.9;

  const statusText = !online
    ? "اتصال اینترنت قطع است"
    : busy
      ? status === "submitted"
        ? "در حال خواندن اسناد…"
        : "در حال نوشتن پاسخ…"
      : `دستیار ${BRAND} آماده پاسخ است`;

  const lastMessageId = messages.length ? messages[messages.length - 1].id : null;

  return (
    <div className="app-root">
      {!online && (
        <div className="offline-banner" role="status">
          <span className="inline-flex items-center gap-1.5">
            <WifiOff size={12} aria-hidden />
            اتصال اینترنت برقرار نیست.
          </span>
        </div>
      )}

      <Header
        onReset={onReset}
        canReset={!isEmpty || busy}
        onToggleTheme={toggle}
        theme={theme}
      />

      <div ref={scrollRef} className="chat-scroll scroll-area">
        <div className="chat-inner">
          {isEmpty ? (
            <Welcome onPick={send} disabled={busy || !online} />
          ) : (
            <>
              {messages.map((m) => (
                <Message
                  key={m.id}
                  role={m.role}
                  parts={m.parts as UIParts}
                  isLast={m.id === lastMessageId && m.role === "assistant"}
                  busy={busy}
                  onRetry={onRetry}
                />
              ))}

              {status === "submitted" && (
                <div className="msg msg-bot">
                  <div className="msg-avatar msg-avatar-bot" aria-hidden />
                  <div className="msg-body">
                    <div className="msg-role">{BRAND}</div>
                    <div className="msg-content">
                      <span
                        className="thinking"
                        role="status"
                        aria-label="در حال نوشتن پاسخ"
                      >
                        <span />
                        <span />
                        <span />
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="error-card" role="alert">
                  <TriangleAlert size={16} aria-hidden style={{ flexShrink: 0 }} />
                  <div className="flex-1">
                    <div className="font-semibold">خطایی رخ داد</div>
                    <div
                      className="mt-0.5"
                      style={{ color: "var(--fg-muted)" }}
                      dir="auto"
                    >
                      {error.message?.trim() ||
                        "پاسخی دریافت نشد. لطفاً دوباره تلاش کنید."}
                    </div>
                    <div className="error-actions">
                      <button
                        type="button"
                        className="icon-btn icon-btn-outline"
                        onClick={onRetry}
                      >
                        <RefreshCcw size={14} aria-hidden />
                        <span className="icon-btn-label">تلاش مجدد</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {showFab && !isEmpty && (
          <div className="fab-wrap">
            <button
              type="button"
              className="fab"
              onClick={onFabClick}
              aria-label="رفتن به پایین"
              title="رفتن به پایین"
            >
              <ArrowDown size={16} aria-hidden />
            </button>
          </div>
        )}
      </div>

      <div className="composer-wrap">
        <div className="composer-inner">
          {/* راهنمای کلیدها برای screen reader — در UI نمایش داده نمی‌شود */}
          <p id="composer-help" className="sr-only">
            کلید Enter پیام را ارسال می‌کند، Shift+Enter خط جدید می‌سازد. حداکثر ۱۰۰۰
            کاراکتر.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="composer"
            aria-label="فرم ارسال پیام"
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, CHAR_LIMIT))}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder={`پیام‌تان را به ${BRAND} بنویسید…`}
              aria-label="متن پیام"
              aria-describedby="composer-help"
              disabled={!online}
            />
            {busy ? (
              <button
                type="button"
                onClick={() => stop()}
                className="btn-stop"
                aria-label="توقف پاسخ"
                title="توقف"
              >
                <Square size={14} aria-hidden fill="currentColor" />
              </button>
            ) : (
              <button
                type="submit"
                className="btn-send"
                disabled={!input.trim() || !online}
                aria-label="ارسال پیام"
                title="ارسال"
              >
                {/* فلش بالا، در RTL هم همان جهت درسته */}
                <ArrowUp size={16} aria-hidden />
              </button>
            )}
          </form>

          <div
            className="composer-status"
            data-busy={busy}
            data-offline={!online}
            role="status"
            aria-live="polite"
          >
            <span className="status-dot" aria-hidden />
            <span className="status-text">{statusText}</span>
            {charCount > 0 && (
              <span
                className="composer-counter num-fa"
                data-near={nearLimit}
                aria-label={`${toFaDigits(charCount)} از ${toFaDigits(CHAR_LIMIT)} کاراکتر`}
              >
                {toFaDigits(charCount)} / {toFaDigits(CHAR_LIMIT)}
              </span>
            )}
          </div>
        </div>
      </div>

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <div className="toast-inner">{toast}</div>
        </div>
      )}
    </div>
  );
}
