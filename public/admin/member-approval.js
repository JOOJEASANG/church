import { db, auth } from '/firebase-init.js';
import { ref, get, onValue, update } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js';

let unsubscribeUsers = null;
let users = [];

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function formatDate(timestamp) {
  if (!timestamp) return '-';
  try { return new Date(timestamp).toLocaleString('ko-KR'); }
  catch { return '-'; }
}

function ensureStyles() {
  if (document.getElementById('memberApprovalStyles')) return;
  const style = document.createElement('style');
  style.id = 'memberApprovalStyles';
  style.textContent = `
    .member-approval-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:14px 0}
    .member-status{display:inline-block;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:800}
    .member-status.pending,.member-status.missing{background:#fff3cc;color:#785b00}
    .member-status.approved{background:var(--primary-soft);color:var(--primary-dark)}
    .member-status.suspended{background:var(--danger-soft);color:var(--danger)}
    .member-meta{font-size:11px;color:var(--muted);line-height:1.5;margin-top:4px}
    #memberApprovalList{overflow-x:auto}
    #memberApprovalList select{min-width:92px}
    @media(max-width:760px){#memberApprovalList table{min-width:850px}}
  `;
  document.head.appendChild(style);
}

function ensurePane() {
  ensureStyles();
  let pane = document.getElementById('pane-members');
  if (!pane) {
    pane = document.createElement('div');
    pane.className = 'pane';
    pane.id = 'pane-members';
    pane.innerHTML = `
      <div class="panel">
        <h2>👥 회원 승인 관리</h2>
        <p class="sub">신규 가입자는 대기 상태로 등록됩니다. 승인된 회원만 글쓰기·신청·업로드 기능을 사용할 수 있습니다.</p>
        <div class="member-approval-tools">
          <button class="btn primary" id="approveLegacyMembers" type="button">미설정 기존 계정 일괄 승인</button>
          <button class="btn" id="refreshMembers" type="button">새로고침</button>
          <span id="memberApprovalSummary" style="font-size:12px;color:var(--muted);font-weight:700;"></span>
        </div>
        <div id="memberApprovalList"></div>
      </div>`;
    document.querySelector('.content')?.appendChild(pane);
  }

  let nav = document.querySelector('.nav-item[data-pane="members"]');
  if (!nav) {
    nav = document.createElement('div');
    nav.className = 'nav-item';
    nav.dataset.pane = 'members';
    nav.innerHTML = '<span class="ico">👥</span>회원 승인 <span class="badge" id="badgeMembers" style="display:none;">0</span>';
    const sections = Array.from(document.querySelectorAll('.sidebar .nav-section'));
    const settings = sections.find((section) => section.textContent.trim() === '설정');
    if (settings) settings.before(nav);
    else document.querySelector('.sidebar')?.appendChild(nav);

    nav.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));
      document.querySelectorAll('.pane').forEach((item) => item.classList.remove('active'));
      nav.classList.add('active');
      pane.classList.add('active');
    });
  }

  document.getElementById('refreshMembers')?.addEventListener('click', render);
  document.getElementById('approveLegacyMembers')?.addEventListener('click', approveLegacyMembers);
  return pane;
}

function statusLabel(status) {
  return ({ pending: '승인 대기', approved: '승인', suspended: '이용 정지' })[status] || '미설정';
}

function render() {
  ensurePane();
  const list = document.getElementById('memberApprovalList');
  if (!list) return;

  const pendingCount = users.filter((user) => !user.status || user.status === 'pending').length;
  const badge = document.getElementById('badgeMembers');
  if (badge) {
    badge.textContent = pendingCount;
    badge.style.display = pendingCount ? '' : 'none';
  }
  const summary = document.getElementById('memberApprovalSummary');
  if (summary) summary.textContent = `전체 ${users.length}명 · 승인 대기/미설정 ${pendingCount}명`;

  if (!users.length) {
    list.innerHTML = '<div class="empty">등록된 회원이 없습니다.</div>';
    return;
  }

  list.innerHTML = `<table><thead><tr><th>회원</th><th>연락처</th><th>가입일</th><th>회원 구분</th><th>상태</th><th></th></tr></thead><tbody>${users.map((user) => {
    const status = user.status || 'missing';
    return `<tr data-member-row="${escapeHtml(user.uid)}">
      <td><b>${escapeHtml(user.displayName || '이름 미등록')}</b><div class="member-meta">${escapeHtml(user.email || '')}<br/>${escapeHtml(user.role || '성도')}</div></td>
      <td>${escapeHtml(user.phone || '-')}</td>
      <td>${escapeHtml(formatDate(user.createdAt))}</td>
      <td>
        <select class="field" data-member-type="${escapeHtml(user.uid)}" style="padding:6px 8px;">
          <option value="member" ${user.memberType === 'member' || !user.memberType ? 'selected' : ''}>교인</option>
          <option value="newcomer" ${user.memberType === 'newcomer' ? 'selected' : ''}>새가족</option>
          <option value="staff" ${user.memberType === 'staff' ? 'selected' : ''}>교역자/직원</option>
        </select>
      </td>
      <td><span class="member-status ${escapeHtml(status)}">${escapeHtml(statusLabel(user.status))}</span></td>
      <td style="white-space:nowrap;">
        <button class="btn btn-sm primary" data-member-status="approved" data-uid="${escapeHtml(user.uid)}">승인</button>
        <button class="btn btn-sm" data-member-status="pending" data-uid="${escapeHtml(user.uid)}">대기</button>
        <button class="btn btn-sm danger" data-member-status="suspended" data-uid="${escapeHtml(user.uid)}">정지</button>
      </td>
    </tr>`;
  }).join('')}</tbody></table>`;

  list.querySelectorAll('[data-member-status]').forEach((button) => {
    button.addEventListener('click', async () => {
      const uid = button.dataset.uid;
      const status = button.dataset.memberStatus;
      const memberType = list.querySelector(`[data-member-type="${CSS.escape(uid)}"]`)?.value || 'member';
      button.disabled = true;
      try {
        const changes = {
          status,
          memberType,
          updatedAt: Date.now()
        };
        if (status === 'approved') {
          changes.approvedAt = Date.now();
          changes.approvedBy = auth.currentUser?.uid || '';
        } else {
          changes.approvedAt = null;
          changes.approvedBy = null;
        }
        await update(ref(db, `users/${uid}`), changes);
      } catch (error) {
        alert('회원 상태 변경 실패: ' + (error.code || error.message));
      } finally {
        button.disabled = false;
      }
    });
  });
}

async function approveLegacyMembers() {
  const legacy = users.filter((user) => !user.status);
  if (!legacy.length) {
    alert('상태가 미설정된 기존 계정이 없습니다.');
    return;
  }
  if (!confirm(`상태가 미설정된 기존 계정 ${legacy.length}명을 모두 승인하시겠습니까?\n신규 대기 계정은 포함되지 않습니다.`)) return;

  const now = Date.now();
  const currentUid = auth.currentUser?.uid || '';
  try {
    await Promise.all(legacy.map((user) => update(ref(db, `users/${user.uid}`), {
      status: 'approved',
      memberType: user.memberType || 'member',
      approvedAt: now,
      approvedBy: currentUid,
      updatedAt: now
    })));
    alert(`${legacy.length}명의 기존 계정을 승인했습니다.`);
  } catch (error) {
    alert('일괄 승인 실패: ' + (error.code || error.message));
  }
}

onAuthStateChanged(auth, async (user) => {
  unsubscribeUsers?.();
  unsubscribeUsers = null;
  users = [];
  if (!user) return;

  try {
    const adminSnap = await get(ref(db, `admins/${user.uid}`));
    if (!adminSnap.exists()) return;
    ensurePane();
    unsubscribeUsers = onValue(ref(db, 'users'), (snapshot) => {
      users = [];
      snapshot.forEach((child) => users.push({ uid: child.key, ...(child.val() || {}) }));
      users.sort((a, b) => {
        const rank = (value) => !value ? 0 : value === 'pending' ? 1 : value === 'suspended' ? 2 : 3;
        return rank(a.status) - rank(b.status) || (b.createdAt || 0) - (a.createdAt || 0);
      });
      render();
    }, (error) => console.error('[member-approval] 회원 목록 읽기 실패:', error));
  } catch (error) {
    console.error('[member-approval] 관리자 확인 실패:', error);
  }
});
