# 답변참고문서 만들기 스크립트

원본 → 청킹전 → 청킹 → `api/data/index.json` 순서로 만든다. team_project 폴더에서 차례로 돌린다.

```bash
python -I -X utf8 scripts/1_convert.py
python -I -X utf8 scripts/2_clean.py
python -I -X utf8 scripts/3_chunk.py
python -I -X utf8 scripts/4_keywords.py
python -I -X utf8 scripts/5_build_index.py
```

| 단계 | 하는 일 | 결과 |
| --- | --- | --- |
| 1_convert | hwp(실제로는 HWPML XML)·docx·txt 를 .md 로 바꾼다. 이미 있는 .md 는 건너뛴다 | docs/답변참고문서/청킹전 |
| 2_clean | 양식 자리표시·작성자 줄·QR 줄을 빼고, 기본 정보에 연락처 기준 시점을 붙인다 | 청킹전 (그 자리에서) |
| 3_chunk | 조·소제목마다 자르고 출처·자료·판본 줄을 붙인다. 청킹 폴더를 새로 만든다 | docs/답변참고문서/청킹 |
| 4_keywords | 둘째 줄에 키워드를 넣는다 | 청킹, docs/청킹_키워드확인표.md |
| 5_build_index | 조각을 하나로 묶는다 — 서버는 이 파일만 읽는다 | api/data/index.json |

## 새 문서를 넣을 때
1. 받은 파일을 `docs/답변참고문서/원본` 에 넣는다.
2. `scripts/문서목록.json` 에 약칭·호수·자료·판본·시행·번호를 적는다. 판본은 시연 사례 안에서 「개정 전 / 개정 후」로 적는다.
3. 1 → 5 단계를 돌린다.

## 알아 둘 것
- `to_md.py` 의 TIMELINE 은 정비 사례 docx 안 타임라인 그림의 글자를 손으로 옮긴 것이다. 다른 docx 의 그림은 글로 옮기지 못하니 확인 후 직접 적는다.
- `4_keywords.py` 의 MANUAL 은 손으로 고른 키워드다. 문서 약칭_호수 와 첫 소제목으로 찾는다.
