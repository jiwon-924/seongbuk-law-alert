// ④ 개정 초안 3안 (AI)
import { send, readBody, onlyMethod } from './_lib/http.js';
import { DEMO_CASE, chunk, search, sourceName, bodyText } from './_lib/data.js';
import { askJson } from './_lib/ai.js';
import { SYSTEM, CONTACT, draftsPrompt, keepKnown } from './_lib/prompts.js';
import { demo } from './_lib/fetchx.js';
import { skipList, saved, save, tooOften } from './_lib/guard.js';

const NAMES = ['최소 개정', '예외 사유 구체화', '조문 번호·인용 정비 포함'];

// AI 가 모두 실패했을 때: 1안 자리에 실제 정비 결과(제1396호 제8조의2 원문)를 보여 주고, 나머지는 비워 둔다
function demoDrafts() {
  const real = chunk('성북구폐기물조례_1396_12_제8조의2');
  return [
    { 안: '1안', 이름: '실제 정비 결과 (참고)', 조문안: bodyText(real), 설명: '2021.10.6 실제로 신설된 조문입니다. AI 초안이 아닙니다.', 근거: [sourceName(real)] },
    { 안: '2안', 이름: NAMES[1], 조문안: '', 설명: 'AI 연결이 모두 실패해 만들지 못했습니다.', 근거: [] },
    { 안: '3안', 이름: NAMES[2], 조문안: '', 설명: 'AI 연결이 모두 실패해 만들지 못했습니다.', 근거: [] },
  ];
}

export default async function handler(req, res) {
  if (!onlyMethod(req, res, 'POST')) return;
  const body = await readBody(req);
  const id = String(body.id || '');
  const skip = skipList(body.skip);
  if (id !== DEMO_CASE.id) {
    return send(res, 200, { 문서에없음: true, 안내: `이 개정은 답변참고문서에 없어 초안을 만들지 않습니다. 문의처: ${CONTACT}` });
  }
  // 다시 쓰기(force)가 아니면 서버에 저장해 둔 초안을 돌려준다
  const key = `drafts:${id}`;
  const keep = !body.force && !skip.length && saved(key);
  if (keep) return send(res, 200, { ...keep, 저장된결과: true });
  const blocked = tooOften(req, 'drafts');
  if (blocked) return send(res, 429, { 오류: blocked });

  const cs = DEMO_CASE;
  const chs = search('조례 개정 초안 예외 사유 주간작업 3명1조 신설 조문 번호 인용', { must: [...cs.핵심조각, ...cs.초안조각], limit: 1, maxChars: 9000 });
  const r = await askJson(SYSTEM, draftsPrompt(cs, chs), {
    skip,
    validate: (j) => Array.isArray(j.초안) && j.초안.length === 3 && j.초안.every((d) => d.조문안),
  });
  if (!r.ok) {
    return send(res, 200, { 초안: demoDrafts(), tried: r.tried, 출처: demo('답변참고문서', 'AI 연결 모두 실패') });
  }
  const 초안 = r.json.초안.map((d, i) => ({
    안: `${i + 1}안`, 이름: NAMES[i], 조문안: String(d.조문안), 설명: String(d.설명 || ''), 근거: keepKnown(d.근거, chs),
  }));
  const out = { 초안, ai: r.ai, model: r.model, tried: r.tried, 쓴조각: chs.map(sourceName), 출처: { 종류: '실시간', 기관: `AI (${r.ai})` } };
  if (!skip.length) save(key, out); // 실제 AI 가 쓴 초안만 저장
  send(res, 200, out);
}
