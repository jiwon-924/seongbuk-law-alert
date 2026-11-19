// 국민참여입법센터 진행 중인 입법예고 (LAWMAKING_OC)
// 응답 항목 이름은 승인 뒤에 확정된다 — 지금은 반복되는 XML 묶음을 일반 규칙으로 읽는다
import { key, has } from './env.js';
import { fetchx, CallError, reasonFromStatus } from './fetchx.js';

const URL_BASE = 'https://www.lawmaking.go.kr/rest/ogLmPp.xml';

const decode = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();

// <a><b>..</b><c>..</c></a> 처럼 자식이 글자뿐인 묶음을 항목 하나로 본다
function items(xml) {
  const out = [];
  const re = /<([A-Za-z][\w]*)\b[^>]*>((?:\s*<([A-Za-z][\w]*)\b[^>]*>[^<]*(?:<!\[CDATA\[[\s\S]*?\]\]>[^<]*)?<\/\3>\s*){2,})<\/\1>/g;
  let m;
  while ((m = re.exec(xml))) {
    const row = {};
    const fr = /<([A-Za-z][\w]*)\b[^>]*>([^<]*(?:<!\[CDATA\[[\s\S]*?\]\]>[^<]*)?)<\/\1>/g;
    let f;
    while ((f = fr.exec(m[2]))) row[f[1]] = decode(f[2]);
    out.push(row);
  }
  return out;
}

export async function notices() {
  if (!has('LAWMAKING_OC')) throw new CallError('키 비어 있음', 'LAWMAKING_OC');
  const r = await fetchx(`${URL_BASE}?${new URLSearchParams({ OC: key('LAWMAKING_OC') })}`, { timeoutMs: 15000 });
  const xml = await r.text();
  if (!r.ok) throw new CallError(reasonFromStatus(r.status), `입법센터 ${r.status}`);
  const ret = xml.match(/<retMsg>\s*([^<]*)<\/retMsg>/);
  if (ret) {
    const code = Number(ret[1]);
    if (code === 401 || code === 403) throw new CallError('승인 안 됨', `입법센터 retMsg ${ret[1]}`);
    if (code) throw new CallError('오류', `입법센터 retMsg ${ret[1]}`);
  }
  if (/<html[\s>]/i.test(xml)) throw new CallError('오류', 'XML 대신 웹 화면이 옴 — 주소 확인 필요');
  return items(xml);
}
