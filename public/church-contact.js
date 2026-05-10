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
let naverFieldBound = false;
let naverSaveTimer = null;
let lastSavedNaverUrl = '';

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
    .hero h1 { white-space: pre-line !important; }
    .hero p { display: none !important; }
    html[data-admin-page] #chSubtitle,
    html[data-admin-page] .ch-subtitle-extra-hidden { display: none !important; }
    html[data-admin-page] #chNaverMapSaveStatus {
      display: inline-block;
      margin-top: 6px;
      font-size: 12px;
      font-weight: 800;
      color: var(--primary, #73926d);
    }
    .church-contact-card {
      margin-top: 18px;
      background: var(--paper, #fff);
      border: 1px solid var(--line, #ebece8);
      border-radius: var(--radius, 18px);
      padding: 18px 20px;
      box-shadow: var(--shadow-sm, 0 2px 8px rgba(20,22,26,.05));
    }
    .church-contact-card .contact-head { display: flex; align-items: center; gap: 9px; margin-bottom: 13px; }
    .church-contact-card .contact-ico {
      width: 34px; height: 34px; display: grid; place-items: center; border-radius: 12px;
      background: var(--primary-soft, #eef4ea); color: var(--primary-dark, #5d7858); font-size: 17px; flex: 0 0 auto;
    }
    .church-contact-card h2 { margin: 0; font-size: 16px; font-weight: 900; letter-spacing: -0.45px; color: var(--text, #15171a); }
    .church-contact-card .contact-row { display: flex; gap: 10px; align-items: flex-start; padding: 10px 0; border-top: 1px solid var(--line, #ebece8); }
    .church-contact-card .contact-row:first-of-type { border-top: 0; padding-top: 0; }
    .church-contact-card .contact-label { width: 52px; flex: 0 0 auto; color: var(--muted, #767a83); font-size: 12px; font-weight: 900; letter-spacing: -0.1px; }
    .church-contact-card .contact-value { min-width: 0; flex: 1 1 auto; color: var(--text-soft, #2a2d33); font-size: 13.5px; font-weight: 650; line-height: 1.5; word-break: keep-all; }
    .church-contact-card .map-btn {
      margin-top: 12px; display: inline-flex; align-items: center; justify-content: center; gap: 7px;
      width: 100%; min-height: 44px; border-radius: 999px; background: var(--primary, #73926d); color: #fff;
      font-size: 14px; font-weight: 900; text-decoration: none; box-shadow: 0 8px 18px rgba(95,111,82,.22);
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
  if (prev && /부제|작은\s*문구/.test(prev.textContent || '')) prev.classList.add('ch-subtitle-extra-hidden');
  const help = input.nextElementSibling;
  if (help && /부제|작은\s*문구/.test(help.textContent || '')) help.classList.add('ch-subtitle-extra-hidden');
}

function ensureAdminNaverField() {
  if (!isAdminPage()) return;
  if (document.getElementById('chNaverMapUrl')) {
    bindNaverFieldAutoSave();
    return;
  }

  const address = document.getElementById('chAddress') || document.querySelector('input[id*="Address"], textarea[id*="Address"], input[placeholder*="주소"], textarea[placeholder*="주소"]');
  const directions = document.getElementById('chDirections') || document.querySelector('input[id*="Directions"], textarea[id*="Directions"], input[placeholder*="오시는"], textarea[placeholder*="오시는"]');
  const anchor = directions || address;
  if (!anchor) return;

  const wrap = document.createElement('div');
  wrap.id = 'chNaverMapWrap';
  wrap.innerHTML = `
    <label>네이버지도 위치 링크</label>
    <input class="field" id="chNaverMapUrl" placeholder="예: https://map.naver.com/..." autocomplete="off" />
    <p class="sub" style="margin-top:6px;font-size:12px;">붙여넣으면 자동 저장되고, 교회정보 저장 버튼을 눌러도 함께 저장됩니다.</p>
    <span id="chNaverMapSaveStatus"></span>
  `;
  anchor.insertAdjacentElement('afterend', wrap);
  fillAdminNaverField();
  bindNaverFieldAutoSave();
}

function fillAdminNaverField() {
  const input = document.getElementById('chNaverMapUrl');
  if (!input || document.activeElement === input) return;
  const value = churchInfo.naverMapUrl || churchInfo.naverMapURL || churchInfo.mapUrl || churchInfo.mapURL || '';
  input.value = value;
  lastSavedNaverUrl = value;
}

function setNaverStatus(msg, error = false) {
  const el = document.getElementById('chNaverMapSaveStatus');
  if (!el) return;
  el.textContent = msg || '';
  el.style.color = error ? 'var(--danger, #d05656)' : 'var(--primary, #73926d)';
}

async function saveNaverMapUrl({ quiet = false } = {}) {
  const input = document.getElementById('chNaverMapUrl');
  if (!input) return;
  const naverMapUrl = input.value.trim();
  if (naverMapUrl === lastSavedNaverUrl) return;
  if (naverMapUrl && !safeUrl(naverMapUrl)) {
    setNaverStatus('http 또는 https 링크만 저장할 수 있습니다.', true);
    return;
  }
  setNaverStatus('네이버지도 링크 저장 중...');
  try {
    await update(ref(db, 'config/church'), {
      naverMapUrl,
      mapUrl: naverMapUrl,
      updatedAt: Date.now()
    });
    lastSavedNaverUrl = naverMapUrl;
    setNaverStatus(naverMapUrl ? '네이버지도 링크 저장됨' : '네이버지도 링크 비움');
    if (!quiet && naverMapUrl) toast('네이버지도 링크가 저장되었습니다');
  } catch (e) {
    console.error('[church-contact] 네이버지도 링크 저장 실패:', e);
    setNaverStatus('저장 실패: ' + (e.code || e.message), true);
  }
}

function bindNaverFieldAutoSave() {
  if (naverFieldBound) return;
  const input = document.getElementById('chNaverMapUrl');
  if (!input) return;
  naverFieldBound = true;
  input.addEventListener('input', () => {
    setNaverStatus('입력 중...');
    clearTimeout(naverSaveTimer);
    naverSaveTimer = setTimeout(() => saveNaverMapUrl({ quiet: true }), 900);
  });
  input.addEventListener('change', () => saveNaverMapUrl());
  input.addEventListener('paste', () => {
    clearTimeout(naverSaveTimer);
    naverSaveTimer = setTimeout(() => saveNaverMapUrl(), 120);
  });
  input.addEventListener('blur', () => saveNaverMapUrl({ quiet: true }));
}

function bindAdminSave() {
  if (!isAdminPage() || adminBound) return;
  adminBound = true;
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button, [role="button"]');
    if (!btn) return;
    const label = (btn.textContent || btn.id || '').trim();
    if (btn.id === 'chSave' || /교회정보.*저장|저장/.test(label)) {
      setTimeout(() => saveNaverMapUrl({ quiet: true }), 250);
      setTimeout(() => saveNaverMapUrl({ quiet: true }), 900);
    }
  }, true);
}

function findHomePane() {
  const byId = document.querySelector('#home, #tab-home, #homePane, #pane-home, [data-pane="home"], [data-tab="home"]');
  if (byId) return byId;
  const hero = document.querySelector('.hero');
  return hero?.closest('.tab-pane') || hero?.parentElement || document.querySelector('.main');
}

function ensureHomeContactCard() {
  if (isAdminPage()) return null;
  let card = document.getElementById('churchContactCard');
  if (card) return card;
  const home = findHomePane();
  if (!home) return null;
  card = document.createElement('div');
  card.id = 'churchContactCard';
  card.className = 'church-contact-card empty';
  card.innerHTML = `
    <div class="contact-head"><div class="contact-ico">⛪</div><h2>교회 안내</h2></div>
    <div class="contact-row contact-address-row"><div class="contact-label">주소</div><div class="contact-value" data-contact-address></div></div>
    <div class="contact-row contact-phone-row"><div class="contact-label">전화</div><div class="contact-value" data-contact-phone></div></div>
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
    if (mapUrl) { mapBtn.href = mapUrl; mapBtn.style.display = ''; }
    else { mapBtn.removeAttribute('href'); mapBtn.style.display = 'none'; }
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
  [400, 1000, 2200, 4000].forEach((ms) => setTimeout(() => {
    hideHeroSubtitleAdminField();
    ensureAdminNaverField();
    bindAdminSave();
    ensureHomeContactCard();
    renderHomeContactCard();
  }, ms));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
