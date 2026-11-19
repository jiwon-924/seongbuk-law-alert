// ③ 조례 조문 대조와 사유 (AI)
import { send, readBody, onlyMethod } from './_lib/http.js';
import { DEMO_CASE, chunk, search, sourceName, bodyText } from './_lib/data.js';
import { askJson } from './_lib/ai.js';
import { SYSTEM, CONTACT, analyzePrompt, keepKnown } from './_lib/prompts.js';
import { demo } from './_lib/fetchx.js';
import { skipList, saved, save, tooOften } from './_lib/guard.js';

// AI 가 모두 실패했을 때: 정비 사례 문서의 글을 그대로 옮긴 시연 값
function demoResult() {
  const point = chunk('정비사례_폐기물안전기준_06_법령개정알리미시연포인트');
  const rule = chunk('정비사례_폐기물안전기준_03_시행규칙제16조의3');
  const alarm = bodyText(point).split('\n').filter((l) => l.startsWith('>')).map((l) => l.slice(1).trim()).join(' ');
  const gap = bodyText(rule).split('\n').filter((l) => l.startsWith('조례 위임')).join(' ');
  return {
    요약: alarm,
    검토조문: [{
      법령조문: '폐기물관리법 시행규칙 제16조의3제2항제3호 단서', 조례조문: '해당 규정 없음 (제1349호)',
      판단: '검토 필요', 사유: gap, 근거: [sourceName(point), sourceName(rule)],
    }],
    확인할점: [],
  };
}

export default async function handler(req, res) {
  if (!onlyMethod(req, res, 'POST')) return;
  const body = await readBody(req);
  const id = String(body.id || '');
  const skip = skipList(body.skip);
  if (id !== DEMO_CASE.id) {
    return send(res, 200, {
      문서에없음: true,
      안내: `이 개정은 답변참고문서에 없어 AI 대조를 하지 않습니다. 법령·조례 원문은 화면의 실시간 자료로 확인하고, 문의처는 ${CONTACT} 입니다.`,
    });
  }
  // 다시 대조(force)가 아니면 서버에 저장해 둔 결과를 돌려준다 (시험용 skip 은 저장을 건너뜀)
  const key = `analyze:${id}`;
  const keep = !body.force && !skip.length && saved(key);
  if (keep) return send(res, 200, { ...keep, 저장된결과: true });
  const blocked = tooOften(req, 'analyze');
  if (blocked) return send(res, 429, { 오류: blocked });

  const cs = DEMO_CASE;
  const chs = search(`${cs.법령} ${cs.법령조문} 조례 위임 예외 사유 주간작업 3명 1조 ${cs.조례}`, { must: cs.핵심조각, limit: 2, maxChars: 9000 });
  const r = await askJson(SYSTEM, analyzePrompt(cs, chs), {
    skip,
    validate: (j) => typeof j.요약 === 'string' && Array.isArray(j.검토조문) && j.검토조문.length > 0,
  });
  if (!r.ok) {
    return send(res, 200, { 결과: demoResult(), tried: r.tried, 출처: demo('정비 사례 문서', 'AI 연결 모두 실패 — 문서 글을 그대로 보여 줍니다') });
  }
  for (const row of r.json.검토조문) row.근거 = keepKnown(row.근거, chs);
  const out = {
    결과: { 요약: r.json.요약, 검토조문: r.json.검토조문, 확인할점: Array.isArray(r.json.확인할점) ? r.json.확인할점 : [] },
    ai: r.ai, model: r.model, tried: r.tried, 쓴조각: chs.map(sourceName),
    출처: { 종류: '실시간', 기관: `AI (${r.ai})` },
  };
  if (!skip.length) save(key, out); // 실제 AI 가 답한 결과만 저장
  send(res, 200, out);
}
