// Vercel 과 로컬 server.js 양쪽에서 같은 모양으로 동작하는 도우미

export function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

export function query(req) {
  return Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);
}

// Vercel 은 본문을 미리 읽어 req.body 에 넣어 둔다. 로컬은 스트림을 직접 읽는다.
export async function readBody(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100000) throw new Error('본문이 너무 큽니다');
  }
  return raw ? JSON.parse(raw) : {};
}

export function onlyMethod(req, res, method) {
  if (req.method === method) return true;
  send(res, 405, { 오류: `${method} 만 받습니다` });
  return false;
}
