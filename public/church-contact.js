/* =============================================================
 * 교회정보 확장
 * - 관리자: 메인 히어로 작은 문구 입력 숨김, 네이버지도 링크 저장 필드 추가
 * - 사용자 홈: 하단에 교회 주소/전화/네이버지도 버튼 표시
 * - 히어로 큰 문구 줄바꿈 표시 지원
 * ============================================================= */

import { db } from '/firebase-init.js';
import { ref, onValue, update } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";

let churchInfo = {};
let adminBound = false;
let homeCardInserted = false;

function isAdminPage() {
  return location.pathname === '/admin' || location.pathname.startsWith('/admin/');
}

function safeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const u = new URL(url, location.href);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.href;
  } catch {
    return '';
  }
}

function escapeHtml(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function toast(msg) {
  if (typeof window.toast === 'function') {
    window.toast(msg);
    return;
  }
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = 'position:fixed;left:50%;bottom:86px;transform:translateX(-50%);z-index:9999;background:#15171a;color:white;padding:10px 14px;border-radius:999px;font-size:13px;font-weight:800;box-shadow:0 10px 28px rgba(0,0,0,.22);max-width:calc(100% - 32px);text-align:center;';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2300);
}

function injectStyles() {
  if (document.getElementById('churchContactStyles')) return;
  const style = document.createElement('style');
  style.id = 'churchContactStyles';
  style.textContent = `
    /* 히어로 큰 문구 줄바꿈 표시, 작은 문구 숨김 */
    .hero h1 { white-space: pre-line !important; }
    .hero p { display: none !important; }

    /* 관리자: 히어로 작은문구 입력 제거 */
    html[data-admin-page] #chSubtitle,
    html[data-admin-page] .ch-subtitle-extra-hidden {
      display: none !important;
    }

    .church-contact-card {
      margin-top: 18px;
      background: var(--paper, #fff);
      border: 1px solid var(--line, #ebece8);
      border-radius: var(--radius, 18px);
      padding: 18px 20px;
      box-shadow: var(--shadow-sm, 0 2px 8px rgba(20,22,26,.05));
    }
    .church-contact-card .contact-head {
      display: flex;
      align-items: center;
      gap: 9px;
      margin-bottom: 13px;
    }
    .church-contact-card .contact-ico {
      width: 34px;
      height: 34px;
      display: grid;
      place-items: center;
      border-radius: 12px;
      background: var(--primary-soft, #eef4ea);
      color: var(--primary-dark, #5d7858);
      font-size: 17px;
      flex: 0 0 auto;
    }
    .church-contact-card h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 900;
      letter-spacing: -0.45px;
      color: var(--text, #15171a);
    }
    .church-contact-card .contact-row {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 10px 0;
      border-top: 1px solid var(--line, #ebece8);
    }
    .church-contact-card .contact-row:first-of-type { border-top: 0; padding-top: 0; }
    .church-contact-card .contact-label {
      width: 52px;
      flex: 0 0 auto;
      color: var(--muted, #767a83);
      font-size: 12px;
      font-weight: 900;
      letter-spacing: -0.1px;
    }
    .church-contact-card .contact-value {
      min-width: 0;
      flex: 1 1 auto;
      color: var(--text-soft, #2a2d33);
      font-size: 13.5px;
      font-weight: 650;
      line-height: 1.5;
      word-break: keep-all;
    }
    .church-contact-card .map-btn {
      margin-top: 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      width: 100%;
      min-height: 44px;
      border-radius: 999px;
      background: var(--primary, #73926d);
      color: #fff;
      font-size: 14px;
      font-weight: 900;
      text-decoration: none;
      box-shadow: 0 8px 18px rgba(95,111,82,.22);
    }
    .church-contact-card .map-btn:active { transform: translateY(1px); }
    .church-contact-card.empty { display: none; }
  `;
  document.head.appendChild(style);
}

function hideHeroSubtitleAdminField() {
  if (!isAdminPage()) return;
  const input = document.getElementById('chSubtitle');
  if (!input) return;
  input.style.display = 'none';
  let prev = input.previousElementSibling;
  while (prev && prev.tagName !== 'LABEL') prev = prev.previousElementSibling;
  if (prev && /부제|작은\s*문구/.test(prev.textContent || '')) {
    prev.classList.add('ch-subtitle-extra-hidden');
  }
  const help = input.nextElementSibling;
  if (help && /부제|작은\s*문구/.test(help.textContent || '')) {
    help.classList.add('ch-subtitle-extra-hidden');
  }
}

function ensureAdminNaverField() {
  if (!isAdminPage()) return;
  if (document.getElementById('chNaverMapUrl')) return;

  const address = document.getElementById('chAddress');
  const directions = document.getElementById('chDirections');
  const anchor = directions || address;
  if (!anchor) return;

  const wrap = document.createElement('div');
  wrap.id = 'chNaverMapWrap';
  wrap.innerHTML = `
    <label>네이버지도 위치 링크</label>
    <input class="field" id="chNaverMapUrl" placeholder="예: https://map.naver.com/..." />
    <p class="sub" style="margin-top:6px;font-size:12px;">홈 화면 하단의 네이버지도 버튼에 연결됩니다.</p>
  `;
  anchor.insertAdjacentElement('afterend', wrap);
  fillAdminNaverField();
}

function fillAdminNaverField() {
  const input = document.getElementById('chNaverMapUrl');
  if (!input || document.activeElement === input) return;
  input.value = churchInfo.naverMapUrl || churchInfo.naverMapURL || churchInfo.mapUrl || churchInfo.mapURL || '';
}

function bindAdminSave() {
  if (!isAdminPage() || adminBound) return;
  const save = document.getElementById('chSave');
  if (!save) return;
  adminBound = true;
  save.addEventListener('click', () => {
    setTimeout(async () => {
      const naverMapUrl = document.getElementById('chNaverMapUrl')?.value.trim() || '';
      try {
        await update(ref(db, 'config/church'), {
          naverMapUrl,
          mapUrl: naverMapUrl,
          subtitle: '',
          updatedAt: Date.now()
        });
        if (naverMapUrl) toast('네이버지도 링크도 저장되었습니다');
      } catch (e) {
        console.error('[church-contact] 네이버지도 링크 저장 실패:', e);
        toast('네이버지도 링크 저장 실패: ' + (e.code || e.message));
      }
    }, 350);
  });
}

function findHomePane() {
  const byId = document.querySelector('#home, #tab-home, #homePane, #pane-home, [data-pane="home"], [data-tab="home"]');
  if (byId) return byId;
  const hero = document.querySelector('.hero');
  return hero?.closest('.tab-pane') || hero?.parentElement || document.querySelector('.main');
}

function ensureHomeContactCard() {
  if (isAdminPage()) return;
  let card = document.getElementById('churchContactCard');
  if (card) return card;

  const home = findHomePane();
  if (!home) return null;

  card = document.createElement('div');
  card.id = 'churchContactCard';
  card.className = 'church-contact-card empty';
  card.innerHTML = `
    <div class="contact-head">
      <div class="contact-ico">⛪</div>
      <h2>교회 안내</h2>
    </div>
    <div class="contact-row contact-address-row">
      <div class="contact-label">주소</div>
      <div class="contact-value" data-contact-address></div>
    </div>
    <div class="contact-row contact-phone-row">
      <div class="contact-label">전화</div>
      <div class="contact-value" data-contact-phone></div>
    </div>
    <a class="map-btn" data-contact-map href="#" target="_blank" rel="noopener noreferrer">네이버지도에서 보기</a>
  `;
  home.appendChild(card);
  renderHomeContactCard();
  return card;
}

function renderHomeContactCard() {
  const card = ensureHomeContactCard();
  if (!card) return;

  const address = churchInfo.address || churchInfo.chAddress || '';
  const phone = churchInfo.phone || churchInfo.tel || churchInfo.chPhone || '';
  const mapUrl = safeUrl(churchInfo.naverMapUrl || churchInfo.naverMapURL || churchInfo.mapUrl || churchInfo.mapURL || '');

  const hasAny = !!(address || phone || mapUrl);
  card.classList.toggle('empty', !hasAny);

  const addressRow = card.querySelector('.contact-address-row');
  const phoneRow = card.querySelector('.contact-phone-row');
  const mapBtn = card.querySelector('[data-contact-map]');

  if (addressRow) addressRow.style.display = address ? '' : 'none';
  if (phoneRow) phoneRow.style.display = phone ? '' : 'none';
  card.querySelector('[data-contact-address]').textContent = address;
  card.querySelector('[data-contact-phone]').textContent = phone;

  if (mapBtn) {
    if (mapUrl) {
      mapBtn.href = mapUrl;
      mapBtn.style.display = '';
    } else {
      mapBtn.removeAttribute('href');
      mapBtn.style.display = 'none';
    }
  }
}

function listenChurchInfo() {
  onValue(ref(db, 'config/church'), (snap) => {
    churchInfo = snap.val() || {};
    fillAdminNaverField();
    renderHomeContactCard();
  }, (err) => console.warn('[church-contact] config/church 읽기 실패:', err.code || err.message));
}

function boot() {
  if (isAdminPage()) document.documentElement.setAttribute('data-admin-page', 'true');
  injectStyles();
  hideHeroSubtitleAdminField();
  ensureAdminNaverField();
  bindAdminSave();
  ensureHomeContactCard();
  listenChurchInfo();
  [400, 1000, 2200].forEach((ms) => setTimeout(() => {
    hideHeroSubtitleAdminField();
    ensureAdminNaverField();
    bindAdminSave();
    ensureHomeContactCard();
    renderHomeContactCard();
  }, ms));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
