// 연결 상태: 키 값 있음/비어 있음 + AI 별로 정해진 모델 이름. 키 값은 내보내지 않는다.
import { send } from './_lib/http.js';
import { keyStatus } from './_lib/env.js';
import { modelStatus } from './_lib/ai.js';
import { nowKST } from './_lib/fetchx.js';

export default async function handler(req, res) {
  send(res, 200, { 조회시각: nowKST(), 키: keyStatus(), AI순서: ['Claude', 'Groq', 'Gemini'], AI: await modelStatus() });
}
