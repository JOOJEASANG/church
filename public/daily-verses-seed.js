/* =============================================================
 * 오늘의 말씀 기본 데이터 추가 버튼
 * - 관리자 페이지 > 말씀 관리 > 오늘의 말씀 화면에 버튼 추가
 * - DB 기준으로 기존 ref를 확인하여 중복 등록 방지
 * - 추가 후 목록이 바로 안 보일 때를 대비해 백업 렌더링 제공
 * ============================================================= */

import { db, auth } from '/firebase-init.js';
import { ref, onValue, push, get } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

const STARTER_VERSES = [
  { ref: '시편 23:1', text: '여호와는 나의 목자시니 내게 부족함이 없으리로다', note: '인도하심' },
  { ref: '시편 46:1', text: '하나님은 우리의 피난처이시며 힘이시니 환난 중에 만날 큰 도움이십니다.', note: '위로' },
  { ref: '시편 119:105', text: '주의 말씀은 내 발에 등이요 내 길에 빛입니다.', note: '말씀' },
  { ref: '잠언 3:5-6', text: '마음을 다해 여호와를 신뢰하고, 범사에 그분을 인정하면 길을 지도하십니다.', note: '신뢰' },
  { ref: '이사야 40:31', text: '여호와를 앙망하는 자는 새 힘을 얻고 독수리처럼 날아오릅니다.', note: '새 힘' },
  { ref: '이사야 41:10', text: '두려워하지 말라. 하나님이 함께하시며 너를 굳세게 하십니다.', note: '두려움' },
  { ref: '예레미야 29:11', text: '하나님은 우리를 향한 평안의 계획과 미래와 희망을 가지고 계십니다.', note: '소망' },
  { ref: '마태복음 5:16', text: '너희 빛이 사람 앞에 비치게 하여 하나님께 영광을 돌리게 하라.', note: '빛' },
  { ref: '마태복음 6:33', text: '먼저 하나님의 나라와 의를 구하면 필요한 것을 더하십니다.', note: '우선순위' },
  { ref: '마태복음 11:28', text: '수고하고 무거운 짐 진 자들아 다 내게로 오라. 내가 쉬게 하리라.', note: '쉼' },
  { ref: '요한복음 3:16', text: '하나님은 세상을 사랑하셔서 독생자를 주시고, 믿는 자에게 영생을 주셨습니다.', note: '복음' },
  { ref: '요한복음 14:27', text: '주님은 세상이 줄 수 없는 평안을 우리에게 주십니다.', note: '평안' },
  { ref: '요한복음 15:5', text: '주님 안에 거하면 열매를 맺고, 주님을 떠나서는 아무것도 할 수 없습니다.', note: '동행' },
  { ref: '로마서 8:28', text: '하나님을 사랑하는 자에게는 모든 것이 합력하여 선을 이룹니다.', note: '섭리' },
  { ref: '로마서 12:2', text: '이 세대를 본받지 말고 마음을 새롭게 하여 하나님의 뜻을 분별하십시오.', note: '변화' },
  { ref: '고린도전서 13:13', text: '믿음, 소망, 사랑은 항상 있을 것이며 그중에 제일은 사랑입니다.', note: '사랑' },
  { ref: '고린도후서 5:17', text: '그리스도 안에 있으면 새로운 피조물입니다. 이전 것은 지나갔습니다.', note: '새 사람' },
  { ref: '갈라디아서 5:22-23', text: '성령의 열매는 사랑과 희락과 화평과 오래 참음과 자비와 양선과 충성과 온유와 절제입니다.', note: '성령의 열매' },
  { ref: '에베소서 2:10', text: '우리는 그리스도 안에서 선한 일을 위하여 지으심을 받은 하나님의 작품입니다.', note: '사명' },
  { ref: '에베소서 4:32', text: '서로 친절하게 하며 불쌍히 여기고, 하나님이 용서하신 것처럼 서로 용서하십시오.', note: '용서' },
  { ref: '빌립보서 4:4', text: '주 안에서 항상 기뻐하십시오. 다시 말하노니 기뻐하십시오.', note: '기쁨' },
  { ref: '빌립보서 4:6-7', text: '아무것도 염려하지 말고 기도와 감사로 하나님께 아뢰면 하나님의 평강이 지키십니다.', note: '기도' },
  { ref: '빌립보서 4:13', text: '내게 능력 주시는 자 안에서 내가 모든 것을 할 수 있습니다.', note: '능력' },
  { ref: '골로새서 3:23', text: '무슨 일을 하든지 사람에게 하듯 하지 말고 주께 하듯 마음을 다하십시오.', note: '섬김' },
  { ref: '데살로니가전서 5:16-18', text: '항상 기뻐하고 쉬지 말고 기도하며 범사에 감사하십시오.', note: '감사' },
  { ref: '디모데후서 1:7', text: '하나님은 두려워하는 마음이 아니라 능력과 사랑과 절제의 마음을 주셨습니다.', note: '담대함' },
  { ref: '히브리서 4:16', text: '은혜의 보좌 앞에 담대히 나아가 때를 따라 돕는 은혜를 얻으십시오.', note: '은혜' },
  { ref: '히브리서 11:1', text: '믿음은 바라는 것들의 실상이요 보이지 않는 것들의 증거입니다.', note: '믿음' },
  { ref: '야고보서 1:5', text: '지혜가 부족하거든 모든 사람에게 후히 주시는 하나님께 구하십시오.', note: '지혜' },
  { ref: '야고보서 1:22', text: '말씀을 듣기만 하지 말고 행하는 사람이 되십시오.', note: '순종' },
  { ref: '베드로전서 5:7', text: '너희 염려를 다 주께 맡기라. 주께서 너희를 돌보십니다.', note: '염려' },
  { ref: '요한일서 4:7', text: '서로 사랑합시다. 사랑은 하나님께 속한 것입니다.', note: '공동체' },
  { ref: '요한일서 4:18', text: '온전한 사랑은 두려움을 내쫓습니다.', note: '사랑과 두려움' },
  { ref: '요한계시록 3:20', text: '주님은 문 밖에 서서 두드리시며, 듣고 열면 함께하십니다.', note: '초청' },
  { ref: '민수기 6:24-26', text: '여호와께서 복을 주시고 지키시며 은혜와 평강을 주시기를 원합니다.', note: '축복' },
  { ref: '신명기 31:8', text: '여호와께서 앞서 가시며 함께하시니 두려워하지 말고 놀라지 마십시오.', note: '동행' },
  { ref: '여호수아 1:9', text: '강하고 담대하십시오. 어디로 가든지 하나님이 함께하십니다.', note: '담대함' },
  { ref: '느헤미야 8:10', text: '여호와로 인한 기쁨이 우리의 힘입니다.', note: '기쁨' },
  { ref: '미가 6:8', text: '하나님께서 원하시는 것은 정의를 행하고 인자를 사랑하며 겸손히 동행하는 것입니다.', note: '삶의 태도' },
  { ref: '스바냐 3:17', text: '하나님은 우리 가운데 계시며 사랑으로 기뻐하시고 노래하십니다.', note: '사랑' }
];

let latestItems = [];
let seeding = false;

function isAdminPage() {
  return location.pathname === '/admin' || location.pathname.startsWith('/admin/');
}

function escapeHtml(v) {
  return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function setSeedStatus(msg, error = false) {
  const el = document.getElementById('dvSeedStatus');
  if (!el) return;
  el.textContent = msg || '';
  el.style.color = error ? 'var(--danger, #d05656)' : 'var(--primary, #73926d)';
}

function updateCount() {
  const count = document.getElementById('dvCount');
  if (count && latestItems.length) count.textContent = String(latestItems.length);
}

function ensureSeedButton() {
  if (!isAdminPage()) return;
  if (document.getElementById('dvSeedBtn')) {
    updateCount();
    return;
  }

  const saveBtn = document.getElementById('dvSave');
  if (!saveBtn) return;

  const wrap = document.createElement('div');
  wrap.id = 'dvSeedWrap';
  wrap.style.cssText = 'margin-top:12px;padding-top:12px;border-top:1px solid var(--line,#ebece8);display:flex;gap:8px;align-items:center;flex-wrap:wrap;';
  wrap.innerHTML = `
    <button class="btn" id="dvSeedBtn" type="button">기본 말씀 40개 추가</button>
    <button class="btn" id="dvSeedRefreshBtn" type="button">목록 새로고침</button>
    <span id="dvSeedStatus" style="font-size:12.5px;font-weight:800;color:var(--muted);"></span>
  `;
  saveBtn.closest('.panel')?.appendChild(wrap);

  document.getElementById('dvSeedBtn')?.addEventListener('click', seedStarterVerses);
  document.getElementById('dvSeedRefreshBtn')?.addEventListener('click', async () => {
    await loadItemsFromDb();
    renderBackupList();
    setSeedStatus(`목록 새로고침 완료: ${latestItems.length}개`);
  });
  updateCount();
}

async function loadItemsFromDb() {
  const snap = await get(ref(db, 'dailyVerses'));
  const arr = [];
  snap.forEach((c) => arr.push({ id: c.key, ...c.val() }));
  latestItems = arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  updateCount();
  return latestItems;
}

function renderBackupList() {
  const list = document.getElementById('dvList');
  if (!list) return;
  if (!latestItems.length) {
    list.innerHTML = '<div class="empty">아직 등록된 말씀이 없습니다.</div>';
    return;
  }
  list.innerHTML = `<table><thead><tr><th>상태</th><th>구절</th><th>본문</th><th>등록</th></tr></thead><tbody>${latestItems.map((v) => `
    <tr>
      <td>${v.active === false ? '<span class="pill">숨김</span>' : '<span class="pill" style="background:var(--primary-soft);color:var(--primary-dark);">사용</span>'}</td>
      <td><b>${escapeHtml(v.ref || '')}</b>${v.note ? `<br/><span style="color:var(--muted);font-size:11.5px;">${escapeHtml(v.note)}</span>` : ''}</td>
      <td style="max-width:420px;white-space:pre-wrap;font-size:12.5px;">${escapeHtml(v.text || '')}</td>
      <td style="font-size:12px;color:var(--muted);">${v.source === 'starter-verses-v1' ? '기본 말씀' : '직접 등록'}</td>
    </tr>`).join('')}</tbody></table>`;
}

async function seedStarterVerses() {
  const user = auth.currentUser;
  if (!user) {
    setSeedStatus('로그인 후 사용할 수 있습니다.', true);
    return;
  }
  if (seeding) return;
  if (!confirm('기본 말씀 40개를 오늘의 말씀 목록에 추가할까요?\n이미 같은 성경구절이 있으면 중복 등록하지 않습니다.')) return;

  const btn = document.getElementById('dvSeedBtn');
  seeding = true;
  if (btn) btn.disabled = true;
  setSeedStatus('DB 확인 중...');

  try {
    const currentItems = await loadItemsFromDb();
    const existingRefs = new Set(currentItems.map((v) => String(v.ref || '').trim()).filter(Boolean));

    setSeedStatus('기본 말씀 추가 중...');
    let added = 0;
    let skipped = 0;

    for (const verse of STARTER_VERSES) {
      if (existingRefs.has(verse.ref)) {
        skipped++;
        continue;
      }
      await push(ref(db, 'dailyVerses'), {
        ref: verse.ref,
        text: verse.text,
        note: verse.note || '기본 말씀',
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: user.uid,
        updatedBy: user.uid,
        source: 'starter-verses-v1'
      });
      existingRefs.add(verse.ref);
      added++;
    }

    await loadItemsFromDb();
    setTimeout(renderBackupList, 300);
    setSeedStatus(`완료: ${added}개 추가, ${skipped}개 중복 제외 · 현재 ${latestItems.length}개`);
  } catch (e) {
    console.error('[daily-verses-seed] 기본 말씀 추가 실패:', e);
    setSeedStatus('추가 실패: ' + (e.code || e.message), true);
  } finally {
    seeding = false;
    if (btn) btn.disabled = false;
  }
}

function listenCount() {
  if (!isAdminPage()) return;
  onValue(ref(db, 'dailyVerses'), (snap) => {
    const arr = [];
    snap.forEach((c) => arr.push({ id: c.key, ...c.val() }));
    latestItems = arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    updateCount();
  }, (err) => setSeedStatus('말씀 목록 읽기 실패: ' + (err.code || err.message), true));
}

function boot() {
  if (!isAdminPage()) return;
  ensureSeedButton();
  listenCount();
  onAuthStateChanged(auth, () => setTimeout(ensureSeedButton, 500));
  [300, 800, 1600, 3000].forEach((ms) => setTimeout(ensureSeedButton, ms));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
