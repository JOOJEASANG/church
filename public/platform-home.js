/* 크리스천 참여형 플랫폼 홈
 * 기존 교회 기능을 유지하면서 게임·미션·랭킹을 홈의 첫 경험으로 제공합니다.
 */
import { app, auth } from '/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-functions.js';

const callQuiz = httpsCallable(getFunctions(app, 'asia-northeast3'), 'bibleQuizV2');
let platformMeta = null;
let loadingMeta = false;

const MISSIONS = [
  { id: 'quiz', icon: '🎯', title: '성경퀴즈 한 판 완료', sub: '퀴즈를 끝내면 자동으로 체크돼요', auto: true },
  { id: 'verse', icon: '📖', title: '오늘의 말씀 읽기', sub: '말씀을 읽고 오늘의 체크를 남겨요' },
  { id: 'prayer', icon: '🙏', title: '한 사람을 위해 기도하기', sub: '떠오르는 한 사람을 위해 잠시 기도해요' },
  { id: 'encourage', icon: '💚', title: '격려 한마디 전하기', sub: '가족이나 지인에게 따뜻한 말을 건네요' }
];

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function notify(message) {
  if (typeof window.toast === 'function') window.toast(message);
  else {
    let el = document.getElementById('platformToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'platformToast';
      el.className = 'cph-toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), 1800);
  }
}

function injectStyles() {
  if (document.getElementById('christianPlatformStyles')) return;
  const style = document.createElement('style');
  style.id = 'christianPlatformStyles';
  style.textContent = `
    #bqLaunch { display:none !important; }
    .cph-wrap{margin:4px 0 20px}
    .cph-hero{position:relative;overflow:hidden;border-radius:26px;padding:25px 21px 21px;color:#fff;background:linear-gradient(145deg,#0e213c 0%,#173f65 58%,#85672d 135%);box-shadow:0 14px 34px rgba(17,45,75,.17)}
    .cph-hero:before,.cph-hero:after{content:'';position:absolute;border-radius:999px;background:rgba(255,255,255,.065);pointer-events:none}
    .cph-hero:before{width:170px;height:170px;right:-70px;top:-82px}.cph-hero:after{width:105px;height:105px;left:-52px;bottom:-58px}
    .cph-eyebrow{position:relative;z-index:1;display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border:1px solid rgba(255,255,255,.18);border-radius:999px;background:rgba(255,255,255,.09);font-size:10px;font-weight:900;letter-spacing:.7px}
    .cph-hero h1{position:relative;z-index:1;margin:13px 0 6px;font-size:27px;line-height:1.2;letter-spacing:-1px}
    .cph-hero p{position:relative;z-index:1;margin:0;max-width:470px;font-size:13px;line-height:1.65;color:rgba(255,255,255,.82);font-weight:650}
    .cph-meta{position:relative;z-index:1;display:flex;flex-wrap:wrap;gap:6px;margin-top:15px}
    .cph-meta span{padding:6px 9px;border-radius:10px;background:rgba(255,255,255,.09);font-size:10.5px;font-weight:800;color:rgba(255,255,255,.9)}
    .cph-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:11px}
    .cph-action{border:1px solid var(--line,#e7e8e3);border-radius:18px;background:var(--paper,#fff);color:var(--text,#17191c);padding:16px 14px;text-align:left;cursor:pointer;box-shadow:var(--shadow-xs,0 1px 2px rgba(0,0,0,.04));min-height:108px}
    .cph-action .ico{font-size:25px;line-height:1}.cph-action b{display:block;margin-top:10px;font-size:15px;letter-spacing:-.35px}.cph-action span{display:block;margin-top:4px;font-size:11px;line-height:1.45;color:var(--muted,#777);font-weight:650}
    .cph-action.featured{background:linear-gradient(145deg,color-mix(in srgb,var(--primary-soft,#eef4ea) 72%,var(--paper,#fff)),var(--paper,#fff));border-color:color-mix(in srgb,var(--primary,#73926d) 30%,var(--line,#ddd))}
    .cph-block{margin-top:18px}
    .cph-title{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;margin:0 2px 9px}
    .cph-title h2{margin:0;font-size:18px;letter-spacing:-.55px}.cph-title small{font-size:10.5px;color:var(--muted,#777);font-weight:750}
    .cph-panel{border:1px solid var(--line,#e7e8e3);border-radius:20px;background:var(--paper,#fff);padding:8px 14px;box-shadow:var(--shadow-xs,0 1px 2px rgba(0,0,0,.04))}
    .cph-mission{display:grid;grid-template-columns:36px 1fr auto;align-items:center;gap:10px;padding:12px 1px;border-bottom:1px solid var(--line,#eee);cursor:pointer}
    .cph-mission:last-child{border-bottom:0}.cph-mission .mi{width:34px;height:34px;display:grid;place-items:center;border-radius:11px;background:var(--bg-2,#f4f1ea);font-size:18px}
    .cph-mission b{display:block;font-size:13px}.cph-mission span{display:block;margin-top:2px;font-size:10.5px;color:var(--muted,#777);line-height:1.4}
    .cph-check{width:27px;height:27px;border-radius:999px;border:1px solid var(--line-strong,#d8d9d4);display:grid;place-items:center;font-size:13px;color:transparent;background:var(--bg,#fafaf7);font-weight:950}
    .cph-mission.done .cph-check{background:var(--primary,#73926d);border-color:var(--primary,#73926d);color:#fff}.cph-mission.done{opacity:.74}
    .cph-progress{height:7px;border-radius:999px;background:var(--bg-2,#f1f1ed);overflow:hidden;margin:4px 0 8px}.cph-progress>i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--primary,#73926d),#b28a48)}
    .cph-rank-row{display:grid;grid-template-columns:31px 1fr auto;align-items:center;gap:8px;padding:10px 1px;border-bottom:1px solid var(--line,#eee);font-size:12px}.cph-rank-row:last-child{border-bottom:0}
    .cph-rank-no{width:26px;height:26px;border-radius:9px;display:grid;place-items:center;background:var(--bg-2,#f4f1ea);font-weight:950}.cph-rank-row.me{font-weight:850;color:var(--primary-dark,#5d7858)}
    .cph-rank-score{font-weight:900}.cph-empty{padding:18px 6px;text-align:center;color:var(--muted,#777);font-size:12px;line-height:1.55}
    .cph-my-rank{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:9px;padding:11px 13px;border-radius:15px;background:var(--primary-soft,#eef4ea);font-size:11px}.cph-my-rank b{font-size:13px}
    .cph-church-head{display:flex;align-items:center;gap:12px;margin:28px 2px 10px;padding-top:4px}.cph-church-ico{width:42px;height:42px;border-radius:14px;background:var(--primary-soft,#eef4ea);display:grid;place-items:center;font-size:20px}.cph-church-head h2{margin:0;font-size:19px;letter-spacing:-.6px}.cph-church-head p{margin:2px 0 0;font-size:11px;color:var(--muted,#777)}
    .cph-toast{position:fixed;left:50%;bottom:calc(28px + env(safe-area-inset-bottom,0px));z-index:16000;transform:translate(-50%,8px);opacity:0;pointer-events:none;transition:.18s;background:#18201c;color:#fff;border-radius:999px;padding:10px 15px;font-size:12px;font-weight:800;white-space:nowrap;max-width:calc(100% - 30px)}.cph-toast.show{opacity:1;transform:translate(-50%,0)}
    @media(min-width:761px){.cph-actions{grid-template-columns:repeat(4,minmax(0,1fr))}.cph-action{min-height:124px}}
    @media(max-width:380px){.cph-action{padding:14px 12px}.cph-action b{font-size:14px}.cph-hero h1{font-size:25px}}
  `;
  document.head.appendChild(style);
}

function shellHtml() {
  return `
    <div class="cph-wrap" id="christianPlatformHome">
      <section class="cph-hero">
        <div class="cph-eyebrow">✦ CHRISTIAN PLAY · BETA</div>
        <h1>오늘 뭐 할까요?</h1>
        <p>말씀을 배우고, 퀴즈로 즐기고, 성도들과 함께 도전해보세요. 짧게 와도 즐길 거리가 있는 크리스천 공간입니다.</p>
        <div class="cph-meta" id="platformMetaChips">
          <span>📖 성경 66권</span><span>🎯 212+ 문제</span><span>⚡ 실시간 대결</span>
        </div>
      </section>
      <div class="cph-actions">
        <button type="button" class="cph-action featured" data-platform-quiz="quiz"><div class="ico">🎯</div><b>오늘의 퀴즈</b><span>가볍게 한 판 풀고 주간 점수를 올려요</span></button>
        <button type="button" class="cph-action" data-platform-quiz="competition"><div class="ico">⚡</div><b>실시간 대결</b><span>코드로 초대하고 함께 순위를 겨뤄요</span></button>
        <button type="button" class="cph-action" data-platform-quiz="study"><div class="ico">📚</div><b>공부 모드</b><span>힌트·성경 위치·정답 해설과 함께 배워요</span></button>
        <button type="button" class="cph-action" data-platform-quiz="make"><div class="ico">✍️</div><b>문제 내기</b><span>내가 직접 문제와 해설을 만들어봐요</span></button>
      </div>
      <section class="cph-block">
        <div class="cph-title"><h2>🔥 오늘의 미션</h2><small id="platformMissionCount">0 / 4 완료</small></div>
        <div class="cph-progress"><i id="platformMissionProgress" style="width:0%"></i></div>
        <div class="cph-panel" id="platformMissionList"></div>
      </section>
      <section class="cph-block">
        <div class="cph-title"><h2>🏆 이번 주 랭킹</h2><small>퀴즈 정답 수 기준</small></div>
        <div class="cph-panel" id="platformRanking"><div class="cph-empty">랭킹을 불러오는 중...</div></div>
        <div class="cph-my-rank" id="platformMyRank" style="display:none"></div>
      </section>
    </div>
  `;
}

function renderMissions() {
  const target = document.getElementById('platformMissionList');
  if (!target) return;
  const state = platformMeta?.missions || {};
  target.innerHTML = MISSIONS.map((m) => {
    const done = Boolean(state[m.id]);
    return `<div class="cph-mission ${done ? 'done' : ''}" data-platform-mission="${m.id}" role="button" tabindex="0" aria-pressed="${done}">
      <div class="mi">${m.icon}</div><div><b>${esc(m.title)}</b><span>${esc(m.sub)}</span></div><div class="cph-check">${done ? '✓' : '·'}</div>
    </div>`;
  }).join('');
  const completed = MISSIONS.filter((m) => Boolean(state[m.id])).length;
  const count = document.getElementById('platformMissionCount');
  const progress = document.getElementById('platformMissionProgress');
  if (count) count.textContent = `${completed} / ${MISSIONS.length} 완료`;
  if (progress) progress.style.width = `${Math.round((completed / MISSIONS.length) * 100)}%`;
}

function renderRanking() {
  const target = document.getElementById('platformRanking');
  const mine = document.getElementById('platformMyRank');
  if (!target || !mine) return;
  const rows = platformMeta?.leaderboard || [];
  if (!rows.length) {
    target.innerHTML = '<div class="cph-empty"><b>이번 주 첫 도전자가 되어보세요.</b><br>퀴즈를 완료하면 주간 랭킹이 시작됩니다.</div>';
  } else {
    target.innerHTML = rows.slice(0, 5).map((r) => `<div class="cph-rank-row ${r.isMe ? 'me' : ''}"><div class="cph-rank-no">${r.rank}</div><div>${esc(r.name)}${r.isMe ? ' · 나' : ''}</div><div class="cph-rank-score">${Number(r.points) || 0}점</div></div>`).join('');
  }
  const me = platformMeta?.me;
  if (me && (me.rank || me.points)) {
    mine.style.display = 'flex';
    mine.innerHTML = `<span>내 주간 기록 · ${me.rank ? `${me.rank}위` : '순위 집계 전'}</span><b>${Number(me.points) || 0}점 · ${Number(me.plays) || 0}판</b>`;
  } else {
    mine.style.display = 'none';
  }
}

function renderMeta() {
  const chips = document.getElementById('platformMetaChips');
  if (chips && platformMeta) chips.innerHTML = `<span>📖 성경 66권</span><span>🎯 ${Number(platformMeta.bankCount) || 212}+ 문제</span><span>⚡ 실시간 대결</span>`;
  renderMissions();
  renderRanking();
}

async function refreshMeta() {
  if (!auth.currentUser || loadingMeta) return;
  loadingMeta = true;
  try {
    const result = await callQuiz({ action: 'platformMeta' });
    platformMeta = result.data || {};
    renderMeta();
  } catch (error) {
    console.warn('[platform-home] 상태 불러오기 실패:', error?.message || error);
    renderMissions();
    const ranking = document.getElementById('platformRanking');
    if (ranking) ranking.innerHTML = '<div class="cph-empty">퀴즈를 시작하면 주간 기록을 확인할 수 있습니다.</div>';
  } finally {
    loadingMeta = false;
  }
}

async function completeMission(id) {
  if (!auth.currentUser) {
    notify('로그인 후 미션을 이용할 수 있습니다.');
    return;
  }
  const mission = MISSIONS.find((m) => m.id === id);
  if (!mission || platformMeta?.missions?.[id]) return;
  if (mission.auto) {
    notify('성경퀴즈 한 판을 끝내면 자동으로 완료됩니다.');
    document.dispatchEvent(new CustomEvent('christian-platform:quiz', { detail: { mode: 'quiz' } }));
    return;
  }
  try {
    const result = await callQuiz({ action: 'missionComplete', missionId: id });
    platformMeta = result.data || platformMeta;
    renderMeta();
    notify('오늘의 미션을 완료했습니다.');
    if (id === 'verse') document.getElementById('verseCard')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (error) {
    notify(String(error?.message || '미션을 저장하지 못했습니다.').replace(/^FirebaseError:\s*/i, '').replace(/^functions\/[\w-]+:\s*/i, ''));
  }
}

function setChurchDivider() {
  const home = document.getElementById('tab-home');
  const hero = home?.querySelector('.hero');
  if (!home || !hero || document.getElementById('platformChurchDivider')) return;
  const el = document.createElement('div');
  el.id = 'platformChurchDivider';
  el.className = 'cph-church-head';
  el.innerHTML = '<div class="cph-church-ico">⛪</div><div><h2>우리교회</h2><p>예배 · 말씀 · 일정 · 기도 · 봉사와 교회 소식을 확인하세요</p></div>';
  hero.insertAdjacentElement('beforebegin', el);
}

function tuneNavigation() {
  const community = document.querySelector('.tabbar-item[data-tab="community"]');
  if (community) {
    community.setAttribute('aria-label', '우리교회');
    const label = community.querySelector('.tl');
    if (label) label.textContent = '교회';
  }
  const board = document.querySelector('.tabbar-item[data-tab="board"] .tl');
  if (board) board.textContent = '나눔';
}

function bind() {
  document.querySelectorAll('[data-platform-quiz]').forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = '1';
    button.addEventListener('click', () => document.dispatchEvent(new CustomEvent('christian-platform:quiz', { detail: { mode: button.dataset.platformQuiz } })));
  });
  document.querySelectorAll('[data-platform-mission]').forEach((row) => {
    if (row.dataset.bound) return;
    row.dataset.bound = '1';
    const run = () => completeMission(row.dataset.platformMission);
    row.addEventListener('click', run);
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); run(); }
    });
  });
}

function build() {
  injectStyles();
  const home = document.getElementById('tab-home');
  const hero = home?.querySelector('.hero');
  if (!home || !hero) return;
  if (!document.getElementById('christianPlatformHome')) hero.insertAdjacentHTML('beforebegin', shellHtml());
  setChurchDivider();
  tuneNavigation();
  renderMissions();
  bind();

  const play = new URL(location.href).searchParams.get('play');
  if (['quiz', 'study', 'competition', 'make'].includes(play)) {
    setTimeout(() => document.dispatchEvent(new CustomEvent('christian-platform:quiz', { detail: { mode: play } })), 600);
    const url = new URL(location.href); url.searchParams.delete('play'); history.replaceState({}, '', url);
  }
}

document.addEventListener('christian-platform:refresh', refreshMeta);

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build, { once: true });
else build();

onAuthStateChanged(auth, (user) => {
  if (user) setTimeout(refreshMeta, 250);
  else {
    platformMeta = null;
    renderMissions();
    const ranking = document.getElementById('platformRanking');
    if (ranking) ranking.innerHTML = '<div class="cph-empty">로그인하면 오늘의 미션과 주간 랭킹을 이용할 수 있습니다.</div>';
  }
});

const observer = new MutationObserver(() => { bind(); setChurchDivider(); });
observer.observe(document.documentElement, { childList: true, subtree: true });
setTimeout(() => observer.disconnect(), 12000);
