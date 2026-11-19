// ② 신구법 비교
import { send, query } from './_lib/http.js';
import { DEMO_CASE, chunk, bodyText, sourceName, pairsFor } from './_lib/data.js';
import { oldAndNew } from './_lib/law.js';
import { live, demo, reasonOf } from './_lib/fetchx.js';

// 시연 사례: 미리 받은 조각(제830호 · 제843호)으로 보여 준다
function demoCompare(이유) {
  const before = chunk(DEMO_CASE.개정전.조각);
  const after = chunk(DEMO_CASE.개정후.조각);
  return {
    법령: DEMO_CASE.법령,
    개정전: {
      판본: DEMO_CASE.개정전.판본,
      안내: '개정 전 판본에는 생활폐기물 수집·운반 안전기준 조문이 없습니다. 같은 번호의 제16조의3은 다른 조문이었고, 개정 후 판본에서 제16조의5로 이동했습니다.',
      조문: [bodyText(before)], 근거: sourceName(before), 다른조문: true,
    },
    개정후: { 판본: DEMO_CASE.개정후.판본, 조문: [bodyText(after)], 근거: sourceName(after) },
    관련조문: ['제16조의3'],
    출처: demo('미리 받은 답변참고문서', 이유),
  };
}

// 짝 정보의 법령조문에서 「제○조(의○)」만 뽑는다
const articleNos = (lawName) => [...new Set(pairsFor(lawName).flatMap((p) => p['법령조문'].match(/제\d+조(의\d+)?/g) || []))];

export default async function handler(req, res) {
  const { id = '', law = '' } = query(req);
  if (id === DEMO_CASE.id) return send(res, 200, demoCompare('시연 사례(2019)는 미리 받은 문서로 보여 줍니다'));
  if (!id.startsWith('live-') || !law) return send(res, 400, { 오류: 'id 와 law 가 필요합니다' });
  try {
    const r = await oldAndNew(law, id.slice(5));
    send(res, 200, { 법령: law, ...r, 관련조문: articleNos(law), 출처: live('법제처 국가법령정보') });
  } catch (e) {
    send(res, 200, { ...demoCompare(`실시간 조회 실패: ${reasonOf(e)} — 시연 사례로 대신 보여 줍니다`), 대체: true });
  }
}
