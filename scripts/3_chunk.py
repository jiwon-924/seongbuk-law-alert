"""3단계: 청킹전 .md → 청킹 조각
규칙
- 법령·조례: 조마다 / 그 밖: ## 소제목마다 / 첫 ## 앞의 글은 「문서정보」 조각
- 1500자(공백·줄바꿈 포함, 출처·키워드·자료 줄 제외)를 넘으면 문단 끝에서 다시 자른다
  다시 자른 조각 맨 앞에는 「[앞 조각에서 이어짐] 조 제목 + 그 조·항의 첫 문장」을 붙인다
- 내용 없는 제목(장·부칙 이름)은 다음 조각 앞에 둔다
- 100자 미만 조각은 다음(마지막이면 앞) 조각과 합친다 — 조와 문서정보는 합치지 않는다
- 파일 이름: 약칭_호수_번호_조번호.md (조각 100개 넘으면 번호 세 자리)
- 1줄 「출처: # 문서 이름 · ## 소제목」, 2줄 「자료: … · 판본: …」 (4_keywords 가 1줄 다음에 키워드를 넣는다)
사용: python -I -X utf8 scripts/3_chunk.py   (청킹 폴더의 기존 .md 를 지우고 새로 만든다)
"""
import os, re, json

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, 'docs', '답변참고문서', '청킹전')
DST = os.path.join(ROOT, 'docs', '답변참고문서', '청킹')
DOCS = json.load(open(os.path.join(HERE, '문서목록.json'), encoding='utf-8'))
MAX, MIN = 1500, 100
RE_ART = re.compile(r'^(부칙.*?\s)?(제\d+조(?:의\d+)?)(?:\(|\s+삭제)')
HANG = re.compile(r'^[①-⑳]')
BAD = re.compile(r'[\\/:*?"<>|\s]')
CONT = '[앞 조각에서 이어짐]'


def first_sentence(par, head_num):
    """문단의 첫 문장. 조 제목으로 시작하면 제목 부분은 뺀다."""
    t = re.sub(r'^' + re.escape(head_num) + r'\s*(\((?:[^()]|\([^()]*\))*\))?\s*', '', par).strip()
    m = re.search(r'.*?(다\.|:)', t)
    return (m.group(0) if m else t).strip()


def prefix_for(head, art_num, paras, i):
    """paras[i] 부터 시작하는 이어진 조각의 머리 문장"""
    if not art_num or HANG.match(paras[i]):
        return '%s %s' % (CONT, head)
    lead = None
    for p in reversed(paras[:i]):            # 바로 앞의 항(①…) 문단, 없으면 조의 첫 문단
        if HANG.match(p) or p.startswith(art_num):
            lead = p; break
    lead = lead or paras[0]
    return '%s %s %s' % (CONT, head, first_sentence(lead, art_num))


def split_big(par, budget):
    """문단 하나가 너무 길 때: 표는 행 사이(머리글 반복), 글은 문장 끝에서"""
    lines = par.split('\n')
    if lines[0].startswith('|') and len(lines) > 2 and lines[1].startswith('| ---'):
        head, out, cur = '\n'.join(lines[:2]), [], ''
        for row in lines[2:]:
            if cur and len(cur) + 1 + len(row) > budget:
                out.append(cur); cur = ''
            cur = (cur + '\n' + row) if cur else head + '\n' + row
        return out + [cur]
    out, cur = [], ''
    for s in re.split(r'(?<=다\.)\s+', par):
        if cur and len(cur) + 1 + len(s) > budget:
            out.append(cur); cur = ''
        cur = (cur + ' ' + s) if cur else s
    return out + [cur]


def pack(title_part, body, head, art_num):
    paras = [p for p in re.split(r'\n\s*\n', body.strip()) if p.strip()]
    pieces, i, first = [], 0, True
    while i < len(paras):
        cur = title_part if first else prefix_for(head, art_num, paras, i)
        added = 0
        while i < len(paras) and len(cur) + 2 + len(paras[i]) <= MAX:
            cur += '\n\n' + paras[i]; i += 1; added += 1
        if not added:                         # 문단 하나가 남은 자리보다 길다
            sub = split_big(paras[i], MAX - len(cur) - 2)
            if len(sub) > 1:
                paras[i:i + 1] = sub
                continue
            cur += '\n\n' + paras[i]; i += 1    # 더 못 자르는 한 덩어리(긴 표 한 행 등)는 그대로 한 조각
        pieces.append(cur); first = False
    return pieces or [title_part]


def chunk_file(path, info):
    text = open(path, encoding='utf-8').read()
    parts = re.split(r'(?m)^(?=## )', text)
    pre = parts[0].strip().split('\n')
    title = pre[0][2:].strip()
    pre_body = '\n'.join(pre[1:]).strip()
    chunks = []
    if pre_body:
        chunks.append({'heads': ['문서정보'], 'tag': '문서정보', 'text': pre_body, 'article': False, 'docinfo': True})
    pending = []
    for sec in parts[1:]:
        sec = sec.strip()
        head_line, _, body = sec.partition('\n')
        head = head_line[3:].strip()
        if not body.strip():
            pending.append(head_line); continue
        m = RE_ART.match(head) if info.get('법령') else None
        art_num = m.group(2) if m else None
        if m:
            tag = ('부칙' if m.group(1) else '') + art_num
        elif head.startswith('부칙'):
            tag = '부칙'
        else:
            tag = BAD.sub('', head)[:20]
        title_part = '\n\n'.join(pending + [head_line])
        pending = []
        for p in pack(title_part, body, head, art_num):
            chunks.append({'heads': [head], 'tag': tag, 'text': p, 'article': bool(m)})
    if pending and chunks:
        chunks[-1]['text'] += '\n\n' + '\n\n'.join(pending)

    def mergeable(c):
        return not c['article'] and not c.get('docinfo')

    i = 0
    while i < len(chunks):
        c = chunks[i]
        if mergeable(c) and len(c['text']) < MIN:
            nxt = chunks[i + 1] if i + 1 < len(chunks) else None
            prv = chunks[i - 1] if i > 0 else None
            if nxt and mergeable(nxt) and len(c['text']) + 2 + len(nxt['text']) <= MAX:
                c['text'] += '\n\n' + nxt['text']
                c['heads'] += [h for h in nxt['heads'] if h not in c['heads']]
                del chunks[i + 1]; continue
            if prv and mergeable(prv) and len(prv['text']) + 2 + len(c['text']) <= MAX:
                prv['text'] += '\n\n' + c['text']
                prv['heads'] += [h for h in c['heads'] if h not in prv['heads']]
                del chunks[i]; i -= 1; continue
        i += 1
    return title, chunks


def meta_line(info):
    parts = ['자료: ' + info['자료']]
    if info.get('판본'):
        parts += ['판본: ' + info['판본'], '시행 ' + info['시행'], info['번호']]
    return ' · '.join(parts)


def main():
    os.makedirs(DST, exist_ok=True)
    for fn in os.listdir(DST):
        if fn.endswith('.md'):
            os.remove(os.path.join(DST, fn))
    for fn in sorted(os.listdir(SRC)):
        base = fn[:-3]
        info = DOCS.get(base)
        if info is None:
            print('문서목록.json 에 없음 — 건너뜀:', fn); continue
        if info.get('제외'):
            print('제외:', fn); continue
        title, chunks = chunk_file(os.path.join(SRC, fn), info)
        width = 3 if len(chunks) > 100 else 2
        stem = info['약칭'] + ('_' + info['호수'] if info.get('호수') else '')
        for n, c in enumerate(chunks, 1):
            name = '%s_%0*d_%s.md' % (stem, width, n, c['tag'])
            head = '출처: # %s · %s' % (title, ' · '.join('## ' + h for h in c['heads']))
            with open(os.path.join(DST, name), 'w', encoding='utf-8', newline='\n') as f:
                f.write(head + '\n' + meta_line(info) + '\n\n' + c['text'].strip() + '\n')
        print('%s → 조각 %d개' % (fn, len(chunks)))


if __name__ == '__main__':
    main()
