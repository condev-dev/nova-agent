"use client";

import { useChat } from "@ai-sdk/react";
import {
  cloneElement,
  ComponentType,
  KeyboardEvent as ReactKeyboardEvent,
  ReactElement,
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
  ArrowUp,
  BookOpen,
  Brain,
  Check,
  CircleDashed,
  Copy,
  ExternalLink,
  FileText,
  LoaderCircle,
  PenLine,
  MessageSquarePlus,
  Moon,
  RefreshCcw,
  ScanLine,
  Search,
  Sparkles,
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

const SOURCE_TITLES: Record<string, string> = {
  company: "درباره ما",
  shipping: "ارسال و تحویل",
  returns: "بازگشت کالا و تعویض",
  warranty: "گارانتی و تعمیرات",
  payment: "پرداخت و تخفیف",
  sizing: "سایزبندی و نگهداری",
  faq: "سؤال‌های پرتکرار",
};

const PERSIAN_SOURCE_MAP: Record<string, string> = {
  "درباره ما": "company",
  "ارسال و تحویل": "shipping",
  "ارسال": "shipping",
  "بازگشت کالا و تعویض": "returns",
  "بازگشت کالا": "returns",
  "مرجوعی": "returns",
  "گارانتی و تعمیرات": "warranty",
  "گارانتی": "warranty",
  "پرداخت و تخفیف": "payment",
  "پرداخت": "payment",
  "سایزبندی و نگهداری": "sizing",
  "سایزبندی": "sizing",
  "سؤال‌های پرتکرار": "faq",
  "سوالات متداول": "faq",
};

function formatSourceTitle(source: string): string {
  const key = source.trim().toLowerCase().replace(/\.md$/i, "");
  const canonicalKey = SOURCE_TITLES[key] ? key : PERSIAN_SOURCE_MAP[key];
  return (canonicalKey && SOURCE_TITLES[canonicalKey]) || source;
}

function isCitationToken(token: string): boolean {
  const normalized = token.trim().toLowerCase().replace(/\.md$/i, "");
  return (
    /^[0-9۰-۹]{1,2}$/.test(normalized) ||
    normalized in SOURCE_TITLES ||
    token.trim() in PERSIAN_SOURCE_MAP
  );
}

function renderWithCitations(text: string): ReactNode[] {
  const re = /\[([0-9۰-۹a-zA-Z_\-.,\s\u0600-\u06FF]+)\](?!\()/g;
  const cleaned = text.replace(re, (full, inner: string) => {
    const tokens = inner
      .split(/[,،]/)
      .map((token) => token.trim())
      .filter(Boolean);
    return tokens.length > 0 && tokens.every(isCitationToken) ? "" : full;
  });

  return [cleaned.replace(/[ \t]{2,}/g, " ")];
}

function processNodeWithCitations(node: ReactNode): ReactNode {
  if (typeof node === "string") {
    return renderWithCitations(node);
  }
  if (Array.isArray(node)) {
    return node.map((child, i) => (
      <span key={i}>{processNodeWithCitations(child)}</span>
    ));
  }
  if (node && typeof node === "object" && "props" in node) {
    const el = node as ReactElement<{ children?: ReactNode }>;
    if (el.props?.children) {
      return cloneElement(el, {
        children: processNodeWithCitations(el.props.children),
      });
    }
  }
  return node;
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
          <span className="brand-tag">فروشگاه نوا</span>
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

function createMarkdownComponents(): Components {
  return {
    p({ children }) {
      return <p dir="auto">{processNodeWithCitations(children)}</p>;
    },
    li({ children }) {
      return <li dir="auto">{processNodeWithCitations(children)}</li>;
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
          {processNodeWithCitations(children)}
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
}

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

type ProgressIconComponent = ComponentType<{
  size?: number | string;
  strokeWidth?: number | string;
  className?: string;
}>;

const STAGE_ICONS: Record<string, ProgressIconComponent[]> = {
  connect: [LoaderCircle, CircleDashed, LoaderCircle],
  search: [Search, ScanLine, Search],
  read: [BookOpen, FileText, BookOpen],
  compose: [Brain, PenLine, Sparkles],
};

function ProgressMessage({ parts }: { parts: UIParts }) {
  const [tick, setTick] = useState(0);

  const toolParts = useMemo(
    () =>
      parts
        .map((part) => part as ToolPart)
        .filter((part) => typeof part?.type === "string" && part.type.startsWith("tool-")),
    [parts],
  );

  const hasSearch = toolParts.some((part) => part.type === "tool-search_knowledge");
  const searchDone = toolParts.some(
    (part) => part.type === "tool-search_knowledge" && part.state === "output-available",
  );
  const hasRead = toolParts.some((part) => part.type === "tool-read_document");
  const readDone = toolParts.some(
    (part) => part.type === "tool-read_document" && part.state === "output-available",
  );

  const messages = useMemo(() => {
    if (!hasSearch) {
      return [
        "در حال برقراری ارتباط با دستیار…",
        "در حال آماده‌سازی جست‌وجو…",
        "در حال بررسی اسناد مرتبط…",
      ];
    }
    if (!searchDone) {
      return [
        "در حال جست‌وجو در اسناد…",
        "در حال پیدا کردن بخش‌های مرتبط…",
        "در حال مقایسه نتایج جست‌وجو…",
      ];
    }
    if (hasRead && !readDone) {
      return [
        "نتایج پیدا شد؛ در حال خواندن سندهای مرتبط…",
        "در حال بررسی جزئیات و استثناها…",
        "در حال استخراج اطلاعات دقیق…",
      ];
    }
    return [
      "اسناد بررسی شد؛ در حال جمع‌بندی پاسخ…",
      "در حال تنظیم یک پاسخ دقیق و قابل فهم…",
      "تقریباً آماده است…",
    ];
  }, [hasRead, hasSearch, readDone, searchDone]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTick((current) => current + 1);
    }, 2200);
    return () => window.clearInterval(interval);
  }, []);

  const isSlow = tick >= 4;
  const message = isSlow
    ? "این مرحله کمی زمان می‌برد؛ هنوز در حال پردازش هستم"
    : messages[tick % messages.length].replace(/…$/, "");

  const stage = !hasSearch
    ? "connect"
    : !searchDone
      ? "search"
      : hasRead && !readDone
        ? "read"
        : "compose";

  const stageIcons = STAGE_ICONS[stage];
  const Icon = stageIcons[tick % stageIcons.length];
  const seconds = Math.round(tick * 2.2);

  return (
    <div className="answer-waiting">
      <div className="answer-progress" role="status" aria-live="polite">
        <span
          key={`${stage}-${tick}`}
          className="progress-orb"
          data-stage={stage}
          aria-hidden
        >
          <span className="progress-orb-ring" />
          <Icon size={10} strokeWidth={2.4} className="progress-orb-icon" />
        </span>
        <span className="progress-copy">
          <span key={message} className="progress-text">
            {message}
          </span>
        </span>
        {tick >= 2 && (
          <span className="progress-elapsed num-fa" aria-hidden>
            {toFaDigits(seconds)} ثانیه
          </span>
        )}
      </div>

      {tick >= 1 && (
        <div className="answer-skeleton" aria-hidden>
          <span style={{ width: "78%" }} />
          <span style={{ width: "52%" }} />
        </div>
      )}
    </div>
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
  const markdownComponents = useMemo(() => createMarkdownComponents(), []);

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

        {!isUser && busy && !text && <ProgressMessage parts={parts} />}

        <div className="msg-content">
          {parts.map((raw, i) => {
            const part = raw as { type: string; text?: string };
            if (part?.type === "text" && typeof part.text === "string" && part.text) {
              return (
                <div key={i} className="md" dir="auto">
                  <ReactMarkdown

                    remarkPlugins={[remarkGfm]}
                    components={markdownComponents}
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
                <span
                  key={s}
                  className="source-chip"
                  title={`منبع ${toFaDigits(i + 1)}: ${formatSourceTitle(s)}`}
                >
                  <span className="n num-fa">{toFaDigits(i + 1)}</span>
                  <span dir="auto">{formatSourceTitle(s)}</span>
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
  const [toast, setToast] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      const scrollElement = chatScrollRef.current;
      if (!scrollElement || event.ctrlKey) return;

      const canScroll = scrollElement.scrollHeight > scrollElement.clientHeight;
      if (!canScroll) return;

      const atTop = scrollElement.scrollTop <= 0;
      const atBottom =
        scrollElement.scrollTop + scrollElement.clientHeight >=
        scrollElement.scrollHeight - 1;
      const movingUp = event.deltaY < 0;
      const movingDown = event.deltaY > 0;

      if ((movingUp && atTop) || (movingDown && atBottom)) return;
      event.preventDefault();
      scrollElement.scrollBy({ top: event.deltaY, behavior: "auto" });
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, []);

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
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        textareaRef.current?.focus();
      });
    },
    [busy, sendMessage],
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
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [busy, stop, setMessages]);

  const onRetry = useCallback(() => {
    regenerate();
  }, [regenerate]);

  const charCount = input.length;
  const nearLimit = charCount > CHAR_LIMIT * 0.9;

  const statusText = !online
    ? "اتصال اینترنت قطع است"
    : busy
      ? status === "submitted"
        ? "در حال خواندن اسناد…"
        : "در حال نوشتن پاسخ…"
      : `دستیار ${BRAND} آماده پاسخ است`;

  const lastMessage = messages.length ? messages[messages.length - 1] : null;
  const lastMessageId = lastMessage ? lastMessage.id : null;
  const lastRole = lastMessage ? lastMessage.role : null;

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

      <div ref={chatScrollRef} className="chat-scroll scroll-area">
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

              {status === "submitted" && lastRole !== "assistant" && (
                <div className="msg msg-bot">
                  <div className="msg-avatar msg-avatar-bot" aria-hidden />
                  <div className="msg-body">
                    <div className="msg-role">{BRAND}</div>
                    <ProgressMessage parts={[]} />
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

          <div ref={messagesEndRef} aria-hidden />
        </div>
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
