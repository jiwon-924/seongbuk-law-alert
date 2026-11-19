"""1단계: 원본(hwp·docx·txt) → 청킹전(.md)
사용: python -I -X utf8 scripts/1_convert.py          (이미 있는 .md 는 건너뜀)
      python -I -X utf8 scripts/1_convert.py --force  (다시 만듦 — 2_clean 으로 정제한 내용이 지워진다)
"""
import os, sys, subprocess, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, 'docs', '답변참고문서', '원본')
DST = os.path.join(ROOT, 'docs', '답변참고문서', '청킹전')


def run(*args):
    subprocess.run([sys.executable, '-I', '-X', 'utf8', *args], check=True)


def main(force):
    os.makedirs(DST, exist_ok=True)
    tmp = tempfile.mkdtemp()
    for fn in sorted(os.listdir(SRC)):
        base, ext = os.path.splitext(fn)
        src, dst = os.path.join(SRC, fn), os.path.join(DST, base + '.md')
        if os.path.exists(dst) and not force:
            print('건너뜀(이미 있음):', base); continue
        ext = ext.lower()
        js = os.path.join(tmp, 'blocks.json')
        if ext == '.hwp':          # 법제처에서 받은 .hwp 는 실제로 HWPML(XML) 이다
            run(os.path.join(HERE, 'hml2blocks.py'), src, js)
            run(os.path.join(HERE, 'to_md.py'), 'hwp', js, base, dst)
        elif ext == '.docx':
            run(os.path.join(HERE, 'docx2blocks.py'), src, js)
            run(os.path.join(HERE, 'to_md.py'), 'docx', js, base, dst)
        elif ext == '.txt':
            run(os.path.join(HERE, 'to_md.py'), 'txt', src, base, dst)
        else:
            print('바꾸지 못하는 형식:', fn)


if __name__ == '__main__':
    main('--force' in sys.argv)
