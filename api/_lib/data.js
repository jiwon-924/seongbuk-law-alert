// 미리 받은 데이터: 조각(api/data/index.json) 과 법령–조례 짝(api/data/법령조례짝.json)
// 서버는 조각을 index.json 하나로만 읽는다 (CLAUDE.md 「키와 배포」)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DATA = join(process.cwd(), 'api', 'data');
let index = null;
let pairs = null;

export function chunks() {
  if (!index) index = JSON.parse(readFileSync(join(DATA, 'index.json'), 'utf8'))['조각'];
  return index;
}

export function pairRows() {
  if (!pairs) pairs = JSON.parse(readFileSync(join(DATA, '법령조례짝.json'), 'utf8'))['짝'];
  return pairs;
}

export function chunk(id) {
  return chunks().find((c) => c.id === id) || null;
}

// 근거 표시용 이름: 「문서 이름 · 소제목」
export function sourceName(c) {
  return `${c['문서']} · ${c['소제목'].join(' > ')}`;
}

// 본문에서 맨 앞 「## 소제목」 줄을 뗀 글
export function bodyText(c) {
  return c['본문'].replace(/^##[^\n]*\n+/, '').trim();
}

// ── 시연 사례 (2019 폐기물 안전기준 위임) ──
// 시점: 시행규칙 제843호가 시행된 2019.12.31. 대조 대상 조례는 그때의 판본(제1349호)이다.
export const DEMO_CASE = {
  id: 'demo-2019',
  구분: '시연 사례',
  법령: '폐기물관리법 시행규칙',
  법령조문: '제16조의3제2항제3호 단서',
  제개정구분: '일부개정 (조문 신설)',
  공포일자: '2019.12.31',
  시행일자: '2019.12.31',
  개정전: { 판본: '환경부령 제830호 (시행 2019.10.29)', 조각: '폐기물관리법시행규칙_830_042_제16조의3' },
  개정후: { 판본: '환경부령 제843호 (시행 2019.12.31)', 조각: '폐기물관리법시행규칙_843_042_제16조의3' },
  조례: '서울특별시 성북구 폐기물 관리 조례',
  조례판본: '제1349호 (시행 2020.12.31) — 개정 전',
  조례조각: '성북구폐기물조례_1349_12_제8조의2',
  관계: '위임',
  // AI 에 반드시 넣는 조각 — 나머지는 검색으로 더한다
  핵심조각: [
    '폐기물관리법시행규칙_843_042_제16조의3',
    '성북구폐기물조례_1349_12_제8조의2',
    '정비사례_폐기물안전기준_03_시행규칙제16조의3',
    '정비사례_폐기물안전기준_06_법령개정알리미시연포인트',
    '정비사례_폐기물안전기준_05_타임라인',
    '폐기물관리법_16318_027_제14조의5',
  ],
  초안조각: [
    '정비사례_폐기물안전기준_04_성북구조례제8조의2신설',
    '성북구폐기물조례_1396_12_제8조의2',
    '성북구폐기물조례_1349_01_기본정보',
  ],
};

// 짝 줄 중 이 법령 이름과 이어지는 것
export function pairsFor(lawName) {
  return pairRows().filter((p) => p['법령'] === lawName);
}

export function pairLawNames() {
  return [...new Set(pairRows().map((p) => p['법령']))];
}

// ── 조각 검색: 키워드·소제목·본문에 질문 낱말이 몇 번 나오는지로 점수 ──
function terms(q) {
  return [...new Set(q.split(/[\s,.·「」()\[\]?!"'“”‘’:;\/]+/).map((t) => t.trim()).filter((t) => t.length >= 2))];
}

export function search(q, { must = [], limit = 8, maxChars = 14000 } = {}) {
  const ts = terms(q);
  const scored = chunks()
    .filter((c) => !must.includes(c.id))
    .map((c) => {
      const kw = c['키워드'].join(' ');
      const head = c['소제목'].join(' ');
      let s = 0;
      for (const t of ts) {
        if (kw.includes(t)) s += 3;
        if (head.includes(t)) s += 2;
        if (c['본문'].includes(t)) s += 1;
      }
      return { c, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  const out = must.map(chunk).filter(Boolean);
  let size = out.reduce((n, c) => n + c['본문'].length, 0);
  for (const { c } of scored) {
    if (out.length >= must.length + limit) break;
    if (size + c['본문'].length > maxChars) continue;
    out.push(c);
    size += c['본문'].length;
  }
  return out;
}
