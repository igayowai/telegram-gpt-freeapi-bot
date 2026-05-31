import { config as loadDotenv } from "dotenv";
import { Bot } from "grammy";
import OpenAI from "openai";
import {
  formatSafeErrorForLog,
  formatTelegramUserError,
  shouldStopPollingForTelegramError,
} from "./telegram-safety.mjs";

loadDotenv({ path: ".env.local" });

const TELEGRAM_LIMIT = 4096;
const SAFE_CHUNK_LIMIT = 3900;
const MAX_REPLY_CHUNKS = 4;
const REPLY_CHUNK_DELAY_MS = 350;
const POLLING_TIMEOUT_SECONDS = 30;
const COST_LOOKBACK_DAYS = 30;
const MAX_SOURCE_LINKS = 5;
const MAX_MEMORY_QUESTION_CHARS = 1000;
const MAX_MEMORY_ANSWER_CHARS = 3000;
const USER_TIMEZONE = "Asia/Seoul";
const DEFAULT_MODEL = "gpt-5.4-mini";
const ADVANCED_MODEL = "gpt-5.5";
const DEFAULT_FREE_TOKEN_GUARD_RESERVE = 50_000;
const GENERATING_MESSAGE = "답변 생성 중";
const HIGH_LEVEL_FALLBACK_MESSAGE = "고수준 한도가 소진되어 저수준으로 출력합니다";
const RESPONSE_STYLE_PROMPT = [
  "Answer in Korean unless asked otherwise.",
  "Be concise, factual, and high-density.",
  "Use Korean task-log tone ending like 함/됨/있음; avoid polite endings, praise, jokes, small talk, and long explanations.",
  "Lead with the conclusion.",
  "Do not repeat reasoning/logs; summarize only what matters.",
].join(" ");
const SHORT_TERM_CONTEXT_PROMPT =
  "A previous Q&A may be provided only as short-term context. Use it only when the new user message is a follow-up or ambiguous; otherwise ignore it. If asked about memory, state that it exists only while the bot operator's PC/server and Node process keep running, and is lost when that machine turns off or the process restarts.";
const INCENTIVE_SERVICE_TIER = "incentivized-tier";
const FREE_TOKEN_GROUPS = [
  {
    id: "large",
    label: "Large group",
    tier12Limit: 250_000,
    tier35Limit: 1_000_000,
    patterns: [
      /^gpt-5\.5(?:-|$)/,
      /^gpt-5\.4(?!-mini|-nano)(?:-|$)/,
      /^gpt-5\.2(?:-|$)/,
      /^gpt-5\.1(?:-|$)/,
      /^gpt-5\.1-codex(?:-|$)/,
      /^gpt-5-codex(?:-|$)/,
      /^gpt-5(?:-|$)/,
      /^gpt-5-chat-latest$/,
      /^gpt-4\.5-preview(?:-|$)/,
      /^gpt-4\.1(?:-|$)/,
      /^gpt-4o(?:-|$)/,
      /^o3(?:-|$)/,
      /^o1-preview(?:-|$)/,
      /^o1(?:-|$)/,
    ],
  },
  {
    id: "mini",
    label: "Mini/nano group",
    tier12Limit: 2_500_000,
    tier35Limit: 10_000_000,
    patterns: [
      /^gpt-5\.4-mini(?:-|$)/,
      /^gpt-5\.4-nano(?:-|$)/,
      /^gpt-5\.1-codex-mini(?:-|$)/,
      /^gpt-5-mini(?:-|$)/,
      /^gpt-5-nano(?:-|$)/,
      /^gpt-4\.1-mini(?:-|$)/,
      /^gpt-4\.1-nano(?:-|$)/,
      /^gpt-4o-mini(?:-|$)/,
      /^o4-mini(?:-|$)/,
      /^o1-mini(?:-|$)/,
      /^codex-mini-latest$/,
    ],
  },
];

const env = loadEnv();
const bot = new Bot(env.telegramBotToken);
const openai = new OpenAI({ apiKey: env.openaiApiKey });
const lastQaByConversation = new Map();

let botUsername = null;

bot.command(["start", "helpai"], async (ctx) => {
  await runCommand(ctx, "helpai", async () => {
    await ctx.reply(formatHelpMessage(ctx.chat.type));
  });
});

bot.command(["free", "limits", "usage"], async (ctx) => {
  await runCommand(ctx, "free", async () => {
    await handleFreeCommand(ctx);
  });
});

bot.command("costs", async (ctx) => {
  await runCommand(ctx, "costs", async () => {
    await handleCostsCommand(ctx);
  });
});

bot.command("formattest", async (ctx) => {
  await runCommand(ctx, "formattest", async () => {
    if (ctx.chat.type !== "private") {
      await ctx.reply("포맷 테스트는 봇 DM에서만 가능함.");
      return;
    }

    await sendFormatTestMessages(ctx);
  });
});

bot.on("message:text", async (ctx) => {
  const simpleCommand = parseSimpleCommand(ctx.message.text, botUsername);
  if (simpleCommand === "start" || simpleCommand === "helpai") {
    await runCommand(ctx, simpleCommand, async () => {
      await ctx.reply(formatHelpMessage(ctx.chat.type));
    });
    return;
  }
  if (["free", "limits", "usage"].includes(simpleCommand)) {
    await runCommand(ctx, simpleCommand, async () => {
      await handleFreeCommand(ctx);
    });
    return;
  }
  if (simpleCommand === "costs") {
    await runCommand(ctx, simpleCommand, async () => {
      await handleCostsCommand(ctx);
    });
    return;
  }

  const parsed = parseModelCommand(ctx.message.text, botUsername);
  if (!parsed) return;
  await runCommand(ctx, parsed.command, async () => {
    await handleModelCommand(ctx, parsed);
  });
});

bot.on("channel_post:text", async (ctx) => {
  const text = ctx.channelPost.text;
  const command = parseSimpleCommand(text, botUsername);

  if (command === "start" || command === "helpai") {
    await runCommand(ctx, command, async () => {
      await ctx.reply(formatHelpMessage(ctx.chat.type));
    });
    return;
  }
  if (["free", "limits", "usage"].includes(command)) {
    await runCommand(ctx, command, async () => {
      await handleFreeCommand(ctx);
    });
    return;
  }
  if (command === "costs") {
    await runCommand(ctx, command, async () => {
      await ctx.reply("비용 조회는 봇 DM에서만 가능함.");
    });
    return;
  }

  const parsed = parseModelCommand(text, botUsername);
  if (!parsed) return;
  await runCommand(ctx, parsed.command, async () => {
    await handleModelCommand(ctx, parsed);
  });
});

async function runCommand(ctx, command, handler) {
  const startedAt = Date.now();
  logCommandEvent(ctx, command, "start", 0);

  try {
    await handler();
    logCommandEvent(ctx, command, "end", Date.now() - startedAt);
  } catch (error) {
    logCommandEvent(ctx, command, "error", Date.now() - startedAt, error);
    throw error;
  }
}

function logCommandEvent(ctx, command, phase, durationMs, error = null) {
  const chat = ctx.chat;
  const base = [
    `cmd=${command}`,
    `phase=${phase}`,
    `duration_ms=${durationMs}`,
    `chat_type=${chat?.type ?? "unknown"}`,
    `chat_id=${maskId(chat?.id)}`,
  ].join(" ");

  if (!error) {
    console.log(base);
    return;
  }

  console.error(`${base} ${formatErrorForLog(error)}`);
}

function maskId(id) {
  if (id === null || id === undefined) return "unknown";
  const text = String(id);
  if (text.length <= 4) return "****";
  return `${text.slice(0, 3)}...${text.slice(-3)}`;
}

function formatErrorForLog(error) {
  return formatSafeErrorForLog(error);
}

async function deleteReplyIfPossible(ctx, message) {
  if (!message?.message_id) return;
  try {
    await ctx.api.deleteMessage(ctx.chat.id, message.message_id);
  } catch {
    // Deletion depends on Telegram chat permissions; never break the user response.
  }
}

async function editReplyIfPossible(ctx, message, text) {
  if (!message?.message_id) return false;
  try {
    await ctx.api.editMessageText(ctx.chat.id, message.message_id, text);
    return true;
  } catch {
    return false;
  }
}

async function handleModelCommand(ctx, parsed) {
  if (!parsed.query) {
    await ctx.reply(`사용법: /${parsed.command} 질문`);
    return;
  }

  let model = getModelForCommand(parsed.command);
  const generatingMessage = await ctx.reply(GENERATING_MESSAGE);
  let deleteGeneratingMessage = true;
  let usedHighLevelFallback = false;

  try {
    const guard = await checkFreeTokenGuard(model);
    if (!guard.allowed) {
      if (!shouldFallbackToLowLevel(parsed.command, model, guard)) {
        await ctx.reply(guard.message);
        await deleteReplyIfPossible(ctx, generatingMessage);
        return;
      }

      model = env.openaiModel;
      usedHighLevelFallback = true;
      deleteGeneratingMessage = false;
      const edited = await editReplyIfPossible(ctx, generatingMessage, HIGH_LEVEL_FALLBACK_MESSAGE);
      if (!edited) {
        await ctx.reply(HIGH_LEVEL_FALLBACK_MESSAGE);
        await deleteReplyIfPossible(ctx, generatingMessage);
      }

      const lowLevelGuard = await checkFreeTokenGuard(model);
      if (!lowLevelGuard.allowed) {
        await ctx.reply(lowLevelGuard.message);
        return;
      }
    }
  } catch (error) {
    await ctx.reply(formatUserError(error));
    if (deleteGeneratingMessage) {
      await deleteReplyIfPossible(ctx, generatingMessage);
    }
    return;
  }

  await ctx.api.sendChatAction(ctx.chat.id, "typing");

  try {
    const memoryKey = getConversationMemoryKey(ctx);
    const lastQa = getLastQa(memoryKey);
    const answer = await answerQuestion(parsed, model, lastQa);
    await replyInChunks(ctx, formatAnswerWithModelHeader(answer, model, parsed.command, usedHighLevelFallback));
    rememberLastQa(memoryKey, parsed.query, answer);
  } catch (error) {
    await ctx.reply(formatUserError(error));
  }

  if (deleteGeneratingMessage) {
    await deleteReplyIfPossible(ctx, generatingMessage);
  }
}

async function handleFreeCommand(ctx) {
  if (!env.openaiAdminKey) {
    await ctx.reply(".env.local에 OPENAI_ADMIN_KEY 설정 필요함.");
    return;
  }

  await ctx.api.sendChatAction(ctx.chat.id, "typing");

  try {
    const summary = await getFreeTokenSummary(env.openaiAdminKey, env.openaiUsageTierBand);
    await ctx.reply(summary, { disable_web_page_preview: true, parse_mode: "Markdown" });
  } catch (error) {
    await ctx.reply(formatUserError(error));
  }
}

async function handleCostsCommand(ctx) {
  if (ctx.chat.type !== "private") {
    await ctx.reply("비용 조회는 봇 DM에서만 가능함.");
    return;
  }

  if (!env.openaiAdminKey) {
    await ctx.reply(".env.local에 OPENAI_ADMIN_KEY 설정 필요함.");
    return;
  }

  await ctx.api.sendChatAction(ctx.chat.id, "typing");

  try {
    const summary = await getCostSummary(env.openaiAdminKey);
    await ctx.reply(summary, { disable_web_page_preview: true });
  } catch (error) {
    await ctx.reply(formatUserError(error));
  }
}

async function sendFormatTestMessages(ctx) {
  const tests = [
    {
      label: "Markdown",
      text: [
        "*Markdown 테스트*",
        "*Bold*",
        "_Italic_",
        "Underline 지원 안 됨",
        "~Strikethrough~",
        "> Quote",
        "`Monospace`",
        "Spoiler 지원 안 됨",
      ].join("\n"),
      options: { parse_mode: "Markdown", disable_web_page_preview: true },
    },
    {
      label: "MarkdownV2",
      text: [
        "*MarkdownV2 테스트*",
        "*Bold*",
        "_Italic_",
        "__Underline__",
        "~Strikethrough~",
        ">Quote",
        "`Monospace`",
        "||Spoiler||",
      ].join("\n"),
      options: { parse_mode: "MarkdownV2", disable_web_page_preview: true },
    },
    {
      label: "HTML",
      text: [
        "<b>HTML 테스트</b>",
        "<b>Bold</b>",
        "<i>Italic</i>",
        "<u>Underline</u>",
        "<s>Strikethrough</s>",
        "<blockquote>Quote</blockquote>",
        "<code>Monospace</code>",
        '<span class="tg-spoiler">Spoiler</span>',
      ].join("\n"),
      options: { parse_mode: "HTML", disable_web_page_preview: true },
    },
  ];

  for (const test of tests) {
    try {
      await ctx.reply(test.text, test.options);
    } catch (error) {
      await ctx.reply(`${test.label} 전송 실패: ${formatTelegramError(error)}`);
    }
  }
}

function formatTelegramError(error) {
  return formatTelegramUserError(error);
}

function escapeMarkdownV2(text) {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

function markdownBoldToHtml(text) {
  return textToTelegramHtml(text);
}

function textToTelegramHtml(text) {
  const links = [];
  const linkPlaceholder = (label, url) => {
    if (!isHttpUrl(url)) return label;
    const placeholder = `\u0000TG_LINK_${links.length}\u0000`;
    links.push(
      `<a href="${escapeHtmlAttribute(url)}">${escapeHtml(label || getUrlHostname(url) || "링크")}</a>`,
    );
    return placeholder;
  };

  const withMarkdownLinks = text.replace(/\[([^\]\n]{1,160})\]\((https?:\/\/[^\s)<>]+)\)/g, (_match, label, url) =>
    linkPlaceholder(label.trim(), url.trim()),
  );

  const withBareLinks = withMarkdownLinks.replace(/https?:\/\/[^\s<>"']+/g, (match) => {
    const { url, trailing } = splitTrailingUrlPunctuation(match);
    return `${linkPlaceholder(getUrlHostname(url) || "링크", url)}${trailing}`;
  });

  let html = escapeHtml(withBareLinks).replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
  for (const [index, link] of links.entries()) {
    html = html.replaceAll(`\u0000TG_LINK_${index}\u0000`, link);
  }
  return html;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(text) {
  return escapeHtml(text).replace(/"/g, "&quot;");
}

function splitTrailingUrlPunctuation(value) {
  let url = value;
  let trailing = "";
  while (/[),.;!?]$/.test(url)) {
    trailing = `${url.at(-1)}${trailing}`;
    url = url.slice(0, -1);
  }
  return { url, trailing };
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function getUrlHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

bot.catch((err) => {
  const error = err?.error;
  console.error(`Bot error: ${formatSafeErrorForLog(error)}`);

  if (shouldStopPollingForTelegramError(error)) {
    console.error("Fatal Telegram 401 Unauthorized. Stopping polling to avoid invalid-token retry loop.");
    setTimeout(() => process.exit(78), 20);
  }
});

let me;
try {
  me = await bot.api.getMe();
} catch (error) {
  console.error(`Telegram getMe failed: ${formatSafeErrorForLog(error)}`);
  process.exit(shouldStopPollingForTelegramError(error) ? 78 : 1);
}
botUsername = me.username?.toLowerCase() ?? null;

console.log(`Telegram GPT bot started as @${me.username ?? "unknown"}`);
try {
  await bot.start({
    allowed_updates: ["message", "channel_post"],
    timeout: POLLING_TIMEOUT_SECONDS,
    drop_pending_updates: true,
    onStart: () => {},
  });
} catch (error) {
  console.error(`Telegram polling stopped: ${formatSafeErrorForLog(error)}`);
  process.exit(shouldStopPollingForTelegramError(error) ? 78 : 1);
}

function loadEnv() {
  const openaiApiKey = process.env.OPENAI_API_KEY?.trim();
  const openaiAdminKey = process.env.OPENAI_ADMIN_KEY?.trim();
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const openaiModel = process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
  const openaiAdvancedModel = process.env.OPENAI_ADVANCED_MODEL?.trim() || ADVANCED_MODEL;
  const openaiUsageTierBand = process.env.OPENAI_USAGE_TIER_BAND?.trim();
  const freeTokenGuardReserve = parseIntegerEnv(
    "OPENAI_FREE_TOKEN_GUARD_RESERVE",
    DEFAULT_FREE_TOKEN_GUARD_RESERVE,
  );

  const missing = [];
  if (!openaiApiKey) missing.push("OPENAI_API_KEY");
  if (!telegramBotToken) missing.push("TELEGRAM_BOT_TOKEN");

  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }

  if (!openaiApiKey.startsWith("sk-") || openaiApiKey.includes("TELEGRAM_BOT_TOKEN=")) {
    console.error("Invalid OPENAI_API_KEY format in .env.local");
    process.exit(1);
  }

  if (openaiAdminKey && !openaiAdminKey.startsWith("sk-admin-")) {
    console.error("Invalid OPENAI_ADMIN_KEY format in .env.local");
    process.exit(1);
  }

  if (!/^\d+:[A-Za-z0-9_-]+$/.test(telegramBotToken)) {
    console.error("Invalid TELEGRAM_BOT_TOKEN format in .env.local");
    process.exit(1);
  }

  if (openaiUsageTierBand && !["1-2", "3-5"].includes(openaiUsageTierBand)) {
    console.error("Invalid OPENAI_USAGE_TIER_BAND in .env.local. Use 1-2 or 3-5.");
    process.exit(1);
  }

  if (freeTokenGuardReserve < 0) {
    console.error("Invalid OPENAI_FREE_TOKEN_GUARD_RESERVE in .env.local. Use 0 or a positive integer.");
    process.exit(1);
  }

  return {
    openaiApiKey,
    openaiAdminKey,
    telegramBotToken,
    openaiModel,
    openaiAdvancedModel,
    openaiUsageTierBand,
    freeTokenGuardReserve,
  };
}

function parseIntegerEnv(name, defaultValue) {
  const raw = process.env[name]?.trim();
  if (!raw) return defaultValue;
  if (!/^\d+$/.test(raw)) return -1;
  return Number(raw);
}

function formatHelpMessage(chatType, formatLabel = "") {
  const commands = [
    formatLabel ? `${formatLabel} 사용법:` : "사용법:",
    "/hi 질문 - 고수준+자동검색",
    "/lo 질문 - 저수준+자동검색",
    "/ez 질문 - 저수준+검색 X",
    "/free - 잔여 한도",
    "/helpai - 도움말",
  ];

  if (chatType === "private") {
    commands.splice(-1, 0, "/costs - 최근 30일 API 비용");
  }

  return commands.join("\n");
}

function parseModelCommand(text, username) {
  const trimmed = text.trim();
  if (!/^\/(?:hi|lo|ez)(?:@|\s|$)/.test(trimmed)) return null;

  const [command, ...rest] = trimmed.split(/\s+/);
  const match = command.match(/^\/(hi|lo|ez)(?:@([A-Za-z0-9_]+))?$/);
  if (!match) return null;

  const name = match[1];
  const mentioned = match[2]?.toLowerCase();
  if (mentioned && username && mentioned !== username) return null;

  return { command: name, query: rest.join(" ").trim() };
}

function parseSimpleCommand(text, username) {
  const trimmed = text.trim();
  const [command] = trimmed.split(/\s+/);
  const match = command.match(/^\/([A-Za-z0-9_]+)(?:@([A-Za-z0-9_]+))?$/);
  if (!match) return null;

  const mentioned = match[2]?.toLowerCase();
  if (mentioned && username && mentioned !== username) return null;

  return match[1].toLowerCase();
}

function getModelForCommand(command) {
  return command === "hi" ? env.openaiAdvancedModel : env.openaiModel;
}

function shouldFallbackToLowLevel(command, model, guard) {
  return command === "hi" && model !== env.openaiModel && guard?.reason === "reserve";
}

async function answerQuestion(parsed, model, lastQa = null) {
  if (parsed.command === "ez") {
    return answerWithoutSearch(parsed.query, model, lastQa);
  }

  return answerWithSearch(parsed.query, model, lastQa);
}

async function answerWithSearch(query, model, lastQa = null) {
  const response = await openai.responses.create({
    model,
    tools: [{ type: "web_search" }],
    include: ["web_search_call.action.sources"],
    input: [
      {
        role: "system",
        content: [
          RESPONSE_STYLE_PROMPT,
          SHORT_TERM_CONTEXT_PROMPT,
          "Use web search when current or factual verification is useful.",
          "If web search is used, do not write raw URLs, Markdown links, domain-only citations, or a source list in the answer text; use compact inline citation markers like [1], [2] only when needed. The application will append source links from API citation metadata.",
          "Prefer direct sources about the specific entity in the user question; avoid broad aggregate or unrelated background sources unless they are essential.",
        ].join(" "),
      },
      ...formatPreviousQaInput(lastQa),
      {
        role: "user",
        content: query,
      },
    ],
  });

  const text = removeGeneratedSourceList(response.output_text?.trim() || extractText(response).trim());
  const sources = extractSources(response, query);
  const sourceBlock = formatSources(sources);
  const combined = sourceBlock ? `${text}\n\n${sourceBlock}` : text;

  return combined || "응답을 생성하지 못함.";
}

async function answerWithoutSearch(query, model, lastQa = null) {
  const response = await openai.responses.create({
    model,
    input: [
      {
        role: "system",
        content: [
          RESPONSE_STYLE_PROMPT,
          SHORT_TERM_CONTEXT_PROMPT,
          "Do not browse or claim current facts unless they are already known from the prompt.",
        ].join(" "),
      },
      ...formatPreviousQaInput(lastQa),
      {
        role: "user",
        content: query,
      },
    ],
  });

  return response.output_text?.trim() || extractText(response).trim() || "응답을 생성하지 못함.";
}

function getConversationMemoryKey(ctx) {
  const chatId = ctx.chat?.id ?? "unknown-chat";
  const actorId = ctx.from?.id ?? "channel";
  return `${chatId}:${actorId}`;
}

function getLastQa(memoryKey) {
  return lastQaByConversation.get(memoryKey) ?? null;
}

function rememberLastQa(memoryKey, question, answer) {
  lastQaByConversation.set(memoryKey, {
    question: truncateForMemory(question, MAX_MEMORY_QUESTION_CHARS),
    answer: truncateForMemory(answer, MAX_MEMORY_ANSWER_CHARS),
  });
}

function formatAnswerWithModelHeader(answer, model, command, usedHighLevelFallback) {
  let suffix = "";
  if (usedHighLevelFallback) {
    suffix = " (고수준 한도 소진)";
  } else if (command === "ez") {
    suffix = " (검색X)";
  }

  return `현재 모델: ${model}${suffix}\n\n${answer}`;
}

function truncateForMemory(text, maxChars) {
  const normalized = String(text ?? "").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars).trim()}\n[truncated]`;
}

function formatPreviousQaInput(lastQa) {
  if (!lastQa?.question || !lastQa?.answer) return [];
  return [
    {
      role: "user",
      content: `Previous user question:\n${lastQa.question}`,
    },
    {
      role: "assistant",
      content: `Previous assistant answer:\n${lastQa.answer}`,
    },
  ];
}

function extractText(response) {
  const parts = [];
  for (const item of response.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n\n");
}

function extractSources(response, query = "") {
  const annotationSeen = new Set();
  const annotationSources = [];
  const searchSeen = new Set();
  const searchSources = [];

  for (const item of response.output ?? []) {
    if (item.type === "message") {
      for (const content of item.content ?? []) {
        for (const annotation of content.annotations ?? []) {
          addSource(annotationSources, annotationSeen, annotation);
        }
      }
    }

    for (const source of item.action?.sources ?? []) {
      addSource(searchSources, searchSeen, source);
    }
  }

  const sources = annotationSources.length > 0 ? annotationSources : searchSources;
  return filterSourcesByQueryRelevance(sources, query).slice(0, MAX_SOURCE_LINKS);
}

function addSource(sources, seen, source) {
  const url = typeof source?.url === "string" ? source.url.trim() : "";
  if (!isHttpUrl(url)) return;

  const key = normalizeSourceUrl(url);
  if (seen.has(key)) return;
  seen.add(key);

  sources.push({
    title: typeof source.title === "string" ? source.title.trim() : "",
    url,
  });
}

function formatSources(sources) {
  if (sources.length === 0) return "";
  return [
    "출처:",
    ...sources.map((source, index) => `${index + 1}. [${formatSourceTitle(source, index)}](${source.url})`),
  ].join("\n");
}

function filterSourcesByQueryRelevance(sources, query) {
  const terms = extractSourceRelevanceTerms(query);
  if (terms.length === 0 || sources.length <= 1) return sources;

  const scored = sources.map((source, index) => ({
    source,
    index,
    score: getSourceRelevanceScore(source, terms),
  }));
  const matched = scored.filter((item) => item.score > 0);

  if (matched.length === 0) return sources;

  return matched
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.source);
}

function extractSourceRelevanceTerms(query) {
  const stopwords = new Set([
    "검색",
    "적용",
    "친구",
    "친구가",
    "뭐하는",
    "곳이고",
    "어떻고",
    "맞는",
    "곳인지",
    "평가좀",
    "리뷰는",
    "평가와",
    "한참",
    "웨이팅",
    "정도",
    "about",
    "review",
    "reviews",
    "search",
    "please",
    "what",
    "where",
    "how",
  ]);

  return [...new Set(query.match(/[\p{L}\p{N}][\p{L}\p{N}'._-]*/gu) ?? [])]
    .map((term) => term.toLowerCase())
    .filter((term) => term.length >= 2 && term.length <= 32 && !stopwords.has(term));
}

function getSourceRelevanceScore(source, terms) {
  const sourceText = getSourceSearchText(source);
  let score = 0;

  for (const term of terms) {
    if (!sourceText.includes(term)) continue;
    score += term.length >= 4 ? 2 : 1;
  }

  return score;
}

function getSourceSearchText(source) {
  const parts = [source.title ?? ""];
  try {
    const parsed = new URL(source.url);
    parts.push(parsed.hostname);
    parts.push(decodeURIComponent(parsed.pathname));
  } catch {
    parts.push(source.url ?? "");
  }
  return parts.join(" ").toLowerCase();
}

function formatSourceTitle(source, index) {
  const fallback = getUrlHostname(source.url) || `출처 ${index + 1}`;
  const title = String(source.title ?? "")
    .replace(/\s+/g, " ")
    .replace(/[\[\]\r\n]/g, " ")
    .trim();

  const cleaned = !title || isHttpUrl(title) ? fallback : title;
  return cleaned.length > 80 ? `${cleaned.slice(0, 77)}...` : cleaned;
}

function removeGeneratedSourceList(text) {
  const marker = text.search(/\n(?:#{1,6}\s*)?(?:출처|sources?)\s*:/i);
  return marker === -1 ? text.trim() : text.slice(0, marker).trim();
}

function normalizeSourceUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    if (parsed.pathname !== "/") {
      parsed.pathname = parsed.pathname.replace(/\/+$/g, "");
    }
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

async function getCostSummary(adminKey) {
  const endTime = Math.floor(Date.now() / 1000);
  const startTime = endTime - COST_LOOKBACK_DAYS * 24 * 60 * 60;
  const data = await fetchOrganizationCosts(adminKey, startTime, endTime);

  const totals = new Map();
  for (const bucket of data.data ?? []) {
    for (const result of bucket.results ?? []) {
      const currency = result.amount?.currency ?? "usd";
      const current = totals.get(currency) ?? 0;
      totals.set(currency, current + Number(result.amount?.value ?? 0));
    }
  }

  const totalText = [...totals.entries()]
    .map(([currency, value]) => formatCurrency(value, currency))
    .join(", ") || formatCurrency(0, "usd");

  return [
    "OpenAI API 비용 요약",
    `기간: ${formatDate(startTime)} ~ ${formatDate(endTime)}`,
    `최근 ${COST_LOOKBACK_DAYS}일 합계: ${totalText}`,
  ].join("\n");
}

async function getFreeTokenSummary(adminKey, usageTierBand) {
  const endTime = Math.floor(Date.now() / 1000);
  const startTime = getCurrentUtcDayStart(endTime);
  const resetTime = startTime + 86_400;
  const monthStartTime = getCurrentUtcMonthStart(endTime);
  const nextMonthStartTime = getNextUtcMonthStart(endTime);
  const [data, monthlyUsageData, costData, usdKrwRate] = await Promise.all([
    fetchCompletionsUsage(adminKey, startTime, endTime),
    fetchCompletionsUsage(adminKey, monthStartTime, endTime),
    fetchOrganizationCosts(adminKey, monthStartTime, nextMonthStartTime),
    fetchUsdKrwRate().catch(() => null),
  ]);
  const grouped = summarizeFreeUsage(data);
  const paidUsage = summarizePaidUsage(monthlyUsageData);
  const paidCost = summarizeCosts(costData);

  return [
    "*오늘 무료토큰 잔여한도*",
    `(매일 ${formatKstTime(resetTime)} 초기화)`,
    ...FREE_TOKEN_GROUPS.flatMap((group) => formatFreeGroup(group, grouped.get(group.id), usageTierBand)),
    "",
    ...formatPaidBillingSection(paidUsage, paidCost, usdKrwRate, monthStartTime, endTime),
    "",
    "#주의",
    "검색 실행시(자동실행) 비용은 무료 토큰 대상 제외. 종량제로 과금 됨.",
  ].join("\n");
}

async function checkFreeTokenGuard(model) {
  if (!env.openaiAdminKey) {
    return {
      allowed: false,
      reason: "missing_admin_key",
      message: "무료 토큰 잔여 한도 확인 불가. OPENAI_ADMIN_KEY 설정 필요함.",
    };
  }

  const group = findFreeTokenGroup(model);
  if (!group) {
    return {
      allowed: false,
      reason: "unknown_group",
      message: `무료 토큰 그룹 확인 불가로 요청 거절됨. 모델: ${model}`,
    };
  }

  const endTime = Math.floor(Date.now() / 1000);
  const startTime = getCurrentUtcDayStart(endTime);
  const data = await fetchCompletionsUsage(env.openaiAdminKey, startTime, endTime);
  const grouped = summarizeFreeUsage(data);
  const usage = grouped.get(group.id);
  const used = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
  const limit = getFreeTokenLimit(group, env.openaiUsageTierBand);
  const remaining = Math.max(limit - used, 0);

  if (remaining <= env.freeTokenGuardReserve) {
    return {
      allowed: false,
      reason: "reserve",
      message: [
        "무료 토큰 잔여 한도 보호로 요청 거절됨.",
        `모델: ${model}`,
        `그룹: ${formatGroupLabel(group)}`,
        `잔여: ${formatNumber(remaining)} / ${formatNumber(limit)} TK`,
        `보호 기준: ${formatNumber(env.freeTokenGuardReserve)} TK 이하`,
        "/free로 현재 한도 확인 가능함.",
      ].join("\n"),
    };
  }

  return { allowed: true, reason: "ok" };
}

async function fetchOrganizationCosts(adminKey, startTime, endTime) {
  const params = new URLSearchParams({
    start_time: String(startTime),
    end_time: String(endTime),
    bucket_width: "1d",
    limit: String(COST_LOOKBACK_DAYS + 1),
  });

  const response = await fetch(`https://api.openai.com/v1/organization/costs?${params}`, {
    headers: {
      Authorization: `Bearer ${adminKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new AdminApiError(response.status);
  }

  return response.json();
}

async function fetchCompletionsUsage(adminKey, startTime, endTime) {
  const params = new URLSearchParams({
    start_time: String(startTime),
    end_time: String(endTime),
    bucket_width: "1d",
    limit: "1",
  });
  params.append("group_by", "service_tier");
  params.append("group_by", "model");

  const response = await fetch(`https://api.openai.com/v1/organization/usage/completions?${params}`, {
    headers: {
      Authorization: `Bearer ${adminKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new AdminApiError(response.status);
  }

  return response.json();
}

function summarizeFreeUsage(data) {
  const grouped = new Map();

  for (const bucket of data.data ?? []) {
    for (const result of bucket.results ?? []) {
      if (result.service_tier !== INCENTIVE_SERVICE_TIER) continue;

      const group = findFreeTokenGroup(result.model);
      if (!group) continue;

      const current = grouped.get(group.id) ?? {
        inputTokens: 0,
        outputTokens: 0,
        requests: 0,
      };
      const inputTokens = Number(result.input_tokens ?? 0);
      const outputTokens = Number(result.output_tokens ?? 0);
      current.inputTokens += inputTokens;
      current.outputTokens += outputTokens;
      current.requests += Number(result.num_model_requests ?? 0);
      grouped.set(group.id, current);
    }
  }

  return grouped;
}

function summarizePaidUsage(data) {
  const summary = {
    tokens: 0,
    requests: 0,
  };

  for (const bucket of data.data ?? []) {
    for (const result of bucket.results ?? []) {
      if (result.service_tier === INCENTIVE_SERVICE_TIER) continue;

      summary.tokens += Number(result.input_tokens ?? 0);
      summary.tokens += Number(result.output_tokens ?? 0);
      summary.tokens += Number(result.input_audio_tokens ?? 0);
      summary.tokens += Number(result.output_audio_tokens ?? 0);
      summary.requests += Number(result.num_model_requests ?? 0);
    }
  }

  return summary;
}

function summarizeCosts(data) {
  const totals = new Map();

  for (const bucket of data.data ?? []) {
    for (const result of bucket.results ?? []) {
      const currency = result.amount?.currency ?? "usd";
      const current = totals.get(currency) ?? 0;
      totals.set(currency, current + Number(result.amount?.value ?? 0));
    }
  }

  return totals;
}

function findFreeTokenGroup(model = "") {
  const groups = [
    FREE_TOKEN_GROUPS.find((group) => group.id === "mini"),
    FREE_TOKEN_GROUPS.find((group) => group.id === "large"),
  ].filter(Boolean);
  return groups.find((group) => group.patterns.some((pattern) => pattern.test(model)));
}

function formatFreeGroup(group, usage, usageTierBand) {
  const used = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
  const limit = getFreeTokenLimit(group, usageTierBand);
  const remaining = Math.max(limit - used, 0);
  const remainingPercent = limit > 0 ? (remaining / limit) * 100 : 0;

  return [
    "",
    `#${formatGroupLabel(group)}`,
    `*사용*: ${formatNumber(used)} TK (요청 ${formatNumber(usage?.requests ?? 0)}회)`,
    `*잔여*: ${formatNumber(remaining)} / ${formatNumber(limit)} (*${formatPercent(remainingPercent)}* 남음)`,
    `*모델*: ${formatConfiguredModel(group)}`,
  ];
}

function getFreeTokenLimit(group, usageTierBand) {
  return usageTierBand === "3-5" ? group.tier35Limit : group.tier12Limit;
}

function formatGroupLabel(group) {
  return group.id === "large" ? "고수준 모델" : "저수준 모델";
}

function formatConfiguredModel(group) {
  return group.id === "large" ? env.openaiAdvancedModel : env.openaiModel;
}

function formatPaidBillingSection(paidUsage, paidCost, usdKrwRate, startTime, endTime) {
  const usdCost = paidCost.get("usd") ?? 0;

  return [
    "#이번달 종량제 과금현황",
    `*사용*: ${formatNumber(paidUsage.tokens)} TK (요청 ${formatNumber(paidUsage.requests)}회)`,
    `*비용*: ${formatUsd(usdCost)} ${formatKrw(usdCost, usdKrwRate)}`,
  ];
}

function formatUsd(value) {
  return `$${value.toFixed(value > 0 && value < 0.01 ? 4 : 2)}`;
}

function formatKrw(usdCost, usdKrwRate) {
  if (!usdKrwRate) return "(KRW 환산 실패)";
  const krw = Math.round(usdCost * usdKrwRate.rate);
  return `(${formatNumber(krw)}원)`;
}

function formatCurrency(value, currency) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 4,
  }).format(value);
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(value) {
  return `${value.toFixed(1)}%`;
}

function formatDate(unixSeconds) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: USER_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(unixSeconds * 1000));
}

function formatKstDateTime(unixSeconds) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: USER_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(unixSeconds * 1000));
}

function formatKstTime(unixSeconds) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: USER_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(unixSeconds * 1000));
}

function getCurrentUtcDayStart(unixSeconds) {
  return Math.floor(unixSeconds / 86_400) * 86_400;
}

function getCurrentUtcMonthStart(unixSeconds) {
  const date = new Date(unixSeconds * 1000);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000;
}

function getNextUtcMonthStart(unixSeconds) {
  const date = new Date(unixSeconds * 1000);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) / 1000;
}

async function fetchUsdKrwRate() {
  const response = await fetch("https://open.er-api.com/v6/latest/USD");
  if (!response.ok) {
    throw new Error(`USD/KRW exchange rate request failed with status ${response.status}`);
  }

  const data = await response.json();
  const rate = Number(data.rates?.KRW);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("USD/KRW exchange rate missing");
  }

  return { rate };
}

async function replyInChunks(ctx, text) {
  const chunks = splitTelegramText(markdownBoldToHtml(text));
  const limitedChunks = chunks.slice(0, MAX_REPLY_CHUNKS);

  if (chunks.length > MAX_REPLY_CHUNKS) {
    const lastIndex = limitedChunks.length - 1;
    limitedChunks[lastIndex] = `${limitedChunks[lastIndex]}\n\n[응답이 길어 일부 생략됨]`;
  }

  for (const [index, chunk] of limitedChunks.entries()) {
    if (index > 0) {
      await sleep(REPLY_CHUNK_DELAY_MS);
    }
    await ctx.reply(chunk, { disable_web_page_preview: true, parse_mode: "HTML" });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function splitTelegramText(text) {
  if (text.length <= TELEGRAM_LIMIT) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= SAFE_CHUNK_LIMIT) {
      chunks.push(remaining);
      break;
    }

    let splitAt = remaining.lastIndexOf("\n\n", SAFE_CHUNK_LIMIT);
    if (splitAt < SAFE_CHUNK_LIMIT * 0.5) {
      splitAt = remaining.lastIndexOf("\n", SAFE_CHUNK_LIMIT);
    }
    if (splitAt < SAFE_CHUNK_LIMIT * 0.5) {
      splitAt = remaining.lastIndexOf(" ", SAFE_CHUNK_LIMIT);
    }
    if (splitAt < SAFE_CHUNK_LIMIT * 0.5) {
      splitAt = SAFE_CHUNK_LIMIT;
    }

    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  return chunks.filter(Boolean);
}

function formatUserError(error) {
  const status = error?.status ?? error?.response?.statusCode;
  const code = error?.code ?? error?.error?.code;

  if (error instanceof AdminApiError) {
    if (status === 401) return "OpenAI Admin Key 인증 실패. .env.local의 OPENAI_ADMIN_KEY 확인 필요함.";
    if (status === 403) return "OpenAI Admin Key 권한 부족. Organization Owner/Admin key 권한 확인 필요함.";
    if (status === 429) return "OpenAI Usage/Costs API 속도 제한 상태임. 잠시 후 다시 시도 필요함.";
    return "OpenAI Usage/Costs API 조회 실패. 잠시 후 다시 시도 필요함.";
  }

  if (status === 401 || code === "invalid_api_key") {
    return "OpenAI API 키 인증 실패. .env.local의 OPENAI_API_KEY 확인 필요함.";
  }
  if (status === 429 || code === "rate_limit_exceeded") {
    return "OpenAI API 한도 초과 또는 속도 제한 상태임. 잠시 후 다시 시도 필요함.";
  }
  if (code === "insufficient_quota") {
    return "OpenAI API 사용량/결제 한도 확인 필요함.";
  }

  return "요청 처리 실패. 잠시 후 다시 시도 필요함.";
}

class AdminApiError extends Error {
  constructor(status) {
    super(`OpenAI admin API request failed with status ${status}`);
    this.name = "AdminApiError";
    this.status = status;
  }
}
