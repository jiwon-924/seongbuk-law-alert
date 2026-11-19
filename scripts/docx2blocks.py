"""docx 에서 문단(스타일·번호 포함)과 표, 그림을 순서대로 꺼내 JSON 으로 저장한다.
사용: python -I docx2blocks.py <입력.docx> <출력.json>
"""
import sys, json, zipfile, os
import xml.etree.ElementTree as ET

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
stats = {'images': 0, 'equations': 0, 'ole': 0, 'unknown_runs': {}}


def load_styles(z):
    st = {}
    try:
        root = ET.fromstring(z.read('word/styles.xml'))
    except KeyError:
        return st
    for s in root.findall(W + 'style'):
        sid = s.get(W + 'styleId')
        name = s.find(W + 'name')
        ol = s.find(W + 'pPr/' + W + 'outlineLvl')
        st[sid] = {'name': name.get(W + 'val') if name is not None else sid,
                   'outline': int(ol.get(W + 'val')) if ol is not None else None}
    return st


def load_numbering(z):
    """numId → {ilvl: (numFmt, lvlText)}"""
    try:
        root = ET.fromstring(z.read('word/numbering.xml'))
    except KeyError:
        return {}
    absn = {}
    for a in root.findall(W + 'abstractNum'):
        lv = {}
        for l in a.findall(W + 'lvl'):
            f = l.find(W + 'numFmt'); t = l.find(W + 'lvlText')
            lv[int(l.get(W + 'ilvl'))] = (f.get(W + 'val') if f is not None else 'decimal',
                                          t.get(W + 'val') if t is not None else '')
        absn[a.get(W + 'abstractNumId')] = lv
    nums = {}
    for n in root.findall(W + 'num'):
        nums[n.get(W + 'numId')] = absn.get(n.find(W + 'abstractNumId').get(W + 'val'), {})
    return nums


R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
RELS = {}


def run_text(p):
    s = []
    for el in p:
        if el.tag == W + 'hyperlink':
            inner = run_text(el)
            url = RELS.get(el.get(R + 'id'))
            s.append('[%s](%s)' % (inner, url) if url else inner)
            continue
        s.append(_el_text(el))
        s.append(run_text(el) if el.tag not in (W + 'drawing',) and not el.tag.endswith('}pict') else '')
    return ''.join(s)


def _el_text(el):
    s = []
    for el in [el]:
        tag = el.tag
        if tag == W + 't':
            s.append(el.text or '')
        elif tag == W + 'tab':
            s.append('\t')
        elif tag in (W + 'br', W + 'cr'):
            s.append('\n')
        elif tag == W + 'noBreakHyphen':
            s.append('-')
        elif tag == W + 'sym':
            s.append(chr(int(el.get(W + 'char'), 16)))
        elif tag.endswith('}drawing') or tag.endswith('}pict'):
            stats['images'] += 1
            s.append('\x00IMG\x00')
        elif tag.endswith('}oMath'):
            stats['equations'] += 1
        elif tag.endswith('}object'):
            stats['ole'] += 1
    return ''.join(s)


def para(p, styles, nums):
    ppr = p.find(W + 'pPr')
    sid = None; num = None; outline = None
    if ppr is not None:
        ps = ppr.find(W + 'pStyle')
        if ps is not None:
            sid = ps.get(W + 'val')
        npr = ppr.find(W + 'numPr')
        if npr is not None:
            il = npr.find(W + 'ilvl'); ni = npr.find(W + 'numId')
            num = (ni.get(W + 'val') if ni is not None else None, int(il.get(W + 'val')) if il is not None else 0)
        ol = ppr.find(W + 'outlineLvl')
        if ol is not None:
            outline = int(ol.get(W + 'val'))
    st = styles.get(sid, {})
    if outline is None:
        outline = st.get('outline')
    bold = all((r.find(W + 'rPr/' + W + 'b') is not None) for r in p.findall(W + 'r') if (r.findtext(W + 't') or '').strip()) and any((r.findtext(W + 't') or '').strip() for r in p.findall(W + 'r'))
    fmt = None
    if num and num[0] in nums:
        fmt = nums[num[0]].get(num[1])
    return {'t': 'p', 'text': run_text(p), 'style': st.get('name', sid), 'outline': outline,
            'num': num, 'numfmt': fmt, 'bold': bold}


def table(tbl, styles, nums):
    rows = []
    for tr in tbl.findall(W + 'tr'):
        row = []
        for tc in tr.findall(W + 'tc'):
            tcpr = tc.find(W + 'tcPr')
            span = 1; vmerge = None
            if tcpr is not None:
                g = tcpr.find(W + 'gridSpan')
                if g is not None:
                    span = int(g.get(W + 'val'))
                vm = tcpr.find(W + 'vMerge')
                if vm is not None:
                    vmerge = vm.get(W + 'val') or 'continue'
            blocks = []
            for c in tc:
                if c.tag == W + 'p':
                    blocks.append(para(c, styles, nums))
                elif c.tag == W + 'tbl':
                    blocks.append(table(c, styles, nums))
            row.append({'span': span, 'vmerge': vmerge, 'blocks': blocks})
        rows.append(row)
    return {'t': 'table', 'rows': rows}


def main(src, dst):
    z = zipfile.ZipFile(src)
    styles = load_styles(z); nums = load_numbering(z)
    for rel in ET.fromstring(z.read('word/_rels/document.xml.rels')):
        if rel.get('Type', '').endswith('/hyperlink'):
            RELS[rel.get('Id')] = rel.get('Target')
    body = ET.fromstring(z.read('word/document.xml')).find(W + 'body')
    blocks = []
    for c in body:
        if c.tag == W + 'p':
            blocks.append(para(c, styles, nums))
        elif c.tag == W + 'tbl':
            blocks.append(table(c, styles, nums))
        elif c.tag == W + 'sdt':
            for p in c.iter(W + 'p'):
                blocks.append(para(p, styles, nums))
    json.dump({'blocks': blocks, 'stats': stats}, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print(os.path.basename(src), len(blocks), stats)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
