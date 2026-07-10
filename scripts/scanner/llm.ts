import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

// Provider-agnostic LLM extraction with a no-pay bias.
//
// Free tiers, in preference order:
//   1. Groq (GROQ_API_KEY) — OpenAI-compatible, thousands of req/day free.
//   2. Cerebras (CEREBRAS_API_KEY) — OpenAI-compatible, generous free tier.
//   3. Any OpenAI-compatible endpoint (OPENAI_COMPAT_BASE_URL + _API_KEY) —
//      e.g. OpenRouter free models, Together.
//   4. Gemini (GOOGLE_API_KEY) — only ~20 req/day free, so it's last.
//
// On a 429/quota error we advance through the model list; once every model
// is exhausted the run stops calling out (isQuotaExhausted() → true).

interface ModelSpec {
  provider: "groq" | "cerebras" | "openai-compat" | "gemini";
  model: string;
}

function buildModelChain(): ModelSpec[] {
  const chain: ModelSpec[] = [];
  if (process.env.GROQ_API_KEY) {
    chain.push(
      { provider: "groq", model: "llama-3.3-70b-versatile" },
      { provider: "groq", model: "llama-3.1-8b-instant" },
    );
  }
  if (process.env.CEREBRAS_API_KEY) {
    chain.push(
      { provider: "cerebras", model: process.env.CEREBRAS_MODEL ?? "llama-3.3-70b" },
      { provider: "cerebras", model: "llama3.1-8b" },
    );
  }
  if (process.env.OPENAI_COMPAT_API_KEY && process.env.OPENAI_COMPAT_BASE_URL) {
    const m = process.env.OPENAI_COMPAT_MODEL ?? "gpt-4o-mini";
    chain.push({ provider: "openai-compat", model: m });
  }
  if (process.env.GOOGLE_API_KEY) {
    chain.push(
      { provider: "gemini", model: "gemini-2.5-flash" },
      { provider: "gemini", model: "gemini-2.5-flash-lite" },
      { provider: "gemini", model: "gemini-2.0-flash" },
    );
  }
  return chain;
}

const CHAIN = buildModelChain();
let idx = 0;

export function hasLlm(): boolean {
  return CHAIN.length > 0;
}

export function isQuotaExhausted(): boolean {
  return idx >= CHAIN.length;
}

export function activeProvider(): string {
  return CHAIN[idx]?.provider ?? "none";
}

// Gemini-only structured-output schema; other providers use json_object mode
// and rely on the prompt to describe the shape.
const GEMINI_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    events: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          day: { type: SchemaType.STRING },
          date: { type: SchemaType.STRING },
          event: { type: SchemaType.STRING },
          where: { type: SchemaType.STRING },
          cost: { type: SchemaType.STRING },
          category: { type: SchemaType.STRING },
          flag: { type: SchemaType.STRING, nullable: true },
          mode: { type: SchemaType.STRING },
          start: { type: SchemaType.STRING, nullable: true },
          end: { type: SchemaType.STRING, nullable: true },
          note: { type: SchemaType.STRING, nullable: true },
          url: { type: SchemaType.STRING },
        },
        required: [
          "day", "date", "event", "where", "cost", "category", "mode", "url",
        ],
      },
    },
  },
  required: ["events"],
};

async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  model: string,
): Promise<string> {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  const m = genAI.getGenerativeModel({
    model,
    systemInstruction: systemPrompt,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: GEMINI_SCHEMA,
      temperature: 0,
    },
  });
  const res = await m.generateContent(userPrompt);
  return res.response.text();
}

// Model catalogs vary by provider and account, so a hard-coded id can 404.
// On the first such miss we ask /models what this key can actually use and
// cache the pick per endpoint.
const resolvedModel: Record<string, string> = {};

async function discoverModel(
  baseUrl: string,
  apiKey: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { id?: string }[] };
    const ids = (json.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => !!id && !/embed|whisper|tts/i.test(id));
    // Prefer a mid/large instruct model; fall back to anything available.
    return (
      ids.find((id) => /llama.*(70b|3\.3)/i.test(id)) ??
      ids.find((id) => /llama/i.test(id)) ??
      ids.find((id) => /(qwen|gpt|glm|mixtral|gemma)/i.test(id)) ??
      ids[0] ??
      null
    );
  } catch {
    return null;
  }
}

async function postChat(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            systemPrompt +
            '\n\nReturn a JSON object of the form {"events": [ ... ]}.',
        },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return json.choices?.[0]?.message?.content ?? "";
}

function isModelNotFound(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    (msg.includes("404") || m.includes("not_found")) &&
    (m.includes("model") || m.includes("does not exist"))
  );
}

async function callOpenAiCompat(
  systemPrompt: string,
  userPrompt: string,
  model: string,
  baseUrl: string,
  apiKey: string,
): Promise<string> {
  const pick = resolvedModel[baseUrl] ?? model;
  try {
    return await postChat(baseUrl, apiKey, pick, systemPrompt, userPrompt);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!isModelNotFound(msg) || resolvedModel[baseUrl]) throw err;
    // Configured model is unavailable — discover a valid one and retry once.
    const discovered = await discoverModel(baseUrl, apiKey);
    if (!discovered) throw err;
    resolvedModel[baseUrl] = discovered;
    console.warn(`   discovered usable model: ${discovered}`);
    return await postChat(baseUrl, apiKey, discovered, systemPrompt, userPrompt);
  }
}

function isQuotaError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    msg.includes("429") ||
    m.includes("quota") ||
    m.includes("rate limit") ||
    m.includes("rate_limit") ||
    m.includes("too many requests")
  );
}

function dispatch(
  spec: ModelSpec,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  if (spec.provider === "gemini") {
    return callGemini(systemPrompt, userPrompt, spec.model);
  }
  const [base, key] =
    spec.provider === "groq"
      ? ["https://api.groq.com/openai/v1", process.env.GROQ_API_KEY!]
      : spec.provider === "cerebras"
        ? ["https://api.cerebras.ai/v1", process.env.CEREBRAS_API_KEY!]
        : [process.env.OPENAI_COMPAT_BASE_URL!, process.env.OPENAI_COMPAT_API_KEY!];
  return callOpenAiCompat(systemPrompt, userPrompt, spec.model, base, key);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// A per-minute cap (tokens OR requests) needs a full rolling-window wait to
// clear; generic server congestion clears faster.
const PER_MINUTE_BACKOFF_MS = 60000;
const CONGESTION_BACKOFF_MS = 12000;
// Pace calls so we don't burst over the per-minute caps in the first place.
const MIN_CALL_GAP_MS = 6000;
const MAX_CONSECUTIVE_RATE_FAILS = 8;
let consecutiveRateFails = 0;
let lastCallAt = 0;

// Both tokens-per-minute and requests-per-minute are rolling-window limits.
function isPerMinuteLimit(msg: string): boolean {
  return /per minute|per_minute|too_many_tokens|too_many_requests/i.test(msg);
}

async function paced(spec: ModelSpec, sys: string, user: string): Promise<string> {
  const wait = MIN_CALL_GAP_MS - (Date.now() - lastCallAt);
  if (wait > 0) await sleep(wait);
  try {
    return await dispatch(spec, sys, user);
  } finally {
    lastCallAt = Date.now();
  }
}

/** Returns raw JSON text, or null when no provider can serve this call. */
export async function callLlm(
  systemPrompt: string,
  userPrompt: string,
): Promise<string | null> {
  while (idx < CHAIN.length) {
    const spec = CHAIN[idx]!;
    try {
      const out = await paced(spec, systemPrompt, userPrompt);
      consecutiveRateFails = 0;
      return out;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      // Rate limit on a hosted (non-Gemini) provider is temporary. Wait long
      // enough for the window to clear (a full minute for a TPM cap), retry
      // the same provider once, then skip this venue but keep the provider.
      if (isQuotaError(msg) && spec.provider !== "gemini") {
        consecutiveRateFails += 1;
        if (consecutiveRateFails >= MAX_CONSECUTIVE_RATE_FAILS) {
          console.warn(`   ${spec.provider} rate-limited repeatedly — dropping it for this run`);
          idx += 1;
          continue;
        }
        const backoff = isPerMinuteLimit(msg)
          ? PER_MINUTE_BACKOFF_MS
          : CONGESTION_BACKOFF_MS;
        console.warn(`   rate-limited on ${spec.provider} (${msg.slice(0, 120)}); backing off ${backoff / 1000}s`);
        await sleep(backoff);
        try {
          const out = await paced(spec, systemPrompt, userPrompt);
          consecutiveRateFails = 0;
          return out;
        } catch {
          return null; // skip this venue; provider stays in the chain
        }
      }

      // Gemini quota is a hard daily cap; other errors are model/network —
      // either way, advance to the next model in the chain.
      if (idx + 1 < CHAIN.length) {
        console.warn(
          `   ${spec.provider}:${spec.model} unavailable (${msg.slice(0, 80)}) — trying ${CHAIN[idx + 1]!.provider}`,
        );
      } else {
        console.warn(`   all LLM providers exhausted — LLM disabled for rest of run`);
      }
      idx += 1;
    }
  }
  return null;
}
