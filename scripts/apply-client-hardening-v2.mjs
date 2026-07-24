import fs from 'node:fs';

const filePath = 'public/app.js';
let source = fs.readFileSync(filePath, 'utf8');
let changes = 0;
const warnings = [];

function replaceOnce(search, replacement, label, marker = replacement) {
  if (source.includes(marker)) return;
  const index = source.indexOf(search);
  if (index === -1) {
    warnings.push(`[${label}] 원본 코드를 찾지 못했습니다.`);
    return;
  }
  if (source.indexOf(search, index + search.length) !== -1) {
    warnings.push(`[${label}] 원본 코드가 여러 번 발견되었습니다.`);
    return;
  }
  source = source.replace(search, replacement);
  changes++;
}

function replaceRegex(regex, replacement, label, marker) {
  if (marker && source.includes(marker)) return;
  const globalRegex = regex.global ? regex : new RegExp(regex.source, `${regex.flags}g`);
  const matches = [...source.matchAll(globalRegex)];
  if (matches.length !== 1) {
    warnings.push(`[${label}] 예상 1개, 실제 ${matches.length}개입니다.`);
    return;
  }
  source = source.replace(regex, replacement);
  changes++;
}

replaceOnce(
  `  onAuthStateChanged, updateProfile, signOut, deleteUser,\n  createUserWithEmailAndPassword, signInWithEmailAndPassword,\n  sendPasswordResetEmail, EmailAuthProvider, reauthenticateWithCredential,`,
  `  onAuthStateChanged, updateProfile, signOut,\n  createUserWithEmailAndPassword, signInWithEmailAndPassword,\n  sendPasswordResetEmail,`,
  '구형 탈퇴 전용 Auth import 제거',
  `  onAuthStateChanged, updateProfile, signOut,\n  createUserWithEmailAndPassword`
);

replaceOnce(
  `// 인증 로직은 onAuthStateChanged에서 처리됨 — 자동 로그인 없음.`,
  `let submitCapacityApplicationCallable = null;\n\nasync function submitCapacityApplication(payload) {\n  if (!submitCapacityApplicationCallable) {\n    const [{ app }, { getFunctions, httpsCallable }] = await Promise.all([\n      import('/firebase-init.js'),\n      import('https://www.gstatic.com/firebasejs/12.12.1/firebase-functions.js')\n    ]);\n    const functions = getFunctions(app, 'asia-northeast3');\n    submitCapacityApplicationCallable = httpsCallable(functions, 'submitCapacityApplication');\n  }\n  const result = await submitCapacityApplicationCallable(payload);\n  return result.data || {};\n}\n\n// 인증 로직은 onAuthStateChanged에서 처리됨 — 자동 로그인 없음.`,
  '정원 신청 Callable helper',
  'async function submitCapacityApplication(payload)'
);

replaceOnce(
  `    const newRef = await push(ref(db, 'applications'), {\n      kind: '재능나눔', roomId, roomTitle: room.title, name, phone,\n      userUid: state.uid, timestamp: Date.now()\n    });\n    recordMyApplication(newRef.key);`,
  `    const result = await submitCapacityApplication({\n      targetType: 'room', targetId: roomId, name, phone, count: 1\n    });\n    recordMyApplication(result.applicationId);`,
  '재능나눔 서버 트랜잭션 신청',
  `targetType: 'room', targetId: roomId`
);

replaceOnce(
  `    const data = {\n      kind: kind === 'post' ? '모임' : '행사',\n      name, phone, count, note,\n      eventTitle: target.title || '',\n      userUid: state.uid, timestamp: Date.now()\n    };\n    if (kind === 'post') data.postId = id; else data.announcementId = id;\n    const newRef = await push(ref(db, 'applications'), data);\n    recordMyApplication(newRef.key);`,
  `    const result = await submitCapacityApplication({\n      targetType: kind === 'post' ? 'post' : 'announcement',\n      targetId: id, name, phone, count, note\n    });\n    recordMyApplication(result.applicationId);`,
  '행사·모임 서버 트랜잭션 신청',
  `targetType: kind === 'post' ? 'post' : 'announcement'`
);

replaceRegex(
  /async function openMyApplications\(\) \{[\s\S]*?\n\}\n\nfunction recordMyApplication/,
  `async function openMyApplications() {\n  const items = [];\n  try {\n    const ownQuery = query(ref(db, 'applications'), orderByChild('userUid'), equalTo(state.uid));\n    const snap = await get(ownQuery);\n    snap.forEach((child) => items.push({ id: child.key, ...child.val() }));\n  } catch (error) {\n    console.error('[apps] 내 신청 조회 실패:', error);\n    openListModal('내 신청 내역', '<div class="list-empty">신청 내역을 불러오지 못했어요</div>');\n    return;\n  }\n\n  items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));\n  const rows = items.map((a) => {\n    let detail = a.roomTitle || a.eventTitle || a.type || '';\n    if (a.kind === '심방요청' && a.date) detail = \`희망일: \${a.date}\`;\n    if (a.kind === '새가족' && a.address) detail = a.address;\n    return \`<div class="list-row" data-app-id="\${escapeHtml(a.id)}">\n      <div class="list-row-main">\n        <div class="list-row-head">\n          <span class="tag">\${escapeHtml(a.kind || '신청')}</span>\n          <span class="time">\${escapeHtml(timeAgo(a.timestamp))}</span>\n        </div>\n        <div class="list-row-title">\${escapeHtml(detail)}</div>\n        <div class="list-row-body">\${escapeHtml(a.name || '')}\${a.phone ? ' · ' + escapeHtml(a.phone) : ''}</div>\n      </div>\n      <button class="list-row-del" data-del-app="\${escapeHtml(a.id)}" type="button" title="신청 취소">🗑️</button>\n    </div>\`;\n  }).join('');\n  openListModal('내 신청 내역', rows || '<div class="list-empty">아직 신청한 내역이 없어요</div>');\n\n  document.querySelectorAll('#listBody [data-del-app]').forEach((btn) => {\n    btn.addEventListener('click', async (event) => {\n      event.stopPropagation();\n      const id = btn.dataset.delApp;\n      if (!confirm('이 신청을 취소(삭제)하시겠어요?')) return;\n      try {\n        await remove(ref(db, \`applications/\${id}\`));\n        btn.closest('.list-row')?.remove();\n        toast('신청이 취소되었습니다');\n      } catch (error) {\n        console.error('[apps] 삭제 실패:', error);\n        toast('삭제 실패: ' + (error.code || error.message));\n      }\n    });\n  });\n}\n\nfunction recordMyApplication`,
  '본인 신청 보안 쿼리 조회',
  `const ownQuery = query(ref(db, 'applications'), orderByChild('userUid'), equalTo(state.uid));`
);

replaceRegex(
  /\n\/\/ ===== 탈퇴 \(내 모든 데이터 영구 삭제\) =====[\s\S]*?\n\}\n\ndocument\.querySelectorAll\('\[data-action\]'\)/,
  `\n// 회원 탈퇴는 member-status.js의 deleteMyAccount Callable에서만 처리합니다.\n\ndocument.querySelectorAll('[data-action]')`,
  '구형 클라이언트 탈퇴 제거',
  '회원 탈퇴는 member-status.js의 deleteMyAccount Callable에서만 처리합니다.'
);

replaceOnce(
  `    else if (a === 'withdraw') handleWithdraw();`,
  `    else if (a === 'withdraw') { /* member-status.js가 캡처 단계에서 처리 */ }`,
  '탈퇴 라우팅 서버 전용화',
  `else if (a === 'withdraw') { /* member-status.js가 캡처 단계에서 처리 */ }`
);

fs.writeFileSync(filePath, source);
console.log(`public/app.js 추가 하드닝 완료: ${changes}개 변경`);
if (warnings.length) {
  console.warn(`추가 패치 경고 (${warnings.length}건)`);
  warnings.forEach((warning) => console.warn(`- ${warning}`));
}
