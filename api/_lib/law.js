// 법제처 국가법령정보 공동활용 (LAW_OC)
// 변경이력(공포일 범위 검색) · 신구법 비교 · 현행 법령 · 조례 본문/시행일
import { key, has } from './env.js';
import { fetchx, CallError, reasonFromStatus } from './fetchx.js';

const BASE = 'https://www.law.go.kr/DRF';
const TIMEOUT_MS = 15000;

async function drf(svc, params) {
  if (!has('LAW_OC')) throw new CallError('키 비어 있음', 'LAW_OC');
  const qs = new URLSearchParams({ OC: key('LAW_OC'), type: 'JSON', ...params });
  const r = await fetchx(`${BASE}/${svc}?${qs}`, { timeoutMs: TIMEOUT_MS });
  const text = await r.text();
  if (!r.ok) throw new CallError(reasonFromStatus(r.status), `법제처 ${r.status}`);
  // OC 가 틀리거나 서버 IP·도메인이 등록되지 않으면 200 + {"result":"사용자 정보 검증에 실패하였습니다."} 가 온다
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    throw new CallError(/검증에 실패|미신청|등록/.test(text) ? '승인 안 됨' : '오류', '법제처 응답이 JSON 이 아님');
  }
  if (typeof j.result === 'string' && /검증에 실패|미신청|등록/.test(j.result + (j.msg || ''))) {
    throw new CallError('승인 안 됨', '법제처 OC 또는 서버 IP·도메인 미등록');
  }
  return j;
}

const arr = (x) => (x == null ? [] : [].concat(x));
const ymd = (d) => d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }).replaceAll('-', '');
export const dot = (s) => (s && s.length === 8 ? `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6)}` : s || '');

// 최근 days 일 동안 공포된 법령 중 names 에 든 것
export async function recentChanges(names, days = 30) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400000);
  const range = `${ymd(from)}~${ymd(to)}`;
  const found = [];
  let total = Infinity;
  for (let page = 1; (page - 1) * 100 < total && page <= 10; page++) {
    const j = (await drf('lawSearch.do', { target: 'law', display: '100', page: String(page), ancYd: range, sort: 'ddes' })).LawSearch;
    total = Number(j.totalCnt || 0);
    for (const l of arr(j.law)) {
      if (names.includes(l['법령명한글'])) {
        found.push({
          법령: l['법령명한글'], 법령구분: l['법령구분명'], 제개정구분: l['제개정구분명'],
          공포일자: dot(l['공포일자']), 시행일자: dot(l['시행일자']), 공포번호: l['공포번호'],
          MST: l['법령일련번호'], 소관부처: l['소관부처명'],
        });
      }
    }
  }
  return { 기간: `${dot(ymd(from))} ~ ${dot(ymd(to))}`, 전체건수: total === Infinity ? 0 : total, 건: found };
}

// 신구법 비교. mst 가 있으면 그 판본, 없으면 현행
export async function oldAndNew(lawName, mst) {
  const s = (await drf('lawSearch.do', { target: 'oldAndNew', display: '20', query: lawName })).OldAndNewLawSearch;
  const list = arr(s.oldAndNew).filter((x) => x['신구법명'] === lawName);
  const hit = list.find((x) => x['신구법일련번호'] === mst) || list[0];
  if (!hit) throw new CallError('오류', '신구법 비교 자료 없음');
  const j = (await drf('lawService.do', { target: 'oldAndNew', MST: hit['신구법일련번호'] })).OldAndNewService;
  const side = (info, rows) => ({
    법령: info?.['법령명'], 판본: `${info?.['법종구분'] || ''} 제${Number(info?.['공포번호'] || 0)}호 (시행 ${dot(info?.['시행일자'])})`,
    조문: arr(rows?.['조문']).map((r) => r.content),
  });
  return { 개정전: side(j['구조문_기본정보'], j['구조문목록']), 개정후: side(j['신조문_기본정보'], j['신조문목록']) };
}

// 현행 조례 본문
export async function ordinance(name) {
  const s = (await drf('lawSearch.do', { target: 'ordin', display: '20', query: name })).OrdinSearch;
  const hit = arr(s.law).find((x) => x['자치법규명'] === name);
  if (!hit) throw new CallError('오류', '조례를 찾지 못함');
  const j = (await drf('lawService.do', { target: 'ordin', MST: hit['자치법규일련번호'] })).LawService;
  const info = j['자치법규기본정보'] || {};
  return {
    조례: info['자치법규명'], 판본: `제${info['공포번호']}호 (시행 ${dot(info['시행일자'])})`,
    담당부서: info['담당부서명'], 전화: info['전화번호'],
    조문: arr(j['조문']?.['조'] ?? j['조문']).filter((x) => x['조문여부'] === 'Y').map((x) => ({ 제목: x['조제목'], 내용: x['조내용'] })),
  };
}
