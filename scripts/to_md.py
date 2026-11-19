"""JSON 블록(hml2blocks / docx2blocks 결과)이나 txt 를 마크다운으로 바꾼다.
사용: python -I to_md.py <종류 hwp|docx|txt> <입력> <문서이름> <출력.md>
"""
import sys, json, re

NBSP = '\xa0'
QR = '[그림: QR 코드 — 그림이라 글로 옮기지 못함]'
TIMELINE = '''[그림: 타임라인 — 그림 속 글자를 표로 옮김]

성북구 조례가 위임 사항을 약 21개월 뒤에 채웠다
폐기물관리법·시행규칙 안전기준에서 성북구 조례 정비까지, 2019~2021

| 항목 | 시점 |
| --- | --- |
| 법률 제14조의5 시행 | 2019.10.17 |
| 시행규칙 제16조의3 신설 | 2019.12.31 |
| 조례 위임 사항 미규정 | 2019.12.31 ~ 2021.10.5 |
| 성북구 조례 제8조의2 신설 | 2021.10.6 |'''


def clean_lines(text):
    """줄 앞뒤 공백만 정리한다(앞 공백 4칸 이상은 마크다운에서 코드 블록이 되므로). 글자는 그대로 둔다."""
    lines = [l.replace(NBSP, ' ').strip() for l in text.split('\n')]
    return [l for l in lines if l]


def norm(s):
    return re.sub(r'\s+', ' ', s.replace(NBSP, ' ')).strip()


def cell_md(blocks, img_text):
    parts = []
    for b in blocks:
        if b['t'] == 'p':
            parts.extend(clean_lines(b['text'].replace('\x00IMG\x00', img_text)))
        elif b['t'] == 'table':
            parts.append('(표 안의 표) ' + ' / '.join(cell_md(c['blocks'], img_text) for r in b.get('rows', []) for c in r))
    return '<br>'.join(p.replace('|', '\\|') for p in parts)


# ---------------- hwp(HWPML) ----------------
RE_PART = re.compile(r'^제\d+(편|장|절|관)(의\d+)?(\s|$)')
RE_ART = re.compile(r'^(제\d+조(?:의\d+)?)\s*(\((?:[^()]|\([^()]*\))*\))')
RE_ART_DEL = re.compile(r'^(제\d+조(?:의\d+)?)\s+(삭제)')


def hwp_md(path, name):
    d = json.load(open(path, encoding='utf-8'))
    out = ['# ' + name, '', '## 기본 정보', '']
    buchik = None

    def table_md(t):
        grid = [[''] * t['cols'] for _ in range(t['rows'])]
        for c in t['cells']:
            grid[c['row']][c['col']] = cell_md(c['blocks'], QR)
        lines = ['| ' + ' | '.join(grid[0]) + ' |', '|' + ' --- |' * t['cols']]
        lines += ['| ' + ' | '.join(r) + ' |' for r in grid[1:]]
        return lines

    for b in d['blocks']:
        if b['t'] == 'img':
            out += [QR, '']; continue
        if b['t'] == 'table':
            out += table_md(b) + ['']; continue
        if b['t'] != 'p':
            out += ['[%s — 글로 옮기지 못함]' % b['t'], '']; continue
        lines = clean_lines(b['text'])
        if not lines:
            continue
        first = lines[0]
        if RE_PART.match(first) and len(lines) == 1:
            out += ['## ' + norm(first), '']; buchik = None; continue
        if first.startswith('부칙') and len(lines) == 1:
            buchik = norm(first)
            out += ['## ' + buchik, '']; continue
        m = RE_ART.match(first) or RE_ART_DEL.match(first)
        if m:
            head = m.group(1) + (m.group(2) if m.group(2).startswith('(') else ' ' + m.group(2))
            out += ['## ' + (buchik + ' ' if buchik else '') + head, '']
        out += [l + '  ' if i < len(lines) - 1 else l for i, l in enumerate(lines)] + ['']
    return out


# ---------------- docx ----------------
def docx_md(path, name):
    d = json.load(open(path, encoding='utf-8'))
    out = []
    counters = {}
    for b in d['blocks']:
        is_list = b['t'] == 'p' and b.get('num') and b.get('numfmt')
        if not is_list and out and re.match(r'^\s*(\d+\.|-) ', out[-1]):
            out.append('')
        if b['t'] == 'table':
            rows = b['rows']
            ncol = max(sum(c['span'] for c in r) for r in rows)
            grid = []
            for r in rows:
                row = []
                for c in r:
                    txt = '' if c['vmerge'] == 'continue' else cell_md(c['blocks'], TIMELINE)
                    row += [txt] + [''] * (c['span'] - 1)
                grid.append(row + [''] * (ncol - len(row)))
            out += ['| ' + ' | '.join(grid[0]) + ' |', '|' + ' --- |' * ncol]
            out += ['| ' + ' | '.join(r) + ' |' for r in grid[1:]] + ['']
            continue
        text = b['text']
        if '\x00IMG\x00' in text:
            rest = text.replace('\x00IMG\x00', '').strip()
            out += [TIMELINE, '']
            if not rest:
                continue
            text = rest
        lines = clean_lines(text)
        if not lines:
            continue
        style = (b.get('style') or '').lower()
        if b.get('outline') == 0 or style == 'heading 1':
            out += ['# ' + norm(text), '']; continue
        if b.get('outline') is not None and b['outline'] >= 1:
            out += ['#' * (b['outline'] + 1) + ' ' + norm(text), '']; continue
        mh = re.match(r'heading (\d)$', style)
        if mh:
            out += ['#' * int(mh.group(1)) + ' ' + norm(text), '']; continue
        if b.get('bold') and len(lines) == 1:
            out += ['### ' + lines[0], '']; continue
        if b.get('num') and b.get('numfmt'):
            key = tuple(b['num'])
            counters[key] = counters.get(key, 0) + 1
            fmt = b['numfmt'][0]
            mark = '%d.' % counters[key] if fmt == 'decimal' else '-'
            out += ['   ' * b['num'][1] + mark + ' ' + '  \n   '.join(lines)]
            continue
        if style == 'quote':
            out += ['> ' + '  \n> '.join(lines), '']; continue
        if out and re.match(r'^\s*(\d+\.|-) ', out[-1]):
            out.append('')
        out += ['  \n'.join(lines), '']
    if out and out[0].startswith('# '):
        out[0] = '# ' + name
    else:
        out = ['# ' + name, ''] + out
    return out


# ---------------- txt ----------------
def txt_md(path, name):
    raw = open(path, 'rb').read()
    try:
        text = raw.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = raw.decode('cp949')
    lines = [l.rstrip() for l in text.splitlines()]
    while lines and not lines[-1]:
        lines.pop()
    return ['# ' + name, '', '## 질문 목록', ''] + lines


def main(kind, src, name, dst):
    out = {'hwp': hwp_md, 'docx': docx_md, 'txt': txt_md}[kind](src, name)
    text = '\n'.join(out)
    text = re.sub(r'\n{3,}', '\n\n', text).strip() + '\n'
    open(dst, 'w', encoding='utf-8', newline='\n').write(text)
    print('ok', dst)


if __name__ == '__main__':
    main(*sys.argv[1:5])
