"""2단계: 청킹전 .md 정제 (여러 번 돌려도 결과가 같다)
- 법령정보센터 양식 자리표시 줄({목차영역} 등)을 뺀다
- 작성자 줄(예: "Nov 5, 2026 · @이름")을 뺀다 — 실명을 근거 문서에 두지 않는다
- 「기본 정보」의 QR 코드 자리표시 줄을 빼고, 부서·전화번호의 기준 시점을 한 줄 붙인다
사용: python -I -X utf8 scripts/2_clean.py
"""
import os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, 'docs', '답변참고문서', '청킹전')
QR = '[그림: QR 코드 — 그림이라 글로 옮기지 못함]'
NOTE = '※ 위 부서명과 전화번호는 자료를 받은 2026년 11월 기준이다.'
BYLINE = re.compile(r'^[A-Z][a-z]{2} \d{1,2}, \d{4} · @\S+$')


def clean(text):
    removed, kept = [], []
    for l in text.split('\n'):
        s = l.strip()
        if re.fullmatch(r'\{[^}]*\}', s) or BYLINE.match(s) or s == QR:
            removed.append(s)
        else:
            kept.append(l)
    text = '\n'.join(kept)
    # 「기본 정보」에 부서·전화번호가 있으면 끝에 기준 시점 안내를 붙인다
    m = re.search(r'(?ms)^## 기본 정보\n(.*?)(?=^## |\Z)', text)
    if m and NOTE not in m.group(1) and re.search(r'\d{2,3}-\d{3,4}-\d{4}', m.group(1)):
        end = m.end(1)
        text = text[:end].rstrip('\n') + '\n\n' + NOTE + '\n\n' + text[end:].lstrip('\n')
        removed.append('(추가) ' + NOTE)
    return re.sub(r'\n{3,}', '\n\n', text).strip() + '\n', removed


def main():
    for fn in sorted(os.listdir(DIR)):
        if not fn.endswith('.md'):
            continue
        p = os.path.join(DIR, fn)
        old = open(p, encoding='utf-8').read()
        new, removed = clean(old)
        if new != old:
            open(p, 'w', encoding='utf-8', newline='\n').write(new)
        print(fn, '|', ', '.join(removed) if removed else '바뀐 것 없음')


if __name__ == '__main__':
    main()
