// ③ 왼쪽: 대조할 조례 조문
import { send, query } from './_lib/http.js';
import { DEMO_CASE, chunk, chunks, bodyText, sourceName, pairsFor } from './_lib/data.js';
import { ordinance } from './_lib/law.js';
import { live, demo, reasonOf } from './_lib/fetchx.js';

const nos = (s) => s.match(/제\d+조(의\d+)?/g) || [];

function demoOrdinance(이유) {
  const c = chunk(DEMO_CASE.조례조각);
  const memo = pairsFor(DEMO_CASE.법령).find((p) => p['관계'] === '위임')?.['메모'] || '';
  return {
    조례: DEMO_CASE.조례, 판본: DEMO_CASE.조례판본,
    안내: `이 판본에는 시행규칙 제16조의3제2항제3호 단서가 맡긴 예외 사유 규정이 없습니다. 아래는 같은 번호(제8조의2)의 현재 조문으로, 새 조문을 넣으면 번호가 바뀔 수 있습니다. (짝 정보 메모: ${memo})`,
    조문: [{ 제목: c['소제목'][0], 내용: bodyText(c), 근거: sourceName(c) }],
    출처: demo('미리 받은 답변참고문서', 이유),
  };
}

// 실시간 실패 때: 개정 후 조례(제1396호) 조각에서 같은 조문을 꺼낸다
function chunkArticles(list) {
  return list.map((no) => chunks().find((c) => c.id.startsWith('성북구폐기물조례_1396_') && c['소제목'][0].startsWith(`${no}(`)))
    .filter(Boolean).map((c) => ({ 제목: c['소제목'][0], 내용: bodyText(c), 근거: sourceName(c) }));
}

export default async function handler(req, res) {
  const { id = '', law = '' } = query(req);
  if (id === DEMO_CASE.id) return send(res, 200, demoOrdinance('시연 사례(2019)는 그때의 조례 판본(제1349호)으로 보여 줍니다'));
  if (!law) return send(res, 400, { 오류: 'law 가 필요합니다' });
  const rows = pairsFor(law);
  const name = rows[0]?.['조례'];
  const want = [...new Set(rows.flatMap((p) => nos(p['조례조문'])))];
  if (!name) return send(res, 200, { 조례: '', 조문: [], 안내: '짝 정보에 연결된 조례가 없습니다.', 출처: demo('짝 정보', '연결 없음') });
  try {
    const r = await ordinance(name);
    const 조문 = r.조문.filter((a) => want.some((no) => a.내용.startsWith(`${no}(`)))
      .map((a) => ({ 제목: a.내용.match(/^제\d+조(의\d+)?\([^)]*\)/)?.[0] || a.제목, 내용: a.내용 }));
    send(res, 200, { ...r, 조문, 찾은조문: want, 출처: live('법제처 국가법령정보 (자치법규)') });
  } catch (e) {
    send(res, 200, {
      조례: name, 판본: '제1396호 (시행 2021.10.6)', 조문: chunkArticles(want), 찾은조문: want,
      출처: demo('미리 받은 답변참고문서', `실시간 조회 실패: ${reasonOf(e)}`),
    });
  }
}
