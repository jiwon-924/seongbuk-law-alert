// 키 읽기. 값은 절대 응답·로그에 내보내지 않는다.
export const KEY_NAMES = ['CLAUDE_API_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY', 'LAW_OC', 'LAWMAKING_OC'];

export function key(name) {
  return (process.env[name] || '').trim();
}

export function has(name) {
  return key(name) !== '';
}

// 「값 있음 / 비어 있음」만 알려 준다
export function keyStatus() {
  return Object.fromEntries(KEY_NAMES.map((k) => [k, has(k) ? '값 있음' : '비어 있음']));
}
