"""4단계: 청킹 조각 둘째 줄에 「키워드:」를 넣는다 (다시 돌리면 키워드 줄을 새로 쓴다)
- 손으로 고른 조각: MANUAL (문서 약칭_호수 + 첫 소제목으로 찾는다)
- 그 밖(법령·조례): 조 번호 + 조 제목 + 조각에 나오는 사전 용어 + 그 용어의 비슷한 말, 5개 이내
- 조 제목에 없는 말인데 50개 넘는 조각에 붙는 흔한 키워드는 빼고 다음 후보로 채운다
- 숫자의 쉼표는 뺀다 (25,000원 → 25000원)
사용: python -I -X utf8 scripts/4_keywords.py   (확인표: docs/청킹_키워드확인표.md)
"""
import os, re, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, 'docs', '답변참고문서', '청킹')
REPORT = os.path.join(ROOT, 'docs', '청킹_키워드확인표.md')
COMMON = 50

# 조각에 나오는 공식 용어 → 이용자가 달리 부르는 말 (원래 용어가 조각에 있고 키워드에 들어갈 때만 붙인다)
GLOSSARY = [
    ('음식물류 폐기물', ['음식물쓰레기']), ('음식물류폐기물', ['음식물쓰레기']),
    ('대형폐기물', ['대형쓰레기', '폐가구']),
    ('공사장생활폐기물', ['공사장 쓰레기']),
    ('사업장생활폐기물', ['사업장 쓰레기']),
    ('사업장폐기물', ['사업장 쓰레기']),
    ('생활폐기물', ['생활쓰레기']),
    ('건설폐기물', ['공사 폐자재']),
    ('지정폐기물', ['유해 폐기물']),
    ('의료폐기물', ['병원 쓰레기']),
    ('방치폐기물', ['버려진 폐기물']),
    ('재활용가능품', ['재활용품', '분리배출']),
    ('규격봉투', ['종량제봉투', '쓰레기봉투']),
    ('종량제', ['쓰레기 종량제']),
    ('수집ㆍ운반', ['쓰레기 수거']), ('수집·운반', ['쓰레기 수거']),
    ('적환장', ['쓰레기 중간 집하장']),
    ('폐기물처리업자', ['폐기물 처리업체']),
    ('폐기물처리업', ['폐기물 처리업체']),
    ('폐기물처리시설', ['쓰레기 처리시설']),
    ('폐기물처리신고자', ['폐기물 처리 신고업체']),
    ('대행', ['청소 대행업체']),
    ('환경미화원', ['청소 노동자']),
    ('과태료', []), ('포상금', ['신고 포상금']),
    ('수수료', ['처리 비용']),
    ('주간작업', ['낮 시간 작업']), ('야간작업', ['밤 작업']), ('가로청소', ['거리 청소']),
    ('봉투판매소', ['종량제봉투 파는 곳']), ('가산금', ['연체료']), ('감면', ['수수료 할인']),
    ('현금 교환', ['봉투 환불']), ('공포한 날부터 시행', ['시행일']), ('투기', ['쓰레기 무단투기']),
    ('소각', ['쓰레기 태우기']),
    ('매립', ['쓰레기 매립지']),
    ('재활용', []), ('감량', ['쓰레기 줄이기']),
    ('사후관리', []), ('행정처분', ['영업정지']),
    ('벌칙', ['처벌']), ('벌금', []), ('징역', []),
    ('허가', ['인허가']), ('신고', []), ('승인', []),
    ('경과조치', ['경과 규정']), ('시행일', ['언제부터 시행']),
    ('위임', ['조례 위임']), ('청결', ['청소']),
    ('보관', []), ('교육', []), ('보고', []), ('검사', []), ('안전기준', ['작업 안전']),
    ('기술관리인', []), ('처리이행보증', []), ('올바로시스템', ['전자인계']),
    ('전자정보처리프로그램', ['올바로시스템']),
]
# 조 제목을 키워드로 쓸 때 다른 법령과 헷갈리는 것 (문서 약칭, 제목) → 바꿔 쓸 말
TITLE_OVERRIDE = {('성북구폐기물조례', '시행규칙'): '성북구 조례 시행규칙'}
MANUAL = {
    ('성북구폐기물조례_1349', '기본 정보'):
        ['성북구 폐기물 관리 조례', '조례 제1349호', '시행 2020. 12. 31.', '청소행정과', '문의처 전화번호'],
    ('성북구폐기물조례_1396', '기본 정보'):
        ['성북구 폐기물 관리 조례', '조례 제1396호', '시행 2021. 10. 6.', '청소행정과', '문의처 전화번호'],
    ('폐기물관리법_16318', '기본 정보'):
        ['폐기물관리법', '법률 제16318호', '시행 2019. 10. 17.', '기후에너지환경부', '담당 부서 문의처'],
    ('폐기물관리법시행규칙_830', '기본 정보'):
        ['폐기물관리법 시행규칙', '환경부령 제830호', '시행 2019. 10. 29.', '기후에너지환경부', '담당 부서 문의처'],
    ('폐기물관리법시행규칙_843', '기본 정보'):
        ['폐기물관리법 시행규칙', '환경부령 제843호', '시행 2019. 12. 31.', '기후에너지환경부', '담당 부서 문의처'],
    ('정비사례_폐기물안전기준', '개요'):
        ['환경미화원 안전', '주간작업', '3명 1조 작업', '예외 사유 조례 위임', '청소 노동자'],
    ('정비사례_폐기물안전기준', '법률: 폐기물관리법 제14조의5'):
        ['제14조의5', '생활폐기물 수집·운반 안전기준', '안전점검', '실태조사', '쓰레기 수거 안전'],
    ('정비사례_폐기물안전기준', '시행규칙: 제16조의3'):
        ['시행규칙 제16조의3', '주간작업', '3명 1조', '보호장구', '야간작업'],
    ('정비사례_폐기물안전기준', '성북구 조례: 제8조의2 신설'):
        ['성북구 조례 제8조의2', '예외 사유', '야간작업', '가로청소', '조문 번호 밀림'],
    ('정비사례_폐기물안전기준', '타임라인'):
        ['타임라인', '약 21개월', '조례 위임 사항 미규정', '조례 정비까지 걸린 기간', '2021.10.6'],
    ('정비사례_폐기물안전기준', '법령개정 알리미 시연 포인트'):
        ['법령개정 알리미', '위임 사항 탐지', '영향 조례 매칭', '공백 기간', '알림 예시'],
    ('정비사례_폐기물안전기준', '원문 링크'):
        ['원문 링크', '국가법령정보센터', '법률 제16318호', '환경부령 제843호', '조례 제1396호'],
}
RE_ART = re.compile(r'^(부칙.*?\s)?(제\d+조(?:의\d+)?)\s*(?:\(((?:[^()]|\([^()]*\))*)\)|(삭제))')


def nocomma(s):
    return re.sub(r'(?<=\d),(?=\d{3}\b)', '', s)


def auto(doc, head, body, banned):
    kw, title = [], ''
    m = RE_ART.match(head)
    if m:
        buchik, num, title, deleted = m.groups()
        kw.append('부칙' if buchik else num)
        title = re.sub(r'\s*등$', '', (title or deleted or '').strip())
        if title:
            kw.append(TITLE_OVERRIDE.get((doc, title), title))
    else:
        kw.append('부칙' if head.startswith('부칙') else head)
    ok = lambda w: w not in banned or w in title
    found = []
    for term, syn in GLOSSARY:
        cnt = body.count(term)
        if cnt and ok(term) and not any(term in f for f, _, _ in found):
            found.append((term, syn, cnt + (100 if term in title else 0)))
    found.sort(key=lambda x: -x[2])
    for term, _, _ in found:
        if len(kw) >= 4:
            break
        if not any(term in k for k in kw):
            kw.append(term)
    syns = []
    for term, syn, _ in found:
        if not any(term in k for k in kw):
            continue
        for s in syn:
            if ok(s) and s not in syns and s not in body and not any(s in k for k in kw):
                syns.append(s)
    out = kw[:4] + syns[:1]
    if len(out) < 5:
        out += [s for s in syns[1:] if s not in out][:5 - len(out)]
    return out[:5], title


def read_chunk(p):
    lines = open(p, encoding='utf-8').read().split('\n')
    if len(lines) > 1 and lines[1].startswith('키워드:'):
        del lines[1]                          # 다시 돌릴 때는 키워드 줄을 새로 쓴다
    return lines


def main():
    files = sorted(f for f in os.listdir(DIR) if f.endswith('.md'))
    data = []
    for fn in files:
        lines = read_chunk(os.path.join(DIR, fn))
        heads = [h.strip() for h in lines[0].split(' · ## ')[1:]]
        stem = fn.rsplit('_', 2)[0]
        body = '\n'.join(lines[2:])           # 1줄 출처, 2줄 자료·판본 다음부터 본문
        data.append((fn, lines, stem, heads[0], body))
    banned = set()
    for _ in range(5):                         # 흔한 말을 빼고 다시 뽑기를 바뀌는 것이 없을 때까지
        result, cnt = {}, collections.Counter()
        for fn, lines, stem, head, body in data:
            if (stem, head) in MANUAL:
                result[fn] = (MANUAL[(stem, head)], None); continue
            kw, title = auto(stem.split('_')[0], head, body, banned)
            result[fn] = (kw, title)
            cnt.update(set(kw))
        new = {k for k, n in cnt.items() if n > COMMON and not re.fullmatch(r'제\d+조(의\d+)?|부칙', k)}
        if new <= banned:
            break
        banned |= new
    with open(REPORT, 'w', encoding='utf-8', newline='\n') as rep:
        rep.write('| 조각 파일 | 키워드 |\n| --- | --- |\n')
        for fn, lines, stem, head, body in data:
            kw = [nocomma(k) for k in result[fn][0]]
            new_lines = [lines[0], '키워드: ' + ', '.join(kw)] + lines[1:]
            open(os.path.join(DIR, fn), 'w', encoding='utf-8', newline='\n').write('\n'.join(new_lines))
            rep.write('| %s | %s |\n' % (fn, ', '.join(kw)))
    print('조각 %d개 | 손으로 고름 %d개 | 흔해서 뺀 말: %s' % (
        len(data), sum(1 for d in data if (d[2], d[3]) in MANUAL), ', '.join(sorted(banned)) or '없음'))


if __name__ == '__main__':
    main()
