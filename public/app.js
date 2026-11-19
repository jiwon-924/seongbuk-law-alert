// 성북 법령개정 알리미 — 화면 동작 (빌드 없음, 해시 주소로 단계 이동)
// 키는 화면에 없다. 모든 공공 API · AI 호출은 /api 를 거친다.
(() => {
  'use strict';

  const view = document.getElementById('view');
  const STORE_KEY = 'seongbuk-law-alert:v1';
  const STEPS = ['검토 필요 목록', '신구법 비교', '조문 대조·사유', '개정 초안 3안', '입법예고'];
  const STATUS = ['검토 필요', '검토 중', '검토 완료'];

  // ── 아이콘 (인라인 SVG, 24 그리드 · 2px 선) ──
  const I = {
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    checkCircle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 11v6M12 7h.01"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 6v8M12 18h.01"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  };

  // ── 저장: 이 브라우저에만 (그릴링 Q7). 막혀 있어도 화면은 동작한다 ──
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
  }
  function save(s) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* 저장 불가 — 이번 화면에서만 유지 */ }
  }
  const store = Object.assign({ status: {}, picked: {}, ai: {} }, load());
  const statusOf = (id) => store.status[id] || '검토 필요';
  function setStatus(id, s) { store.status[id] = s; save(store); }

  // ── 도우미 ──
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // 법제처 신구법의 <P>바뀐 글</P> 만 강조로 바꾸고 나머지는 모두 글자로 둔다
  const lawHtml = (s) => esc(s).replace(/&lt;P&gt;/g, '<mark>').replace(/&lt;\/P&gt;/g, '</mark>');
  // 실시간 조례 본문은 줄바꿈 없이 와서 항(①)·호(1. 2.)·목(가. 나. 다.) 앞에서 줄을 나눈다.
  // 호: 「.」 앞이 숫자인 「2002. 02.」 같은 날짜는 나누지 않는다.
  // 목: 「한다. 다른」 같은 문장 끝과 헷갈리지 않게, 가 → 나 → 다 … 차례가 맞을 때만 나눈다.
  const MOK = '가나다라마바사아자차카타파하';
  const breakItems = (s) => String(s)
    .replace(/(\S)[ \t]*([①-⑳])/g, '$1\n$2') // 항(① ② …)
    .replace(/(?<!\d)([가-힣.)])[ \t]*(\d+\.\s)/g, '$1\n$2') // 「…경우2. 3명」처럼 한글 바로 뒤의 호도 나눈다
    .split('\n')
    .map((line) => {
      let next = 0;
      return line.replace(/(\S)([가-힣])\.\s/g, (m, pre, ch) => {
        if (ch !== MOK[next]) return m;
        next += 1;
        return `${pre}\n${ch}. `;
      });
    })
    .join('\n');

  async function api(path, body) {
    const opt = body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {};
    const r = await fetch(path, opt);
    if (!r.ok) {
      // 서버가 이유(오류)를 보냈으면 그 글을 그대로 보여 준다 (예: 너무 자주 부름)
      let msg = `서버 응답 ${r.status}`;
      try { msg = (await r.json()).오류 || msg; } catch { /* 본문 없음 */ }
      throw new Error(msg);
    }
    return r.json();
  }

  // 화면을 옮긴 뒤 키보드 위치를 새 화면 제목으로 보낸다 (처음 열 때는 하지 않는다)
  let moveFocus = false;
  function focusTitle(seq) {
    if (!moveFocus || isStale(seq)) return;
    const h = view.querySelector('h2.title');
    if (!h) return;
    moveFocus = false;
    h.setAttribute('tabindex', '-1');
    h.focus({ preventScroll: true });
  }

  // 클립보드 복사. 막혀 있으면(권한·http 등) 숨긴 글상자로 한 번 더 시도한다
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* 아래 방법으로 */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch { return false; }
  }

  function toast(msg) {
    const t = document.querySelector('.toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, 2400);
  }

  const statusBadge = (s) => `<span class="badge ${s === '검토 완료' ? 'badge--success' : s === '검토 중' ? 'badge--pastel' : 'badge--warning'}">${esc(s)}</span>`;

  // 출처 표시: 실시간이면 한 줄, 시연 값이면 이유와 함께 경고 상자
  function sourceHtml(src) {
    if (!src) return '';
    if (src.종류 === '실시간') {
      return `<p class="source"><span class="badge badge--success">실시간</span>${esc(src.기관)}${src.조회시각 ? ` · <span class="num">${esc(src.조회시각)}</span> 조회` : ''}</p>`;
    }
    return `<div class="alert alert--warning" role="note"><span class="alert__icon">${I.warn}</span><div>
      <p class="alert__title">시연 값 — ${esc(src.기관)}</p>
      <p class="alert__body">이유: ${esc(src.이유 || '확인 필요')}${src.조회시각 ? ` · <span class="num">${esc(src.조회시각)}</span>` : ''}</p></div></div>`;
  }

  // AI 가 답했는지, 어디서 넘어왔는지
  function aiMetaHtml(r) {
    const tried = (r.tried || []).map((t) => `${esc(t.ai)}${t.model ? ` (${esc(t.model)})` : ''}: ${esc(t.이유)}`);
    const who = r.ai ? `<span class="badge badge--solid">답한 AI · ${esc(r.ai)}</span><span>${esc(r.model || '')}</span>` : '<span class="badge badge--warning">AI 답 없음</span>';
    return `<div class="ai-meta">${who}${tried.length ? `<span>넘어간 기록 — ${tried.join(' / ')}</span>` : ''}</div>`;
  }

  const citeHtml = (list) => (list && list.length
    ? `<div class="cite">근거<ul>${list.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>`
    : '<div class="cite">근거: 확인 필요 — AI 가 근거 문서 이름을 붙이지 않았습니다.</div>');

  const skeleton = (note) => `<div aria-busy="true"><div class="skel skel--line" style="width:40%"></div><div class="skel skel--block"></div><div class="skel skel--line" style="width:70%"></div>${note ? `<p class="wait-note">${esc(note)}</p>` : ''}</div>`;

  const errorBox = (e) => `<div class="alert alert--danger" role="alert"><span class="alert__icon">${I.warn}</span><div><p class="alert__title">화면 자료를 불러오지 못했습니다</p><p class="alert__body">${esc(e.message)} — 잠시 뒤 화면을 다시 엽니다.</p></div></div>`;

  function setNav(name) {
    document.querySelectorAll('[data-nav]').forEach((a) => {
      if (a.dataset.nav === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  // ── 목록 자료 (한 번 받아 두고 「다시 조회」 때만 새로 받는다) ──
  let board = null;
  async function getBoard(force) {
    if (!board || force) board = await api('/api/changes');
    return board;
  }

  // 화면 번호: 화면을 그리기 시작할 때마다 하나씩 올린다.
  // 응답을 기다리는 동안 다른 화면으로 옮겨 갔으면(번호가 바뀌었으면) 늦게 온 결과를 그리지 않는다.
  let screenSeq = 0;
  const isStale = (seq) => seq !== screenSeq;

  // ═════ ① 현황판 ═════
  // refocusReload: 「다시 조회」를 눌렀으면 다시 그린 뒤 그 버튼으로 키보드 위치를 돌려준다
  async function renderBoard(force, refocusReload) {
    const seq = ++screenSeq;
    setNav('board');
    view.innerHTML = `<div class="page-head"><div><p class="eyebrow">1단계 · 검토 필요 목록</p><h2 class="title">현황판</h2>
      <p class="lede">최근 30일 동안 바뀐 법령 중 성북구 조례와 이어진 것을 모았습니다. 항목을 열면 신구법 비교부터 초안까지 차례로 봅니다.</p></div></div>${skeleton('법제처 변경이력을 조회하고 있습니다.')}`;
    let d;
    try { d = await getBoard(force); } catch (e) { if (!isStale(seq)) view.innerHTML = errorBox(e); return; }
    if (isStale(seq)) return;

    const counts = Object.fromEntries(STATUS.map((s) => [s, d.목록.filter((r) => statusOf(r.id) === s).length]));
    const dot = { '검토 필요': 'var(--warning)', '검토 중': 'var(--primary-50)', '검토 완료': 'var(--success)' };
    const rows = d.목록.map((r) => {
      const links = r.연결.map((l) => `<span>${esc(l.조례조문)} ← ${esc(l.법령조문)} <span class="badge badge--tertiary">${esc(l.관계)}</span></span>`).join('');
      return `<tr>
        <td><span class="badge ${r.구분 === '실시간' ? 'badge--primary' : 'badge--pastel'}">${esc(r.구분)}</span></td>
        <td><p class="board__law">${esc(r.법령)}</p><p class="board__sub">${esc(r.제개정구분)}${r.판본 ? ` · ${esc(r.판본)}` : ''}</p></td>
        <td class="num">${esc(r.시행일자)}<p class="board__sub">공포 ${esc(r.공포일자)}</p></td>
        <td><p class="board__sub" style="margin:0 0 4px">${esc(r.연결[0]?.조례 || '연결된 조례 없음')}</p><div class="board__links">${links}</div></td>
        <td>${statusBadge(statusOf(r.id))}</td>
        <td class="board__go"><a class="btn btn--tertiary btn--s" href="#/case/${encodeURIComponent(r.id)}/2" aria-label="${esc(`${r.구분} ${r.법령} (시행 ${r.시행일자}) 열기`)}">열기 ${I.arrow}</a></td>
      </tr>`;
    }).join('');

    const live = d.실시간;
    view.innerHTML = `
      <div class="page-head">
        <div><p class="eyebrow">1단계 · 검토 필요 목록</p><h2 class="title">현황판</h2>
          <p class="lede">최근 30일 동안 바뀐 법령 중 성북구 조례와 이어진 것을 모았습니다. 항목을 열면 신구법 비교부터 초안까지 차례로 봅니다.</p></div>
        <button class="btn btn--tertiary" type="button" data-act="reload">${I.refresh} 다시 조회</button>
      </div>
      ${sourceHtml(live.출처)}
      <p class="meta" style="margin-bottom:16px"><span>조회 기간 <span class="num">${esc(live.기간)}</span></span><span>공포 법령 <span class="num">${esc(live.전체건수)}</span>건 중 짝 정보와 이어진 것 <span class="num">${esc(live.짝법령건수)}</span>건</span><span>마지막 조회 <span class="num">${esc(d.조회시각)}</span></span></p>
      <div class="status-row" aria-label="검토 상태">${STATUS.map((s) => `<span class="chip"><span class="chip__dot" style="background:${dot[s]}"></span>${s} <strong>${counts[s]}</strong></span>`).join('')}</div>
      <div class="table-wrap"><table class="board">
        <caption class="visually-hidden">검토 필요 목록</caption>
        <thead><tr><th scope="col">구분</th><th scope="col">바뀐 법령</th><th scope="col">시행일</th><th scope="col">연결 조례 · 조문</th><th scope="col">상태</th><th scope="col"><span class="visually-hidden">열기</span></th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <div class="infobox" style="margin-top:24px"><span class="infobox__icon">${I.info}</span><div>
        <p class="infobox__title">AI 판단은 참고용입니다</p>
        <p class="infobox__body">개정 필요 여부와 초안은 담당자가 원문을 확인해 최종 결정합니다. 시연 사례는 2019년 폐기물 안전기준 위임 1건이며, 실시간 항목은 답변참고문서에 없어 AI 대조를 하지 않습니다.</p></div></div>
      <details class="status"><summary>연결 상태 보기</summary><div class="status__body" id="status-body">${skeleton()}</div></details>`;

    focusTitle(seq);
    if (refocusReload) view.querySelector('[data-act="reload"]').focus();
    view.querySelector('[data-act="reload"]').addEventListener('click', () => renderBoard(true, true));
    view.querySelector('details.status').addEventListener('toggle', async (ev) => {
      if (!ev.target.open || ev.target.dataset.loaded) return;
      ev.target.dataset.loaded = '1';
      const box = document.getElementById('status-body');
      try {
        const s = await api('/api/status');
        box.innerHTML = Object.entries(s.키).map(([k, v]) => `<p class="kv"><code>${esc(k)}</code>${v === '값 있음' ? '<span class="badge badge--success">값 있음</span>' : '<span class="badge badge--danger">비어 있음</span>'}</p>`).join('')
          + `<p style="margin-top:8px">AI 부르는 순서: ${s.AI순서.map(esc).join(' → ')}</p>`
          + s.AI.map((a) => `<p class="kv"><strong>${esc(a.ai)}</strong><span>${esc(a.상태)}</span>${a.모델 ? `<code>${esc(a.모델)}</code>` : ''}</p>`).join('');
      } catch (e) { box.innerHTML = errorBox(e); }
    });
  }

  // ═════ 사건 화면 공통 ═════
  function stepsHtml(id, step) {
    return `<ol class="steps" aria-label="검토 단계">${STEPS.map((name, i) => {
      const n = i + 1;
      const cls = n < step ? 'is-done' : n === step ? 'is-current' : '';
      const href = n === 1 ? '#/' : `#/case/${encodeURIComponent(id)}/${n}`;
      const dot = n < step ? I.check : n;
      return `<li class="${cls}"><a href="${href}"${n === step ? ' aria-current="step"' : ''}><span class="dot">${dot}</span><span class="label">${esc(name)}</span></a></li>`;
    }).join('')}</ol>`;
  }

  // 시그니처 — 위임 사슬: 법이 조례에 맡긴 고리를 이어 보여 주고, 빠진 고리는 점선 칸
  function chainHtml(row) {
    const joint = (label) => `<div class="chain__joint" aria-hidden="true"><span>${esc(label)}</span>${I.arrow}</div>`;
    if (row.id === 'demo-2019') {
      const done = statusOf(row.id) === '검토 완료';
      return `<section class="chain" aria-label="위임 사슬">
        <p class="chain__label">위임 사슬 — 법이 조례에 맡긴 사항이 어디까지 이어졌는지</p>
        <div class="chain__row">
          <div class="link"><p class="link__kind">법률 · 시행 2019.10.17</p><p class="link__name">폐기물관리법 제14조의5</p><p class="link__note">생활폐기물 수집·운반 안전기준</p></div>
          ${joint('근거')}
          <div class="link link--changed"><p class="link__kind">시행규칙 · 신설 2019.12.31</p><p class="link__name">제16조의3제2항제3호 단서</p><p class="link__note">주간작업·3명 1조 예외를 「조례로 정한 사유」로 위임</p></div>
          ${joint('위임')}
          <div class="link link--missing"><p class="link__kind">성북구 조례 · 제1349호</p><p class="link__name">해당 규정 없음</p><p class="link__note">예외 사유가 없어 야간작업·1~2인 작업의 조례상 근거가 비어 있습니다.</p>${done ? '<p class="link__status"><span class="badge badge--success">검토 완료</span></p>' : ''}</div>
        </div></section>`;
    }
    const links = row.연결.map((l) => `<div class="link"><p class="link__kind">${esc(l.조례)}</p><p class="link__name">${esc(l.조례조문)}</p><p class="link__note">${esc(l.법령조문)}과 ${esc(l.관계)} 관계 · 짝 정보 확인: ${esc(l.확인)}</p></div>`);
    return `<section class="chain" aria-label="연결 사슬">
      <p class="chain__label">연결 사슬 — 바뀐 법령과 짝 정보로 이어진 조례 조문</p>
      <div class="chain__row">
        <div class="link link--changed"><p class="link__kind">${esc(row.제개정구분)} · 시행 ${esc(row.시행일자)}</p><p class="link__name">${esc(row.법령)}</p><p class="link__note">${esc(row.판본 || '')}</p></div>
        ${joint('짝')}
        ${links.join(joint('·'))}
      </div></section>`;
  }

  function pagerHtml(id, step) {
    const prev = step === 2 ? '#/' : `#/case/${encodeURIComponent(id)}/${step - 1}`;
    const next = step < 5 ? `<a class="btn btn--primary" href="#/case/${encodeURIComponent(id)}/${step + 1}">다음: ${esc(STEPS[step])} ${I.arrow}</a>` : '<a class="btn btn--primary" href="#/">현황판으로</a>';
    return `<div class="pager"><a class="btn btn--tertiary" href="${prev}">${I.back} 이전: ${esc(STEPS[step - 2])}</a>${next}</div>`;
  }

  // 검토 상태 고르기 — 담당자가 직접 바꾸고 되돌릴 수 있다 (실시간 항목도 같음)
  function statusControlHtml(id) {
    const now = statusOf(id);
    return `<fieldset class="seg"><legend class="seg__legend">검토 상태</legend>
      ${STATUS.map((s) => `<label class="seg__item"><input type="radio" name="case-status" value="${esc(s)}"${s === now ? ' checked' : ''}><span>${esc(s)}</span></label>`).join('')}
    </fieldset>`;
  }

  // 상태에 따라 달라지는 머리 부분(상태 고르기 · 위임 사슬)을 지금 상태에 맞춘다
  function syncStatusUi(row) {
    const chain = view.querySelector('.chain');
    if (chain) chain.outerHTML = chainHtml(row);
    view.querySelectorAll('input[name="case-status"]').forEach((r) => { r.checked = r.value === statusOf(row.id); });
  }

  // 머리에서 상태를 바꾸면: 머리 부분 + (4단계면) 초안 아래 결정 줄을 다시 그린다. 상태 고르기는 그대로 두어 키보드 위치가 남는다
  function onStatusChanged(row, step) {
    syncStatusUi(row);
    if (step === 4) {
      const body = document.getElementById('step-body');
      if (body) stepDrafts(body, row).catch((e) => { body.innerHTML = errorBox(e); });
    }
  }

  async function renderCase(id, step) {
    const seq = ++screenSeq;
    setNav('board');
    view.innerHTML = skeleton();
    let d;
    try { d = await getBoard(); } catch (e) { if (!isStale(seq)) view.innerHTML = errorBox(e); return; }
    if (isStale(seq)) return;
    const row = d.목록.find((r) => r.id === id);
    if (!row) {
      view.innerHTML = `<div class="infobox"><span class="infobox__icon">${I.info}</span><div><p class="infobox__title">이 항목은 지금 목록에 없습니다</p><p class="infobox__body">최근 30일 범위를 벗어났을 수 있습니다. 현황판에서 다시 고릅니다.</p><p style="margin-top:12px"><a class="btn btn--tertiary btn--s" href="#/">현황판으로</a></p></div></div>`;
      return;
    }
    view.innerHTML = `
      <nav class="breadcrumb" aria-label="현재 위치"><a href="#/">현황판</a><span class="sep">›</span><span>${esc(row.법령)}</span><span class="sep">›</span><span aria-current="page">${esc(STEPS[step - 1])}</span></nav>
      <div class="page-head"><div>
        <p class="eyebrow">${step}단계 · ${esc(STEPS[step - 1])}</p>
        <h2 class="title">${esc(row.법령)}</h2>
        <p class="meta" style="margin-top:8px"><span class="badge ${row.구분 === '실시간' ? 'badge--primary' : 'badge--pastel'}">${esc(row.구분)}</span><span>${esc(row.제개정구분)}</span><span>시행 <span class="num">${esc(row.시행일자)}</span></span></p>
      </div>${statusControlHtml(id)}</div>
      ${chainHtml(row)}
      ${stepsHtml(id, step)}
      <div id="step-body">${skeleton()}</div>
      ${pagerHtml(id, step)}`;

    view.querySelectorAll('input[name="case-status"]').forEach((r) => r.addEventListener('change', () => {
      setStatus(id, r.value);
      toast(`검토 상태를 「${r.value}」${r.value === '검토 중' ? '으로' : '로'} 바꿨습니다.`);
      onStatusChanged(row, step);
    }));
    focusTitle(seq);

    const body = document.getElementById('step-body');
    try {
      if (step === 2) await stepCompare(body, row);
      else if (step === 3) await stepAnalyze(body, row);
      else if (step === 4) await stepDrafts(body, row);
      else await stepNotices(body, true);
    } catch (e) { body.innerHTML = errorBox(e); }
  }

  const lawQ = (row) => `id=${encodeURIComponent(row.id)}&law=${encodeURIComponent(row.법령)}`;

  // ═════ ② 신구법 비교 ═════
  async function stepCompare(body, row) {
    const d = await api(`/api/compare?${lawQ(row)}`);
    const related = (s) => (d.관련조문 || []).some((no) => new RegExp(`^${no}[(<]`).test(s.replace(/^\s+/, '')) || s.includes(`${no}제`) || s.includes(`${no}(`));
    const n = Math.max(d.개정전.조문.length, d.개정후.조문.length);
    let cells = '';
    for (let i = 0; i < n; i++) {
      const a = d.개정전.조문[i] ?? '';
      const b = d.개정후.조문[i] ?? '';
      // 시연 사례의 개정 전 칸은 번호만 같은 다른 조문이라 짝 표시를 하지 않는다
      const relA = !d.개정전.다른조문 && related(a);
      const relB = related(b);
      const tagOf = (on) => (on ? '<p class="cmp__tag"><span class="badge badge--primary">짝 정보 조문</span></p>' : '');
      const tagA = d.개정전.다른조문 && a ? '<p class="cmp__tag"><span class="badge badge--tertiary">같은 번호 · 다른 조문</span></p>' : tagOf(relA);
      // cmp__side: 좁은 화면에서 한 줄로 바뀔 때만 보이는 「개정 전/후」 표시
      cells += `<div class="cmp__cell${relA ? ' is-related' : ''}"><p class="cmp__side">개정 전 · ${esc(d.개정전.판본)}</p>${tagA}<div class="lawtext">${lawHtml(a)}</div></div><div class="cmp__cell${relB ? ' is-related' : ''}"><p class="cmp__side">개정 후 · ${esc(d.개정후.판본)}</p>${tagOf(relB)}<div class="lawtext">${lawHtml(b)}</div></div>`;
    }
    body.innerHTML = `
      ${sourceHtml(d.출처)}
      ${d.대체 ? '<p class="note" style="margin-bottom:12px">실시간 신구법 비교를 받지 못해, 아래는 시연 사례의 비교입니다.</p>' : ''}
      ${d.개정전.안내 ? `<div class="alert alert--info"><span class="alert__icon">${I.info}</span><div><p class="alert__title">개정 전 판본 안내</p><p class="alert__body">${esc(d.개정전.안내)}</p></div></div>` : ''}
      <p class="note" style="margin-bottom:12px">파란 칠은 바뀐 글자, 연한 파란 칸은 짝 정보에 적힌 조문입니다.</p>
      <div class="cmp">
        <div class="cmp__head"><strong>개정 전</strong><span>${esc(d.개정전.판본)}</span></div>
        <div class="cmp__head"><strong>개정 후</strong><span>${esc(d.개정후.판본)}</span></div>
        ${cells}
      </div>
      ${d.개정전.근거 ? citeHtml([d.개정전.근거, d.개정후.근거]) : ''}`;
  }

  // ═════ ③ 조문 대조·사유 ═════
  async function stepAnalyze(body, row) {
    body.innerHTML = `<div class="grid-2"><section class="panel" id="ord">${skeleton()}</section><section class="panel" id="ai">${skeleton('AI 가 조각 문서로 대조하고 있습니다. 20초쯤 걸릴 수 있습니다.')}</section></div>`;
    const ordBox = body.querySelector('#ord');
    const aiBox = body.querySelector('#ai');

    api(`/api/ordinance?${lawQ(row)}`).then((o) => {
      ordBox.innerHTML = `<div class="panel-head"><h3 class="section-title">조례 조문</h3><span class="meta">${esc(o.조례)} ${esc(o.판본 || '')}</span></div>
        ${sourceHtml(o.출처)}
        ${o.안내 ? `<div class="alert alert--warning"><span class="alert__icon">${I.warn}</span><div><p class="alert__title">위임 규정 없음</p><p class="alert__body">${esc(o.안내)}</p></div></div>` : ''}
        ${o.조문.length ? o.조문.map((a) => `<h4 style="font-size:15px;margin:12px 0 6px">${esc(a.제목)}</h4><div class="lawtext">${esc(breakItems(a.내용))}</div>${a.근거 ? citeHtml([a.근거]) : ''}`).join('')
          : `<p class="note">짝 정보의 조문(${esc((o.찾은조문 || []).join(', '))})을 본문에서 찾지 못했습니다.</p>`}`;
    }).catch((e) => { ordBox.innerHTML = errorBox(e); });

    await analyzeInto(aiBox, row, false);
  }

  async function analyzeInto(box, row, force) {
    const cached = store.ai[row.id]?.analyze;
    let r = !force && cached;
    if (!r) {
      box.innerHTML = skeleton('AI 가 조각 문서로 대조하고 있습니다. 20초쯤 걸릴 수 있습니다.');
      try {
        r = await api('/api/analyze', { id: row.id, force: !!force });
      } catch (e) {
        // 다시 대조가 막히면(너무 자주 부름 등) 이전 결과를 그대로 두고 이유만 알린다
        if (!cached) throw e;
        toast(e.message);
        r = cached;
      }
      // 실제 AI 가 답했을 때만 저장 — AI 가 모두 실패해 받은 시연 값은 저장하지 않고 다음에 다시 부른다
      if (r.ai) { (store.ai[row.id] ||= {}).analyze = r; save(store); }
    }
    if (r.문서에없음) {
      box.innerHTML = `<h3 class="section-title">AI 대조와 사유</h3><div class="infobox"><span class="infobox__icon">${I.info}</span><div><p class="infobox__title">문서에 없음</p><p class="infobox__body">${esc(r.안내)}</p></div></div>`;
      return;
    }
    const res = r.결과;
    box.innerHTML = `
      <div class="panel-head"><h3 class="section-title">AI 대조와 사유</h3><button class="btn btn--tertiary btn--s" type="button" data-act="re-analyze">${I.refresh} 다시 대조</button></div>
      ${aiMetaHtml(r)}
      ${r.출처?.종류 === '시연 값' ? sourceHtml(r.출처) : ''}
      <p class="summary">${esc(res.요약)}</p>
      ${res.검토조문.map((x) => `<div class="review-row">
        <p>${x.판단 === '검토 필요' ? '<span class="badge badge--warning">검토 필요</span>' : `<span class="badge badge--tertiary">${esc(x.판단)}</span>`}</p>
        <dl><dt>법령 조문</dt><dd>${esc(x.법령조문)}</dd><dt>조례 조문</dt><dd>${esc(x.조례조문)}</dd><dt>사유</dt><dd>${esc(x.사유)}</dd></dl>
        ${citeHtml(x.근거)}</div>`).join('')}
      ${res.확인할점?.length ? `<h4 style="font-size:15px;margin-top:16px">원문으로 확인할 것</h4><ul class="checklist">${res.확인할점.map((c) => `<li>${I.checkCircle}<span>${esc(c)}</span></li>`).join('')}</ul>` : ''}`;
    box.querySelector('[data-act="re-analyze"]').addEventListener('click', () => analyzeInto(box, row, true).catch((e) => { box.innerHTML = errorBox(e); }));
  }

  // ═════ ④ 개정 초안 3안 ═════
  // focus: 다시 그린 뒤 키보드 위치를 돌려줄 요소 (선택자)
  async function stepDrafts(body, row, force, focus) {
    const cached = store.ai[row.id]?.drafts;
    let r = !force && cached;
    if (!r) {
      body.innerHTML = skeleton('AI 가 초안 3안을 쓰고 있습니다. 20초쯤 걸릴 수 있습니다.');
      try {
        r = await api('/api/drafts', { id: row.id, force: !!force });
        if (force && r.ai) { delete store.picked[row.id]; save(store); } // 새 초안이 왔을 때만 고른 안을 비운다
      } catch (e) {
        if (!cached) throw e;
        toast(e.message);
        r = cached;
      }
      // 실제 AI 가 답했을 때만 저장 (시연 값은 저장하지 않음)
      if (r.ai) { (store.ai[row.id] ||= {}).drafts = r; save(store); }
    }
    if (r.문서에없음) {
      body.innerHTML = `<div class="infobox"><span class="infobox__icon">${I.info}</span><div><p class="infobox__title">문서에 없음</p><p class="infobox__body">${esc(r.안내)}</p></div></div>`;
      return;
    }
    const picked = store.picked[row.id];
    body.innerHTML = `
      <div class="panel-head"><p class="note">세 안 중 하나를 골라 검토를 이어 갑니다. 고른 안은 이 브라우저에만 저장됩니다.</p>
        <button class="btn btn--tertiary btn--s" type="button" data-act="re-draft">${I.refresh} 초안 다시 쓰기</button></div>
      ${aiMetaHtml(r)}
      ${r.출처?.종류 === '시연 값' ? sourceHtml(r.출처) : ''}
      <div class="drafts" role="radiogroup" aria-label="개정 초안">
        ${r.초안.map((d) => {
          const sel = picked === d.안;
          return `<article class="draft${sel ? ' is-selected' : ''}">
            <p><span class="badge ${sel ? 'badge--solid' : 'badge--pastel'}">${esc(d.안)}</span></p>
            <h3 class="draft__name">${esc(d.이름)}</h3>
            <div class="draft__text">${d.조문안 ? `<div class="lawtext">${esc(d.조문안)}</div>` : '<p class="draft__empty">초안 없음</p>'}</div>
            <p class="note">${esc(d.설명)}</p>
            ${citeHtml(d.근거)}
            <div class="draft__actions">
              <button class="btn btn--tertiary btn--s" type="button" data-copy="${esc(d.안)}" aria-label="${esc(`${d.안} ${d.이름} 조문안 복사`)}" ${d.조문안 ? '' : 'disabled'}>${I.copy} 조문안 복사</button>
              <button class="btn ${sel ? 'btn--primary' : 'btn--tertiary'}" type="button" role="radio" aria-checked="${sel}" aria-label="${esc(`${d.안} ${d.이름} ${sel ? '고른 안' : '고르기'}`)}" data-pick="${esc(d.안)}" ${d.조문안 ? '' : 'disabled'}>${sel ? `${I.check} 고른 안` : '이 안 고르기'}</button>
            </div>
          </article>`;
        }).join('')}
      </div>
      <div class="decision"><p tabindex="-1">지금 상태 ${statusBadge(statusOf(row.id))}${picked ? ` · 고른 안 <strong>${esc(picked)}</strong>` : ''}</p>
        <button class="btn btn--primary" type="button" data-act="done" ${picked && statusOf(row.id) !== '검토 완료' ? '' : 'disabled'}>검토 완료로 표시</button></div>`;

    if (focus) body.querySelector(focus)?.focus();

    body.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
      const d = r.초안.find((x) => x.안 === b.dataset.copy);
      toast(await copyText(d.조문안) ? `${d.안} 조문안을 복사했습니다.` : '복사하지 못했습니다. 조문을 직접 선택해 복사합니다.');
    }));
    body.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
      const 안 = b.dataset.pick;
      store.picked[row.id] = 안; save(store);
      // 초안을 고르면 검토가 시작된 것으로 본다 (머리의 상태 고르기로 언제든 바꿀 수 있다)
      if (statusOf(row.id) === '검토 필요') { setStatus(row.id, '검토 중'); syncStatusUi(row); }
      toast(`${안}을 골랐습니다.`);
      stepDrafts(body, row, false, `[data-pick="${안}"]`);
    }));
    body.querySelector('[data-act="done"]').addEventListener('click', () => {
      setStatus(row.id, '검토 완료');
      syncStatusUi(row);
      toast('검토 완료로 표시했습니다.');
      stepDrafts(body, row, false, '.decision p');
    });
    body.querySelector('[data-act="re-draft"]').addEventListener('click', () => {
      stepDrafts(body, row, true).catch((e) => { body.innerHTML = errorBox(e); });
    });
  }

  // ═════ ⑤ 입법예고 ═════
  async function stepNotices(body) {
    const d = await api('/api/notices');
    const fields = (r) => Object.entries(r).filter(([k]) => !['관련', '제목'].includes(k));
    const titleOf = (r) => r.제목 || Object.values(r).find((v) => typeof v === 'string' && v.length > 6) || '제목 없음';
    body.innerHTML = `
      ${sourceHtml(d.출처)}
      ${d.시연 ? '<p class="note" style="margin-bottom:12px">국민참여입법센터 승인 전이라, 시연 사례 조문이 개정 전 단계에 있었다고 가정한 예시를 보여 줍니다. 실제 입법예고가 아닙니다.</p>' : ''}
      <section class="panel"><div class="panel-head"><h3 class="section-title">진행 중인 입법예고</h3>
        <a class="btn btn--tertiary btn--s" href="${esc(d.원문)}" target="_blank" rel="noopener">국민참여입법센터 열기 ${I.link}</a></div>
        <div>${d.목록.length ? d.목록.map((r) => `<div class="notice">
          <p class="notice__title">${r.관련 ? '<span class="badge badge--primary">짝 법령</span> ' : ''}${esc(titleOf(r))}</p>
          <dl>${fields(r).map(([k, v]) => `<div><dt class="visually-hidden">${esc(k)}</dt><dd>${esc(k)}: ${esc(v)}</dd></div>`).join('')}</dl>
        </div>`).join('') : '<p class="note">지금 진행 중인 입법예고가 없습니다.</p>'}</div>
      </section>`;
  }

  async function renderNotices() {
    const seq = ++screenSeq; // 다른 화면이 기다리던 결과로 이 화면을 덮어쓰지 못하게 번호를 올린다
    setNav('notices');
    view.innerHTML = `<div class="page-head"><div><p class="eyebrow">5단계 · 입법예고</p><h2 class="title">입법예고 열람</h2>
      <p class="lede">개정 전 단계의 법령안을 미리 보고 조례 검토를 준비합니다. 짝 정보에 있는 법령은 표시해 둡니다.</p></div></div><div id="step-body">${skeleton()}</div>`;
    focusTitle(seq);
    const body = document.getElementById('step-body');
    try { await stepNotices(body); } catch (e) { body.innerHTML = errorBox(e); }
  }

  // ── 주소 → 화면 ──
  function route() {
    const h = location.hash.replace(/^#/, '') || '/';
    const m = h.match(/^\/case\/([^/]+)\/(\d)$/);
    if (m) renderCase(decodeURIComponent(m[1]), Math.min(5, Math.max(2, Number(m[2]))));
    else if (h === '/notices') renderNotices();
    else renderBoard();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', () => { moveFocus = true; route(); });
  route();
})();
