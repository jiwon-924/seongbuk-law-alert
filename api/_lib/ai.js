// AI 호출: CLAUDE_API_KEY → GROQ_API_KEY → GEMINI_API_KEY 순서.
// 앞이 실패하면(키 비어 있음 · 오류 · 시간 초과) 다음으로 넘어가고, 어느 AI 가 답했는지 남긴다.
// 모델 이름은 키로 모델 목록을 조회해 정한다. 404 → 모델 이름부터 의심하고 목록을 다시 조회한다.
import { key, has } from './env.js';
import { fetchx, CallError, errorOf, reasonOf } from './fetchx.js';

const AI_TIMEOUT_MS = 20000; // 한 곳당 (그릴링 Q12)
const LIST_TTL_MS = 60 * 60 * 1000;
const modelCache = {}; // { claude: { id, at } }

// 20초 안에 끝내기 위한 Claude 설정 (2026-11 측정: sonnet-5-5 약 12초)
// sonnet 5.5 는 disabled 를 400 으로 거절해 between_tools 로 끈다. haiku 는 disabled 를 받는다.
function claudeSpeed(model) {
  if (!/^claude-(sonnet|haiku|opus|fable)-5/.test(model)) return {};
  const thinking = model.startsWith('claude-sonnet-5-5') ? { type: 'between_tools' }
    : model.startsWith('claude-haiku-5') ? { type: 'disabled' } : undefined;
  return { ...(thinking ? { thinking } : {}), output_config: { effort: 'low' } };
}

const PROVIDERS = [
  {
    name: 'claude', label: 'Claude', keyName: 'CLAUDE_API_KEY',
    async list(ms) {
      const r = await fetchx('https://api.anthropic.com/v1/models?limit=100', {
        timeoutMs: ms, headers: { 'x-api-key': key('CLAUDE_API_KEY'), 'anthropic-version': '2023-06-01' },
      });
      if (!r.ok) throw await errorOf(r, '모델 목록');
      return (await r.json()).data.map((m) => m.id);
    },
    // 목록은 최신순 — 속도·비용이 알맞은 sonnet 을 먼저 고른다
    pick: (ids) => ids.find((id) => id.includes('sonnet')) || ids.find((id) => id.includes('haiku')) || ids[0],
    async call(model, system, user, ms) {
      const r = await fetchx('https://api.anthropic.com/v1/messages', {
        method: 'POST', timeoutMs: ms,
        headers: { 'x-api-key': key('CLAUDE_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        // 새 Claude 모델은 temperature 를 받지 않는다 (400: deprecated).
        // 생각(thinking)이 기본으로 켜져 있어 답 글자 없이 max_tokens 를 다 쓰므로 끄고 effort 를 낮춘다.
        body: JSON.stringify({ model, max_tokens: 4000, ...claudeSpeed(model), system, messages: [{ role: 'user', content: user }] }),
      });
      if (!r.ok) throw await errorOf(r, '응답');
      const j = await r.json();
      return j.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    },
  },
  {
    name: 'groq', label: 'Groq', keyName: 'GROQ_API_KEY',
    async list(ms) {
      const r = await fetchx('https://api.groq.com/openai/v1/models', {
        timeoutMs: ms, headers: { Authorization: `Bearer ${key('GROQ_API_KEY')}` },
      });
      if (!r.ok) throw await errorOf(r, '모델 목록');
      return (await r.json()).data.filter((m) => m.active !== false).map((m) => m.id);
    },
    // 음성·안전 필터 모델은 빼고 글 쓰는 모델을 고른다
    pick(ids) {
      const text = ids.filter((id) => !/whisper|orpheus|guard|safeguard|tts/i.test(id));
      return ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile'].find((p) => text.includes(p)) || text.find((id) => /gpt-oss|llama|qwen/.test(id)) || text[0];
    },
    async call(model, system, user, ms) {
      const r = await fetchx('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', timeoutMs: ms,
        headers: { Authorization: `Bearer ${key('GROQ_API_KEY')}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model, temperature: 0.2, max_tokens: 4000, response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        }),
      });
      if (!r.ok) throw await errorOf(r, '응답');
      return (await r.json()).choices[0].message.content;
    },
  },
  {
    name: 'gemini', label: 'Gemini', keyName: 'GEMINI_API_KEY',
    async list(ms) {
      const r = await fetchx('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
        timeoutMs: ms, headers: { 'x-goog-api-key': key('GEMINI_API_KEY') },
      });
      if (!r.ok) throw await errorOf(r, '모델 목록');
      return (await r.json()).models.filter((m) => m.supportedGenerationMethods?.includes('generateContent')).map((m) => m.name);
    },
    pick(ids) {
      // latest 별칭이 현재 flash 를 가리킨다 (gemini-2.5-flash 는 새 사용자에게 404)
      // 3순위 대체용이라 20초 안에 답하는 것이 먼저다 (2026-11 측정: flash-lite-latest 약 11초,
      // flash-latest · gemini-3.8-flash 는 503 이나 40초 넘게 응답 없음)
      for (const p of ['models/gemini-flash-lite-latest', 'models/gemini-flash-latest']) if (ids.includes(p)) return p;
      // 그다음은 버전이 가장 높은 정식 flash (예: gemini-3.8-flash)
      const ver = (id) => Number(id.match(/^models\/gemini-(\d+(?:\.\d+)?)-flash$/)?.[1] || 0);
      return ids.filter((id) => ver(id) > 0).sort((a, b) => ver(b) - ver(a))[0] || ids[0];
    },
    async call(model, system, user, ms) {
      const r = await fetchx(`https://generativelanguage.googleapis.com/v1beta/${model}:generateContent`, {
        method: 'POST', timeoutMs: ms,
        headers: { 'x-goog-api-key': key('GEMINI_API_KEY'), 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
        }),
      });
      if (!r.ok) throw await errorOf(r, '응답');
      const j = await r.json();
      return (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    },
  },
];

// 404 가 난 모델 이름 — 목록에 있어도 다시 고르지 않는다
// (예: gemini-2.5-flash 는 목록에 있지만 「새 사용자에게 제공 안 함」으로 404)
const badModels = {};

async function modelFor(p, ms, refresh = false) {
  const c = modelCache[p.name];
  if (!refresh && c && Date.now() - c.at < LIST_TTL_MS) return c.id;
  const bad = badModels[p.name] || new Set();
  const id = p.pick((await p.list(ms)).filter((m) => !bad.has(m)));
  if (!id) throw new CallError('모델 이름 의심', '쓸 수 있는 모델이 목록에 없음');
  modelCache[p.name] = { id, at: Date.now() };
  return id;
}

// 응답 글에서 JSON 한 덩어리를 꺼낸다
function parseJson(text) {
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s < 0 || e < s) throw new CallError('오류', 'JSON 형식이 아님');
  try {
    return JSON.parse(text.slice(s, e + 1));
  } catch {
    throw new CallError('오류', 'JSON 형식이 아님');
  }
}

// skip: 시험용으로 일부 AI 를 건너뛴다 (예: ['claude'])
export async function askJson(system, user, { skip = [], validate = () => true } = {}) {
  const tried = [];
  for (const p of PROVIDERS) {
    if (skip.includes(p.name)) { tried.push({ ai: p.label, 이유: '시험용으로 건너뜀' }); continue; }
    if (!has(p.keyName)) { tried.push({ ai: p.label, 이유: '키 비어 있음' }); continue; }
    const deadline = Date.now() + AI_TIMEOUT_MS;
    const left = () => Math.max(1000, deadline - Date.now());
    let model = modelCache[p.name]?.id || '';
    try {
      model = await modelFor(p, Math.min(8000, left()));
      let text;
      try {
        text = await p.call(model, system, user, left());
      } catch (e) {
        const busy = e.status === 503;
        if (e.reason !== '모델 이름 의심' && !busy) throw e;
        // 404 → 그 이름을 빼고 목록을 다시 조회해 다른 이름으로 한 번 더 (404 난 이름은 계속 뺀다)
        // 503(사용량 폭주) → 이번 요청만 다음 후보로 한 번 더
        const bad = (badModels[p.name] ||= new Set());
        bad.add(model);
        const again = await modelFor(p, Math.min(8000, left()), true);
        if (busy) { bad.delete(model); delete modelCache[p.name]; }
        if (again === model) throw e;
        tried.push({ ai: p.label, model, 이유: reasonOf(e) });
        model = again;
        text = await p.call(model, system, user, left());
      }
      const json = parseJson(text);
      if (!validate(json)) throw new CallError('오류', '답 형식이 맞지 않음');
      return { ok: true, json, ai: p.label, model, tried };
    } catch (e) {
      tried.push({ ai: p.label, model: model || undefined, 이유: reasonOf(e) });
    }
  }
  return { ok: false, tried };
}

// 연결 상태 화면용: 정해진 모델 이름 (조회만, 키 값은 내보내지 않음)
export async function modelStatus() {
  return Promise.all(PROVIDERS.map(async (p) => {
    if (!has(p.keyName)) return { ai: p.label, 키: p.keyName, 상태: '키 비어 있음' };
    try {
      return { ai: p.label, 키: p.keyName, 상태: '연결됨', 모델: await modelFor(p, 8000) };
    } catch (e) {
      return { ai: p.label, 키: p.keyName, 상태: reasonOf(e) };
    }
  }));
}
