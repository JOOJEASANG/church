import fs from 'node:fs';

const filePath = 'public/app.js';
let source = fs.readFileSync(filePath, 'utf8');
let changes = 0;

function replaceOnce(search, replacement, label, marker = replacement) {
  if (source.includes(marker)) return;
  const first = source.indexOf(search);
  if (first === -1) throw new Error(`[${label}] 원본 코드를 찾지 못했습니다.`);
  if (source.indexOf(search, first + search.length) !== -1) {
    throw new Error(`[${label}] 원본 코드가 여러 번 발견되었습니다.`);
  }
  source = source.replace(search, replacement);
  changes++;
}

function replaceRegex(regex, replacement, label, marker) {
  if (marker && source.includes(marker)) return;
  const matches = [...source.matchAll(regex)];
  if (matches.length !== 1) throw new Error(`[${label}] 예상 1개, 실제 ${matches.length}개입니다.`);
  source = source.replace(regex, replacement);
  changes++;
}

function removeRegex(regex, label) {
  const matches = [...source.matchAll(regex)];
  if (matches.length === 0) return;
  if (matches.length !== 1) throw new Error(`[${label}] 예상 최대 1개, 실제 ${matches.length}개입니다.`);
  source = source.replace(regex, '');
  changes++;
}

replaceOnce(
  'ref, onValue, push, update, get, set, remove, serverTimestamp, query, orderByChild, runTransaction',
  'ref, onValue, push, update, get, set, remove, serverTimestamp, query, orderByChild, equalTo, runTransaction',
  'Firebase query import',
  'orderByChild, equalTo, runTransaction'
);

replaceOnce(
  `email, displayName: name, phone, role, createdAt: Date.now(),\n      agreedTosAt: Date.now(), agreedPrivacyAt: Date.now()`,
  `email, displayName: name, phone, role,\n      memberType: 'member', status: 'pending', createdAt: Date.now(),\n      agreedTosAt: Date.now(), agreedPrivacyAt: Date.now()`,
  '이메일 가입 기본 승인 상태',
  `memberType: 'member', status: 'pending', createdAt: Date.now()`
);

replaceOnce(
  `role: '성도',\n        provider: 'google',`,
  `role: '성도',\n        memberType: 'member',\n        status: 'pending',\n        provider: 'google',`,
  'Google 가입 기본 승인 상태',
  `status: 'pending',\n        provider: 'google'`
);

replaceOnce(
  '<li>탈퇴는 비밀번호 재확인 후 진행되며, 되돌릴 수 없습니다.</li>',
  '<li>탈퇴는 확인 문구 입력 후 서버에서 본인 데이터와 인증 계정을 함께 삭제하며, 되돌릴 수 없습니다.</li>',
  '탈퇴 안내 문구'
);

replaceOnce(
  'let listenersAttached = false;',
  `let listenersAttached = false;\nconst activeUnsubscribers = [];\nconst prayerBuckets = new Map();\n\nfunction detachListeners() {\n  while (activeUnsubscribers.length) {\n    const unsubscribe = activeUnsubscribers.pop();\n    try { unsubscribe?.(); } catch {}\n  }\n  prayerBuckets.clear();\n  listenersAttached = false;\n}`,
  '리스너 해제 기반',
  'const activeUnsubscribers = []'
);

replaceOnce(
  `if (!user) {\n    listenersAttached = false;`,
  `if (!user) {\n    detachListeners();`,
  '로그아웃 리스너 해제',
  `if (!user) {\n    detachListeners();`
);

replaceOnce(
  `function onValueWithError(path, handler) {\n  return onValue(ref(db, path), handler, (err) => {\n    console.error(\`[home] \${path} 읽기 실패:\`, err.code || err.message);\n  });\n}`,
  `function onValueWithError(path, handler) {\n  const unsubscribe = onValue(ref(db, path), handler, (err) => {\n    console.error(\`[home] \${path} 읽기 실패:\`, err.code || err.message);\n  });\n  activeUnsubscribers.push(unsubscribe);\n  return unsubscribe;\n}\n\nfunction updatePrayerBucket(key, snapshot) {\n  const bucket = new Map();\n  snapshot.forEach((child) => bucket.set(child.key, { id: child.key, ...child.val() }));\n  prayerBuckets.set(key, bucket);\n  const merged = new Map();\n  prayerBuckets.forEach((items) => items.forEach((value, id) => merged.set(id, value)));\n  state.prayers = [...merged.values()].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));\n  renderPrayers();\n}\n\nfunction attachPrayerListeners() {\n  ['공개', '익명 공개', '감사'].forEach((type) => {\n    const prayerQuery = query(ref(db, 'prayers'), orderByChild('type'), equalTo(type));\n    const unsubscribe = onValue(prayerQuery,\n      (snapshot) => updatePrayerBucket(\`type:\${type}\`, snapshot),\n      (error) => console.error(\`[home] 공개 기도제목(\${type}) 읽기 실패:\`, error.code || error.message));\n    activeUnsubscribers.push(unsubscribe);\n  });\n\n  const mineQuery = query(ref(db, 'prayers'), orderByChild('createdBy'), equalTo(state.uid));\n  const unsubscribeMine = onValue(mineQuery,\n    (snapshot) => updatePrayerBucket('mine', snapshot),\n    (error) => console.error('[home] 내 기도제목 읽기 실패:', error.code || error.message));\n  activeUnsubscribers.push(unsubscribeMine);\n}`,
  '리스너 및 기도 쿼리 헬퍼',
  'function attachPrayerListeners()'
);

replaceOnce(
  `  onValueWithError('prayers', (snap) => {\n    state.prayers = [];\n    snap.forEach((c) => { state.prayers.push({ id: c.key, ...c.val() }); });\n    state.prayers.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));\n    renderPrayers();\n  });`,
  '  attachPrayerListeners();',
  '기도제목 제한 쿼리 연결'
);

const servicesListener = "  onValue(ref(db, 'config/services'), (snap) => {\n    state.services = [];\n    snap.forEach((c) => { state.services.push({ id: c.key, ...c.val() }); });\n    state.services.sort((a, b) => (serviceFirstDay(a) - serviceFirstDay(b)) || (a.time || '').localeCompare(b.time || ''));\n    renderServiceTimes();\n  }, (err) => {\n    console.error('[home] config/services 읽기 실패:', err.code || err.message, err);\n    const list = document.getElementById('serviceList');\n    if (list) list.innerHTML = `<div class=\"service-empty\">⚠️ 예배 시간을 불러오지 못했습니다 (${err.code || '권한 오류'})</div>`;\n  });";
replaceOnce(
  servicesListener,
  servicesListener.replace("  onValue(", "  activeUnsubscribers.push(onValue(").replace(/\);$/, '));'),
  '예배시간 리스너 추적',
  "activeUnsubscribers.push(onValue(ref(db, 'config/services')"
);

replaceOnce(
  'const path = `posts/${Date.now()}-${Math.random().toString(36).slice(2,8)}-${i}.${ext}`;',
  'const path = `posts/${state.uid}/${Date.now()}-${Math.random().toString(36).slice(2,8)}-${i}.${ext}`;',
  '게시물 Storage UID 경로',
  'const path = `posts/${state.uid}/'
);

replaceOnce(
  'const task = uploadBytesResumable(sRef(storage, path), f, { contentType: f.type });',
  'const task = uploadBytesResumable(sRef(storage, path), f, { contentType: f.type, customMetadata: { ownerUid: state.uid } });',
  '게시물 Storage 소유자 메타데이터',
  'customMetadata: { ownerUid: state.uid }'
);

replaceRegex(
  /async function prayFor\(prayerId\) \{[\s\S]*?\n\}\n\nfunction resetPrayerModal/,
  `async function prayFor(prayerId) {\n  if (!state.uid) { toast('잠시 후 다시 시도해주세요'); return; }\n  const prayer = (state.prayers || []).find((item) => item.id === prayerId);\n  if (prayer?.createdBy === state.uid) { toast('자신이 올린 기도제목입니다'); return; }\n  if (state.prayedBy[prayerId]) { toast('이미 기도에 참여하셨어요'); return; }\n\n  try {\n    const markerRef = ref(db, \`prayedBy/\${prayerId}/\${state.uid}\`);\n    const result = await runTransaction(markerRef, (current) => current ? undefined : true);\n    if (!result.committed) { toast('이미 기도에 참여하셨어요'); return; }\n    state.prayedBy[prayerId] = true;\n    if (prayer) prayer.count = (prayer.count || 0) + 1;\n    toast('기도 참여가 기록되었습니다');\n    renderPrayers();\n  } catch (error) {\n    toast('처리 중 오류가 발생했어요');\n    console.error(error);\n  }\n}\n\nfunction resetPrayerModal`,
  '기도 참여 중복 방지',
  'const markerRef = ref(db, `prayedBy/${prayerId}/${state.uid}`)'
);

replaceRegex(
  /document\.getElementById\('postDetailLikeBtn'\)\?\.addEventListener\('click', async \(\) => \{[\s\S]*?\n\}\);\n\ndocument\.getElementById\('commentSubmit'/,
  `document.getElementById('postDetailLikeBtn')?.addEventListener('click', async () => {\n  const id = state.currentPostId;\n  if (!id) return;\n  const post = state.posts.find((item) => item.id === id);\n  if (!post) return;\n  const liked = Boolean(state.postLikes[id]);\n  try {\n    if (liked) {\n      await remove(ref(db, \`postLikes/\${id}/\${state.uid}\`));\n      delete state.postLikes[id];\n      post.likeCount = Math.max(0, (post.likeCount || 0) - 1);\n    } else {\n      const result = await runTransaction(ref(db, \`postLikes/\${id}/\${state.uid}\`),\n        (current) => current ? undefined : true);\n      if (!result.committed) { toast('이미 좋아요를 눌렀습니다'); return; }\n      state.postLikes[id] = true;\n      post.likeCount = (post.likeCount || 0) + 1;\n    }\n    document.getElementById('postDetailLikeBtn').classList.toggle('liked', !liked);\n    document.getElementById('postDetailLikeCount').textContent = post.likeCount || 0;\n    renderPosts();\n  } catch (error) { toast('실패: ' + (error.code || error.message)); }\n});\n\ndocument.getElementById('commentSubmit'`,
  '좋아요 marker 기반 처리',
  '이미 좋아요를 눌렀습니다'
);

removeRegex(
  /\n          \/\/ commentCount 감소\n          const post = state\.posts\.find\(\(x\) => x\.id === postId\);\n          if \(post\) \{\n            await update\(ref\(db, `posts\/\$\{postId\}`\), \{\n              commentCount: Math\.max\(0, \(post\.commentCount \|\| 0\) - 1\)\n            \}\)\.catch\(\(\) => \{\}\);\n          \}/,
  '댓글 삭제 카운터 서버화'
);

removeRegex(
  /\n    await update\(ref\(db, `posts\/\$\{id\}`\), \{\n      commentCount: \(post\.commentCount \|\| 0\) \+ 1\n    \}\)\.catch\(\(\) => \{\}\);/,
  '댓글 등록 카운터 서버화'
);

replaceOnce(
  `    if (room.joined < room.capacity) {\n      await update(ref(db, \`rooms/\${roomId}\`), { joined: room.joined + 1 });\n    }`,
  '    // 재능나눔 신청 인원은 Cloud Function이 applications를 기준으로 재계산합니다.',
  '재능나눔 신청 인원 서버 집계'
);

replaceOnce(
  `    // post 신청이면 signupCount 원자적 증가 (race-safe transaction)\n    if (kind === 'post') {\n      try {\n        await runTransaction(ref(db, \`posts/\${id}/signupCount\`), (cur) => {\n          const next = (cur || 0) + count;\n          // 정원 초과 시 트랜잭션 중단 (서버 측 최종 검증)\n          if (target.capacity && next > target.capacity) return;\n          return next;\n        });\n      } catch (e) { console.warn('[signup-count]', e.code); }\n    }`,
  '    // 행사 신청 인원은 Cloud Function이 applications를 기준으로 재계산합니다.',
  '행사 신청 인원 서버 집계'
);

replaceOnce(
  `    // capacity는 announcements에만 사용 (posts는 무제한)\n    kind === 'announcement' && target.capacity ? \`정원 \${target.capacity}명\` : ''`,
  `    target.capacity ? \`정원 \${target.capacity}명\` : ''`,
  '모든 신청 대상 정원 표시'
);

replaceOnce(
  `  // 정원 초과 체크 (post: 정원 필수)\n  if (kind === 'post' && target.capacity) {`,
  `  // 공지와 커뮤니티 모임 모두 현재 집계값으로 정원을 확인합니다.\n  if (target.capacity) {`,
  '모든 신청 대상 정원 확인'
);

replaceOnce(
  'const token = await getToken(messaging, { vapidKey: VAPID_KEY });',
  'const registration = await navigator.serviceWorker.ready;\n    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });',
  'FCM 서비스워커 통합',
  'serviceWorkerRegistration: registration'
);

replaceRegex(
  /\$\{DAY_NAMES_KO\[s\.day\]\}요일 \$\{escapeHtml\(s\.time\)\}/,
  '${escapeHtml(formatDays(s))} ${escapeHtml(s.time)}',
  '교회 정보 다중 요일 표시',
  'info-service-time">${escapeHtml(formatDays(s))}'
);

if (!source.includes('function localDateKey(')) {
  replaceOnce(
    '// ===== 교회 캘린더 =====\nconst MONTHS_KO',
    `// ===== 교회 캘린더 =====\nfunction localDateKey(date = new Date()) {\n  return \`\${date.getFullYear()}-\${String(date.getMonth() + 1).padStart(2, '0')}-\${String(date.getDate()).padStart(2, '0')}\`;\n}\n\nconst MONTHS_KO`,
    '로컬 날짜 헬퍼',
    'function localDateKey('
  );
}

const utcDatePattern = 'new Date().toISOString().slice(0, 10)';
const utcDateCount = source.split(utcDatePattern).length - 1;
if (utcDateCount > 0) {
  source = source.split(utcDatePattern).join('localDateKey(new Date())');
  changes += utcDateCount;
}

fs.writeFileSync(filePath, source);
console.log(`public/app.js 하드닝 완료: ${changes}개 변경`);
