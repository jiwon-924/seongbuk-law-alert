"""HWPML(XML 형식 .hwp)에서 문단·표를 순서대로 꺼내 JSON 블록으로 저장한다.
사용: python -I hml2blocks.py <입력.hwp> <출력.json>
"""
import sys, json, os, re
import xml.etree.ElementTree as ET

stats = {'images': 0, 'equations': 0, 'ole': 0, 'unknown_tags': {}, 'header_footer': [], 'pua_chars': 0}
SKIP = {'SECDEF', 'COLDEF', 'SHAPEOBJECT', 'SHAPECOMPONENT', 'PARAMARGIN', 'CELLMARGIN', 'INSIDEMARGIN',
        'OUTSIDEMARGIN', 'SIZE', 'POSITION', 'FIELDBEGIN', 'FIELDEND', 'BOOKMARK', 'PAGENUM', 'PAGENUMCTRL',
        'PAGEHIDING', 'NEWNUM', 'INDEXMARK', 'MARKPENBEGIN', 'MARKPENEND', 'TITLEMARK', 'COMPOSE', 'DUTMAL'}


def char_text(el):
    """CHAR 요소 안의 글자와 특수 문자(탭, 줄바꿈 등)를 문자열로"""
    s = el.text or ''
    for c in el:
        tag = c.tag
        if tag == 'TAB':
            s += '\t'
        elif tag == 'LINEBREAK':
            s += '\n'
        elif tag in ('NBSPACE', 'FWSPACE'):
            s += ' '
        elif tag == 'HYPEN' or tag == 'HYPHEN':
            s += '-'
        else:
            stats['unknown_tags'][tag] = stats['unknown_tags'].get(tag, 0) + 1
        s += c.tail or ''
    return s


def walk_p(p, out):
    """P 하나 → 글 문단 + (안에 든) 표·그림 블록"""
    buf = []

    def flush():
        t = ''.join(buf)
        buf.clear()
        return t

    for text in p.findall('TEXT'):
        for c in text:
            tag = c.tag
            if tag == 'CHAR':
                buf.append(char_text(c))
            elif tag == 'TABLE':
                t = flush()
                if t.strip():
                    out.append({'t': 'p', 'text': t})
                out.append(walk_table(c))
            elif tag == 'PICTURE':
                stats['images'] += 1
                out.append({'t': 'img'})
            elif tag in ('RECTANGLE', 'ELLIPSE', 'POLYGON', 'CONTAINER', 'TEXTART', 'LINE', 'ARC', 'CURVE'):
                # 글상자가 있으면 글을 꺼낸다
                sub = []
                for pl in c.iter('PARALIST'):
                    for pp in pl.findall('P'):
                        walk_p(pp, sub)
                if sub:
                    out.extend(sub)
                else:
                    stats['images'] += 1
                    out.append({'t': 'img'})
            elif tag == 'EQUATION':
                stats['equations'] += 1
                out.append({'t': 'eq', 'script': (c.findtext('SCRIPT') or '').strip()})
            elif tag == 'OLE':
                stats['ole'] += 1
                out.append({'t': 'ole'})
            elif tag in ('HEADER', 'FOOTER'):
                sub = []
                for pl in c.iter('PARALIST'):
                    for pp in pl.findall('P'):
                        walk_p(pp, sub)
                stats['header_footer'].append({tag: [b.get('text', '') for b in sub]})
            elif tag in ('FOOTNOTE', 'ENDNOTE'):
                sub = []
                for pl in c.iter('PARALIST'):
                    for pp in pl.findall('P'):
                        walk_p(pp, sub)
                out.append({'t': 'note', 'blocks': sub})
            elif tag in ('AUTONUM',) or tag in SKIP:
                pass
            else:
                stats['unknown_tags'][tag] = stats['unknown_tags'].get(tag, 0) + 1
    out.append({'t': 'p', 'text': flush()})


def walk_table(tbl):
    cells = []
    for row in tbl.findall('ROW'):
        for cell in row.findall('CELL'):
            sub = []
            for pl in cell.findall('PARALIST'):
                for pp in pl.findall('P'):
                    walk_p(pp, sub)
            cells.append({'row': int(cell.get('RowAddr', 0)), 'col': int(cell.get('ColAddr', 0)),
                          'rs': int(cell.get('RowSpan', 1)), 'cs': int(cell.get('ColSpan', 1)), 'blocks': sub})
    return {'t': 'table', 'rows': int(tbl.get('RowCount', 0)), 'cols': int(tbl.get('ColCount', 0)), 'cells': cells}


def main(src, dst):
    raw = open(src, 'rb').read().decode('utf-8')
    stats['pua_chars'] = len(re.findall('[-]', raw))
    stats['replacement_chars'] = raw.count('�')
    root = ET.fromstring(raw.encode('utf-8'))
    title = root.findtext('HEAD/DOCSUMMARY/TITLE')
    blocks = []
    for sec in root.iter('SECTION'):
        if (sec.text or '').strip():
            blocks.append({'t': 'p', 'text': sec.text.strip()})
        for p in sec.findall('P'):
            walk_p(p, blocks)
            if (p.tail or '').strip():
                blocks.append({'t': 'p', 'text': p.tail.strip()})
    json.dump({'title': title, 'blocks': blocks, 'stats': stats}, open(dst, 'w', encoding='utf-8'),
              ensure_ascii=False, indent=0)
    print(os.path.basename(src), '| title:', title, '| blocks:', len(blocks), '|', json.dumps(stats, ensure_ascii=False))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
