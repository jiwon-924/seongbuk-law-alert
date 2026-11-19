// ⑤ 진행 중인 입법예고 열람 (국민참여입법센터)
import { send } from './_lib/http.js';
import { DEMO_CASE, chunk, pairLawNames } from './_lib/data.js';
import { notices } from './_lib/lawmaking.js';
import { live, demo, reasonOf } from './_lib/fetchx.js';

const SITE = 'https://www.lawmaking.go.kr';

// 승인 전 시연 값: 시연 사례 조문이 개정 전 단계(입법예고)에 있었다고 가정한 예시 한 줄
function demoRows() {
  const c = chunk(DEMO_CASE.개정후.조각);
  return [{
    제목: `${DEMO_CASE.법령} 일부개정령안 (가정 예시)`,
    내용: `${c['소제목'][0]} 신설 — 주간작업·3명 1조 작업 원칙과 예외 사유의 조례 위임`,
    소관: '환경부 (가정)', 기간: '시연용 가정 — 실제 예고 기간 아님', 관련: true,
  }];
}

export default async function handler(req, res) {
  const names = pairLawNames();
  try {
    const rows = await notices();
    const 목록 = rows.map((r) => ({ ...r, 관련: names.some((n) => Object.values(r).some((v) => String(v).includes(n))) }));
    send(res, 200, { 목록, 원문: SITE, 출처: live('국민참여입법센터') });
  } catch (e) {
    send(res, 200, { 목록: demoRows(), 원문: SITE, 시연: true, 출처: demo('국민참여입법센터', reasonOf(e)) });
  }
}
