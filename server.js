// 로컬 실행: node --env-file=.env server.js
// public 의 화면 파일과 /api/* 를 한 주소에서 띄운다 (Vercel 과 같은 모양)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

const PORT = Number(process.env.PORT || 3000);
const ROOT = process.cwd();
const PUBLIC = join(ROOT, 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  try {
    // /api/이름 → api/이름.js (밑줄로 시작하는 도우미 폴더는 열지 않는다)
    const m = path.match(/^\/api\/([a-z]+)\/?$/);
    if (m) {
      const file = join(ROOT, 'api', `${m[1]}.js`);
      if (!existsSync(file)) { res.statusCode = 404; return res.end('없는 주소'); }
      const mod = await import(pathToFileURL(file).href);
      return await mod.default(req, res);
    }
    const rel = normalize(path === '/' ? '/index.html' : path).replace(/^([/\\])+/, '');
    const file = join(PUBLIC, rel);
    if (!file.startsWith(PUBLIC) || !existsSync(file)) { res.statusCode = 404; return res.end('없는 파일'); }
    res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch (e) {
    console.error(e);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ 오류: '서버 오류' }));
    }
  }
}).listen(PORT, () => console.log(`성북 법령개정 알리미: http://localhost:${PORT}`));
