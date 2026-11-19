"""5단계: 청킹 조각을 서버가 읽을 api/data/index.json 하나로 묶는다
조각을 고치면 이 단계를 다시 돌리고 index.json 도 함께 올린다.
사용: python -I -X utf8 scripts/5_build_index.py
"""
import os, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'docs', '답변참고문서', '청킹')
DST = os.path.join(ROOT, 'api', 'data', 'index.json')


def parse(fn):
    lines = open(os.path.join(SRC, fn), encoding='utf-8').read().split('\n')
    src, kw, meta = lines[0], lines[1], lines[2]
    assert src.startswith('출처: # ') and kw.startswith('키워드: ') and meta.startswith('자료: '), fn
    doc, _, heads = src[len('출처: # '):].partition(' · ## ')
    item = {
        'id': fn[:-3],
        '문서': doc,
        '소제목': heads.split(' · ## '),
        '출처': src[len('출처: '):],
        '키워드': [k for k in kw[len('키워드: '):].split(', ') if k],
    }
    for part in meta.split(' · '):            # 자료: … · 판본: … · 시행 … · 번호
        if part.startswith('자료: '):
            item['자료'] = part[4:]
        elif part.startswith('판본: '):
            item['판본'] = part[4:]
        elif part.startswith('시행 '):
            item['시행'] = part[3:]
        else:
            item['번호'] = part
    item['본문'] = '\n'.join(lines[3:]).strip()
    return item


def main():
    items = [parse(f) for f in sorted(os.listdir(SRC)) if f.endswith('.md')]
    os.makedirs(os.path.dirname(DST), exist_ok=True)
    with open(DST, 'w', encoding='utf-8', newline='\n') as f:
        json.dump({'조각수': len(items), '조각': items}, f, ensure_ascii=False, indent=1)
    print('index.json: 조각 %d개, %d바이트' % (len(items), os.path.getsize(DST)))


if __name__ == '__main__':
    main()
