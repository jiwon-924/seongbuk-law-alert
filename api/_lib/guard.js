// AI 호출 지킴이: 배포 주소를 아는 누구나 AI 비용을 쓰게 하지 못하도록 막는다.
// - 같은 사건의 AI 결과를 서버 메모리에 10분 저장해 다시 쓴다 (실제 AI 가 답한 결과만)
// - 같은 사람이 같은 주소를 15초 안에 다시 부르면 막는다
// - 서버 하나가 10분 동안 부를 수 있는 AI 횟수를 40번으로 제한한다
// Vercel 은 요청마다 서버가 여러 개 뜰 수 있어 완전한 제한은 아니다 — 시연 규모의 남용을 줄이는 정도다.

const CACHE_MS = 10 * 60 * 1000;
const GAP_MS = 15 * 1000;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_IN_WINDOW = 40;

const results = new Map(); // `${주소}:${id}` → { at, data }
const lastCall = new Map(); // `${사람}:${주소}` → 시각
let calls = []; // 최근 AI 호출 시각들

// 시험용 skip(일부 AI 건너뛰기)은 로컬에서만 받는다
export function skipList(skip) {
  return !process.env.VERCEL && Array.isArray(skip) ? skip.map(String) : [];
}

export function saved(key) {
  const hit = results.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  results.delete(key);
  return null;
}

export function save(key, data) {
  results.set(key, { at: Date.now(), data });
}

function who(req) {
  const f = req.headers?.['x-forwarded-for'];
  const first = (Array.isArray(f) ? f[0] : f || '').split(',')[0].trim();
  return first || req.socket?.remoteAddress || '알 수 없음';
}

// 막아야 하면 화면에 보일 이유를 돌려준다. 통과하면 null
export function tooOften(req, endpoint) {
  const now = Date.now();
  const k = `${who(req)}:${endpoint}`;
  const last = lastCall.get(k) || 0;
  if (now - last < GAP_MS) {
    return `AI 를 너무 자주 불렀습니다. ${Math.ceil((GAP_MS - (now - last)) / 1000)}초 뒤 다시 시도합니다.`;
  }
  calls = calls.filter((t) => now - t < WINDOW_MS);
  if (calls.length >= MAX_IN_WINDOW) {
    return 'AI 호출이 잠시 많습니다. 몇 분 뒤 다시 시도합니다.';
  }
  lastCall.set(k, now);
  calls.push(now);
  return null;
}
