/* 개역한글판 오늘의 말씀 + 커뮤니티 성경큐티
 * - Firebase 관리자 등록 데이터에 의존하지 않습니다.
 * - Asia/Seoul 날짜를 기준으로 매일 한 구절과 큐티 질문을 자동 선택합니다.
 */
import { db, auth } from '/firebase-init.js';
import { ref, get, set } from 'https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js';

const KRV_DAILY = [
  { ref: '창세기 1:1', text: '태초에 하나님이 천지를 창조하시니라', topic: '창조' },
  { ref: '출애굽기 14:14', text: '여호와께서 너희를 위하여 싸우시리니 너희는 가만히 있을찌니라', topic: '신뢰' },
  { ref: '민수기 6:24-26', text: '여호와는 네게 복을 주시고 너를 지키시기를 원하며 여호와는 그 얼굴로 네게 비취사 은혜 베푸시기를 원하며 여호와는 그 얼굴을 네게로 향하여 드사 평강 주시기를 원하노라 할찌니라', topic: '축복' },
  { ref: '신명기 6:5', text: '너는 마음을 다하고 성품을 다하고 힘을 다하여 네 하나님 여호와를 사랑하라', topic: '사랑' },
  { ref: '신명기 31:8', text: '여호와 그가 네 앞서 행하시며 너와 함께 하사 너를 떠나지 아니하시며 버리지 아니하시리니 너는 두려워 말라 놀라지 말라', topic: '동행' },
  { ref: '여호수아 1:9', text: '내가 네게 명한 것이 아니냐 마음을 강하게 하고 담대히 하라 두려워 말며 놀라지 말라 네가 어디로 가든지 네 하나님 여호와가 너와 함께 하느니라 하시니라', topic: '담대함' },
  { ref: '사무엘상 16:7', text: '나의 보는 것은 사람과 같지 아니하니 사람은 외모를 보거니와 나 여호와는 중심을 보느니라', topic: '마음' },
  { ref: '역대상 16:11', text: '여호와와 그 능력을 구할찌어다 그 얼굴을 항상 구할찌어다', topic: '기도' },
  { ref: '느헤미야 8:10', text: '여호와를 기뻐하는 것이 너희의 힘이니라', topic: '기쁨' },
  { ref: '시편 1:1-2', text: '복 있는 사람은 악인의 꾀를 좇지 아니하며 죄인의 길에 서지 아니하며 오만한 자의 자리에 앉지 아니하고 오직 여호와의 율법을 즐거워하여 그 율법을 주야로 묵상하는 자로다', topic: '말씀' },
  { ref: '시편 19:14', text: '나의 반석이시요 나의 구속자이신 여호와여 내 입의 말과 마음의 묵상이 주의 앞에 열납되기를 원하나이다', topic: '묵상' },
  { ref: '시편 23:1', text: '여호와는 나의 목자시니 내가 부족함이 없으리로다', topic: '인도' },
  { ref: '시편 23:4', text: '내가 사망의 음침한 골짜기로 다닐찌라도 해를 두려워하지 않을 것은 주께서 나와 함께 하심이라 주의 지팡이와 막대기가 나를 안위하시나이다', topic: '위로' },
  { ref: '시편 27:1', text: '여호와는 나의 빛이요 나의 구원이시니 내가 누구를 두려워하리요 여호와는 내 생명의 능력이시니 내가 누구를 무서워하리요', topic: '용기' },
  { ref: '시편 34:8', text: '너희는 여호와의 선하심을 맛보아 알찌어다 그에게 피하는 자는 복이 있도다', topic: '선하심' },
  { ref: '시편 37:5', text: '너의 길을 여호와께 맡기라 저를 의지하면 저가 이루시고', topic: '맡김' },
  { ref: '시편 42:11', text: '내 영혼아 네가 어찌하여 낙망하며 어찌하여 내 속에서 불안하여 하는고 너는 하나님을 바라라 나는 내 얼굴을 도우시는 내 하나님을 오히려 찬송하리로다', topic: '소망' },
  { ref: '시편 46:1', text: '하나님은 우리의 피난처시요 힘이시니 환난 중에 만날 큰 도움이시라', topic: '피난처' },
  { ref: '시편 46:10', text: '너희는 가만히 있어 내가 하나님 됨을 알찌어다 내가 열방과 세계 중에서 높임을 받으리라 하시도다', topic: '쉼' },
  { ref: '시편 55:22', text: '네 짐을 여호와께 맡겨 버리라 너를 붙드시고 의인의 요동함을 영영히 허락지 아니하시리로다', topic: '염려' },
  { ref: '시편 84:11', text: '여호와 하나님은 해요 방패시라 여호와께서 은혜와 영화를 주시며 정직히 행하는 자에게 좋은 것을 아끼지 아니하실 것임이니이다', topic: '은혜' },
  { ref: '시편 119:105', text: '주의 말씀은 내 발에 등이요 내 길에 빛이니이다', topic: '말씀' },
  { ref: '시편 121:1-2', text: '내가 산을 향하여 눈을 들리라 나의 도움이 어디서 올꼬 나의 도움이 천지를 지으신 여호와에게서로다', topic: '도움' },
  { ref: '잠언 3:5-6', text: '너는 마음을 다하여 여호와를 의뢰하고 네 명철을 의지하지 말라 너는 범사에 그를 인정하라 그리하면 네 길을 지도하시리라', topic: '신뢰' },
  { ref: '잠언 4:23', text: '무릇 지킬만한 것보다 더욱 네 마음을 지키라 생명의 근원이 이에서 남이니라', topic: '마음' },
  { ref: '잠언 16:3', text: '너의 행사를 여호와께 맡기라 그리하면 너의 경영하는 것이 이루리라', topic: '맡김' },
  { ref: '잠언 17:22', text: '마음의 즐거움은 양약이라도 심령의 근심은 뼈로 마르게 하느니라', topic: '기쁨' },
  { ref: '전도서 3:1', text: '천하에 범사가 기한이 있고 모든 목적이 이룰 때가 있나니', topic: '때' },
  { ref: '이사야 40:31', text: '오직 여호와를 앙망하는 자는 새 힘을 얻으리니 독수리의 날개치며 올라감 같을 것이요 달음박질하여도 곤비치 아니하겠고 걸어가도 피곤치 아니하리로다', topic: '새힘' },
  { ref: '이사야 41:10', text: '두려워 말라 내가 너와 함께 함이니라 놀라지 말라 나는 네 하나님이 됨이니라 내가 너를 굳세게 하리라 참으로 너를 도와 주리라 참으로 나의 의로운 오른손으로 너를 붙들리라', topic: '담대함' },
  { ref: '이사야 43:2', text: '네가 물 가운데로 지날 때에 내가 함께 할 것이라 강을 건널 때에 물이 너를 침몰치 못할 것이며 네가 불 가운데로 행할 때에 타지도 아니할 것이요 불꽃이 너를 사르지도 못하리니', topic: '보호' },
  { ref: '예레미야 29:11', text: '나 여호와가 말하노라 너희를 향한 나의 생각은 내가 아나니 재앙이 아니라 곧 평안이요 너희 장래에 소망을 주려 하는 생각이라', topic: '소망' },
  { ref: '예레미야애가 3:22-23', text: '여호와의 자비와 긍휼이 무궁하시므로 우리가 진멸되지 아니함이니이다 이것이 아침마다 새로우니 주의 성실이 크도소이다', topic: '성실' },
  { ref: '미가 6:8', text: '사람아 주께서 선한 것이 무엇임을 네게 보이셨나니 여호와께서 네게 구하시는 것이 오직 공의를 행하며 인자를 사랑하며 겸손히 네 하나님과 함께 행하는 것이 아니냐', topic: '실천' },
  { ref: '하박국 3:18', text: '나는 여호와를 인하여 즐거워하며 나의 구원의 하나님을 인하여 기뻐하리로다', topic: '기쁨' },
  { ref: '마태복음 5:16', text: '이같이 너희 빛을 사람 앞에 비취게 하여 저희로 너희 착한 행실을 보고 하늘에 계신 너희 아버지께 영광을 돌리게 하라', topic: '빛' },
  { ref: '마태복음 6:33', text: '너희는 먼저 그의 나라와 그의 의를 구하라 그리하면 이 모든 것을 너희에게 더하시리라', topic: '우선순위' },
  { ref: '마태복음 7:7', text: '구하라 그러면 너희에게 주실 것이요 찾으라 그러면 찾을 것이요 문을 두드리라 그러면 너희에게 열릴 것이니', topic: '기도' },
  { ref: '마태복음 11:28', text: '수고하고 무거운 짐진 자들아 다 내게로 오라 내가 너희를 쉬게 하리라', topic: '쉼' },
  { ref: '마가복음 9:23', text: '예수께서 이르시되 할 수 있거든이 무슨 말이냐 믿는 자에게는 능치 못할 일이 없느니라 하시니', topic: '믿음' },
  { ref: '누가복음 6:31', text: '남에게 대접을 받고자 하는대로 너희도 남을 대접하라', topic: '섬김' },
  { ref: '요한복음 3:16', text: '하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 이는 저를 믿는 자마다 멸망치 않고 영생을 얻게 하려 하심이니라', topic: '복음' },
  { ref: '요한복음 8:12', text: '나는 세상의 빛이니 나를 따르는 자는 어두움에 다니지 아니하고 생명의 빛을 얻으리라', topic: '빛' },
  { ref: '요한복음 14:6', text: '내가 곧 길이요 진리요 생명이니 나로 말미암지 않고는 아버지께로 올 자가 없느니라', topic: '진리' },
  { ref: '요한복음 14:27', text: '평안을 너희에게 끼치노니 곧 나의 평안을 너희에게 주노라 내가 너희에게 주는 것은 세상이 주는 것 같지 아니하니라 너희는 마음에 근심도 말고 두려워하지도 말라', topic: '평안' },
  { ref: '요한복음 15:5', text: '나는 포도나무요 너희는 가지니 저가 내 안에 내가 저 안에 있으면 이 사람은 과실을 많이 맺나니 나를 떠나서는 너희가 아무 것도 할 수 없음이라', topic: '동행' },
  { ref: '사도행전 1:8', text: '오직 성령이 너희에게 임하시면 너희가 권능을 받고 예루살렘과 온 유대와 사마리아와 땅끝까지 이르러 내 증인이 되리라 하시니라', topic: '사명' },
  { ref: '로마서 5:8', text: '우리가 아직 죄인 되었을 때에 그리스도께서 우리를 위하여 죽으심으로 하나님께서 우리에게 대한 자기의 사랑을 확증하셨느니라', topic: '사랑' },
  { ref: '로마서 8:28', text: '우리가 알거니와 하나님을 사랑하는 자 곧 그 뜻대로 부르심을 입은 자들에게는 모든 것이 합력하여 선을 이루느니라', topic: '섭리' },
  { ref: '로마서 12:12', text: '소망 중에 즐거워하며 환난 중에 참으며 기도에 항상 힘쓰며', topic: '인내' },
  { ref: '고린도전서 13:13', text: '그런즉 믿음, 소망, 사랑, 이 세 가지는 항상 있을 것인데 그 중에 제일은 사랑이라', topic: '사랑' },
  { ref: '고린도후서 5:17', text: '그런즉 누구든지 그리스도 안에 있으면 새로운 피조물이라 이전 것은 지나갔으니 보라 새것이 되었도다', topic: '새사람' },
  { ref: '갈라디아서 2:20', text: '내가 그리스도와 함께 십자가에 못 박혔나니 그런즉 이제는 내가 산 것이 아니요 오직 내 안에 그리스도께서 사신 것이라', topic: '헌신' },
  { ref: '에베소서 4:32', text: '서로 인자하게 하며 불쌍히 여기며 서로 용서하기를 하나님이 그리스도 안에서 너희를 용서하심과 같이 하라', topic: '용서' },
  { ref: '빌립보서 4:4', text: '주 안에서 항상 기뻐하라 내가 다시 말하노니 기뻐하라', topic: '기쁨' },
  { ref: '빌립보서 4:6-7', text: '아무 것도 염려하지 말고 오직 모든 일에 기도와 간구로 너희 구할 것을 감사함으로 하나님께 아뢰라 그리하면 모든 지각에 뛰어난 하나님의 평강이 그리스도 예수 안에서 너희 마음과 생각을 지키시리라', topic: '기도' },
  { ref: '빌립보서 4:13', text: '내게 능력 주시는 자 안에서 내가 모든 것을 할 수 있느니라', topic: '능력' },
  { ref: '골로새서 3:23', text: '무슨 일을 하든지 마음을 다하여 주께 하듯하고 사람에게 하듯하지 말라', topic: '섬김' },
  { ref: '데살로니가전서 5:16-18', text: '항상 기뻐하라 쉬지 말고 기도하라 범사에 감사하라 이는 그리스도 예수 안에서 너희를 향하신 하나님의 뜻이니라', topic: '감사' },
  { ref: '디모데후서 1:7', text: '하나님이 우리에게 주신 것은 두려워하는 마음이 아니요 오직 능력과 사랑과 근신하는 마음이니', topic: '담대함' },
  { ref: '히브리서 11:1', text: '믿음은 바라는 것들의 실상이요 보지 못하는 것들의 증거니', topic: '믿음' },
  { ref: '야고보서 1:5', text: '너희 중에 누구든지 지혜가 부족하거든 모든 사람에게 후히 주시고 꾸짖지 아니하시는 하나님께 구하라 그리하면 주시리라', topic: '지혜' },
  { ref: '야고보서 1:22', text: '너희는 도를 행하는 자가 되고 듣기만 하여 자신을 속이는 자가 되지 말라', topic: '순종' },
  { ref: '베드로전서 5:7', text: '너희 염려를 다 주께 맡겨 버리라 이는 저가 너희를 권고하심이니라', topic: '염려' },
  { ref: '요한일서 1:9', text: '만일 우리가 우리 죄를 자백하면 저는 미쁘시고 의로우사 우리 죄를 사하시며 모든 불의에서 우리를 깨끗케 하실 것이요', topic: '회개' },
  { ref: '요한일서 4:18', text: '사랑 안에 두려움이 없고 온전한 사랑이 두려움을 내어 쫓나니 두려움에는 형벌이 있음이라', topic: '사랑' },
  { ref: '요한계시록 3:20', text: '볼찌어다 내가 문 밖에 서서 두드리노니 누구든지 내 음성을 듣고 문을 열면 내가 그에게로 들어가 그로 더불어 먹고 그는 나로 더불어 먹으리라', topic: '초청' }
];

const QT_TEMPLATES = [
  { question: '오늘 이 말씀에서 하나님은 어떤 분으로 나타나십니까?', action: '말씀 속 하나님의 성품 한 가지를 적고 오늘의 선택에 적용해 보세요.' },
  { question: '지금 내 마음에서 이 말씀과 가장 부딪히는 염려나 생각은 무엇입니까?', action: '그 염려를 한 문장으로 적고 하나님께 맡기는 기도를 드려 보세요.' },
  { question: '오늘 순종해야 할 가장 구체적인 한 가지는 무엇입니까?', action: '작고 분명한 실천 한 가지를 정하고 오늘 안에 실행해 보세요.' },
  { question: '이 말씀을 통해 위로하거나 섬겨야 할 사람은 누구입니까?', action: '한 사람에게 안부·격려·감사의 메시지를 보내 보세요.' },
  { question: '말씀을 내 상황에 적용하면 생각과 태도가 어떻게 달라져야 합니까?', action: '바꾸어야 할 태도 한 가지와 계속 지켜야 할 태도 한 가지를 적어 보세요.' },
  { question: '이 말씀 가운데 붙들고 반복해서 고백할 문장은 무엇입니까?', action: '핵심 문장을 세 번 천천히 읽고 짧은 기도로 바꾸어 고백해 보세요.' },
  { question: '하나님께 감사할 이유를 이 말씀에서 무엇으로 발견할 수 있습니까?', action: '감사 제목 세 가지를 적고 그중 한 가지를 다른 사람과 나누어 보세요.' }
];

function seoulParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short'
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function dayNumber(date = new Date()) {
  const p = seoulParts(date);
  return Math.floor(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)) / 86400000);
}

function dateKey(date = new Date()) {
  const p = seoulParts(date);
  return `${p.year}${p.month}${p.day}`;
}

function displayDate(date = new Date()) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
  }).format(date);
}

function getDailyData(date = new Date()) {
  const n = dayNumber(date);
  const verse = KRV_DAILY[((n % KRV_DAILY.length) + KRV_DAILY.length) % KRV_DAILY.length];
  const template = QT_TEMPLATES[((n % QT_TEMPLATES.length) + QT_TEMPLATES.length) % QT_TEMPLATES.length];
  return {
    ...verse,
    dateKey: dateKey(date),
    displayDate: displayDate(date),
    question: template.question,
    action: template.action,
    prayer: `하나님, 오늘 ${verse.topic}의 말씀을 마음에 새기고 삶으로 순종하게 하소서. 아멘.`
  };
}

let current = getDailyData();
let applying = false;

function injectStyles() {
  if (document.getElementById('krvDailyQtStyles')) return;
  const style = document.createElement('style');
  style.id = 'krvDailyQtStyles';
  style.textContent = `
    .verse-label .krv-badge, .krv-badge { display:inline-flex;align-items:center;margin-left:6px;padding:2px 8px;border-radius:999px;background:var(--primary-soft);color:var(--primary-dark);font-size:10.5px;font-weight:800;vertical-align:middle; }
    .board-mode-tabs { display:flex;gap:4px;background:var(--bg-2);border-radius:12px;padding:4px;margin:12px 0 18px; }
    .board-mode-tab { flex:1;padding:10px;border:0;border-radius:9px;background:transparent;color:var(--muted);font-weight:800;cursor:pointer; }
    .board-mode-tab.active { background:var(--paper);color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,.06); }
    .board-mode-pane { display:none; }
    .board-mode-pane.active { display:block; }
    .daily-qt-card { background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:20px;box-shadow:var(--shadow-xs); }
    .daily-qt-head { display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:14px; }
    .daily-qt-head h3 { margin:0;font-size:18px;letter-spacing:-.5px; }
    .daily-qt-date { color:var(--muted);font-size:12px;font-weight:700;margin-top:3px; }
    .daily-qt-ref { color:var(--primary-dark);font-weight:900;font-size:14px;margin-bottom:8px; }
    .daily-qt-text { margin:0;padding:16px;border-radius:14px;background:var(--primary-soft);font-size:15px;line-height:1.8;font-weight:650; }
    .daily-qt-block { margin-top:14px;padding:14px;border:1px solid var(--line);border-radius:14px; }
    .daily-qt-block b { display:block;color:var(--primary-dark);font-size:12px;margin-bottom:5px; }
    .daily-qt-block p { margin:0;font-size:13.5px;line-height:1.65; }
    .daily-qt-actions { display:flex;gap:8px;margin-top:16px;flex-wrap:wrap; }
    .daily-qt-actions button { flex:1;min-width:130px;padding:11px 14px;border-radius:12px;border:1px solid var(--line);background:var(--paper);font-weight:800;cursor:pointer; }
    .daily-qt-actions button.primary { background:var(--primary);border-color:var(--primary);color:#fff; }
    .daily-qt-complete { margin-top:12px;text-align:center;font-size:12px;color:var(--primary-dark);font-weight:800;min-height:18px; }
  `;
  document.head.appendChild(style);
}

function applyVerse() {
  current = getDailyData();
  const textEl = document.getElementById('verseText');
  const refEl = document.getElementById('verseRef');
  const label = document.querySelector('#verseCard .verse-label, .verse-card .verse-label');
  if (!textEl || !refEl) return false;
  applying = true;
  textEl.textContent = current.text;
  refEl.textContent = current.ref;
  textEl.dataset.translation = 'KRV';
  refEl.dataset.translation = 'KRV';
  if (label) label.innerHTML = '📖 오늘의 말씀 <span class="krv-badge">개역한글판</span>';
  window.__namsanTodayVerse = { ...current, translation: '개역한글판', source: 'localKrvDaily' };
  requestAnimationFrame(() => { applying = false; });
  renderQt();
  return true;
}

function ensureBoardQt() {
  const board = document.getElementById('tab-board');
  if (!board || document.getElementById('boardQtPane')) return;
  injectStyles();
  const existing = Array.from(board.children);
  const tabs = document.createElement('div');
  tabs.className = 'board-mode-tabs';
  tabs.innerHTML = '<button class="board-mode-tab active" type="button" data-board-mode="qt">성경큐티</button><button class="board-mode-tab" type="button" data-board-mode="posts">나눔게시판</button>';
  const qtPane = document.createElement('div');
  qtPane.id = 'boardQtPane';
  qtPane.className = 'board-mode-pane active';
  const postPane = document.createElement('div');
  postPane.id = 'boardPostsPane';
  postPane.className = 'board-mode-pane';
  existing.forEach((node) => postPane.appendChild(node));
  board.append(tabs, qtPane, postPane);
  tabs.querySelectorAll('[data-board-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.dataset.boardMode;
      tabs.querySelectorAll('[data-board-mode]').forEach((b) => b.classList.toggle('active', b === button));
      qtPane.classList.toggle('active', mode === 'qt');
      postPane.classList.toggle('active', mode === 'posts');
    });
  });
}

function renderQt() {
  ensureBoardQt();
  const pane = document.getElementById('boardQtPane');
  if (!pane) return;
  const completed = localStorage.getItem(`namsanQtComplete:${current.dateKey}`) === '1';
  pane.innerHTML = `
    <article class="daily-qt-card">
      <div class="daily-qt-head"><div><h3>📖 오늘의 성경큐티 <span class="krv-badge">개역한글판</span></h3><div class="daily-qt-date">${current.displayDate}</div></div></div>
      <div class="daily-qt-ref">${current.ref}</div>
      <p class="daily-qt-text">${current.text}</p>
      <div class="daily-qt-block"><b>묵상 질문</b><p>${current.question}</p></div>
      <div class="daily-qt-block"><b>오늘의 실천</b><p>${current.action}</p></div>
      <div class="daily-qt-block"><b>짧은 기도</b><p>${current.prayer}</p></div>
      <div class="daily-qt-actions">
        <button class="primary" type="button" id="qtWriteNote">✍️ 묵상 노트 쓰기</button>
        <button type="button" id="qtComplete">${completed ? '✅ 오늘 묵상 완료' : '오늘 묵상 완료하기'}</button>
      </div>
      <div class="daily-qt-complete" id="qtCompleteStatus">${completed ? '오늘의 큐티를 완료했습니다.' : ''}</div>
    </article>`;
  document.getElementById('qtWriteNote')?.addEventListener('click', openDailyNote);
  document.getElementById('qtComplete')?.addEventListener('click', () => {
    localStorage.setItem(`namsanQtComplete:${current.dateKey}`, '1');
    renderQt();
  });
}

async function openDailyNote() {
  if (!auth.currentUser) return;
  const modal = document.getElementById('devotionModal');
  if (!modal) return;
  const refEl = document.getElementById('devotionVerseRef');
  const textEl = document.getElementById('devotionVerseText');
  const titleEl = document.getElementById('devTitle');
  const bodyEl = document.getElementById('devBody');
  if (refEl) refEl.textContent = `${current.ref} · 개역한글판`;
  if (textEl) textEl.textContent = current.text;
  if (titleEl) titleEl.value = '';
  if (bodyEl) bodyEl.value = '';
  try {
    const snap = await get(ref(db, `userNotes/${auth.currentUser.uid}/${current.dateKey}`));
    if (snap.exists()) {
      const note = snap.val();
      if (titleEl) titleEl.value = note.title || '';
      if (bodyEl) bodyEl.value = note.body || '';
    }
  } catch {}
  modal.classList.add('show');
  document.body.style.overflow = 'hidden';
}

async function saveDailyNote() {
  if (!auth.currentUser) return;
  const title = document.getElementById('devTitle')?.value.trim() || '';
  const body = document.getElementById('devBody')?.value.trim() || '';
  const status = document.getElementById('devStatus');
  if (!body) {
    if (status) { status.textContent = '묵상 내용을 입력해주세요'; status.style.color = 'var(--danger)'; }
    return;
  }
  const button = document.getElementById('devSubmit');
  if (button) button.disabled = true;
  if (status) { status.textContent = '저장 중...'; status.style.color = ''; }
  try {
    await set(ref(db, `userNotes/${auth.currentUser.uid}/${current.dateKey}`), {
      title, body, verseRef: `${current.ref} · 개역한글판`, verseText: current.text,
      translation: 'KRV', timestamp: Date.now()
    });
    if (status) { status.textContent = '✅ 묵상이 저장되었습니다'; status.style.color = 'var(--primary)'; }
    setTimeout(() => {
      document.getElementById('devotionModal')?.classList.remove('show');
      document.body.style.overflow = '';
    }, 900);
  } catch (error) {
    if (status) { status.textContent = `❌ 저장 실패: ${error.code || error.message}`; status.style.color = 'var(--danger)'; }
  } finally {
    if (button) button.disabled = false;
  }
}

async function shareCurrentVerse() {
  const payload = { title: `오늘의 말씀 · ${current.ref}`, text: `“${current.text}”\n\n${current.ref} · 개역한글판`, url: location.origin };
  if (navigator.share) {
    try { await navigator.share(payload); return; } catch {}
  }
  try { await navigator.clipboard.writeText(`${payload.title}\n\n${payload.text}\n\n${payload.url}`); } catch {}
}

function bindActions() {
  document.addEventListener('click', (event) => {
    const action = event.target.closest?.('[data-action]')?.dataset.action;
    if (action === 'shareVerse') {
      event.preventDefault(); event.stopImmediatePropagation(); shareCurrentVerse();
    } else if (action === 'devotion') {
      event.preventDefault(); event.stopImmediatePropagation(); openDailyNote();
    }
  }, true);
  document.getElementById('devSubmit')?.addEventListener('click', (event) => {
    const modalRef = document.getElementById('devotionVerseRef')?.textContent || '';
    if (!modalRef.includes('개역한글판')) return;
    event.preventDefault(); event.stopImmediatePropagation(); saveDailyNote();
  }, true);
}

function observeVerseCard() {
  const card = document.getElementById('verseCard');
  if (!card || card.dataset.krvObserved === '1') return;
  card.dataset.krvObserved = '1';
  new MutationObserver(() => {
    if (!applying) requestAnimationFrame(applyVerse);
  }).observe(card, { childList: true, subtree: true, characterData: true });
}

function refreshIfNeeded() {
  const next = getDailyData();
  if (next.dateKey !== current.dateKey) current = next;
  applyVerse();
}

function boot() {
  injectStyles();
  ensureBoardQt();
  bindActions();
  applyVerse();
  observeVerseCard();
  setInterval(refreshIfNeeded, 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshIfNeeded(); });
  window.addEventListener('pageshow', refreshIfNeeded);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
