// ① 「검토 필요」 목록: 시연 사례 + 최근 30일 실시간 변경 중 짝 법령
import { send } from './_lib/http.js';
import { DEMO_CASE, pairLawNames, pairsFor } from './_lib/data.js';
import { recentChanges } from './_lib/law.js';
import { live, demo, reasonOf, nowKST } from './_lib/fetchx.js';

const DAYS = 30; // 그릴링 Q10

const link = (p) => ({ 조례: p['조례'], 조례조문: p['조례조문'], 법령조문: p['법령조문'], 관계: p['관계'], 메모: p['메모'], 확인: p['확인'] });

export default async function handler(req, res) {
  const demoRow = {
    id: DEMO_CASE.id, 구분: DEMO_CASE.구분, 법령: DEMO_CASE.법령, 제개정구분: DEMO_CASE.제개정구분,
    공포일자: DEMO_CASE.공포일자, 시행일자: DEMO_CASE.시행일자,
    연결: pairsFor(DEMO_CASE.법령).filter((p) => p['법령조문'].startsWith('제16조의3')).map(link),
    AI대조: true,
  };
  let 실시간;
  const 목록 = [demoRow];
  try {
    const r = await recentChanges(pairLawNames(), DAYS);
    for (const c of r.건) {
      목록.push({
        id: `live-${c.MST}`, 구분: '실시간', 법령: c.법령, 제개정구분: c.제개정구분,
        공포일자: c.공포일자, 시행일자: c.시행일자, 판본: `${c.법령구분} 제${Number(c.공포번호)}호`, MST: c.MST,
        연결: pairsFor(c.법령).map(link),
        AI대조: false, // 그릴링 Q5 — 답변참고문서에 없는 개정이라 AI 대조를 하지 않는다
      });
    }
    실시간 = { 출처: live('법제처 국가법령정보'), 기간: r.기간, 전체건수: r.전체건수, 짝법령건수: r.건.length };
  } catch (e) {
    실시간 = { 출처: demo('법제처 국가법령정보', reasonOf(e)), 기간: `최근 ${DAYS}일`, 전체건수: 0, 짝법령건수: 0 };
  }
  send(res, 200, { 조회시각: nowKST(), 실시간, 목록 });
}
