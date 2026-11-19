// 시간 초과를 붙인 fetch 와 실패 이유 분류.
// 이유는 화면에 그대로 나간다: 키 비어 있음 · 승인 안 됨 · 시간 초과 · 모델 이름 의심 · 오류

export class CallError extends Error {
  constructor(reason, detail = '') {
    super(detail ? `${reason} (${detail})` : reason);
    this.reason = reason;
    this.detail = detail;
  }
}

export async function fetchx(url, { timeoutMs = 15000, ...opt } = {}) {
  try {
    return await fetch(url, { ...opt, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') throw new CallError('시간 초과', `${Math.round(timeoutMs / 1000)}초`);
    throw new CallError('오류', '연결 실패');
  }
}

// HTTP 상태 코드로 이유를 정한다
export function reasonFromStatus(status) {
  if (status === 401 || status === 403) return '승인 안 됨';
  if (status === 404) return '모델 이름 의심';
  if (status === 408 || status === 504) return '시간 초과';
  if (status === 429) return '호출 한도 초과';
  return '오류';
}

// 실패 응답에서 짧은 오류 문구를 꺼낸다 (키 값이 섞이지 않는 error.message 만)
export async function errorOf(r, label) {
  let msg = '';
  try {
    const j = await r.json();
    // 조직 ID 같은 계정 정보는 화면에 내보내지 않는다
    msg = String(j.error?.message || j.message || '').replace(/\s*in organization `[^`]*`/g, '').replace(/org_[A-Za-z0-9]+/g, '<조직>').slice(0, 120);
  } catch { /* 본문이 JSON 이 아니면 상태 코드만 */ }
  // Gemini 는 틀린 키를 400 으로 돌려준다
  const reason = r.status === 400 && /api key/i.test(msg) ? '승인 안 됨' : reasonFromStatus(r.status);
  const e = new CallError(reason, `${label} ${r.status}${msg ? `: ${msg}` : ''}`);
  e.status = r.status;
  return e;
}

export function reasonOf(e) {
  return e instanceof CallError ? e.message : '오류';
}

export function nowKST() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16);
}

// 출처 표시 — 화면이 이것으로 「실시간 / 시연 값」 뱃지를 그린다
export const live = (기관) => ({ 종류: '실시간', 기관, 조회시각: nowKST() });
export const demo = (기관, 이유) => ({ 종류: '시연 값', 기관, 조회시각: nowKST(), 이유 });
