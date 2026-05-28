// 📊 GA4 클릭 추적용 공통 함수
function trackClick(eventName, eventDetails) {
    // gtag(구글 애널리틱스)가 정상적으로 로드되었을 때만 실행! (에러 방지)
    if (typeof gtag === 'function') {
        gtag('event', eventName, eventDetails);
    } else {
        console.log('클릭 추적됨 (GA 미연결):', eventName, eventDetails);
    }
}

function isWorkOnAutoBreak(work) {
    if (!work.cycle) return false;

    // 1. n연 m휴 체크 (예: 4연 1휴 5주차 -> 휴재)
    const nRunMatch = work.cycle.match(/(\d+)연\s*(\d+)휴\s*(\d+)주차/);
    if (nRunMatch) {
        const runWeeks = parseInt(nRunMatch[1]);
        const currentWeek = parseInt(nRunMatch[3]);
        if (currentWeek > runWeeks) return true;
    }

    // 2. 매월 특정 주 휴재 체크 (예: 4주차 휴재인데 이번 주가 4주차면 -> 휴재)
    if (work.cycle.includes('주차 휴재')) {
        const weekMatch = work.cycle.match(/(\d+)주차 휴재/);
        if (weekMatch) {
            const targetWeek = parseInt(weekMatch[1]);
            const now = getWebtoonDate();

            // 🌟 [수정] 5주차가 없는 달의 마지막 주 방어 로직 추가!
            let currentWeekOfMonth = Math.ceil(now.getDate() / 7);
            const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            const maxWeekInMonth = Math.ceil(lastDayOfMonth / 7);

            let effectiveTarget = targetWeek > maxWeekInMonth ? maxWeekInMonth : targetWeek;
            if (currentWeekOfMonth === effectiveTarget) return true;
        }
    }

    // 🌟 [추가] 3. 격주 연재 '자동휴재' 판독
    if (work.cycle && work.cycle.includes('격주 연재')) {
        let match = work.cycle.match(/\((.*?)\)/);
        if (match) {
            const targetDate = new Date(match[1]);
            const today = getWebtoonDate();
            // 오늘이 연재 예정일과 다르면? -> '자동휴재' 뱃지 띄우기!
            if (targetDate.getMonth() !== today.getMonth() || targetDate.getDate() !== today.getDate()) {
                return true;
            }
        }
    }
    return false;
}

// 1. 기존에 있던 applyTheme 함수는 다 지우고 이걸로 덮어씌워 주세요!
function applyTheme() {
    const savedTheme = localStorage.getItem('theme');

    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
    } else if (savedTheme === 'light') {
        document.body.classList.remove('dark-mode');
    } else {
        // 유저가 앱에서 직접 누른 적이 없다면, 기기(시스템) 설정을 따라갑니다!
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
    }

}

// 2. 폰 화면 켜둔 채로 제어센터에서 다크 모드 껐다 켰을 때, 새로고침 없이 즉시 반응하게 만들기!
// (이 코드를 applyTheme 함수 바로 밑이나 window.onload 근처에 붙여넣어 주세요)
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    // 유저가 앱 내 버튼으로 강제 고정해둔 상태가 아닐 때만 폰 설정을 따라갑니다.
    if (!localStorage.getItem('theme')) {
        if (e.matches) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }

    }
});

// PC 환경 마우스 드래그로 지갑 넘기기 기능!
window.addEventListener('DOMContentLoaded', () => {
    const slider = document.getElementById('wallet-slider');
    let isDown = false;
    let startX;
    let scrollLeft;

    if (slider) {
        slider.addEventListener('mousedown', (e) => {
            isDown = true;
            slider.style.scrollSnapType = 'none'; // 드래그 중엔 스냅 잠깐 끄기
            startX = e.pageX - slider.offsetLeft;
            scrollLeft = slider.scrollLeft;
        });
        slider.addEventListener('mouseleave', () => {
            isDown = false;
            slider.style.scrollSnapType = 'x mandatory';
        });
        slider.addEventListener('mouseup', () => {
            isDown = false;
            slider.style.scrollSnapType = 'x mandatory';
        });
        slider.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault(); // 텍스트 파랗게 선택되는 거 방지
            const x = e.pageX - slider.offsetLeft;
            const walk = (x - startX) * 1.5; // 드래그 속도 조절
            slider.scrollLeft = scrollLeft - walk;
        });
    }
});






function getKSTDate() { const now = new Date(); const utc = now.getTime() + (now.getTimezoneOffset() * 60 * 1000); return new Date(utc + (9 * 60 * 60 * 1000)); }


function getWebtoonDate() { const kst = getKSTDate(); if (kst.getHours() >= 22) kst.setDate(kst.getDate() + 1); return kst; }
function formatDate(dateObj) { return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`; }


function isWorkOnBreak(work) {
    if (work.status === '휴재' || work.status === '완결') return true;

    // 1. N연 M휴 로직
    if (work.cycle && work.cycle.includes('휴') && !work.cycle.includes('매월')) {
        let match = work.cycle.match(/(\d+)연\s*(\d+)휴\s*(\d+)주차/);
        if (match) {
            let onW = parseInt(match[1]); let curW = parseInt(match[3]);
            if (curW > onW) return true;
        }
    }

    // 2. 매월 특정 주 휴재 (5주차 없는 달 고려 로직)
    if (work.cycle && work.cycle.includes('매월')) {
        let match = work.cycle.match(/매월\s*(\d+)주차\s*휴재/);
        if (match) {
            const targetWeek = parseInt(match[1]);
            const today = getWebtoonDate();
            const currentDay = today.getDate();

            // 현재 주차 계산 (1~7=1, 8~14=2 ...)
            let currentWeek = Math.ceil(currentDay / 7);

            // [추가 로직] 만약 설정이 5주차인데, 이번 달이 4주차로 끝나는 달이고 오늘이 마지막 주라면?
            const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
            const maxWeekInMonth = Math.ceil(lastDayOfMonth / 7);

            // 유저가 설정한 주차가 해당 달의 최대 주차보다 크면, 마지막 주에 쉼
            let effectiveTarget = targetWeek;
            if (targetWeek > maxWeekInMonth) {
                effectiveTarget = maxWeekInMonth;
            }

            if (currentWeek === effectiveTarget) return true;
        }
    }

    // 3. 격주 연재 로직 (연도 역전 방어형)
    if (work.cycle && work.cycle.includes('격주 연재')) {
        let match = work.cycle.match(/\((.*?)\)/);
        if (match) {
            const today = getWebtoonDate();
            today.setHours(0, 0, 0, 0);
            const baseDate = new Date(today.getFullYear(), parseInt(match[1].split('/')[0]) - 1, parseInt(match[1].split('/')[1]));
            baseDate.setHours(0, 0, 0, 0);

            // 🌟 [핵심] 해가 바뀌었을 때(예: 지금 1월인데 카드엔 12월 적힘) 작년으로 보정
            if (baseDate.getTime() - today.getTime() > 180 * 24 * 60 * 60 * 1000) {
                baseDate.setFullYear(today.getFullYear() - 1);
            }

            const diffTime = today.getTime() - baseDate.getTime();
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays >= 0) {
                const weeksPassed = Math.floor(diffDays / 7);
                if (weeksPassed % 2 !== 0) return true; // 홀수 주차면 휴재
            }
        }
    }
}



function isDateMatch(cycleStr, dateObj) {
    if (!cycleStr || !cycleStr.includes("10일 연재")) return false;
    let match = cycleStr.match(/\((.*?)\)/);
    if (!match) return false;

    // 🌟 [수정] 숫자가 하나도 없을 때 앱이 멈추지 않도록 방어막 추가!
    let nums = match[1].match(/\d+/g);
    if (!nums) return false; // 숫자가 없으면 에러 내지 말고 조용히 무시해!

    let daysArr = nums.map(Number);
    let todayDate = dateObj.getDate();
    let lastDayOfMonth = new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0).getDate();

    for (let targetDay of daysArr) {
        if (todayDate === targetDay || (targetDay > lastDayOfMonth && todayDate === lastDayOfMonth)) return true;
    }
    return false;
}

// 다음 격주 연재일 계산기 (개발자님의 getKSTDate 활용!)
function getNextBiweeklyDate(startDateStr) {
    const today = getKSTDate();
    today.setHours(0, 0, 0, 0);

    let nextDate = new Date(startDateStr);
    nextDate.setHours(0, 0, 0, 0);

    // 기준일이 과거면 14일씩 더해서 다음 연재일 찾기
    while (nextDate < today) {
        nextDate.setDate(nextDate.getDate() + 14);
    }
    return nextDate;
}

// 격주 연재 작품이 있는지 확인해서 메뉴 띄우기
function updateBiweeklyMenuVisibility() {
    let hasBiweekly = false;
    ['lezhin', 'bomtoon', 'ridi', 'mrblue'].forEach(plt => {
        Object.keys(state[plt]).forEach(day => {
            state[plt][day].forEach(work => {
                if (work.cycle && work.cycle.includes('격주 연재')) {
                    hasBiweekly = true;
                }
            });
        });
    });

    const biweeklyMenuBtn = document.getElementById('menu-biweekly');
    if (biweeklyMenuBtn) {
        biweeklyMenuBtn.style.display = hasBiweekly ? 'block' : 'none';
    }
}

const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
let viewDay = days[getWebtoonDate().getDay()];
let currentPlatform = ''; let tempImg = ""; let editMode = false; let actionPlt = ''; let actionOrigDay = ''; let actionIdx = -1;
const STORAGE_KEY = 'WEBTOON_APP_STABLE_V1';

let state = {
    lezhin: { "월요일": [], "화요일": [], "수요일": [], "목요일": [], "금요일": [], "토요일": [], "일요일": [], "10일 연재": [], "격주 연재": [] },
    bomtoon: { "월요일": [], "화요일": [], "수요일": [], "목요일": [], "금요일": [], "토요일": [], "일요일": [], "10일 연재": [], "격주 연재": [] },
    ridi: { "월요일": [], "화요일": [], "수요일": [], "목요일": [], "금요일": [], "토요일": [], "일요일": [], "10일 연재": [], "격주 연재": [] },
    mrblue: { "월요일": [], "화요일": [], "수요일": [], "목요일": [], "금요일": [], "토요일": [], "일요일": [], "10일 연재": [], "격주 연재": [] }
};

let platformOrder = JSON.parse(localStorage.getItem('platformOrder')) || ['lezhin', 'bomtoon', 'ridi', 'mrblue'];

window.onload = function () {
    requestNotificationPermission(); // 1. 권한 확인
    loadAllData();
    cleanupIncorrectHistoryV2();
    applyTheme();
    lucide.createIcons();
    checkCoinExpiration();
    checkSaleDays();
    checkAttendanceReset();
    checkAndShowAttendPopup();
    askForDeduction();
    viewDay = days[getWebtoonDate().getDay()];
    renderAll(); initScroll();
    checkStorage(); checkBackupStatus(); updatePlatformOrder();
    checkRemoteUpdate(); // 2. 업데이트 소식 체크
    autoUpdatePastBiweeklyDates(); // 🔥 앱 처음 켤 때도 날짜 갱신 검사!
    initThemeSwitchSwipe();
};

// 🪄 태그(칩) 생성 함수
function addTag(day, text) {
    text = text.trim();
    if (!text) return;
    const tagList = document.getElementById(`tag-list-${day}`);
    const span = document.createElement('span');
    span.className = 'tag-chip';
    span.dataset.val = text; // 나중에 저장할 때 빼갈 데이터!
    span.innerHTML = `${text} <span class="tag-chip-del" onclick="this.parentElement.remove()">×</span>`;
    tagList.appendChild(span);
    // 🌟 [핵심 마법] 칩이 추가될 때마다 스크롤을 맨 아래로 끌어내려서 입력창을 무조건 보여주기!
    setTimeout(() => {
        const wrapper = tagList.parentElement;
        if (wrapper) wrapper.scrollTop = wrapper.scrollHeight;
    }, 10);
}

// 🪄 엔터, 쉼표, 더블스페이스, 백스페이스 감지 센서 설치!
document.addEventListener("DOMContentLoaded", () => {
    const dayList = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일', '10일 연재', '격주 연재'];
    dayList.forEach(day => {
        const input = document.getElementById(`batch-input-${day}`);
        const tagList = document.getElementById(`tag-list-${day}`);
        if (!input || !tagList) return;

        // 1. [키보드 누를 때] 폼 제출 방지 및 백스페이스 삭제
        input.addEventListener('keydown', function (e) {
            if (e.isComposing) return;

            if (e.key === 'Enter') {
                e.preventDefault();
                addTag(day, this.value);
                this.value = '';
            } else if (e.key === 'Backspace' && this.value === '') {
                if (tagList.lastChild) {
                    tagList.removeChild(tagList.lastChild);
                }
            }
        });

        // 2. 🌟 [핵심] 글자가 입력될 때 (복붙 포함) 줄바꿈(\n), 쉼표(,), 더블스페이스 즉시 감지!
        input.addEventListener('input', function (e) {
            if (this.value.includes('\n') || this.value.includes(',') || this.value.includes('  ')) {
                // 엔터나 쉼표가 들어오면 싹 다 쪼개버리기!
                const parts = this.value.split(/[\n,]+|\s{2,}/).map(t => t.trim()).filter(t => t !== "");
                this.value = ''; // 입력창 싹 비우기
                parts.forEach(p => addTag(day, p));
            }
        });
    });
});

// 🎛️ 모달창 단일/일괄 스위치 변신 함수!
function setAddMode(mode) {
    const btnSingle = document.getElementById('btn-mode-single');
    const btnBatch = document.getElementById('btn-mode-batch');
    const sectionSingle1 = document.getElementById('single-add-section-1');
    const sectionSingle2 = document.getElementById('single-add-section-2');
    const sectionBatch = document.getElementById('batch-add-section');
    const templateArea = document.getElementById('template-recommend-area');

    // 🌟 요일/상태 공통 부모 박스와 모달창 제목 찾기!
    const commonArea = document.getElementById('day-selection-area').parentElement;
    const modalTitle = document.getElementById('modal-title-label'); // 👈 제목 요소 가져오기

    // 🌟 현재 선택된 플랫폼의 한글 이름 변환기
    const pltNames = { lezhin: '레진', bomtoon: '봄툰', ridi: '리디', mrblue: '미블' };
    const currentPltName = pltNames[currentPlatform] || '';

    if (mode === 'single') {
        // 단일 추가 버튼 불 켜기
        btnSingle.style.background = '#fff'; btnSingle.style.color = '#333'; btnSingle.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
        btnBatch.style.background = 'transparent'; btnBatch.style.color = '#888'; btnBatch.style.boxShadow = 'none';

        sectionSingle1.style.display = 'block';
        sectionSingle2.style.display = 'block';
        sectionBatch.style.display = 'none';

        // 단일 모드일 땐 다시 보여주기!
        if (commonArea) commonArea.style.display = 'flex';

        if (templateArea && document.getElementById('template-chips-container').innerHTML.trim() !== "") {
            templateArea.style.display = 'block';
        }

        // 🌟 [핵심] 단일 추가 탭일 때는 원래대로 "작품 추가"로 복구!
        modalTitle.textContent = "작품 추가";

    } else {
        // 일괄 추가 버튼 불 켜기
        btnBatch.style.background = '#fff'; btnBatch.style.color = '#333'; btnBatch.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
        btnSingle.style.background = 'transparent'; btnSingle.style.color = '#888'; btnSingle.style.boxShadow = 'none';

        sectionSingle1.style.display = 'none';
        sectionSingle2.style.display = 'none';
        // 바둑판 그리드 활성화
        sectionBatch.style.display = 'grid';

        // 일괄 모드일 땐 헷갈리는 요일/상태 선택창 싹 숨기기!
        if (commonArea) commonArea.style.display = 'none';

        if (templateArea) templateArea.style.display = 'none';

        // 🌟 [핵심] 일괄 추가 탭일 때는 제목 옆에 (플랫폼) 이름 딱 박아주기!
        modalTitle.textContent = `작품 추가 (${currentPltName})`;
    }
}


function checkAndShowAttendPopup() {
    const lAttend = localStorage.getItem('lezhinAttend') === 'true';
    const bAttend = localStorage.getItem('bomtoonAttend') === 'true';
    let missing = [];
    if (!lAttend) missing.push("레진"); if (!bAttend) missing.push("봄툰");
    if (missing.length > 0) {
        document.getElementById('attend-missing-text').innerHTML = `(현재 <b>${missing.join(', ')}</b> 출석 전입니다)`;
        document.getElementById('attend-warning-modal').style.display = 'flex';
    }
}

// 📊 24시간 레진 보너스 코인 소멸 검사기
function checkCoinExpiration() {
    const expireTime = localStorage.getItem('lezhinBonusExpire');

    // 1. 타이머가 존재하고 & 2. 현재 시간이 타이머 시간을 넘어섰다면?!
    if (expireTime && Date.now() > parseInt(expireTime)) {

        // 유저의 현재 레진 코인 잔액을 가져옵니다. (우니님 변수명 lWallet)
        let currentLezhinCoins = parseInt(localStorage.getItem('lWallet') || 0);

        // 코인이 0보다 클 때만 1코인을 뺏어옵니다. (마이너스 통장 방지)
        if (currentLezhinCoins > 0) {
            localStorage.setItem('lWallet', currentLezhinCoins - 1); // 1코인 뺏어서 저장

            // 유저에게 친절하게(하지만 슬프게) 알려주기
            alert('레진 출석 보너스(1C)를 24시간 내에 사용하지 않아 소멸되었어요.');

            // 화면 지갑 잔액 즉시 새로고침
            refreshBalance();
        }

        // 폭탄이 터졌으니 타이머 기록은 지워줍니다.
        localStorage.removeItem('lezhinBonusExpire');
    }
}


function openNav() {
    checkStorage();
    updateBiweeklyMenuVisibility();
    document.getElementById("side-nav").style.display = "flex";

    // 햄버거 버튼 뒤로 숨기기 (글라스모피즘 겹침 방지)
    const topBar = document.querySelector('.top-util-bar');
    if (topBar) topBar.style.opacity = '0';
}

function closeNav() {
    document.getElementById("side-nav").style.display = "none";

    // 햄버거 버튼 다시 나타나게 하기
    const topBar = document.querySelector('.top-util-bar');
    if (topBar) topBar.style.opacity = '1';
}

function handleMenuAction(type, value) {
    if (type === 'toggleOrder') {
        changePlatformOrder();
    }
    else if (type === 'darkMode') { toggleDarkMode(); }
    else if (type === 'day') { changeDay(value); }
    closeNav();
}

// 💡 마법의 드래그 변수 하나 더 준비!
let pltSortable = null;

// 1. 플랫폼 설정 모달창 열기
function openPlatformSettingModal() {
    closeNav();
    const listEl = document.getElementById('platform-sort-list');
    listEl.innerHTML = '';

    const pltNames = { lezhin: '레진코믹스', bomtoon: '봄툰', ridi: '리디', mrblue: '미스터블루' };
    const allPlts = ['lezhin', 'bomtoon', 'ridi', 'mrblue'];

    // 켜져 있는 애들을 먼저 위로 올리고, 꺼진 애들은 밑에 배치
    let activePlts = [...platformOrder];
    let inactivePlts = allPlts.filter(p => !platformOrder.includes(p));
    let displayPlts = [...activePlts, ...inactivePlts];

    displayPlts.forEach(plt => {
        const isChecked = activePlts.includes(plt) ? 'checked' : '';
        const div = document.createElement('div');
        div.className = 'plt-setting-item';
        div.dataset.plt = plt; // 플랫폼 아이디 기억하기

        div.innerHTML = `
                    <div class="plt-setting-left">
                        <span class="drag-handle">≡</span>
                        <span class="plt-setting-name">${pltNames[plt]}</span>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" class="plt-toggle" value="${plt}" ${isChecked}>
                        <span class="toggle-slider"></span>
                    </label>
                `;
        listEl.appendChild(div);
    });

    // 🪄 여기서 작품 드래그할 때 썼던 SortableJS 재활용!!!
    if (pltSortable) pltSortable.destroy();
    pltSortable = new Sortable(listEl, {
        animation: 150,
        handle: '.drag-handle',
        ghostClass: 'sortable-ghost'
    });

    document.getElementById('platform-setting-modal').style.display = 'flex';
}

// 2. 모달 닫기
function closePlatformSettingModal() {
    document.getElementById('platform-setting-modal').style.display = 'none';
}

// 3. 변경된 순서와 스위치 상태 저장하기!
function savePlatformSetting() {
    const listEl = document.getElementById('platform-sort-list');
    const items = listEl.querySelectorAll('.plt-setting-item');

    let newOrder = [];

    // 위에서부터 순서대로 쭉 읽으면서, 스위치 켜진 애들만 장바구니에 담기
    items.forEach(item => {
        const plt = item.dataset.plt;
        const isChecked = item.querySelector('.plt-toggle').checked;
        if (isChecked) {
            newOrder.push(plt);
        }
    });

    // 🚨 전부 다 끄면 앱이 고장 나니까 막아주기!
    if (newOrder.length === 0) {
        return alert("최소 1개 이상의 플랫폼은 켜두셔야 합니다!");
    }

    // 진짜 저장!
    platformOrder = newOrder;
    localStorage.setItem('platformOrder', JSON.stringify(platformOrder));
    saveData();

    // 화면 레이아웃 즉시 새로고침
    updatePlatformOrder();
    renderAll();
    closePlatformSettingModal();
}

function openCalcModal() {
    closeNav();

    // 계산기 열 때마다 드롭다운 초기화
    const pltSelect = document.getElementById('calc-platform');
    if (pltSelect) { pltSelect.value = 'coin'; updateCalcLabels(); }

    document.getElementById('calc-total').value = '';
    document.getElementById('calc-current').value = '';
    document.getElementById('calc-price').value = '';

    // 코인백 초기화
    document.getElementById('calc-coinback-toggle').checked = false;
    document.getElementById('calc-coinback-percent').value = '';
    toggleCoinbackInput();

    document.getElementById('calc-result-box').style.display = 'none';
    document.getElementById('calc-modal').style.display = 'flex';

    // 🌟 [추가] 창 열리면 '작품 총 화수' 칸에 바로 숫자 입력할 수 있게!
    setTimeout(() => document.getElementById('calc-total').focus(), 100);
}

function closeCalcModal() {
    document.getElementById('calc-modal').style.display = 'none';
}

function toggleCoinbackInput() {
    const isChecked = document.getElementById('calc-coinback-toggle').checked;
    document.getElementById('calc-coinback-area').style.display = isChecked ? 'block' : 'none';


    if (!isChecked) {
        const resultArea = document.getElementById('calc-coinback-result');
        if (resultArea) resultArea.style.display = 'none';
    }
}

// 신규: 드롭다운 선택 시 글씨(코인/캐시/원) 알아서 바꿔주고, 입력창 싹 초기화!
function updateCalcLabels() {
    const plt = document.getElementById('calc-platform').value;
    const priceLabel = document.getElementById('calc-price-label');
    if (plt === 'cash') priceLabel.textContent = '1화당 캐시 (리디)';
    else if (plt === 'won') priceLabel.textContent = '1화당 머니 (미블)';
    else priceLabel.textContent = '1화당 코인 (레진/봄툰)';

    // 🌟 [추가] 플랫폼이 바뀔 때마다 모든 입력창과 결과창을 아주 깨끗하게 초기화합니다!
    document.getElementById('calc-total').value = '';
    document.getElementById('calc-current').value = '';
    document.getElementById('calc-price').value = '';

    // 코인백 체크박스와 퍼센트도 끄기
    const coinbackToggle = document.getElementById('calc-coinback-toggle');
    if (coinbackToggle) {
        coinbackToggle.checked = false;
        toggleCoinbackInput(); // 체크 풀렸으니 알아서 숨겨주는 함수 실행!
    }
    document.getElementById('calc-coinback-percent').value = '';

    // 열려있던 결과창 닫기
    document.getElementById('calc-result-box').style.display = 'none';
}

let currentCalcCoin = 0;

// 수정: 계산기 로직 (JS에 숨어있던 인라인 색상 주입 로직 완전 제거!)
function calculateCoins() {
    const total = parseInt(document.getElementById('calc-total').value) || 0;
    const current = parseInt(document.getElementById('calc-current').value) || 0;
    const price = parseInt(document.getElementById('calc-price').value) || 0;
    const plt = document.getElementById('calc-platform') ? document.getElementById('calc-platform').value : 'coin';

    if (total === 0 || total <= current) {
        alert("총 화수가 현재 진도보다 커야 계산할 수 있어요!");
        return;
    }

    const remainEp = total - current;
    const needCoin = remainEp * price;
    currentCalcCoin = needCoin;

    // 🌟 플랫폼별 단위 세팅 (복잡했던 색상 로직은 싹 지웠습니다!)
    let unit = 'C';
    if (plt === 'cash') { unit = '캐시'; }
    else if (plt === 'won') { unit = '머니'; }

    // 🌟 결과 적용 (쉼표 포맷팅 + 맞춤 단위 글씨)
    document.getElementById('calc-remain-ep').textContent = formatNum(remainEp);
    const needCoinEl = document.getElementById('calc-need-coin');
    needCoinEl.textContent = formatNum(needCoin) + ' ' + unit;
    // 🚨 숨어있던 인라인 스타일 (needCoinEl.style.color = color;) 박멸!

    // 🌟 코인백 로직 계산
    const isCoinback = document.getElementById('calc-coinback-toggle').checked;
    const coinbackResultArea = document.getElementById('calc-coinback-result');

    if (isCoinback) {
        const percent = parseInt(document.getElementById('calc-coinback-percent').value) || 0;
        // 돌려받는 코인 계산 (소수점 버림)
        const backCoin = Math.floor(needCoin * (percent / 100));
        // 돌려받은 코인으로 더 볼 수 있는 화수 계산
        const extraEp = Math.floor(backCoin / price);

        document.getElementById('calc-back-coin').textContent = formatNum(backCoin) + ' ' + unit;
        document.getElementById('calc-extra-ep').textContent = formatNum(extraEp);
        // 🚨 숨어있던 인라인 스타일 (calc-extra-ep.style.color = color;) 박멸!

        coinbackResultArea.style.display = 'block';
    } else {
        coinbackResultArea.style.display = 'none';
    }

    document.getElementById('calc-result-box').style.display = 'block';
}


// 🌟 [통합 결제 시스템] 지갑 차감 + 가계부 작성 + 통계 업데이트를 한 번에!
function executeDeduction(plt, title, amount) {
    if (amount <= 0) return;

    let remainingAmount = amount; // 🌟 깎아야 할 '남은 결제 금액' (처음엔 총 금액)

    // 1. 소멸 예정 코인 먼저 확인 및 최우선 차감!
    let expireData = JSON.parse(localStorage.getItem(plt + 'Expire'));
    if (expireData && expireData.amount) {
        let expAmt = parseInt(expireData.amount) || 0;

        if (expAmt > 0) {
            if (expAmt >= remainingAmount) {
                // 🟢 소멸 코인이 더 많거나 같을 때: 소멸 코인으로 전액 방어!
                expAmt -= remainingAmount;
                remainingAmount = 0; // 본 지갑에서 뺄 돈은 0원이 됨!
            } else {
                // 🔴 소멸 코인이 부족할 때: 소멸 코인 싹 다 긁어 쓰고, 남은 금액 갱신
                remainingAmount -= expAmt;
                expAmt = 0;
            }

            // 소멸 코인 잔액 업데이트 (다 썼으면 영구 삭제)
            if (expAmt <= 0) {
                localStorage.removeItem(plt + 'Expire');
            } else {
                expireData.amount = expAmt;
                localStorage.setItem(plt + 'Expire', JSON.stringify(expireData));
            }
        }
    }

    // 2. 소멸 코인으로 막고 '남은 금액'만 본 지갑에서 깎기!
    if (remainingAmount > 0) {
        const prefix = plt.charAt(0); // l, b, r, m
        let currentWallet = parseInt(localStorage.getItem(prefix + 'Wallet') || 0);
        localStorage.setItem(prefix + 'Wallet', currentWallet - remainingAmount);
    }

    // 3. 이번 달 월말정산에 내역 적기 (기록은 본 지갑, 소멸 코인 합친 총액(amount)으로 기록!)
    const todayKST = getKSTDate();
    const monthKey = `${todayKST.getFullYear()}-${String(todayKST.getMonth() + 1).padStart(2, '0')}`;
    let monthlyHistory = JSON.parse(localStorage.getItem('monthlyHistory')) || {};
    if (!monthlyHistory[monthKey]) monthlyHistory[monthKey] = { lezhin: {}, bomtoon: {}, ridi: {}, mrblue: {} };
    if (!monthlyHistory[monthKey][plt][title]) monthlyHistory[monthKey][plt][title] = 0;

    monthlyHistory[monthKey][plt][title] += amount;
    localStorage.setItem('monthlyHistory', JSON.stringify(monthlyHistory));

    // 4. 주간 통계(홈 화면)에 누적하기
    if (plt === 'ridi' || plt === 'mrblue') {
        addWeeklySpent(0, amount); // 원/캐시는 뒤쪽으로
    } else {
        addWeeklySpent(amount, 0); // 코인은 앞쪽으로
    }

    // 5. 결제한 플랫폼이 레진이라면, 폭탄 타이머를 해체(삭제)합니다!
    if (plt === 'lezhin') {
        localStorage.removeItem('lezhinBonusExpire');
    }

    // 마무리 저장 및 갱신
    saveData();
    refreshBalance();

    let unitStr = '코인';
    if (plt === 'ridi') unitStr = '캐시';
    else if (plt === 'mrblue') unitStr = '머니';
    alert(`성공! [${title}] 작품에 ${formatNum(amount)} 만큼 차감되고 월말정산에 기록되었습니다!`);
}

// 🌟 [신규] 계산기에서 바로 차감 버튼 눌렀을 때 작동하는 함수
function deductFromCalculator() {
    if (currentCalcCoin <= 0) return alert("차감할 금액이 없습니다!");

    let targetPlt = document.getElementById('calc-platform').value;
    let exactPlt = '';

    // 계산기엔 레진/봄툰이 'coin'으로 묶여 있어서 한번 물어봅니다!
    if (targetPlt === 'cash') exactPlt = 'ridi';
    else if (targetPlt === 'won') exactPlt = 'mrblue';
    else {
        let choice = prompt("어느 플랫폼 지갑에서 뺄까요?\n[1] 레진  [2] 봄툰");
        if (choice === '1') exactPlt = 'lezhin';
        else if (choice === '2') exactPlt = 'bomtoon';
        else return alert("차감이 취소되었습니다.");
    }

    // 🌟 [신규 로직] 선택된 플랫폼에 맞춰서 진짜 단위를 꺼내옵니다!
    let unitStr = '코인';
    if (exactPlt === 'ridi') unitStr = '캐시';
    else if (exactPlt === 'mrblue') unitStr = '머니';

    // 🌟 [수정] '원' 대신 진짜 단위(unitStr)를 넣어서 자연스럽게 물어보기!
    const workTitle = prompt(`총 ${formatNum(currentCalcCoin)} ${unitStr} 차감됩니다.\n월말정산에 기록될 '작품 이름'을 적어주세요!`);

    if (!workTitle) return alert("작품 이름이 없어 차감이 취소되었습니다.");

    executeDeduction(exactPlt, workTitle, currentCalcCoin);
    closeCalcModal();
}

// [통합 정산 시스템] 4개 플랫폼 담을 바구니 완벽 준비!
let pendingDeductions = { lezhin: [], bomtoon: [], ridi: [], mrblue: [] };
let pendingDaysStr = "";
let isTodayDeduction = false;

function deductToday() {
    closeNav();
    const webtoonDate = getWebtoonDate();
    const nowStr = formatDate(webtoonDate);
    let last = localStorage.getItem('lastCheckDate');
    let lastPartial = localStorage.getItem('lastPartialDeductDate'); // 🌟 [신규] 일부 정산 메모장 확인!

    // 🌟 [수정] 싹 다 정산해서 내일로 넘어간 경우 OR 오늘 일부만 정산한 경우 둘 다 감지!
    let alreadyFinishedToday = (last && last > nowStr) || (lastPartial === nowStr);

    isTodayDeduction = true;
    pendingDeductions = { lezhin: [], bomtoon: [], ridi: [], mrblue: [] };
    pendingDaysStr = "오늘";
    const todayObj = getWebtoonDate();
    const d = days[todayObj.getDay()];

    let hasUnpaidWorks = false;

    // [핵심] platformOrder(사용자가 켠 플랫폼)만 순회합니다!
    platformOrder.forEach(plt => {
        (state[plt][d] || []).forEach((w, i) => {
            if (!isWorkOnBreak(w) && w.lastDeductDate !== nowStr) {
                pendingDeductions[plt].push({ day: d, idx: i, work: w });
                hasUnpaidWorks = true;
            }
        });
        (state[plt]["10일 연재"] || []).forEach((w, i) => {
            if (!isWorkOnBreak(w) && isDateMatch(w.cycle, todayObj) && w.lastDeductDate !== nowStr) {
                pendingDeductions[plt].push({ day: "10일 연재", idx: i, work: w });
                hasUnpaidWorks = true;
            }
        });

        (state[plt]["격주 연재"] || []).forEach((w, i) => {
            if (!isWorkOnBreak(w) && w.cycle && w.cycle.includes('격주 연재') && w.lastDeductDate !== nowStr) {
                let match = w.cycle.match(/\((.*?)\)/);
                if (match) {
                    const cd = new Date(todayObj.getFullYear(), parseInt(match[1].split('/')[0]) - 1, parseInt(match[1].split('/')[1]));
                    if (cd.getTime() - todayObj.getTime() > 180 * 24 * 60 * 60 * 1000) cd.setFullYear(todayObj.getFullYear() - 1);

                    if (!isNaN(cd) && cd.getMonth() === todayObj.getMonth() && cd.getDate() === todayObj.getDate()) {
                        pendingDeductions[plt].push({ day: "격주 연재", idx: i, work: w });
                        hasUnpaidWorks = true;
                    }
                }
            }
        });
    });

    // 1. 아예 오늘 볼 게 없거나 남은 걸 전부 결제했을 때
    if (!hasUnpaidWorks) {
        alert("오늘은 더 이상 정산할 연재 작품이 없습니다! 편안히 쉬세요!");
        isTodayDeduction = false;
        return;
    }

    // 🌟 [수정] 팝업 멘트를 조금 더 자연스럽게 통합했습니다!
    if (alreadyFinishedToday) {
        if (!confirm("오늘 이미 미리 정산을 진행하셨습니다.\n남은 작품이나 새로 추가된 작품을 마저 정산하시겠습니까?")) {
            isTodayDeduction = false;
            return;
        }
    }

    // 3. 정상적으로 정산 모달 띄우기
    showDeductionModal();
}

function askForDeduction() {
    const webtoonDate = getWebtoonDate(); const nowStr = formatDate(webtoonDate); let last = localStorage.getItem('lastCheckDate');
    if (!last) { last = nowStr; localStorage.setItem('lastCheckDate', nowStr); }

    const dayOfWeek = webtoonDate.getDay(); const mondayDate = new Date(webtoonDate); mondayDate.setDate(webtoonDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
    const weekStr = formatDate(mondayDate);

    // 🌟 [자동 업데이트] 새로운 주가 시작되었을 때 실행
    if (localStorage.getItem('currentWeekStr') !== weekStr) {
        localStorage.setItem('currentWeekStr', weekStr);
        localStorage.setItem('weeklySpent', 0);
        localStorage.setItem('weeklySpentWon', 0);

        // 🔥 모든 플랫폼의 모든 작품을 돌며 주기를 자동으로 +1주 합니다.
        ['lezhin', 'bomtoon', 'ridi', 'mrblue'].forEach(plt => {
            Object.keys(state[plt]).forEach(day => {
                state[plt][day].forEach(work => {
                    // 🌟 [수정] 10일 연재가 섞여 있든 말든, 'N연 M휴'라는 글씨만 있으면 무조건 통과!
                    if (work.cycle && /\d+연\s*\d+휴/.test(work.cycle)) {
                        work.cycle = autoIncrementCycleText(work.cycle);
                    }
                });
            });
        });

        // 변경된 주기를 금고에 영구 저장!
        saveData();
        console.log("새로운 주가 시작되어 모든 작품의 연재 주기를 업데이트했습니다. 🚀");
    }

    if (last < nowStr) {
        let checkParts = last.split('-'); let check = new Date(checkParts[0], checkParts[1] - 1, checkParts[2]);
        pendingDeductions = { lezhin: [], bomtoon: [], ridi: [], mrblue: [] }; let ds = [];

        while (formatDate(check) < nowStr) {
            let d = days[check.getDay()]; if (!ds.includes(d)) ds.push(d);
            const checkStr = formatDate(check); // 🌟 [핵심] 영수증 날짜 생성!

            // [핵심] 여기서도 켠 플랫폼만 밀린 정산 체크!
            platformOrder.forEach(plt => {
                // 🚨🚨 요일 일반 연재: && w.lastDeductDate !== checkStr 추가!
                (state[plt][d] || []).forEach((w, i) => { if (!isWorkOnBreak(w) && w.lastDeductDate !== checkStr) pendingDeductions[plt].push({ day: d, idx: i, work: w }); });

                // 🚨🚨 10일 연재: && w.lastDeductDate !== checkStr 추가!
                (state[plt]["10일 연재"] || []).forEach((w, i) => { if (!isWorkOnBreak(w) && isDateMatch(w.cycle, check) && w.lastDeductDate !== checkStr) pendingDeductions[plt].push({ day: "10일 연재", idx: i, work: w }); });

                // 🌟 [최종 추가 2] 밀린 정산 할 때도 격주 연재 방 확인해!
                (state[plt]["격주 연재"] || []).forEach((w, i) => {
                    // 🚨🚨 격주 연재: && w.lastDeductDate !== checkStr 추가!
                    if (!isWorkOnBreak(w) && w.cycle && w.cycle.includes('격주 연재') && w.lastDeductDate !== checkStr) {
                        let match = w.cycle.match(/\((.*?)\)/);
                        if (match) {
                            // 🌟 연도 보정 포함된 날짜 생성
                            const cd = new Date(check.getFullYear(), parseInt(match[1].split('/')[0]) - 1, parseInt(match[1].split('/')[1]));
                            if (cd.getTime() - check.getTime() > 180 * 24 * 60 * 60 * 1000) cd.setFullYear(check.getFullYear() - 1);

                            if (!isNaN(cd) && cd.getMonth() === check.getMonth() && cd.getDate() === check.getDate()) {
                                pendingDeductions[plt].push({ day: "격주 연재", idx: i, work: w });
                            }
                        }
                    }
                });
            });

            check.setDate(check.getDate() + 1);
        }

        const hasWorks = platformOrder.some(plt => pendingDeductions[plt].length > 0);
        if (hasWorks) {
            pendingDaysStr = ds.join(', '); showDeductionModal(); return;
        } else {
            localStorage.setItem('lastCheckDate', nowStr);
        }
    }
    updateWeeklyStatUI();
}

function showDeductionModal() {
    const listEl = document.getElementById('deduction-list'); listEl.innerHTML = '';

    let popupMsg = isTodayDeduction ? `오늘(${pendingDaysStr}) 볼 작품을 미리 정산할까요?` : `어제(${pendingDaysStr}) 본 작품 정산을 진행할까요?`;
    const todayDate = getKSTDate().getDate();
    // 할인일 알림도 켠 플랫폼만 뜨게 예외 처리!
    if (todayDate === 20 && platformOrder.includes('lezhin')) popupMsg += `<br><span style="color:#e60012; font-size:12px; font-weight:bold;">(오늘 레진 20일 코인 할인 날이에요!)</span>`;
    if (todayDate === 22 && platformOrder.includes('bomtoon')) popupMsg += `<br><span style="color:#ff69b4; font-size:12px; font-weight:bold;">(오늘 봄툰 22일 코인 할인 날이에요!)</span>`;
    document.getElementById('deduction-msg').innerHTML = popupMsg;

    // [핵심] 정산 팝업 리스트도 켠 플랫폼만!
    platformOrder.forEach(plt => {
        pendingDeductions[plt].forEach((item, i) => {
            let pltName = '', color = '', unit = 'C';
            if (plt === 'lezhin') { pltName = '레진'; color = '#e60012'; }
            else if (plt === 'bomtoon') { pltName = '봄툰'; color = '#ff69b4'; }
            else if (plt === 'ridi') { pltName = '리디'; color = '#1e90ff'; unit = '캐시'; }
            else if (plt === 'mrblue') { pltName = '미블'; color = '#004e9a'; unit = '원'; }

            const div = document.createElement('div');
            div.style.display = 'flex'; div.style.justifyContent = 'space-between'; div.style.marginBottom = '8px'; div.style.fontSize = '14px';
            div.innerHTML = `
                        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; width:100%;">
                            <input type="checkbox" id="deduct-chk-${plt}-${i}" checked style="width:16px; height:16px; margin:0;">
                            <span style="flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">[${pltName}] ${item.work.title}</span>
                            <span style="color:${color}; font-weight:bold;">${item.work.coin} ${unit}</span>
                        </label>`;
            listEl.appendChild(div);
        });
    });
    document.getElementById('deduction-modal').style.display = 'flex';
}






// 🌟 [최종 진화] 주차도 올려주고, 격주 날짜도 14일 더해주는 짬짜면 만능 계산기
function autoIncrementCycleText(cyc) {
    if (!cyc) return cyc;

    // 1. 'N연 M휴 K주차' 숫자 올리기 (🚨 return 하지 않고 cyc 변수에 덮어쓰기만 합니다!)
    if (/\d+연\s*\d+휴/.test(cyc)) {
        cyc = cyc.replace(/(\d+)연\s*(\d+)휴\s*(\d+)주차/, (match, run, rest, currentWeek) => {
            let maxCycle = parseInt(run) + parseInt(rest);
            let nextWeek = parseInt(currentWeek) + 1;
            // 주차가 최대치를 넘어가면 다시 1주차로 롤백!
            return `${run}연 ${rest}휴 ${nextWeek > maxCycle ? 1 : nextWeek}주차`;
        });
    }

    // 2. 격주 연재 날짜(4/10)에 14일 더하기 (🚨 마찬가지로 cyc 변수에 덮어쓰기!)
    if (cyc.includes('격주 연재')) {
        let match = cyc.match(/\((.*?)\)/);
        if (match) {
            let parts = match[1].split('/');
            if (parts.length === 2) {
                let today = getWebtoonDate();
                let tempDate = new Date(today.getFullYear(), parseInt(parts[0]) - 1, parseInt(parts[1]));

                // 🌟 해가 바뀌었을 때 보정
                if (tempDate.getTime() - today.getTime() > 180 * 24 * 60 * 60 * 1000) {
                    tempDate.setFullYear(today.getFullYear() - 1);
                }

                tempDate.setDate(tempDate.getDate() + 14);

                // 🌟 다른 글씨(10일 연재 등)는 가만히 두고, 격주 연재 부분만 쏙 바꿔치기!
                cyc = cyc.replace(/격주 연재\s*\((.*?)\)/, `격주 연재 (${tempDate.getMonth() + 1}/${tempDate.getDate()})`);
            }
        }
    }

    // 3. 모든 계산이 끝난 최종 결과물을 여기서 딱 한 번만 반환! 퇴근! 🏃‍♂️💨
    return cyc;
}



// 🌟 [진짜 최종 복구본] 당일 밤 10시가 지나면, 칼같이 '다음 업데이트 날짜'로 미리 바꿔주는 마법!
function autoUpdatePastBiweeklyDates() {
    let isUpdated = false;
    const today = getWebtoonDate(); // 웹툰 기준 시간 (+2시간 보정)
    today.setHours(0, 0, 0, 0);

    ['lezhin', 'bomtoon', 'ridi', 'mrblue'].forEach(plt => {
        Object.keys(state[plt]).forEach(day => {
            state[plt][day].forEach(work => {
                if (work.cycle && work.cycle.includes('격주 연재')) {
                    let match = work.cycle.match(/\((.*?)\)/);
                    if (match) {
                        let parts = match[1].split('/');
                        if (parts.length === 2) {
                            let tMonth = parseInt(parts[0]) - 1;
                            let tDate = parseInt(parts[1]);

                            let targetDate = new Date(today.getFullYear(), tMonth, tDate);
                            targetDate.setHours(0, 0, 0, 0);

                            // 🌟 [추가] 해가 바뀌었을 때(1월인데 카드에 12월이 적힌 경우) 작년으로 계산하게 하는 타임머신!
                            if (targetDate.getTime() - today.getTime() > 180 * 24 * 60 * 60 * 1000) {
                                targetDate.setFullYear(today.getFullYear() - 1);
                            }

                            // 🌟 [수정] 카드에 적힌 날짜(targetDate)로 정산 도장이 찍혔는지 확인!
                            const targetDateStr = formatDate(targetDate);
                            if (targetDate < today) {
                                // 도장이 카드 날짜와 일치하거나, 혹은 아예 어제 이전의 날짜라면 워프!
                                if (work.lastDeductDate === targetDateStr || (today - targetDate) > 24 * 60 * 60 * 1000) {
                                    while (targetDate < today) {
                                        targetDate.setDate(targetDate.getDate() + 14);
                                    }
                                    work.cycle = work.cycle.replace(/\(.*?\)/, `(${targetDate.getMonth() + 1}/${targetDate.getDate()})`);
                                    isUpdated = true;
                                }
                            }
                        }
                    }
                }
            });
        });
    });

    if (isUpdated) {
        saveData();
        console.log("당일 연재가 종료되어, 다음 격주 업데이트 날짜로 갱신되었습니다!");
    }
}

function processDeduction() {
    let tL = 0, tB = 0, tR = 0, tM = 0;
    let checkedCount = 0;
    let totalPendingCount = 0; // 🌟 [핵심] 모달창에 뜬 전체 작품 개수 확인용!

    const todayKST = getKSTDate();
    const webtoonDate = getWebtoonDate();
    const nowStr = formatDate(webtoonDate);

    const monthKey = `${todayKST.getFullYear()}-${String(todayKST.getMonth() + 1).padStart(2, '0')}`;
    let monthlyHistory = JSON.parse(localStorage.getItem('monthlyHistory')) || {};

    if (!monthlyHistory[monthKey]) {
        monthlyHistory[monthKey] = { lezhin: {}, bomtoon: {}, ridi: {}, mrblue: {} };
    }

    platformOrder.forEach(plt => {
        totalPendingCount += pendingDeductions[plt].length; // 🌟 대기 중인 전체 작품 갯수 합산!

        pendingDeductions[plt].forEach((item, i) => {
            const chk = document.getElementById(`deduct-chk-${plt}-${i}`);

            if (chk && chk.checked) {
                checkedCount++;
                const costVal = parseInt(item.work.coin) || 0;

                if (plt === 'lezhin') tL += costVal;
                else if (plt === 'bomtoon') tB += costVal;
                else if (plt === 'ridi') tR += costVal;
                else if (plt === 'mrblue') tM += costVal;

                if (costVal > 0) {
                    if (!monthlyHistory[monthKey][plt][item.work.title]) {
                        monthlyHistory[monthKey][plt][item.work.title] = 0;
                    }
                    monthlyHistory[monthKey][plt][item.work.title] += costVal;
                }

                if (item.work.id) {
                    Object.keys(state[plt]).forEach(d => {
                        state[plt][d].forEach(w => {
                            if (w.id === item.work.id) w.lastDeductDate = nowStr;
                        });
                    });
                } else {
                    item.work.lastDeductDate = nowStr;
                }
            }
        });
    });

    if (checkedCount > 0) {
        if (tL > 0 || tB > 0 || tR > 0 || tM > 0) {
            const deductFromWallet = (plt, totalAmount, prefix) => {
                if (totalAmount <= 0) return;
                let remaining = totalAmount;

                let expireData = JSON.parse(localStorage.getItem(plt + 'Expire'));
                if (expireData && expireData.amount) {
                    let expAmt = parseInt(expireData.amount) || 0;
                    if (expAmt > 0) {
                        if (expAmt >= remaining) {
                            expAmt -= remaining;
                            remaining = 0;
                        } else {
                            remaining -= expAmt;
                            expAmt = 0;
                        }

                        if (expAmt <= 0) localStorage.removeItem(plt + 'Expire');
                        else {
                            expireData.amount = expAmt;
                            localStorage.setItem(plt + 'Expire', JSON.stringify(expireData));
                        }
                    }
                }

                if (remaining > 0) {
                    let currentWallet = parseInt(localStorage.getItem(prefix + 'Wallet') || 0);
                    localStorage.setItem(prefix + 'Wallet', currentWallet - remaining);
                }
            };

            deductFromWallet('lezhin', tL, 'l');
            deductFromWallet('bomtoon', tB, 'b');
            deductFromWallet('ridi', tR, 'r');
            deductFromWallet('mrblue', tM, 'm');


            if (tL > 0) {
                localStorage.removeItem('lezhinBonusExpire');
            }

            const addedWon = tR + tM;
            addWeeklySpent(tL + tB, addedWon);
            localStorage.setItem('monthlyHistory', JSON.stringify(monthlyHistory));
        }

        saveData();

        let msg = "성공적으로 정산되었습니다!\n";
        if (tL > 0) msg += `- 레진 정산: ${tL} C\n`;
        if (tB > 0) msg += `- 봄툰 정산: ${tB} C\n`;
        if (tR > 0) msg += `- 리디 정산: ${tR} 캐시\n`;
        if (tM > 0) msg += `- 미블 정산: ${tM} 머니\n`;

        if (tL === 0 && tB === 0 && tR === 0 && tM === 0) {
            msg += "(무료 감상 등 0원 정산 완료!)";
        }

        alert(msg);
    } else {
        alert("선택된 작품이 없어 정산되지 않았습니다.");
    }

    // 🌟 [수정] 유저가 체크박스를 끄고 일부만 정산했다면!
    if (checkedCount < totalPendingCount) {
        isTodayDeduction = false; // 내일로 넘어가는 건 막아두되,
        localStorage.setItem('lastPartialDeductDate', nowStr); // 🌟 '오늘 일부 정산했다'는 흔적을 남겨서 다음 번에 경고 팝업을 띄우게 만듭니다!
    } else {
        // 전부 다 정산했으면 찌꺼기 기록 청소!
        localStorage.removeItem('lastPartialDeductDate');
    }

    finishDeduction();
}


// 🚨 [복구] '모두 건너뛰기' 버튼을 눌렀을 때 작동하는 함수
function skipDeduction() {
    if (confirm("정말 오늘의 정산을 모두 건너뛰시겠습니까?")) {
        // 확인을 누르면 돈은 안 빼고, '정산 창 닫기 + 완료 도장 찍기' 로직만 실행!
        finishDeduction();
    }
}

// 정산 모달창의 'X' 버튼을 눌렀을 때 창을 닫아주는 함수!
function closeDeductionModal() {
    document.getElementById('deduction-modal').style.display = 'none';
    isTodayDeduction = false; // 정산 모드 초기화
}

function finishDeduction() {
    document.getElementById('deduction-modal').style.display = 'none';
    let dateToSave = getWebtoonDate();
    if (isTodayDeduction) dateToSave.setDate(dateToSave.getDate() + 1);
    localStorage.setItem('lastCheckDate', formatDate(dateToSave));
    isTodayDeduction = false;

    // 🌟 [추가] 정산이 끝나자마자 격주 날짜 넘길 게 있는지 바로 검사!
    autoUpdatePastBiweeklyDates();

    updateWeeklyStatUI();
    refreshBalance();
    renderAll(); // 🌟 화면 새로고침
}


// 플랫폼별 할인/이벤트 날짜 체크 로직 (튼튼한 버전!)
// 플랫폼별 할인/이벤트 날짜 체크 로직 (겹침 완벽 대응!)
function checkSaleDays() {
    const kst = getKSTDate();
    const date = kst.getDate();
    const day = kst.getDay();

    const lBadge = document.getElementById('lezhin-sale-badge');
    const bBadge = document.getElementById('bomtoon-sale-badge');
    const rBadge = document.getElementById('ridi-sale-badge');
    const mBadge = document.getElementById('mrblue-sale-badge');
    const globalAlert = document.getElementById('global-event-alert');

    // 1. 레진/봄툰 할인일
    if (lBadge) lBadge.style.display = (date === 20) ? 'inline-block' : 'none';
    if (bBadge) bBadge.style.display = (date === 22) ? 'inline-block' : 'none';

    let hiddenEvents = [];

    // 🌟 2. 리디 이벤트 체크 (123 더블 적립 추가!)
    const isDoublePoint = (date >= 1 && date <= 3); // 1~3일 더블 적립
    const isSibo = (date >= 14 && date <= 21); // 십오야 기간
    const isWeekly = (day === 2);              // 오늘이 화요일인가?

    if (isDoublePoint && isWeekly) {
        // 1~3일인데 화요일이기까지 한 대박날!
        hiddenEvents.push('리디 1·2·3 더블적립 및 화요 위클리');
        if (rBadge) { rBadge.textContent = "이벤트!"; rBadge.style.display = 'inline-block'; }
    } else if (isDoublePoint) {
        // 1~3일 이벤트만 진행 중
        hiddenEvents.push('리디 1·2·3 더블적립');
        if (rBadge) { rBadge.textContent = "이벤트!"; rBadge.style.display = 'inline-block'; }
    } else if (isSibo && isWeekly) {
        // 십오야 + 화요일 겹치는 날
        hiddenEvents.push('리디 십오야 및 위클리');
        if (rBadge) { rBadge.textContent = "이벤트!"; rBadge.style.display = 'inline-block'; }
    } else if (isSibo) {
        // 십오야만 진행 중
        hiddenEvents.push('리디 십오야');
        if (rBadge) { rBadge.textContent = "이벤트!"; rBadge.style.display = 'inline-block'; }
    } else if (isWeekly) {
        // 화요 위클리만 진행 중
        hiddenEvents.push('리디 화요 위클리');
        if (rBadge) { rBadge.textContent = "이벤트!"; rBadge.style.display = 'inline-block'; }
    } else {
        // 아무것도 없음
        if (rBadge) rBadge.style.display = 'none';
    }

    // 3. 미블 이벤트 체크
    if (date >= 1 && date <= 3) {
        hiddenEvents.push('미블 메가 블루데이');
        if (mBadge) {
            mBadge.textContent = "이벤트!";
            mBadge.style.display = 'inline-block';
        }
    } else {
        if (mBadge) mBadge.style.display = 'none';
    }

    // 4. 알림바 띄우기
    if (globalAlert) {
        if (hiddenEvents.length > 0) {
            // 🌟 인라인 스타일 제거하고 class 이름표 달아주기!
            globalAlert.innerHTML = `옆으로 넘겨보세요! <b class="event-highlight-text">${hiddenEvents.join(', ')}</b> 진행 중!`;
            globalAlert.style.display = 'block';
        } else {
            globalAlert.style.display = 'none';
        }
    }
}

function checkAttendanceReset() { const kst = getKSTDate(); const todayStr = `${kst.getFullYear()}-${kst.getMonth() + 1}-${kst.getDate()}`; if (localStorage.getItem('lastAttendDate') !== todayStr) { localStorage.setItem('lastAttendDate', todayStr); localStorage.setItem('lezhinAttend', 'false'); localStorage.setItem('bomtoonAttend', 'false'); } updateAttendUI(); }
function updateAttendUI() { const lAttend = localStorage.getItem('lezhinAttend') === 'true'; const bAttend = localStorage.getItem('bomtoonAttend') === 'true'; const lBtn = document.getElementById('lezhin-attend-btn'); const bBtn = document.getElementById('bomtoon-attend-btn'); if (lAttend) { lBtn.classList.add('done'); lBtn.textContent = ' 출석완료'; } else { lBtn.classList.remove('done'); lBtn.textContent = '레진 출석 전'; } if (bAttend) { bBtn.classList.add('done'); bBtn.textContent = ' 출석완료'; } else { bBtn.classList.remove('done'); bBtn.textContent = '봄툰 출석 전'; } }

// 🚨 [교체] 출석 확인 및 레진 코인 자동 적립 (무한 복사 방지 적용!)
function checkAttendance(plt) {
    // 1. 🌟 [핵심] 이미 출석 도장을 찍었는지 먼저 검사합니다!
    const alreadyAttended = localStorage.getItem(plt + 'Attend') === 'true';

    // 2. 만약 아직 출석 전이고, 누른 버튼이 '레진'이라면? 그때만 지갑에 +1 코인!
    if (!alreadyAttended && plt === 'lezhin') {
        const currentWallet = parseInt(localStorage.getItem('lWallet') || 0);
        localStorage.setItem('lWallet', currentWallet + 1); // 기존 잔액 + 1 저장
        refreshBalance(); // 화면 지갑 잔액 즉시 업데이트!

        // 🌟 [핵심 추가] 지금부터 24시간(밀리초) 뒤에 폭탄이 터지도록 시간 기록!
        const expireTime = Date.now() + (24 * 60 * 60 * 1000);
        localStorage.setItem('lezhinBonusExpire', expireTime);
    }

    // 3. 코인 검사가 끝났으니, 이제 출석 도장 쾅! (다음에 또 누르면 alreadyAttended가 true가 됨)
    localStorage.setItem(plt + 'Attend', 'true');

    // 4. 화면 버튼을 '출석완료'로 바꾸고 통합 금고에 저장
    updateAttendUI();
    saveData();

    trackClick('attend_check', { 'platform': plt });
}


// 🧹 [핵심 마법] 휴재/완결/자동휴재 작품을 무조건 맨 뒤로 밀어내는 전용 청소기 함수!
function forceSortBreaks() {
    ['lezhin', 'bomtoon', 'ridi', 'mrblue'].forEach(plt => {
        Object.keys(state[plt]).forEach(day => {
            state[plt][day].sort((a, b) => {
                // isWorkOnBreak 만능 판독기로 수동 휴재 + 완결 + 자동휴재까지 싹 다 잡아서 무거운 돌덩이(1)로 만듭니다!
                let aBreak = isWorkOnBreak(a) ? 1 : 0;
                let bBreak = isWorkOnBreak(b) ? 1 : 0;
                return aBreak - bBreak;
            });
        });
    });
}

// 1. 데이터 불러오기
function loadAllData() {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
        const p = JSON.parse(data);
        state = p.state || state;

        let migratedCount = 0;

        ['lezhin', 'bomtoon', 'ridi', 'mrblue'].forEach(plt => {
            if (!state[plt]) state[plt] = { "월요일": [], "화요일": [], "수요일": [], "목요일": [], "금요일": [], "토요일": [], "일요일": [], "10일 연재": [], "격주 연재": [] };
            if (!state[plt]["10일 연재"]) state[plt]["10일 연재"] = [];
            if (!state[plt]["격주 연재"]) state[plt]["격주 연재"] = [];

            Object.keys(state[plt]).forEach(d => {
                state[plt][d] = state[plt][d].map((w, idx) => {
                    if (!w.id) {
                        w.id = Date.now().toString() + "_" + Math.random().toString(36).substr(2, 5);
                        migratedCount++;
                    }
                    return { ...w, status: w.status || '연재중', cycle: w.cycle || '' };
                });
            });
        });

        if (migratedCount > 0) {
            console.log(`총 ${migratedCount}개의 작품에 새 ID를 부여했습니다.`);
            saveData();
        }

        localStorage.setItem('lWallet', p.lWallet || 0);
        localStorage.setItem('bWallet', p.bWallet || 0);
        localStorage.setItem('rWallet', p.rWallet || 0);
        localStorage.setItem('mWallet', p.mWallet || 0);

        if (p.theme) localStorage.setItem('theme', p.theme);
        if (p.platformOrder) {
            platformOrder = p.platformOrder;
            localStorage.setItem('platformOrder', JSON.stringify(platformOrder));
        }
        if (p.weeklySpent !== undefined) localStorage.setItem('weeklySpent', p.weeklySpent);
        if (p.weeklySpentWon !== undefined) localStorage.setItem('weeklySpentWon', p.weeklySpentWon);

        if (p.monthlyHistory) localStorage.setItem('monthlyHistory', JSON.stringify(p.monthlyHistory));
        if (p.bomtoonLink) localStorage.setItem('bomtoonLink', p.bomtoonLink);
        if (p.lezhinLink) localStorage.setItem('lezhinLink', p.lezhinLink);
        if (p.lezhinExpire) localStorage.setItem('lezhinExpire', JSON.stringify(p.lezhinExpire));
        if (p.bomtoonExpire) localStorage.setItem('bomtoonExpire', JSON.stringify(p.bomtoonExpire));
        if (p.ridiExpire) localStorage.setItem('ridiExpire', JSON.stringify(p.ridiExpire));
        if (p.mrblueExpire) localStorage.setItem('mrblueExpire', JSON.stringify(p.mrblueExpire));
        if (p.lastAttendDate) localStorage.setItem('lastAttendDate', p.lastAttendDate);
        if (p.lezhinAttend) localStorage.setItem('lezhinAttend', p.lezhinAttend);
        if (p.bomtoonAttend) localStorage.setItem('bomtoonAttend', p.bomtoonAttend);
    }

    // 🚨 앱을 켤 때마다 자동으로 청소기를 싹~ 돌려서 휴재작들을 전부 뒤로 밀어냅니다!
    forceSortBreaks();
}

// 2. 데이터 저장하기 (🌟 조용히 저장하는 silent 옵션 추가!)
function saveData(silent = false) {
    forceSortBreaks(); // 🚨 새로운 걸 추가하거나 수정할 때도 무조건 청소기 돌리기!

    const d = {
        state: state,
        lWallet: localStorage.getItem('lWallet') || 0,
        bWallet: localStorage.getItem('bWallet') || 0,
        rWallet: localStorage.getItem('rWallet') || 0,
        mWallet: localStorage.getItem('mWallet') || 0,
        theme: localStorage.getItem('theme') || 'light',
        platformOrder: platformOrder,
        weeklySpent: localStorage.getItem('weeklySpent') || 0,
        weeklySpentWon: localStorage.getItem('weeklySpentWon') || 0,
        monthlyHistory: JSON.parse(localStorage.getItem('monthlyHistory')) || {},
        bomtoonLink: localStorage.getItem('bomtoonLink') || '',
        lezhinLink: localStorage.getItem('lezhinLink') || '',
        lezhinExpire: JSON.parse(localStorage.getItem('lezhinExpire')) || null,
        bomtoonExpire: JSON.parse(localStorage.getItem('bomtoonExpire')) || null,
        ridiExpire: JSON.parse(localStorage.getItem('ridiExpire')) || null,
        mrblueExpire: JSON.parse(localStorage.getItem('mrblueExpire')) || null,
        lastAttendDate: localStorage.getItem('lastAttendDate') || '',
        lezhinAttend: localStorage.getItem('lezhinAttend') || 'false',
        bomtoonAttend: localStorage.getItem('bomtoonAttend') || 'false'
    };

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(d));

        // 🌟 [핵심] silent가 false일 때(기본 상태)만 화면을 다시 그립니다!
        // 이사 함수가 saveData(true)로 부르면 이 부분은 무시하고 조용히 넘어갑니다.
        if (!silent) {
            renderAll();
            checkStorage();
        }
    } catch (error) {
        if (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
            alert("모보의 저장 공간(5MB)이 꽉 찼습니다!\n새로운 내용을 저장하려면 기존 작품의 '사진'을 몇 개 삭제해 주세요.");
        } else {
            alert("데이터 저장 중 알 수 없는 오류가 발생했습니다.");
        }
    }
}

function toggleDarkMode() { const isDark = document.body.classList.toggle('dark-mode'); localStorage.setItem('theme', isDark ? 'dark' : 'light'); saveData(); }


function changeDay(day) {
    // 🌟 [전체] 버튼을 눌렀을 때는 메인 화면은 놔두고 모달창만 띄우기!
    if (day === '전체') {
        // 모든 요일 버튼 까만색 빼기
        document.querySelectorAll('.day-btn').forEach(btn => btn.classList.remove('active'));

        // '전체' 버튼만 까맣게 칠하기
        const allBtn = document.querySelector('.day-btn[data-day="전체"]');
        if (allBtn) allBtn.classList.add('active');

        // 통합 서랍 모달 띄우기
        openGlobalDrawerModal();
        return; // 여기서 스톱!
    }

    // 🌟 월~일 버튼을 눌렀을 때는 기존처럼 메인 화면 리스트 바꾸기!
    viewDay = day;
    renderAll();
    checkScrollArrows();
    setTimeout(checkScrollArrows, 20);
}

function updatePlatformOrder() {
    const container = document.getElementById('main-content-area');
    if (!container) return;

    // 1. 먼저 4개 플랫폼을 싹 다 확인해서, 비밀번호에 안 적힌 녀석들은 화면에서 끕니다!
    const allPlats = ['lezhin', 'bomtoon', 'ridi', 'mrblue'];
    allPlats.forEach(plt => {
        if (!platformOrder.includes(plt)) {
            const section = document.getElementById(plt + '-section');
            if (section) section.style.display = 'none';
        }
    });


    platformOrder.forEach(plt => {
        const section = document.getElementById(plt + '-section');
        if (section) {
            section.style.display = ''; // 다시 보이게 켜주고
            container.appendChild(section); // 정해진 순서대로 밑으로 착착착 이동!
        }
    });
}

function renderAll() {
    ['lezhin', 'bomtoon', 'ridi', 'mrblue'].forEach(plt => {
        const el = document.getElementById(plt + '-day-display');
        if (el) el.textContent = viewDay;
    });
    document.querySelectorAll('.day-btn').forEach(btn => { if (btn.dataset.day === viewDay) btn.classList.add('active'); else btn.classList.remove('active'); });

    ['lezhin', 'bomtoon', 'ridi', 'mrblue'].forEach(plt => renderList(plt));
    refreshBalance();
}

let draggedIdx = null; let draggedPlt = null; let draggedDay = null;




// 🌟 [신규] 탭으로 누른 요일이 이번 주 며칠인지 계산하는 만능 달력 (K-달력 패치 완료)
function getTargetDateForViewDay(dayStr) {
    const today = getWebtoonDate();

    // 🌟 월요일부터 시작하는 한국식 달력으로 배열 순서 변경!
    const daysArr = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];
    const targetIdx = daysArr.indexOf(dayStr);

    if (targetIdx === -1) return today;

    // 컴퓨터의 요일(일=0 ~ 토=6)을 우리가 쓰는 (월=0 ~ 일=6)으로 변환
    let todayIdx = today.getDay() - 1;
    if (todayIdx === -1) todayIdx = 6; // 일요일이면 6번 방으로!

    const diff = targetIdx - todayIdx;

    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + diff);
    return targetDate;
}




function renderList(platform) {
    const listEl = document.getElementById(`${platform}-list`); listEl.innerHTML = ''; let displayWorks = [];
    const todayObj = getWebtoonDate();

    // 요일 및 10일 연재 필터링 로직
    if (viewDay === '휴재' || viewDay === '완결') {
        Object.keys(state[platform]).forEach(d => {
            (state[platform][d] || []).forEach((work, idx) => {
                if (work.status === viewDay || (viewDay === '휴재' && isWorkOnBreak(work) && work.status !== '완결')) displayWorks.push({ ...work, origDay: d, origIdx: idx });
            });
        });
    }

    else if (viewDay === '격주 연재') {
        Object.keys(state[platform]).forEach(d => {
            (state[platform][d] || []).forEach((work, idx) => {
                if (work.cycle && work.cycle.includes('격주 연재')) {
                    displayWorks.push({ ...work, origDay: d, origIdx: idx });
                }
            });
        });
    }

    else if (viewDay === '10일 연재') {
        (state[platform]["10일 연재"] || []).forEach((work, idx) => { displayWorks.push({ ...work, origDay: "10일 연재", origIdx: idx }); });
    } else {
        (state[platform][viewDay] || []).forEach((work, idx) => { displayWorks.push({ ...work, origDay: viewDay, origIdx: idx }); });

        // 🌟 [핵심] 오늘뿐만 아니라, 유저가 누른 탭(viewDay)의 날짜를 계산해서 10일 연재작 등판!
        const targetDate = getTargetDateForViewDay(viewDay);
        (state[platform]["10일 연재"] || []).forEach((work, idx) => {
            if (isDateMatch(work.cycle, targetDate)) {
                displayWorks.push({ ...work, origDay: "10일 연재", origIdx: idx, isToday10Day: true });
            }
        });

        // 🔥 [신규 추가] 격주 연재작도 날짜(예: 4/10)가 맞으면 해당 요일에 등판!
        (state[platform]["격주 연재"] || []).forEach((work, idx) => {
            if (work.cycle && work.cycle.includes('격주 연재')) {
                let match = work.cycle.match(/\((.*?)\)/);
                if (match) {
                    const d = new Date(match[1]);
                    if (!isNaN(d)) {
                        if (d.getMonth() === targetDate.getMonth() && d.getDate() === targetDate.getDate()) {
                            displayWorks.push({ ...work, origDay: "격주 연재", origIdx: idx, isTodayBiweekly: true });
                        }
                    }
                }
            }
        });
    }


    // 🌟 [여기에 추가!] 숨기기 모드가 켜져 있다면, 휴재/완결/자동휴재 카드 걸러내기!
    // 🚨 단, 유저가 메뉴에서 직접 '휴재'나 '완결' 탭을 눌러서 들어온 거라면 숨기지 않기!
    if (isHidingFinished[platform] && viewDay !== '휴재' && viewDay !== '완결') {
        displayWorks = displayWorks.filter(work => !isWorkOnBreak(work));
    }

    // [추가] 만약 오늘 볼 작품이 0개라면? 안내 문구 띄우기!
    if (displayWorks.length === 0) {
        listEl.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; text-align: center; width: 100%; padding: 30px 0;">
    <p style="margin: 0; margin-top:5px; font-size: 11px; font-weight: bold; color: #555;">오늘은 연재 작품이 없어요!</p>
    <p style="margin: 5px 0 0 0; font-size: 11px; color: #aaa;">여유롭게 정주행은 어떠신가요?</p>
</div>
    `;
        return; // 카드를 그리지 않고 여기서 멈춤!
    }

    // 화면에 카드 그리기
    displayWorks.forEach((work) => {
        const hasImg = work.img && work.img !== "";
        let statusBadge = "";
        let isBreak = isWorkOnBreak(work);

        // 1. 상태 뱃지 (휴재/완결) - 그림자 추가 & absolute 속성 제거!
        if (viewDay !== '휴재' && viewDay !== '완결') {
            if (work.status === '휴재') statusBadge = `<span style="background: #e67e22; color: #fff; padding: 3px 6px; border-radius: 4px; font-size: 12px; font-weight: 500;">[휴재]</span>`;
            else if (work.status === '완결') statusBadge = `<span style="background: #7f8c8d; color: #fff; padding: 3px 6px; border-radius: 4px; font-size: 12px; font-weight: 500;">[완결]</span>`;
            else if (isBreak) statusBadge = `<span style="background: #e67e22; color: #fff; padding: 3px 6px; border-radius: 4px; font-size: 12px; font-weight: 500; ">[자동휴재]</span>`;
        }


        // 🌟 메인 화면: 이모티콘 완전 삭제 & 무조건 한 줄 방어!
        let cycleTag = '';
        if (work.cycle && work.cycle.trim() !== '') {
            const parts = work.cycle.split('+').map(p => p.trim());

            if (parts.length === 1) {
                // [조건 1] 1개일 때: 이모티콘 싹 빼고 텍스트만!
                cycleTag = `
                        <div style="width: 100%; overflow-x: auto; white-space: nowrap; padding-bottom: 2px; scrollbar-width: none; margin-bottom: 4px;">
                            <span style="background: rgba(232, 240, 254, 0.95); color: #1967d2; padding: 4px 3px; border-radius: 4px; font-size: 11px; font-weight: normal; display: inline-block;">
                                ${parts[0]}
                            </span>
                        </div>`;
            } else {
                // [조건 2] 2개 이상일 때: 이모티콘 없이 압축!
                const compressedParts = parts.map(p => {
                    let shortStr = p;
                    if (p.includes('10일 연재')) {
                        let match = p.match(/\((.*?)\)/);
                        shortStr = match ? match[1] : '10일';
                    } else if (p.includes('격주 연재')) {
                        let match = p.match(/\((.*?)\)/);
                        if (match) {
                            const d = new Date(match[1]);
                            shortStr = !isNaN(d) ? `${d.getMonth() + 1}/${d.getDate()}` : match[1];
                        } else {
                            shortStr = '격주';
                        }
                    } else if (p.includes('휴재') || p.includes('휴')) {
                        if (p.includes('매월')) {
                            let match = p.match(/(\d+)주차/);
                            shortStr = match ? `${match[1]}주차 휴재` : '정기휴재'; // '주휴'를 '주차 휴재'로 변경!
                        } else {
                            let match = p.match(/(\d+)연\s*(\d+)휴\s*(\d+)주차/);
                            shortStr = match ? `${match[1]}연 ${match[2]}휴 (${match[3]})` : p.replace(/(\d+)연\s*(\d+)휴/, '$1연 $2휴');
                        }
                    }
                    return shortStr;
                });

                // 앞쪽에 있던 🔄 빼고 바로 합치기!
                const joinedText = compressedParts.join('<span style="color:#888; margin: 0 2px;">+</span>');

                cycleTag = `
                        <div style="width: 100%; overflow-x: auto; white-space: nowrap; padding-bottom: 2px; scrollbar-width: none; margin-bottom: 4px;">
                            <span style="background: rgba(232, 240, 254, 0.95); color: #1967d2; padding: 4px 3px; border-radius: 4px; font-size: 11px; font-weight: normal; display: inline-block;">
                                ${joinedText}
                            </span>
                        </div>`;
            }
        }

        // 3. 시간 뱃지 (제일 밑에 쌓임!)
        const timeBadge = work.time ? `<span style="background: #f9f9f9; color: #333; padding: 4px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">${work.time}</span>` : '';

        const card = document.createElement('div'); card.className = `webtoon-card-link ${platform}-card`;

        // 🌟 오늘이 10일 연재일이거나 OR 격주 연재일인 경우 하이라이트 테두리!
        if (work.isToday10Day || work.isTodayBiweekly || (viewDay === '10일 연재' && isDateMatch(work.cycle, todayObj))) {
            const isDark = document.body.classList.contains('dark-mode');
            let borderColor = '';
            if (isDark) {
                if (platform === 'lezhin') borderColor = '#cc5a5a';
                else if (platform === 'bomtoon') borderColor = '#c45b83';
                else if (platform === 'ridi') borderColor = '#5a8ebf';
                else if (platform === 'mrblue') borderColor = '#6379a6';
            } else {
                if (platform === 'lezhin') borderColor = '#ff9999';
                else if (platform === 'bomtoon') borderColor = '#ffb3d9';
                else if (platform === 'ridi') borderColor = '#99ccff';
                else if (platform === 'mrblue') borderColor = '#99b3e6';
            }
            // 1. 진짜 두께는 일반 카드와 똑같이 1px로 유지해서 덜컹거림 100% 방지!
            card.style.border = `1px solid ${borderColor}`;

            // 2. 바깥쪽으로 1px 그림자를 싸악 둘러서 시각적으로만 2px처럼 보이게 뻥튀기!
            card.style.boxShadow = `0 0 0 1px ${borderColor}`;
        }

        if (viewDay !== '휴재' && viewDay !== '완결') {
            card.dataset.idx = work.origIdx;
            card.dataset.plt = platform;
            card.dataset.day = work.origDay;
        }

        let isStrike = (work.status !== '연재중' || isBreak);
        let unit = 'C';
        if (platform === 'ridi') unit = '캐시';
        else if (platform === 'mrblue') unit = '머니';

        const hasUrl = work.url && work.url.trim() !== "";
        const imgOnClick = hasUrl ? `onclick="window.open('${work.url}', '_blank')"` : "";
        const cursorStyle = hasUrl ? "cursor: pointer;" : "";



        card.innerHTML = `
    <div class="card-thumbnail" ${imgOnClick} style="background-image: url('${work.img || ''}'); ${cursorStyle}; position: relative;">
        
        <div style="position: absolute; top: 5px; left: 5px; display: flex; flex-direction: column; gap: 4px; align-items: flex-start; z-index: 10;">
            ${timeBadge}   ${statusBadge} </div>

        ${!work.img ? `<div class="no-img-title">${work.title}</div>` : ''}
        
        <button class="more-options-btn" onclick="event.stopPropagation(); openActionModal('${platform}', '${work.origDay}', ${work.origIdx})">⋮</button>
        <span class="progress-badge" id="prog-${platform}-${work.origDay}-${work.origIdx}">${work.progress}</span>
    </div>
    
    <div class="card-info">
        
        <div class="cycle-wrapper" style="text-align: left;">
            ${cycleTag}
        </div>
        
        <p class="title" style="margin-top: 0;">${work.title}</p>

        
        <div class="card-bottom-row">
            <p class="coin" style="${isStrike ? 'text-decoration: line-through; color: #ccc;' : ''}; margin-bottom:0;">${work.coin} ${unit}</p>
            
            <div class="quick-btn-group">
                
                ${work.cycle && (/\d+연\s*\d+휴/.test(work.cycle) || work.cycle.includes('격주 연재')) ? `<button class="quick-btn" onclick="event.stopPropagation(); incrementCycle('${platform}', '${work.origDay}', ${work.origIdx})">+1주</button>` : ''} 

                <button class="quick-btn" onclick="event.stopPropagation(); incrementProgress('${platform}', '${work.origDay}', ${work.origIdx})">+1화</button>

            </div>
        </div>
    </div>`;
        // 🌟 10일 연재 주인공이나 격주 연재 주인공은 맨 앞으로!
        if (work.isToday10Day || work.isTodayBiweekly) {
            listEl.prepend(card);
        } else {
            listEl.appendChild(card);
        }
    });

    checkScrollArrows();
}



function incrementProgress(plt, day, idx) {
    let work = state[plt][day][idx];
    let prog = work.progress; let newProg = prog.replace(/(\d+)(?!.*\d)/, match => parseInt(match) + 1); if (prog === newProg) newProg = prog + " +1";

    // 🌟 [동기화] 같은 ID 찾아서 싹 다 바꿔주기!
    if (work.id) {
        Object.keys(state[plt]).forEach(d => {
            state[plt][d].forEach(w => { if (w.id === work.id) w.progress = newProg; });
        });
    } else {
        work.progress = newProg; // 옛날 데이터 방어막
    }

    saveData();

    trackClick('click_plus_one', { 'platform': plt, 'title': work.title });
    let badge = document.getElementById(`prog-${plt}-${day}-${idx}`); if (badge) { const activeColor = plt === 'lezhin' ? '#ff7675' : plt === 'bomtoon' ? '#ff78cb' : plt === 'ridi' ? '#5dade2' : '#66a3ff'; badge.style.transform = "scale(1.2)"; badge.style.backgroundColor = activeColor; setTimeout(() => { badge.style.transform = "scale(1)"; badge.style.backgroundColor = "rgba(0, 0, 0, 0.6)"; }, 250); }
}

function incrementCycle(plt, day, idx) {
    let work = state[plt][day][idx];
    let cyc = work.cycle;
    if (!cyc) return;

    // 🌟 1. 우리가 아까 만든 똑똑한 함수를 호출해서 다음 주차 계산!
    let newCyc = autoIncrementCycleText(cyc);

    // 🌟 2. [기존 동기화 로직 유지] 같은 ID 찾아서 싹 다 바꿔주기!
    if (work.id) {
        Object.keys(state[plt]).forEach(d => {
            state[plt][d].forEach(w => {
                if (w.id === work.id) {
                    w.cycle = newCyc;
                    // 🌟 [추가] 수동으로 다음 회차로 넘겼으니, 정산 도장을 지워야 다음번에 또 결제창이 뜹니다!
                    w.lastDeductDate = "";
                }
            });
        });
    } else {
        work.cycle = newCyc;
    }

    // 🌟 3. 데이터 저장하고, 바뀐 숫자가 화면에 바로 보이도록 즉시 새로고침!
    saveData();
    renderList(plt);
}

function refreshBalance() {
    const lW = parseInt(localStorage.getItem('lWallet') || 0); const bW = parseInt(localStorage.getItem('bWallet') || 0);
    const rW = parseInt(localStorage.getItem('rWallet') || 0); const mW = parseInt(localStorage.getItem('mWallet') || 0);


    document.getElementById('lezhin-wallet-val').textContent = formatNum(lW);
    document.getElementById('bomtoon-wallet-val').textContent = formatNum(bW);
    if (document.getElementById('ridi-wallet-val')) document.getElementById('ridi-wallet-val').textContent = formatNum(rW);
    if (document.getElementById('mrblue-wallet-val')) document.getElementById('mrblue-wallet-val').textContent = formatNum(mW);

    let lT = 0, bT = 0, rT = 0, mT = 0; let lCount = 0, bCount = 0, rCount = 0, mCount = 0;
    const todayObj = getWebtoonDate();

    if (viewDay !== '휴재' && viewDay !== '완결' && viewDay !== '격주 연재') {
        const lezhinWorks = state.lezhin[viewDay] || []; const bomtoonWorks = state.bomtoon[viewDay] || [];
        const ridiWorks = state.ridi[viewDay] || []; const mrblueWorks = state.mrblue[viewDay] || [];
        lCount = lezhinWorks.length; bCount = bomtoonWorks.length; rCount = ridiWorks.length; mCount = mrblueWorks.length;

        if (viewDay === '10일 연재') {
            lT = lezhinWorks.filter(w => !isWorkOnBreak(w) && isDateMatch(w.cycle, todayObj)).reduce((s, i) => s + (parseInt(i.coin) || 0), 0);
            bT = bomtoonWorks.filter(w => !isWorkOnBreak(w) && isDateMatch(w.cycle, todayObj)).reduce((s, i) => s + (parseInt(i.coin) || 0), 0);
            rT = ridiWorks.filter(w => !isWorkOnBreak(w) && isDateMatch(w.cycle, todayObj)).reduce((s, i) => s + (parseInt(i.coin) || 0), 0);
            mT = mrblueWorks.filter(w => !isWorkOnBreak(w) && isDateMatch(w.cycle, todayObj)).reduce((s, i) => s + (parseInt(i.coin) || 0), 0);
        }

        else {
            lT = lezhinWorks.filter(w => !isWorkOnBreak(w)).reduce((s, i) => s + (parseInt(i.coin) || 0), 0);
            bT = bomtoonWorks.filter(w => !isWorkOnBreak(w)).reduce((s, i) => s + (parseInt(i.coin) || 0), 0);
            rT = ridiWorks.filter(w => !isWorkOnBreak(w)).reduce((s, i) => s + (parseInt(i.coin) || 0), 0);
            mT = mrblueWorks.filter(w => !isWorkOnBreak(w)).reduce((s, i) => s + (parseInt(i.coin) || 0), 0);
        }

        const todayDayStr = days[todayObj.getDay()];
        if (viewDay === todayDayStr) {
            (state.lezhin["10일 연재"] || []).forEach(w => { if (!isWorkOnBreak(w) && isDateMatch(w.cycle, todayObj)) lT += (parseInt(w.coin) || 0); });
            (state.bomtoon["10일 연재"] || []).forEach(w => { if (!isWorkOnBreak(w) && isDateMatch(w.cycle, todayObj)) bT += (parseInt(w.coin) || 0); });
            (state.ridi["10일 연재"] || []).forEach(w => { if (!isWorkOnBreak(w) && isDateMatch(w.cycle, todayObj)) rT += (parseInt(w.coin) || 0); });
            (state.mrblue["10일 연재"] || []).forEach(w => { if (!isWorkOnBreak(w) && isDateMatch(w.cycle, todayObj)) mT += (parseInt(w.coin) || 0); });
        }
    }

    else {
        const checkMatch = (w) => (viewDay === '격주 연재') ? (w.cycle && w.cycle.includes('격주 연재')) : (w.status === viewDay);

        Object.keys(state.lezhin).forEach(d => { (state.lezhin[d] || []).forEach(w => { if (w.status === viewDay) lCount++; }); });
        Object.keys(state.bomtoon).forEach(d => { (state.bomtoon[d] || []).forEach(w => { if (w.status === viewDay) bCount++; }); });
        Object.keys(state.ridi).forEach(d => { (state.ridi[d] || []).forEach(w => { if (w.status === viewDay) rCount++; }); });
        Object.keys(state.mrblue).forEach(d => { (state.mrblue[d] || []).forEach(w => { if (w.status === viewDay) mCount++; }); });
    }

    // 오늘의 필요 코인에 쉼표 팡팡!
    document.getElementById('lezhin-needed-val').textContent = formatNum(lT);
    document.getElementById('bomtoon-needed-val').textContent = formatNum(bT);
    if (document.getElementById('ridi-needed-val')) document.getElementById('ridi-needed-val').textContent = formatNum(rT);
    if (document.getElementById('mrblue-needed-val')) document.getElementById('mrblue-needed-val').textContent = formatNum(mT);

    document.getElementById('lezhin-count-val').textContent = `(작품 총 ${lCount}개)`; document.getElementById('bomtoon-count-val').textContent = `(작품 총 ${bCount}개)`;
    if (document.getElementById('ridi-count-val')) document.getElementById('ridi-count-val').textContent = `(작품 총 ${rCount}개)`;
    if (document.getElementById('mrblue-count-val')) document.getElementById('mrblue-count-val').textContent = `(작품 총 ${mCount}개)`;

    // 정산 후 결과에 쉼표 팡팡!
    document.getElementById('lezhin-result').textContent = formatNum(lW - lT);
    document.getElementById('bomtoon-result').textContent = formatNum(bW - bT);
    if (document.getElementById('ridi-result')) document.getElementById('ridi-result').textContent = formatNum(rW - rT);
    if (document.getElementById('mrblue-result')) document.getElementById('mrblue-result').textContent = formatNum(mW - mT);



    // 🚨 [refreshBalance 함수 맨 아래에 있던 뱃지 코드 교체] 🚨
    ['lezhin', 'bomtoon', 'ridi', 'mrblue'].forEach(plt => {
        const badgeEl = document.getElementById(plt + '-expire-badge');
        if (!badgeEl) return;

        const expireData = JSON.parse(localStorage.getItem(plt + 'Expire'));
        if (!expireData || !expireData.amount || !expireData.date) {
            badgeEl.style.display = 'none';
            return;
        }

        const today = getKSTDate();
        today.setHours(0, 0, 0, 0);
        const expD = new Date(expireData.date);
        expD.setHours(0, 0, 0, 0);

        const diffDays = Math.ceil((expD.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        let unit = (plt === 'ridi') ? '캐시' : (plt === 'mrblue' ? '머니' : 'C');

        // formatNum 함수를 써서 숫자에 예쁘게 쉼표(,)를 찍어줍니다!
        let formattedAmt = formatNum(expireData.amount);

        if (diffDays < 0) {
            localStorage.removeItem(plt + 'Expire');
            badgeEl.style.display = 'none';
        } else if (diffDays === 0) {
            // 여기도 expireData.amount 대신 formattedAmt 로 교체!
            badgeEl.innerHTML = `${formattedAmt}${unit} <span style="color: rgb(255, 48, 48)">오늘 소멸!</span>`;
            badgeEl.style.display = 'inline-block';
        } else {
            // 여기도 교체!
            badgeEl.textContent = `${formattedAmt}${unit} : D-${diffDays}`;
            badgeEl.style.display = 'inline-block';
        }
    });
}


function openActionModal(plt, origDay, idx) { actionPlt = plt; actionOrigDay = origDay; actionIdx = idx; document.getElementById('action-title').textContent = state[plt][origDay][idx].title; document.getElementById('action-modal').style.display = 'flex'; }
function closeActionModal() { document.getElementById('action-modal').style.display = 'none'; }

function toggleCycleInputs(changedEl) {
    const chk10 = document.getElementById('chk-10day');
    const dayChecks = document.querySelectorAll('input[name="day-chk"]');
    const typeSelect = document.getElementById('input-cycle-type');

    // 1. [상호 배타적 선택 철벽 방어!]
    if (changedEl) {
        // Case A: 10일 지정석을 체크했을 때 -> 모든 요일 해제 + 격주 연재 해제
        if (changedEl === chk10 && chk10.checked) {
            dayChecks.forEach(chk => { if (chk !== chk10) chk.checked = false; });
            if (typeSelect.value === '격주 연재') typeSelect.value = '';
        }
        // Case B: 격주 연재를 선택했을 때 -> 모든 요일 해제 + 10일 연재 해제
        else if (changedEl.id === 'input-cycle-type' && changedEl.value === '격주 연재') {
            dayChecks.forEach(chk => chk.checked = false);
            if (chk10) chk10.checked = false;
        }
        // Case C: 일반 요일을 체크했을 때 -> 10일 지정석 해제 + 격주 연재 해제
        else if (changedEl.name === "day-chk" && changedEl !== chk10 && changedEl.checked) {
            if (chk10) chk10.checked = false;
            if (typeSelect.value === '격주 연재') typeSelect.value = '';
        }
    }

    // 2. [입력창 노출 관리]
    // 10일 연재 칸 보이기/숨기기
    const input10 = document.getElementById('input-10day-dates');
    if (chk10 && input10) input10.style.display = chk10.checked ? 'block' : 'none';

    // 주기 드롭다운에 따른 옆칸 보이기/숨기기
    const typeVal = typeSelect.value;
    const weekInput = document.getElementById('input-cycle-week');
    if (weekInput) {
        if (!typeVal) {
            weekInput.style.display = 'none';
            weekInput.value = '';
        } else {
            weekInput.style.display = 'block';
            if (typeVal === '매월 특정 주 휴재' || typeVal === '매월 특정주 휴재') {
                weekInput.type = 'number';
                weekInput.placeholder = '몇 주차? (예: 1)';
            } else if (typeVal === '격주 연재') {
                weekInput.type = 'date';
            } else {
                weekInput.type = 'text';
                weekInput.placeholder = 'n주차 (숫자)';
            }
        }
    }
}

function removeSelectedImage() { tempImg = ""; document.getElementById('image-input').value = ""; document.getElementById('image-status-text').textContent = "📷 사진이 삭제되었습니다."; document.getElementById('image-status-text').style.color = "#e60012"; document.getElementById('remove-img-btn').style.display = 'none'; }

// 작품 수정 창 열기 (저장된 시간 불러오기 + 여러 요일 체크박스 동기화!)
function editFromAction() {
    closeActionModal();
    editMode = true;
    currentPlatform = actionPlt;
    const work = state[actionPlt][actionOrigDay][actionIdx];

    document.getElementById('modal-title-label').textContent = "작품 수정";
    // 🌟 [추가] 수정할 땐 스위치 감추고 단일 모드 고정!
    document.getElementById('add-mode-toggle-container').style.display = 'none';
    setAddMode('single');
    document.getElementById('input-title').value = work.title;
    document.getElementById('input-url').value = work.url || '';

    let savedCyc = work.cycle || "";
    let tenDayDates = "";
    let cType = "";
    let cWeek = "";

    // 🌟 짬짜면 분해 로직
    if (savedCyc) {
        if (savedCyc.includes("10일 연재")) {
            let match10 = savedCyc.match(/10일 연재\s*\((.*?)\)/);
            if (match10) tenDayDates = match10[1];

            savedCyc = savedCyc.replace(/\+?\s*10일 연재\s*\(.*?\)/, '').trim();
            if (savedCyc.endsWith('+')) savedCyc = savedCyc.slice(0, -1).trim();
        }

        if (savedCyc) {
            if (savedCyc.includes("격주 연재")) {
                cType = "격주 연재";
                let match = savedCyc.match(/\((.*?)\)/);
                if (match) {
                    // 🌟 [수정] 저장된 M/D 형식을 달력(input type="date")이 읽을 수 있는 YYYY-MM-DD로 변환!
                    const parts = match[1].split('/');
                    if (parts.length === 2) {
                        const year = new Date().getFullYear();
                        const month = parts[0].padStart(2, '0');
                        const day = parts[1].padStart(2, '0');
                        cWeek = `${year}-${month}-${day}`;
                    } else {
                        cWeek = match[1];
                    }
                }
            }
            else if (savedCyc.includes("매월")) {
                cType = "매월 특정 주 휴재";
                let match = savedCyc.match(/매월\s*(\d+)주차\s*휴재/);
                if (match) cWeek = match[1];
            }
            else {
                let match = savedCyc.match(/^(.*?)(?:\s+(\d+)주차)?$/);
                if (match) { cType = match[1].trim(); cWeek = match[2] || ""; }
            }
        }
    }

    // 🌟 파싱한 데이터 화면에 뿌려주기 (안전장치 추가)
    const tenDayInput = document.getElementById('input-10day-dates');
    if (tenDayInput) tenDayInput.value = tenDayDates;

    const typeSelect = document.getElementById('input-cycle-type');
    if (typeSelect) {
        const typeExists = Array.from(typeSelect.options).some(o => o.value === cType);
        typeSelect.value = typeExists ? cType : "";
    }

    const weekInput = document.getElementById('input-cycle-week');
    if (weekInput) weekInput.value = cWeek;

    // 동기화 체크박스 처리
    let activeDays = [];
    if (work.id) {
        Object.keys(state[actionPlt]).forEach(d => {
            if (state[actionPlt][d].some(w => w.id === work.id)) activeDays.push(d);
        });
    } else {
        activeDays.push(actionOrigDay);
    }

    document.querySelectorAll('input[name="day-chk"]').forEach(chk => {
        chk.checked = activeDays.includes(chk.value);
    });

    // 나머지 잔바리(?) 세팅들
    const coinInput = document.getElementById('input-coin');
    if (actionPlt === 'ridi') coinInput.placeholder = "예: 600 (캐시)";
    else if (actionPlt === 'mrblue') coinInput.placeholder = "예: 500 (머니)";
    else coinInput.placeholder = "예: 3 (코인)";

    document.getElementById('input-coin').value = work.coin;
    document.getElementById('input-progress').value = work.progress;
    document.getElementById('input-time').value = work.time || '';
    document.getElementById('input-status').value = work.status || '연재중';

    const deductLabel = document.getElementById('add-deduct-label');
    if (deductLabel) {
        deductLabel.style.display = 'flex';
        const deductChk = document.getElementById('add-deduct-chk');
        if (deductChk) deductChk.checked = false;
    }

    tempImg = work.img || "";
    document.getElementById('image-input').value = "";
    document.getElementById('image-status-text').textContent = tempImg ? "기존 사진 유지" : "";
    document.getElementById('image-status-text').style.color = tempImg ? "#2ecc71" : "#888";
    document.getElementById('remove-img-btn').style.display = tempImg ? 'block' : 'none';

    // 🌟 [수정] 칸의 종류(date 등)를 먼저 결정한 뒤에!
    if (typeof toggleCycleInputs === "function") toggleCycleInputs();

    // 🌟 [수정] 그 다음에 값을 넣어줘야 달력에 날짜가 제대로 표시됩니다.
    if (cWeek) document.getElementById('input-cycle-week').value = cWeek;

    document.getElementById('custom-modal').style.display = 'flex';
}


// 🌟 [신규 추가] 작품 복제 (껍데기 템플릿) 함수!
function duplicateFromAction() {
    closeActionModal();

    // 🚨 핵심 1: 수정 모드가 아니라 '새 작품 추가' 모드라고 브라우저를 속입니다!
    editMode = false;
    currentPlatform = actionPlt;
    const work = state[actionPlt][actionOrigDay][actionIdx];

    document.getElementById('modal-title-label').textContent = "작품 복제 (새로 추가)";

    // 🌟 [추가] 수정할 땐 스위치 감추고 단일 모드 고정!
    document.getElementById('add-mode-toggle-container').style.display = 'none';
    setAddMode('single');

    // 🚨 핵심 2: 우니님 기획대로 4가지는 완벽하게 '백지화' 합니다!
    document.getElementById('input-title').value = ''; // 제목 비우기
    document.getElementById('input-url').value = '';   // 링크 비우기
    document.getElementById('input-progress').value = ''; // 진도 비우기
    document.getElementById('input-time').value = ''; // 🌟 [추가] 업로드 시간 비우기!

    // 사진(이미지) 완벽하게 초기화
    tempImg = "";
    document.getElementById('image-input').value = "";
    document.getElementById('image-status-text').textContent = "";
    document.getElementById('image-status-text').style.color = "#888";
    document.getElementById('remove-img-btn').style.display = 'none';

    // 🌟 3. 나머지 유용한 설정(주기, 코인, 시간, 상태)은 알뜰하게 훔쳐옵니다!
    let savedCyc = work.cycle || "";
    let tenDayDates = "";
    let cType = "";
    let cWeek = "";

    if (savedCyc) {
        if (savedCyc.includes("10일 연재")) {
            let match10 = savedCyc.match(/10일 연재\s*\((.*?)\)/);
            if (match10) tenDayDates = match10[1];
            savedCyc = savedCyc.replace(/\+?\s*10일 연재\s*\(.*?\)/, '').trim();
            if (savedCyc.endsWith('+')) savedCyc = savedCyc.slice(0, -1).trim();
        }

        if (savedCyc) {
            if (savedCyc.includes("격주 연재")) {
                cType = "격주 연재";
                let match = savedCyc.match(/\((.*?)\)/);
                if (match) {
                    const parts = match[1].split('/');
                    if (parts.length === 2) {
                        const year = new Date().getFullYear();
                        const month = parts[0].padStart(2, '0');
                        const day = parts[1].padStart(2, '0');
                        cWeek = `${year}-${month}-${day}`;
                    } else {
                        cWeek = match[1];
                    }
                }
            }
            else if (savedCyc.includes("매월")) {
                cType = "매월 특정 주 휴재";
                let match = savedCyc.match(/매월\s*(\d+)주차\s*휴재/);
                if (match) cWeek = match[1];
            }
            else {
                let match = savedCyc.match(/^(.*?)(?:\s+(\d+)주차)?$/);
                if (match) { cType = match[1].trim(); cWeek = match[2] || ""; }
            }
        }
    }

    const tenDayInput = document.getElementById('input-10day-dates');
    if (tenDayInput) tenDayInput.value = tenDayDates;

    const typeSelect = document.getElementById('input-cycle-type');
    if (typeSelect) {
        const typeExists = Array.from(typeSelect.options).some(o => o.value === cType);
        typeSelect.value = typeExists ? cType : "";
    }

    const weekInput = document.getElementById('input-cycle-week');
    if (weekInput) weekInput.value = cWeek;

    // 요일 체크박스 동기화 복사
    let activeDays = [];
    if (work.id) {
        Object.keys(state[actionPlt]).forEach(d => {
            if (state[actionPlt][d].some(w => w.id === work.id)) activeDays.push(d);
        });
    } else {
        activeDays.push(actionOrigDay);
    }
    document.querySelectorAll('input[name="day-chk"]').forEach(chk => {
        chk.checked = activeDays.includes(chk.value);
    });

    // 코인, 시간, 상태 복사
    const coinInput = document.getElementById('input-coin');
    if (actionPlt === 'ridi') coinInput.placeholder = "예: 600 (캐시)";
    else if (actionPlt === 'mrblue') coinInput.placeholder = "예: 500 (머니)";
    else coinInput.placeholder = "예: 3 (코인)";

    document.getElementById('input-coin').value = work.coin;
    document.getElementById('input-time').value = work.time || '';
    document.getElementById('input-status').value = work.status || '연재중';

    const deductLabel = document.getElementById('add-deduct-label');
    if (deductLabel) {
        deductLabel.style.display = 'flex';
        const deductChk = document.getElementById('add-deduct-chk');
        if (deductChk) deductChk.checked = false;
    }

    if (typeof toggleCycleInputs === "function") toggleCycleInputs();
    if (cWeek) document.getElementById('input-cycle-week').value = cWeek;

    document.getElementById('custom-modal').style.display = 'flex';
}


// 새 작품 추가 창 열기 (단위 자동 변경 적용! + 알람 뱃지 + 요일 다중 선택)
function openAddModal(platform) {
    editMode = false; currentPlatform = platform; tempImg = "";
    document.getElementById('modal-title-label').textContent = "작품 추가";
    document.getElementById('input-title').value = '';
    document.getElementById('input-url').value = '';
    // 🌟 [추가] 새 작품 추가할 땐 스위치 보이게 하고 무조건 '단일 추가'로 세팅!
    document.getElementById('add-mode-toggle-container').style.display = 'flex';
    setAddMode('single');
    // 🌟 9개의 일괄 추가 태그 상자 전부 깨끗하게 지우기!
    const dayList = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일', '10일 연재', '격주 연재'];
    dayList.forEach(day => {
        const tagList = document.getElementById(`tag-list-${day}`);
        if (tagList) tagList.innerHTML = ''; // 칩들 날리기
        const input = document.getElementById(`batch-input-${day}`);
        if (input) input.value = ''; // 적던 글자 날리기
    });


    // 🌟 에러 안 나게 안전장치 걸어서 초기화
    const cycleType = document.getElementById('input-cycle-type');
    if (cycleType) cycleType.value = '';

    const cycleWeek = document.getElementById('input-cycle-week');
    if (cycleWeek) cycleWeek.value = '';

    const tenDayDates = document.getElementById('input-10day-dates');
    if (tenDayDates) tenDayDates.value = '';

    const coinInput = document.getElementById('input-coin');
    if (platform === 'ridi') {
        coinInput.placeholder = "예: 600 (캐시)";
        document.getElementById('input-coin').value = '';
    } else if (platform === 'mrblue') {
        coinInput.placeholder = "예: 500 (머니)";
        document.getElementById('input-coin').value = '';
    } else {
        coinInput.placeholder = "예: 3 (코인)";
        document.getElementById('input-coin').value = '';
    }

    document.getElementById('input-progress').value = '1화';

    const deductLabel = document.getElementById('add-deduct-label');
    if (deductLabel) {
        deductLabel.style.display = 'flex';
        const deductChk = document.getElementById('add-deduct-chk');
        if (deductChk) deductChk.checked = false;
    }

    document.getElementById('input-time').value = '';

    const todayStr = (viewDay === '휴재' || viewDay === '완결') ? days[getWebtoonDate().getDay()] : viewDay;
    document.querySelectorAll('input[name="day-chk"]').forEach(chk => {
        chk.checked = (chk.value === todayStr);
    });

    document.getElementById('input-status').value = (viewDay === '휴재' || viewDay === '완결') ? viewDay : '연재중';
    document.getElementById('image-input').value = "";
    document.getElementById('image-status-text').textContent = "";
    document.getElementById('image-status-text').style.color = "#888";
    document.getElementById('remove-img-btn').style.display = 'none';

    // 🌟 창 띄우기!
    document.getElementById('custom-modal').style.display = 'flex';

    // 🚨 [핵심] 옛날 함수 말고, 아까 만든 만능 함수 호출!
    if (typeof toggleCycleInputs === "function") toggleCycleInputs();

    // 🌟 [추가] 창 열리면 제목 칸에 바로 커서 깜빡이게 하기!
    setTimeout(() => document.getElementById('input-title').focus(), 100);
}



function closeAddModal() { document.getElementById('custom-modal').style.display = 'none'; }

async function saveWorkFinal() {
    const batchSection = document.getElementById('batch-add-section');
    const isBatchMode = batchSection && batchSection.style.display !== 'none';

    if (isBatchMode) {
        const targetStatus = '연재중';

        let defaultCoin = 0;
        if (currentPlatform === 'lezhin' || currentPlatform === 'bomtoon') {
            defaultCoin = 3;
        } else if (currentPlatform === 'ridi') {
            defaultCoin = 600;
        } else if (currentPlatform === 'mrblue') {
            defaultCoin = 500;
        }

        let addedCount = 0;
        const dayList = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일', '10일 연재', '격주 연재'];

        dayList.forEach(day => {
            const tagList = document.getElementById(`tag-list-${day}`);
            const input = document.getElementById(`batch-input-${day}`);

            let titles = [];
            if (tagList) {
                Array.from(tagList.children).forEach(span => {
                    if (span.dataset.val) titles.push(span.dataset.val);
                });
            }
            if (input && input.value.trim() !== "") {
                titles.push(input.value.trim());
            }

            if (titles.length > 0) {
                titles.forEach(title => {
                    const workId = Date.now().toString() + "_" + Math.random().toString(36).substr(2, 5);
                    let defaultCycle = "";
                    if (day === '10일 연재') defaultCycle = "10일 연재 (10/20/30)";
                    else if (day === '격주 연재') defaultCycle = "격주 연재";

                    const workData = {
                        id: workId, title: title, url: "", cycle: defaultCycle,
                        coin: defaultCoin, progress: "1화", status: targetStatus,
                        img: "", time: "", lastDeductDate: ""
                    };
                    state[currentPlatform][day].push({ ...workData });
                    addedCount++;
                });
            }
        });

        if (addedCount === 0) return alert("추가할 작품 제목을 하나 이상 적어주세요!");

        saveData();
        autoUpdatePastBiweeklyDates();
        renderAll();

        // 🌟 [핵심] 단일 추가나 복제를 했을 때도 똑같이 시간을 되돌려줍니다!
        const nowStrSingle = formatDate(getWebtoonDate());
        if (localStorage.getItem('lastCheckDate') > nowStrSingle) {
            localStorage.setItem('lastCheckDate', nowStrSingle);
        }
        localStorage.removeItem('lastPartialDeductDate'); // 🌟 새 작품 생겼으니 흔적 깔끔하게 지우기

        trackClick('batch_add_works_tags', { 'platform': currentPlatform, 'count': addedCount });
        alert(`총 ${addedCount}개의 작품이 요일별로 완벽하게 추가되었습니다!`);
        closeAddModal();
        return;
    }

    const title = document.getElementById('input-title').value;
    const url = document.getElementById('input-url').value;

    const selectedDays = Array.from(document.querySelectorAll('input[name="day-chk"]:checked')).map(el => el.value);

    let cycleParts = [];
    const cType = document.getElementById('input-cycle-type').value;
    const cWeek = document.getElementById('input-cycle-week').value;

    if (cType) {
        if (cType === "격주 연재") {
            if (cWeek && cWeek.includes('-')) {
                const d = new Date(cWeek);
                const shortDate = `${d.getMonth() + 1}/${d.getDate()}`;
                cycleParts.push(`격주 연재 (${shortDate})`);
            } else {
                cycleParts.push(cWeek ? `격주 연재 (${cWeek})` : "격주 연재");
            }
        }
        else if (cType === "매월 특정 주 휴재" || cType === "매월 특정주 휴재") {
            cycleParts.push(cWeek ? `매월 ${cWeek}주차 휴재` : "매월 특정주 휴재");
        }
        else {
            cycleParts.push(cWeek ? `${cType} ${cWeek}주차` : cType);
        }
    }

    if (selectedDays.includes("10일 연재")) {
        const tenDayDates = document.getElementById('input-10day-dates').value.trim() || '10/20/30';
        cycleParts.push(`10일 연재 (${tenDayDates})`);
    }

    const cycleStr = cycleParts.join(" + ");
    const coin = parseInt(document.getElementById('input-coin').value) || 0;
    const progress = document.getElementById('input-progress').value || "1화";
    const time = document.getElementById('input-time').value.trim();
    const targetStatus = document.getElementById('input-status').value;

    if (!title) return alert("제목을 입력해주세요!");

    const isDateBased = cycleStr.includes('10일 연재') || cycleStr.includes('격주 연재');

    let finalSelectedDays = [...selectedDays];
    if (cycleStr.includes('10일 연재')) finalSelectedDays = ['10일 연재'];
    else if (cycleStr.includes('격주 연재')) finalSelectedDays = ['격주 연재'];

    if (finalSelectedDays.length === 0 && !isDateBased) return alert("연재 요일을 최소 하나는 선택해주세요!");

    if (finalSelectedDays.length === 0 && isDateBased) {
        if (cycleStr.includes('10일 연재')) finalSelectedDays.push('10일 연재');
        else if (cycleStr.includes('격주 연재')) finalSelectedDays.push('격주 연재');
    }

    let workId = "";
    let isOldGhost = false;
    let oldDeductDate = "";

    if (editMode) {
        const originalWork = state[currentPlatform][actionOrigDay][actionIdx];
        if (originalWork.id) {
            workId = originalWork.id;
        } else {
            isOldGhost = true;
            workId = Date.now().toString();
        }
        oldDeductDate = originalWork.lastDeductDate || "";
    } else {
        workId = Date.now().toString() + "_" + Math.random().toString(36).substr(2, 5);
    }

    let finalDeductDate = oldDeductDate;

    const deductChk = document.getElementById('add-deduct-chk');
    if (deductChk && deductChk.checked) {
        let unitStr = '코인';
        if (currentPlatform === 'ridi') unitStr = '캐시';
        else if (currentPlatform === 'mrblue') unitStr = '머니';

        let buyCount = prompt(`[${title}]\n이번에 새로 결제하신 건 몇 화 분량인가요?\n(1화당 ${formatNum(coin)}${unitStr} 차감)`);
        let parsedBuy = parseInt(buyCount) || 0;
        let cost = parsedBuy * coin;

        if (cost > 0) {
            if (confirm(`총 ${formatNum(cost)} ${unitStr}이(가) 차감됩니다.\n정말 지갑에서 차감하시겠습니까?`)) {
                executeDeduction(currentPlatform, title, cost);
                finalDeductDate = formatDate(getWebtoonDate());
            } else {
                alert("지갑 차감이 취소되었습니다.\n(작품 내용은 정상적으로 저장됩니다!)");
            }
        } else {
            alert("결제 화수가 입력되지 않아 지갑 차감은 취소되었습니다.");
        }
    }

    // 🚨 여기서부터 ImgBB 업로드 로직 추가! 🚨
    let finalImgUrl = tempImg;

    // 🌟 똑똑한 필터링: 사진 보관함이 비어있지 않고, '뚱뚱한 원본(data:image)'일 때만 창고로 보냅니다!
    if (tempImg && tempImg.startsWith('data:image')) {
        try {
            const statusText = document.getElementById('image-status-text');
            if (statusText) {
                statusText.textContent = "사진 업로드 중...";
                statusText.style.color = "#1967d2";
            }
            finalImgUrl = await uploadImageToImgBB(tempImg);
        } catch (e) {
            console.error("사진 업로드 에러:", e);
            alert("사진 용량이 너무 큽니다! (다른 사진으로 교체해주세요)");
            return; // 👈 에러 나면 저장을 멈추기
        }
    }

    // 🌟 텍스트 주소로 바뀐 새로운 workData!
    const workData = {
        id: workId,
        title: title,
        url: url,
        cycle: cycleStr,
        coin: coin,
        progress: progress,
        status: targetStatus,
        img: finalImgUrl,
        time: time,
        lastDeductDate: finalDeductDate
    };
    // 🚨 여기까지 추가 완료 🚨

    if (editMode) {
        Object.keys(state[currentPlatform]).forEach(day => {
            const arr = state[currentPlatform][day];
            let targetIdx = -1;

            if (!isOldGhost) targetIdx = arr.findIndex(w => w.id === workId);
            else {
                if (day === actionOrigDay) targetIdx = actionIdx;
                else targetIdx = arr.findIndex(w => !w.id && w.title === originalWork.title);
            }

            if (targetIdx !== -1) {
                if (finalSelectedDays.includes(day)) arr.splice(targetIdx, 1, { ...workData });
                else arr.splice(targetIdx, 1);
            } else if (finalSelectedDays.includes(day)) {
                arr.push({ ...workData });
            }
        });
    } else {
        finalSelectedDays.forEach(day => {
            state[currentPlatform][day].push({ ...workData });
        });
    }

    saveData();
    autoUpdatePastBiweeklyDates();
    renderAll();

    // 🌟 [핵심] 단일 추가나 복제를 했을 때도 똑같이 시간을 되돌려줍니다!
    const nowStrSingle = formatDate(getWebtoonDate());
    if (localStorage.getItem('lastCheckDate') > nowStrSingle) {
        localStorage.setItem('lastCheckDate', nowStrSingle);
    }
    localStorage.removeItem('lastPartialDeductDate'); // 🌟 새 작품 생겼으니 흔적 깔끔하게 지우기

    trackClick(editMode ? 'edit_work' : 'add_new_work', { 'platform': currentPlatform, 'title': title });

    closeAddModal();
}



document.getElementById('image-input').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;

    // 1. 처리 중이라는 안내 표시 (용량이 크면 시간이 걸릴 수 있음)
    document.getElementById('image-status-text').textContent = "사진을 처리하는 중입니다...";
    document.getElementById('image-status-text').style.color = "#f39c12";

    const reader = new FileReader();
    reader.onload = function (ev) {
        const img = new Image();

        // 2. 이미지가 정상적으로 불러와졌을 때 (성공)
        img.onload = function () {
            try {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if (w > 300) { h *= 300 / w; w = 300; }
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);

                tempImg = canvas.toDataURL('image/jpeg', 0.7);

                document.getElementById('image-status-text').textContent = "사진 선택 완료!";
                document.getElementById('image-status-text').style.color = "";
                document.getElementById('image-status-text').className = "img-status-success"; // 🌟 완벽 해결!
                document.getElementById('remove-img-btn').style.display = 'block';
            } catch (err) {
                alert("사진 용량이 너무 크거나 처리할 수 없는 형식입니다.");
                document.getElementById('image-status-text').textContent = "사진 처리에 실패했습니다.";
                document.getElementById('image-status-text').style.color = "#e60012";
            }
            // 입력창 초기화 (같은 사진 다시 고를 수 있게!)
            document.getElementById('image-input').value = "";
        };

        // 3. 브라우저가 못 그리는 이상한 형식일 때의 방어 로직 (먹통 방지!)
        img.onerror = function () {
            alert("지원하지 않는 사진 형식입니다. 캡처본(스크린샷)을 이용해 주세요!");
            document.getElementById('image-status-text').textContent = "📷 지원하지 않는 사진입니다.";
            document.getElementById('image-status-text').style.color = "#e60012";
            document.getElementById('image-input').value = "";
        };

        img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
});

// 1. 모달창을 열 때 사용하는 변수 (어느 플랫폼인지 기억용)
let currentCoinPlt = '';

// [교체 대상] 기존의 updateCoin 함수를 이 코드로 바꾸세요!
// 🚨 [교체] updateCoin 함수
function updateCoin(plt) {
    currentCoinPlt = plt;

    // 모달창 제목 텍스트 세팅
    const titles = {
        lezhin: '레진 코인',
        bomtoon: '봄툰 코인',
        ridi: '리디 캐시',
        mrblue: '미블 머니'
    };

    // 🚨 [추가된 부분!] 소멸 예정 라벨 텍스트 세팅
    const expireLabels = {
        lezhin: '🚨 소멸 예정 코인 (선택)',
        bomtoon: '🚨 소멸 예정 코인 (선택)',
        ridi: '🚨 소멸 예정 캐시/포인트 (선택)',
        mrblue: '🚨 소멸 예정 머니 (선택)'
    };

    // 모달창 제목과 소멸 라벨 글씨를 플랫폼에 맞게 변경
    document.getElementById('coin-modal-title').textContent = titles[plt] + ' 수정';
    document.getElementById('expire-modal-label').textContent = expireLabels[plt];

    // 현재 잔액 불러오기
    const prefix = plt.charAt(0); // l, b, r, m
    document.getElementById('coin-input-val').value = localStorage.getItem(prefix + 'Wallet') || 0;

    // 소멸 예정 데이터 불러오기
    const expireData = JSON.parse(localStorage.getItem(plt + 'Expire')) || { amount: '', date: '' };
    document.getElementById('expire-coin-val').value = expireData.amount;
    document.getElementById('expire-date-val').value = expireData.date;
    // 창 띄우기
    document.getElementById('coin-update-modal').style.display = 'flex';
}

// 2. 모달창을 닫는 함수
function closeCoinModal() {
    document.getElementById('coin-update-modal').style.display = 'none';
}

// 3. 모달창에서 [저장하기] 버튼을 눌렀을 때 실행되는 함수
function saveCoinUpdate() {
    const newBal = document.getElementById('coin-input-val').value || 0;
    const expAmt = document.getElementById('expire-coin-val').value;
    const expDate = document.getElementById('expire-date-val').value;

    // 둘 중 하나만 입력한 경우 멈추고 경고창 띄우기!
    if ((expAmt && !expDate) || (!expAmt && expDate)) {
        alert("소멸 예정 수량과 날짜를 모두 입력하거나, 아예 모두 비워주세요!");
        return; // 저장 안 하고 창도 안 닫고 여기서 스톱!
    }
    // 지갑 잔액 저장 (기존 방식 유지: lWallet, bWallet 등)
    const prefix = currentCoinPlt.charAt(0);
    localStorage.setItem(prefix + 'Wallet', newBal);

    // 소멸 예정 정보 저장 (수량과 날짜가 모두 있을 때만 저장)
    if (expAmt && expDate) {
        localStorage.setItem(currentCoinPlt + 'Expire', JSON.stringify({
            amount: expAmt,
            date: expDate
        }));
    } else {
        // 입력값이 없으면 소멸 정보 삭제 (뱃지 안 뜨게 함)
        localStorage.removeItem(currentCoinPlt + 'Expire');
    }


    // 🌟 [핵심 방어막 추가!] 레진 지갑을 수동으로 수정했다면 24시간 보너스 폭탄 해체!
    if (currentCoinPlt === 'lezhin') {
        localStorage.removeItem('lezhinBonusExpire');
    }

    closeCoinModal(); // 창 닫기
    if (typeof saveData === "function") saveData(); // 전체 데이터 저장 함수 실행
    if (typeof refreshBalance === "function") refreshBalance(); // 화면 잔액 및 뱃지 즉시 갱신
}

function checkStorage() { const used = encodeURIComponent(JSON.stringify(localStorage)).length; const limit = 5 * 1024 * 1024; const percent = Math.min(Math.round((used / limit) * 100), 100); const pEl = document.getElementById('storage-percent'); const fEl = document.getElementById('storage-bar-fill'); if (pEl) pEl.textContent = percent; if (fEl) fEl.style.width = percent + '%'; }

// 파일로 내보내기 (다운로드 직전에 한 번 더 꽉 묶어주기!)
function exportDataToFile() {
    saveData();
    const d = localStorage.getItem(STORAGE_KEY);
    if (!d) return alert("백업할 데이터가 없습니다!");
    const date = getKSTDate();
    const dateString = date.getFullYear() + String(date.getMonth() + 1).padStart(2, '0') + String(date.getDate()).padStart(2, '0');
    const fileName = `mobo_backup_${dateString}.txt`;
    const blob = new Blob([d], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
    localStorage.setItem('lastBackupDate', Date.now());
    checkBackupStatus();
    alert("✅ 백업 파일 다운로드 완료!");
}

function triggerImport() {
    // 파일 선택창을 열기 전에 기존 기록을 지워서 브라우저가 무조건 인식하게 만들기!
    document.getElementById('backup-file-input').value = '';
    document.getElementById('backup-file-input').click();
}

// 🚨 브라우저가 절대 무시할 수 없는 가장 튼튼하고 똑똑한 복구+이사 함수! (철벽 방어 유지, 구글 연동만 제거)
function handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const content = e.target.result;
            const parsedData = JSON.parse(content);

            if (parsedData && parsedData.state) {
                // 🌟 [핵심 방어 1] 일단 원본 그대로 브라우저에 '즉시' 강제 저장!!!
                localStorage.setItem(STORAGE_KEY, JSON.stringify(parsedData));

                // 🌟 [핵심 방어 2] 새로고침/뒤로가기 방어막 켜기!
                const preventReload = (e) => {
                    const warningMessage = "복구를 진행 중입니다. 정말 새로고침 하시겠습니까? (새로고침 시 복구 중단)";
                    e.preventDefault();
                    e.returnValue = warningMessage;
                    return warningMessage;
                };
                window.addEventListener('beforeunload', preventReload);

                alert("데이터 복원이 시작되었습니다!\n완료 팝업이 뜰 때까지 **절대 새로고침하거나 앱을 끄지 마세요!**\n(약 10초~1분 소요)");

                let count = 0;
                const platforms = ['lezhin', 'bomtoon', 'ridi', 'mrblue'];

                // 🌟 사진 창고로 이사 시작
                for (let plt of platforms) {
                    if (parsedData.state[plt]) {
                        for (let day of Object.keys(parsedData.state[plt])) {
                            for (let work of parsedData.state[plt][day]) {
                                if (work.img && work.img.startsWith('data:image')) {
                                    try {
                                        console.log(`[${work.title}] 사진 업로드 중...`);
                                        let newUrl = await uploadImageToImgBB(work.img);
                                        work.img = newUrl; // 창고 주소로 교체!
                                        count++;
                                    } catch (err) {
                                        console.error(`❌ [${work.title}] 사진 업로드 실패:`, err);
                                    }
                                }
                            }
                        }
                    }
                }

                // 🌟 3. 창고 이사가 끝나서 홀가분해진 가벼운 데이터를 다시 저장 (덮어쓰기)
                localStorage.setItem(STORAGE_KEY, JSON.stringify(parsedData));

                // 🚨 [유일하게 지워진 부분!] 파이어베이스 클라우드 업로드 함수 삭제 완료! 🚨

                // 🌟 [방어 해제] 무사히 끝났으니 새로고침 방어막 끄기
                window.removeEventListener('beforeunload', preventReload);

                alert(`복원 성공! 화면을 새로고침합니다.`);
                location.reload();
            } else {
                throw new Error("잘못된 형식입니다.");
            }
        } catch (err) {
            console.error(err);
            alert("잘못된 백업 파일이거나 손상되었습니다.\n(모보에서 다운로드한 파일이 맞는지 확인해주세요!)");
        }
        // 파일 읽기가 '완전히 끝난 후'에 초기화해야 모바일에서 안 튕김
        document.getElementById('backup-file-input').value = '';
    };

    reader.readAsText(file);
}


function checkBackupStatus() { const lastBackup = localStorage.getItem('lastBackupDate'); const alertEl = document.getElementById('backup-alert'); if (!lastBackup || (Date.now() - parseInt(lastBackup)) / 86400000 >= 7) alertEl.style.display = 'block'; else alertEl.style.display = 'none'; }

// 주간 누적 통계 UI 업데이트
function updateWeeklyStatUI() {
    const coinSpent = formatNum(localStorage.getItem('weeklySpent') || 0);
    const wonSpent = formatNum(localStorage.getItem('weeklySpentWon') || 0);

    const el = document.getElementById('weekly-spent-val');
    if (el) {
        // 🌟 가운데 있던 구분선 태그를 통째로 삭제! 딱 알맹이(값) 두 개만 남깁니다!
        el.innerHTML = `<span class="stat-val">${coinSpent} C</span><span class="stat-val">${wonSpent} 원</span>`;
    }
}

// 누적 금액 더하는 로직
function addWeeklySpent(coinAmount, wonAmount = 0) {
    localStorage.setItem('weeklySpent', parseInt(localStorage.getItem('weeklySpent') || 0) + coinAmount);
    localStorage.setItem('weeklySpentWon', parseInt(localStorage.getItem('weeklySpentWon') || 0) + wonAmount);
    updateWeeklyStatUI();
}

/* =========================================
   🚨 가로 스크롤 화살표 (메모리 누수 해결 완벽판!)
========================================= */

// 1. 앱 켜질 때 딱 한 번만! 센서와 버튼을 달아주는 함수
function initScroll() {
    document.querySelectorAll('.scroll-wrapper').forEach(wrapper => {
        const list = wrapper.querySelector('.webtoon-list');
        const leftBtn = wrapper.querySelector('.left-btn');
        const rightBtn = wrapper.querySelector('.right-btn');

        if (!list || !leftBtn || !rightBtn) return; // 에러 방어막

        // 오리지널 디테일 완벽 복구! (160px 이동)
        leftBtn.onclick = () => list.scrollBy({ left: -160, behavior: 'smooth' });
        rightBtn.onclick = () => list.scrollBy({ left: 160, behavior: 'smooth' });

        // 유저가 스와이프할 때마다 감시 (앱 켜질 때 1번만 부착되므로 중복 에러 안 남!)
        list.addEventListener('scroll', () => {
            if (list.scrollWidth <= list.clientWidth) {
                leftBtn.style.display = 'none';
                rightBtn.style.display = 'none';
                return;
            }
            leftBtn.style.display = list.scrollLeft <= 0 ? 'none' : 'flex';
            rightBtn.style.display = Math.ceil(list.scrollLeft) >= list.scrollWidth - list.clientWidth - 1 ? 'none' : 'flex';
        });
    });
}

// 2. 요일이 바뀌거나 창 크기가 변할 때, 수동으로 길이를 한 번 재는 스캐너
function checkScrollArrows() {
    document.querySelectorAll('.scroll-wrapper').forEach(wrapper => {
        const list = wrapper.querySelector('.webtoon-list');
        const leftBtn = wrapper.querySelector('.left-btn');
        const rightBtn = wrapper.querySelector('.right-btn');

        if (!list || !leftBtn || !rightBtn) return;

        if (list.scrollWidth <= list.clientWidth) {
            leftBtn.style.display = 'none';
            rightBtn.style.display = 'none';
        } else {
            leftBtn.style.display = list.scrollLeft <= 0 ? 'none' : 'flex';
            rightBtn.style.display = Math.ceil(list.scrollLeft) >= list.scrollWidth - list.clientWidth - 1 ? 'none' : 'flex';
        }
    });
}

// 창 크기 변동 시 & 처음 로딩 시 재계산
window.addEventListener('resize', checkScrollArrows);
window.addEventListener('load', () => {
    setTimeout(checkScrollArrows, 100);
});


function closeAttendWarning() { document.getElementById('attend-warning-modal').style.display = 'none'; window.scrollTo({ top: 0, behavior: 'smooth' }); }

// ==========================================
// 🍞 토스트 팝업 & 실행 취소 세트 (여기서부터)
// ==========================================

// 1. 백업용 변수 (반드시 함수들 바깥에 있어야 합니다!)
let stateBackupForUndo = null;
let toastTimeout = null;

// 2. 삭제 함수 (확인 창 + 토스트 호출)
function deleteFromAction() {
    if (confirm("이 작품을 영구 삭제할까요? (다른 요일에 있는 같은 작품도 모두 삭제됩니다!)")) {

        stateBackupForUndo = JSON.stringify(state);

        let work = state[actionPlt][actionOrigDay][actionIdx];

        if (work.id) {
            Object.keys(state[actionPlt]).forEach(d => {
                state[actionPlt][d] = state[actionPlt][d].filter(w => w.id !== work.id);
            });
        } else {
            state[actionPlt][actionOrigDay].splice(actionIdx, 1);
        }

        saveData();
        closeActionModal();

        // 🚨 여기서 아래에 있는 showToast 함수를 불러냅니다!
        showToast("작품이 삭제되었습니다.");
    }
}

// 3. 토스트 팝업 띄우기 함수 (이게 꼭 있어야 팝업이 나타나요!)
function showToast(msg) {
    const toast = document.getElementById("toast-popup");
    if (!toast) return; // 혹시 HTML에 팝업창이 없으면 에러 안 나게 방어!

    document.getElementById("toast-message").textContent = msg;
    toast.classList.add("show");

    if (toastTimeout) clearTimeout(toastTimeout);

    toastTimeout = setTimeout(() => {
        toast.classList.remove("show");
        stateBackupForUndo = null;
    }, 3500);
}

// 4. 실행 취소 함수 (이것도 같이 있어야 합니다!)
function undoDelete() {
    if (!stateBackupForUndo) return;

    state = JSON.parse(stateBackupForUndo);
    saveData();

    const toast = document.getElementById("toast-popup");
    toast.classList.remove("show");
    if (toastTimeout) clearTimeout(toastTimeout);
    stateBackupForUndo = null;
}

// ==========================================
// 🍞 토스트 팝업 & 실행 취소 세트 (여기까지!)
// ==========================================


if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js');
    });
}

// =========================================
// 작품 검색 기능 로직
// =========================================
function openSearchModal() {
    closeNav();
    document.getElementById('search-input').value = '';
    document.getElementById('search-result-list').innerHTML = '<p style="text-align:center; color:#888; font-size:14px;">검색어를 입력해주세요.</p>';
    document.getElementById('search-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('search-input').focus(), 100); // 창 열리면 키보드 바로 올라오게!
}

function closeSearchModal() {
    document.getElementById('search-modal').style.display = 'none';
}

function performSearch() {
    const query = document.getElementById('search-input').value.trim().toLowerCase();
    const listEl = document.getElementById('search-result-list');
    listEl.innerHTML = '';

    if (!query) {
        listEl.innerHTML = '<p style="text-align:center; color:#888; font-size:14px;">검색어를 입력해주세요.</p>';
        return;
    }

    let foundWorks = [];
    // 검색도 켠 플랫폼(platformOrder) 안에서만!
    platformOrder.forEach(plt => {
        Object.keys(state[plt]).forEach(day => {
            (state[plt][day] || []).forEach((work, idx) => {
                if (work.title.toLowerCase().includes(query)) {
                    foundWorks.push({ plt, day, idx, work });
                }
            });
        });
    });

    if (foundWorks.length === 0) {
        listEl.innerHTML = '<p style="text-align:center; color:#888; font-size:14px;">검색 결과가 없습니다!</p>';
        return;
    }

    foundWorks.forEach(item => {
        let pltName = '', color = '';
        if (item.plt === 'lezhin') { pltName = '레진'; color = '#e60012'; }
        else if (item.plt === 'bomtoon') { pltName = '봄툰'; color = '#ff69b4'; }
        else if (item.plt === 'ridi') { pltName = '리디'; color = '#1e90ff'; }
        else if (item.plt === 'mrblue') { pltName = '미블'; color = '#004e9a'; }

        const div = document.createElement('div');
        div.style.borderBottom = '1px solid #eee';
        div.style.padding = '10px 0';
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';

        div.innerHTML = `
                    <div style="flex:1; overflow:hidden;">
                        <div style="font-size:11px; color:#888;">[${pltName}] ${item.day}</div>
                        <div style="font-size:14px; font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.work.title}</div>
                    </div>
                    <button onclick="closeSearchModal(); openActionModal('${item.plt}', '${item.day}', ${item.idx})" 
                            style="background:${color}; color:white; border:none; padding:6px 12px; border-radius:5px; cursor:pointer; font-size:12px; flex-shrink:0; margin-left:10px; font-weight:bold;">
                        관리하기
                    </button>
                `;
        listEl.appendChild(div);
    });
}

function openLinkSettingModal() {
    closeNav();

    document.getElementById('bomtoonCustomLink').value = localStorage.getItem('bomtoonLink') || '';
    document.getElementById('lezhinCustomLink').value = localStorage.getItem('lezhinLink') || '';
    document.getElementById('link-setting-modal').style.display = 'flex';
}

function closeLinkSettingModal() {
    document.getElementById('link-setting-modal').style.display = 'none';
}

function saveCustomLinks() {
    const bLink = document.getElementById('bomtoonCustomLink').value.trim();
    const lLink = document.getElementById('lezhinCustomLink').value.trim();
    // 기존에 저장되어 있던 링크 꺼내오기
    const oldB = localStorage.getItem('bomtoonLink') || '';
    const oldL = localStorage.getItem('lezhinLink') || '';

    // 🌟 [핵심 1] 유저가 아무것도 안 바꾸고 그냥 '저장'을 눌렀다면?
    if (bLink === oldB && lLink === oldL) {
        closeLinkSettingModal(); // 잔소리 없이 창만 조용히 닫아줍니다!
        return;
    }

    // 진짜 변경된 값이 있다면 금고에 저장
    localStorage.setItem('bomtoonLink', bLink);
    localStorage.setItem('lezhinLink', lLink);
    saveData();

    // 🌟 [핵심 2] 상황에 맞는 맞춤형 팝업 멘트 띄우기!
    if (!bLink && !lLink) {
        // 둘 다 빈칸으로 지워버린 경우
        alert('기본 출석 링크로 초기화되었습니다!');
    } else {
        // 하나라도 새로운 링크를 적어 넣은 경우
        alert('출석 링크가 성공적으로 저장되었습니다!');
    }

    closeLinkSettingModal();
}

function goToAttendance(plt) {

    const defaultLinks = {
        'bomtoon': 'https://www.bomtoon.com/play',
        'lezhin': 'https://www.lezhin.com/ko/arcade/attendance',
        'mrblue': 'https://www.mrblue.com/' // 미블 출석 링크 기본값
    };


    const customLink = localStorage.getItem(plt + 'Link');


    const finalLink = customLink ? customLink : defaultLinks[plt];


    window.open(finalLink, '_blank');


    checkAttendance(plt);
}

// 지갑 스와이프 시 점 움직이는 함수
function updateWalletDots() {
    const slider = document.getElementById('wallet-slider');
    const dots = document.querySelectorAll('.wallet-pagination .dot');
    if (!slider || dots.length === 0) return;

    const scrollLeft = slider.scrollLeft;
    const clientWidth = slider.clientWidth;
    const index = Math.round(scrollLeft / clientWidth);

    dots.forEach((dot, i) => {
        if (i === index) dot.classList.add('active');
        else dot.classList.remove('active');
    });
}

// 신규 추가: 숫자 세탁기 (천 단위 쉼표 찍어주는 마법!)
function formatNum(num) {
    return Number(num).toLocaleString();
}

// 상세 메뉴(점 세 개)에서 작동하는 플랫폼 이동
function moveFromAction() {
    const moveChoice = prompt("어느 플랫폼으로 이동할까요?\n\n[1] 레진코믹스\n[2] 봄툰\n[3] 리디\n[4] 미스터블루\n\n해당하는 '숫자'만 입력해 주세요!");
    if (!moveChoice) return;
    let targetPlat = '';
    if (moveChoice === '1') targetPlat = 'lezhin'; else if (moveChoice === '2') targetPlat = 'bomtoon'; else if (moveChoice === '3') targetPlat = 'ridi'; else if (moveChoice === '4') targetPlat = 'mrblue';
    else return alert("❌ 1~4 사이의 숫자만 입력해 주세요!");
    if (actionPlt === targetPlat) return alert("이미 해당 플랫폼에 있는 작품입니다!");
    if (!confirm("선택하신 플랫폼으로 작품을 이동시킬까요? (모든 요일 데이터가 함께 이동합니다!)")) return;

    let work = state[actionPlt][actionOrigDay][actionIdx];

    // [동기화 이동] 
    if (work.id) {
        let daysToMove = [];
        // 옛날 집에서 싹 다 빼오기
        Object.keys(state[actionPlt]).forEach(d => {
            let idx = state[actionPlt][d].findIndex(w => w.id === work.id);
            if (idx !== -1) {
                daysToMove.push(d);
                state[actionPlt][d].splice(idx, 1);
            }
        });
        // 새 집으로 싹 다 넣어주기
        daysToMove.forEach(d => {
            if (!state[targetPlat][d]) state[targetPlat][d] = [];
            state[targetPlat][d].push({ ...work });
        });
    } else {
        const workToMove = state[actionPlt][actionOrigDay].splice(actionIdx, 1)[0];
        if (!state[targetPlat][actionOrigDay]) state[targetPlat][actionOrigDay] = [];
        state[targetPlat][actionOrigDay].push(workToMove);
    }

    saveData(); closeActionModal(); alert("플랫폼 이동이 완료되었습니다! 새 탭에서 확인해 보세요!");
}



// ==========================================
// 🌟 [편의기능] 외부 영역(배경) 클릭 시 모든 창 닫기
// ==========================================
window.onclick = function (event) {
    // 1. 일반 모달창들 (작품추가, 정산, 검색, 계산기 등)
    if (event.target.classList.contains('modal-overlay')) {

        // 🌟 [신규 방어막] '전체 요일(서랍)' 모달 배경을 눌렀을 땐 전용 닫기 함수를 실행해서 버튼 색상까지 완벽하게 원상복구!
        if (event.target.id === 'drawer-modal') {
            closeDrawerModal();
        } else {
            event.target.style.display = 'none';
        }


        // 정산 모달인 경우 '오늘 정산' 스위치 초기화
        if (event.target.id === 'deduction-modal') {
            isTodayDeduction = false;
        }
    }

    // 2. 🌟 메뉴바 (사이드 네비게이션)
    // 클릭한 곳이 메뉴바의 배경(nav-overlay)이라면 메뉴를 닫아줍니다.
    if (event.target.classList.contains('nav-overlay')) {
        closeNav(); // 기존에 만들어둔 메뉴 닫기 함수 호출!
    }
};

// 🚨 [1] 알림 권한 요청 (앱 켤 때 한 번 물어봅니다)
function requestNotificationPermission() {
    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
    }
}

// 넷리파이 서버에서 업데이트 정보 가져오기 (확실한 팝업 + 애널리틱스 + 캐시 킬러 통합본!)
async function checkRemoteUpdate() {
    // 🌟 1. 모바일 캐시를 박살 내는 강력한 캐시 킬러!
    const UPDATE_URL = "./update.json?v=" + Date.now();

    try {
        const response = await fetch(UPDATE_URL);
        if (!response.ok) return;

        const data = await response.json();
        const lastSeenUpdate = localStorage.getItem('lastSeenUpdateId') || 0;

        // 새로운 소식 발견!
        if (data.updateId > lastSeenUpdate) {

            // 🌟 2. 팝업이 뜨는 순간 구글 애널리틱스에 '조회' 기록!
            if (typeof gtag === 'function') {
                gtag('event', 'popup_view', { 'event_category': 'notice', 'event_label': data.title });
            }

            // 🌟 3. 에러 많던 푸시 알림(Notification) 로직은 버리고, 무조건 뜨는 중앙 팝업으로 통일!
            setTimeout(() => {
                if (confirm(`[모보 업데이트 소식]\n\n${data.title}\n${data.message}\n\n`)) {
                    // 🌟 4. 확인 버튼을 누르면 애널리틱스에 '클릭' 기록 후 이동!
                    if (typeof gtag === 'function') {
                        gtag('event', 'popup_click', { 'event_category': 'notice', 'event_label': 'confirm' });
                    }
                    location.href = data.link;
                }
            }, 500); // 앱 켜지고 0.5초 뒤에 짠!

            // 🌟 5. 한 번 띄웠으니 도장 쾅! (무한 팝업 방지)
            localStorage.setItem('lastSeenUpdateId', data.updateId);
        }
    } catch (error) {
        console.error("업데이트 체크 중 오류:", error);
    }
}


// 1. 유저가 (다른 앱, 카톡 등) 하다가 '모보'로 다시 돌아왔을 때 확인하기!
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        checkRemoteUpdate();
        if (typeof askForDeduction === 'function') askForDeduction();
        autoUpdatePastBiweeklyDates(); // 🔥 돌아올 때마다 날짜 지났는지 검사!
        renderAll();
    }
});

// 2. 앱을 계속 켜두고 있는 사람을 위해 30분(1800000ms)마다 한 번씩 찔러보기!
setInterval(() => {
    checkRemoteUpdate();
}, 30 * 60 * 1000); // 30분 * 60초 * 1000밀리초

// [신규 기능] 이번 달 월말정산 예쁜 영수증 띄우기!
// 🌟 [교체] 개별 저장 버튼이 달린 월말정산 영수증 띄우기!
// [신규 기능] 이번 달 월말정산 예쁜 영수증 띄우기!
function showMonthlyReport() {
    closeNav();

    const todayKST = getKSTDate();
    const monthKey = `${todayKST.getFullYear()}-${String(todayKST.getMonth() + 1).padStart(2, '0')}`;
    const monthlyHistory = JSON.parse(localStorage.getItem('monthlyHistory')) || {};

    const thisMonthData = monthlyHistory[monthKey];

    if (!thisMonthData) {
        alert(`결제 내역이 없습니다!\n(${todayKST.getMonth() + 1}월에는 아직 정산된 작품이 없어요.)`);
        return;
    }

    let isUsed = false;
    let htmlContent = '';

    const isDark = document.body.classList.contains('dark-mode');
    const pltInfo = {
        lezhin: { name: '레진', unit: 'C', bgColor: isDark ? '#333' : '#f9f9f9', textColor: isDark ? '#fff' : '#333', themeColor: '#e60012' },
        bomtoon: { name: '봄툰', unit: 'C', bgColor: isDark ? '#333' : '#f9f9f9', textColor: isDark ? '#fff' : '#333', themeColor: '#ff69b4' },
        ridi: { name: '리디', unit: '캐시', bgColor: isDark ? '#333' : '#f9f9f9', textColor: isDark ? '#fff' : '#333', themeColor: '#1e90ff' },
        mrblue: { name: '미블', unit: '머니', bgColor: isDark ? '#333' : '#f9f9f9', textColor: isDark ? '#fff' : '#333', themeColor: '#004e9a' }
    };

    platformOrder.forEach(plt => {
        const works = thisMonthData[plt];
        if (!works) return;

        const workTitles = Object.keys(works);

        if (workTitles.length > 0) {
            isUsed = true;
            let totalPltSpent = 0;
            const info = pltInfo[plt];

            // 🌟 1. 기존 화면에 예쁘게 보여지는 모보 앱 UI 영수증 
            htmlContent += `
                    <div class="report-plt-section" id="receipt-original-${plt}" style="background: ${info.bgColor}; padding: 16px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); position: relative; color: ${info.textColor};">
                        
                        <div class="report-plt-title" style="display: flex; justify-content: space-between; align-items: center; color: ${info.textColor}; border-bottom: 2px solid ${isDark ? '#555' : '#ccc'}; padding-bottom: 8px; margin-bottom: 12px;">
                            <span style="font-weight: 900; font-size: 15px;">${info.name} 정산</span>
                            
                            <button onclick="saveSingleReceipt('${plt}', '${info.name}')" style="background: ${info.themeColor}; border: none; color: #fff; cursor: pointer; padding: 6px 10px; border-radius: 8px; display: flex; align-items: center; font-size: 11px; font-weight: normal; gap: 4px;" title="${info.name}만 사진 저장">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                저장
                            </button>
                        </div>`;

            workTitles.forEach(title => {
                const spent = works[title];
                totalPltSpent += spent;
                htmlContent += `
                        <div class="report-item" style="color: ${info.textColor};">
                            <span style="flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-right:10px;">${title}</span>
                            <span>${formatNum(spent)}<span style="font-size:11px; margin-left:3px;">${info.unit}</span></span>
                        </div>`;
            });

            htmlContent += `
                        <div class="report-total" style="display: flex; justify-content: space-between; font-weight: 900; font-size: 15px; margin-top: 12px; padding-top: 10px; border-top: 1px dashed ${isDark ? '#555' : '#ccc'}; color: ${info.textColor};">
                            <span>소계</span>
                            <span>${formatNum(totalPltSpent)} ${info.unit}</span>
                        </div>
                    </div>`;

        }
    });

    if (!isUsed) {
        alert(`결제 내역이 없습니다!\n(${todayKST.getMonth() + 1}월에는 아직 정산된 작품이 없어요.)`);
        return;
    }

    document.getElementById('report-month-title').textContent = `${todayKST.getMonth() + 1}월 모보 정산서`;
    document.getElementById('report-body-content').innerHTML = htmlContent;
    document.getElementById('monthly-report-modal').style.display = 'flex';
}

// 영수증 닫기 함수
function closeMonthlyReport() {
    document.getElementById('monthly-report-modal').style.display = 'none';
}


// 플랫폼 낱장(미니 영수증)을 이미지로 저장해 주는 함수 (예은님 커스텀 반영)
function saveSingleReceipt(plt, pltName) {
    const todayKST = getKSTDate();
    const monthKey = `${todayKST.getFullYear()}-${String(todayKST.getMonth() + 1).padStart(2, '0')}`;
    const monthlyHistory = JSON.parse(localStorage.getItem('monthlyHistory')) || {};
    const thisMonthData = monthlyHistory[monthKey];

    if (!thisMonthData || !thisMonthData[plt]) {
        alert("저장할 결제 내역이 없습니다!");
        return;
    }

    const works = thisMonthData[plt];
    let workTitles = Object.keys(works);
    if (workTitles.length === 0) return;

    workTitles.sort((a, b) => works[b] - works[a]);

    // 🌟 6개 이상이면 탑 4개만, 아니면 전부 다 자르기!
    const isOver5 = workTitles.length > 5;
    const topCount = isOver5 ? 4 : workTitles.length;
    const topTitles = workTitles.slice(0, topCount);
    const padLen = workTitles.length >= 100 ? 3 : 2;

    let totalPltSpent = 0;
    workTitles.forEach(t => totalPltSpent += works[t]);
    const unit = (plt === 'ridi') ? '캐시' : (plt === 'mrblue' ? '머니' : 'C');

    const imgPath = `./images/${plt}_bg.png`;

    const bgImage = new Image();
    bgImage.src = imgPath;

    bgImage.onload = () => {
        const tempDiv = document.createElement('div');
        tempDiv.style.position = 'fixed';
        tempDiv.style.top = '0';
        tempDiv.style.left = '-9999px';

        tempDiv.innerHTML = `
            <div id="temp-y2k-receipt" style="
                width: 320px; 
                height: 540px; 
                position: relative;
                color: #4c4c4c; 
                font-family: 'Courier Prime', 'Courier New', Courier, monospace; 
                font-size: 11px;
                font-weight: 900;
                box-sizing: border-box;
                background-color: transparent; 
            ">
                <div style="position: relative; z-index: 10; padding: 120px 20px 20px 20px; display: flex; flex-direction: column; height: 100%; box-sizing: border-box;">
                    <div style="text-align: center; margin-bottom: 8px;">
                        ======================================<br>
                        <span style="font-size: 14px; letter-spacing: 2px;">M O B O &nbsp; R E C E I P T</span><br>
                        ======================================
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px; padding: 0 5px;">
                        <span>DATE: ${todayKST.getFullYear()}.${String(todayKST.getMonth() + 1).padStart(2, '0')}.${String(todayKST.getDate()).padStart(2, '0')}</span>
                        <span>TIME: ${String(todayKST.getHours()).padStart(2, '0')}:${String(todayKST.getMinutes()).padStart(2, '0')}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px; padding: 0 5px;">
                        <span>POS: MOBO</span>
                        <span>CASHIER: s_euni_</span>
                    </div>

                    <div style="border-bottom: 1px dashed #4c4c4c; margin-bottom: 8px;"></div>

                    <div style="display: flex; justify-content: space-between; padding: 0 5px; margin-bottom: 6px;">
                        <span>[ TITLE ]</span>
                        <span>[ AMOUNT ]</span>
                    </div>

                    <div style="flex: 1; display: flex; flex-direction: column; gap: 8px; padding: 0 5px;">
                        ${topTitles.map((title, index) => `
                        <div style="display: flex; align-items: flex-end; width: 100%;">
                            <span style="max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                ${String(index + 1).padStart(padLen, '0')}. ${title}
                            </span>
                            <span style="flex: 1; border-bottom: 1.5px dashed #4c4c4c; margin: 0 5px; position: relative; top: -4px;"></span>
                            <span style="white-space: nowrap;">${formatNum(works[title])}</span>
                        </div>
                        `).join('')}
                        
                        ${isOver5 ? `
    <div style="text-align: center; margin-top: 2px; margin-bottom: 2px; line-height: 0.6; font-size: 16px; font-weight: bold;">
        .<br>.<br>.
    </div>
    <!-- 🌟 마지막 작품 등수와 금액을 렌더링 -->
    <div style="display: flex; align-items: flex-end; width: 100%;">
        <span style="max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${String(workTitles.length).padStart(padLen, '0')}. ${workTitles[workTitles.length - 1]}
        </span>
        <span style="flex: 1; border-bottom: 1.5px dashed #4c4c4c; margin: 0 5px; position: relative; top: -4px;"></span>
        <span style="white-space: nowrap;">${formatNum(works[workTitles[workTitles.length - 1]])}</span>
    </div>
    ` : ''}
                    </div> 
                    
                    <div style="border-top: 1px dashed #4c4c4c; margin-top: ${isOver5 > 0 ? '6px' : '10px'}; padding-top: 8px; padding-right: 5px; text-align: right; font-size: 13px;">
                        TOTAL: <span style="font-size: 16px;">${formatNum(totalPltSpent)}</span> ${unit}
                    </div>
                    
                    <div style="text-align: center; margin-top: 20px; margin-bottom: 8px;">
                       
                    </div>


                    <div style="text-align: center; margin-bottom: 5px;">
                        <div style="font-family: 'Libre Barcode 39', cursive; font-size: 58px; line-height: 0.7; font-weight: normal; transform: scaleY(1.3);">
                            *MOBO2026*
                        </div>
                    </div>
                    
                    <div style="text-align: center; font-size: 10px;">
                        모보를 사용해 주셔서 감사합니다.<br>
                        THANK YOU FOR USING MOBO
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(tempDiv);
        const targetElement = tempDiv.querySelector('#temp-y2k-receipt');

        html2canvas(targetElement, {
            scale: 3,
            backgroundColor: null,
            useCORS: true,
            scrollY: -window.scrollY
        }).then(textCanvas => {
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = 320 * 3;
            finalCanvas.height = 540 * 3;
            const ctx = finalCanvas.getContext('2d');

            ctx.drawImage(bgImage, 0, 0, finalCanvas.width, finalCanvas.height);
            ctx.drawImage(textCanvas, 0, 0);

            const imgData = finalCanvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = `모보_${todayKST.getMonth() + 1}월_${pltName}_정산서.png`;
            link.href = imgData;
            link.click();

            document.body.removeChild(tempDiv);
        }).catch(err => {
            alert('이미지 저장 중 오류가 발생했습니다.');
            document.body.removeChild(tempDiv);
        });
    };

    bgImage.onerror = () => {
        alert("배경 이미지(" + imgPath + ")를 찾을 수 없습니다. 경로를 다시 한번 확인해 주세요!");
    };
}

// 숨어있는 좀비 장부까지 완벽하게 불태우는 강력한 청소기!
function cleanupIncorrectHistoryV2() {
    // 이번엔 V2 도장으로 확인합니다!
    if (localStorage.getItem('isHistoryCleanedV2') === 'true') return;

    // 1. 밖에 나와 있는 가짜 장부 태우기
    localStorage.removeItem('monthlyHistory');

    // 2. 통합 금고(STORAGE_KEY) 안에 몰래 숨어있던 좀비 백업본 찾아내서 태우기!
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
        let p = JSON.parse(data);
        p.monthlyHistory = {}; // 금고 안의 장부도 완전 텅 빈 상태로 덮어쓰기!
        localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    }

    // 3. 청소 완료 도장 V2 쾅!
    localStorage.setItem('isHistoryCleanedV2', 'true');
    localStorage.setItem('isPastDataMigrated', 'true'); // 예전 영끌 자물쇠도 확실히 채움

    console.log("숨어있던 좀비 장부까지 완벽하게 박멸했습니다! 🧟‍♂️🔥");
}

// ==========================================
// 🌟 [최종 수정] 격주만 하단 서랍, 나머지는 요일 내 주기 뱃지 표시
// ==========================================
function openGlobalDrawerModal(activePlt) {
    if (typeof activePlt !== 'string') {
        activePlt = platformOrder[0];
    }

    const isDark = document.body.classList.contains('dark-mode');
    document.getElementById('drawer-title').textContent = '요일 전체 작품';
    document.getElementById('drawer-title').style.color = isDark ? '#eee' : '#333';

    const listEl = document.getElementById('drawer-list');
    listEl.innerHTML = '';

    const pltNames = { lezhin: '레진', bomtoon: '봄툰', ridi: '리디', mrblue: '미블' };
    const pltColors = { lezhin: '#e60012', bomtoon: '#ff69b4', ridi: '#1e90ff', mrblue: '#004e9a' };

    // 1. 상단 플랫폼 탭
    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'global-drawer-tabs';

    platformOrder.forEach(plt => {
        const btn = document.createElement('button');
        btn.className = 'global-tab-btn';
        btn.textContent = pltNames[plt];

        if (plt === activePlt) {
            btn.style.backgroundColor = pltColors[plt];
            btn.style.color = '#fff';
            btn.style.borderColor = pltColors[plt];
        } else {
            btn.style.backgroundColor = isDark ? '#333' : '#f8f9fa';
            btn.style.color = isDark ? '#888' : '#888';
            btn.style.borderColor = isDark ? '#444' : '#eee';
        }

        btn.onclick = () => openGlobalDrawerModal(plt);
        tabsContainer.appendChild(btn);
    });
    listEl.appendChild(tabsContainer);

    // 2. 그룹 분리 (격주와 휴재/완결만 별도 관리)
    const groups = {
        '월요일': [], '화요일': [], '수요일': [], '목요일': [], '금요일': [], '토요일': [], '일요일': [],
        '10일 연재': [],
        '격주 연재': [],
        '휴재 및 완결': []
    };

    let totalWorksCount = 0;

    Object.keys(state[activePlt]).forEach(day => {
        (state[activePlt][day] || []).forEach((work, idx) => {
            const workData = { ...work, origDay: day, origIdx: idx };
            totalWorksCount++;

            // 🌟 수정: 자동 휴재 상태인지 먼저 확인합니다.
            const autoBreak = isWorkOnAutoBreak(work);

            // 원래 휴재/완결이거나, '자동 휴재' 상태라면 휴재 탭으로 보냅니다.
            if (work.status === '휴재' || work.status === '완결' || autoBreak) {
                groups['휴재 및 완결'].push(workData);
            }
            else if (work.cycle && work.cycle.includes('격주 연재')) {
                groups['격주 연재'].push(workData);
            }
            else if (day === '10일 연재') {
                groups['10일 연재'].push(workData);
            }
            else {
                // 🌟 '특정 주 휴재'가 포함된 일반 작품들도 모두 해당 요일 그룹으로!
                groups[day].push(workData);
            }
        });
    });

    const displayOrder = [
        '월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일',
        '10일 연재', '격주 연재', '휴재 및 완결'
    ];

    displayOrder.forEach(groupName => {
        const works = groups[groupName];

        if (works.length > 0) {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'drawer-day-group';

            const headerDiv = document.createElement('div');
            headerDiv.className = 'drawer-day-header';
            headerDiv.style.top = '45px';

            // 🌟 인라인 스타일 삭제! 대신 종류별로 이름표(class)를 달아줍니다.
            let extraClass = '';
            if (groupName === '10일 연재') extraClass = ' badge-10day';
            else if (groupName === '격주 연재') extraClass = ' badge-biweekly';
            else if (groupName === '휴재 및 완결') extraClass = ' badge-finished';

            // 🌟 style 속성을 빼고 class 안에 쏙 넣어줍니다!
            headerDiv.innerHTML = `<span class="day-badge${extraClass}">${groupName}</span> <span class="day-count">${works.length}개</span>`;
            groupDiv.appendChild(headerDiv);

            const itemsBox = document.createElement('div');
            itemsBox.className = 'drawer-items-box';

            works.forEach((work) => {
                let badgeHtml = '';
                let isBreak = isWorkOnAutoBreak(work);
                if (work.status === '휴재') badgeHtml = `<span class="drawer-badge badge-break">휴재</span>`;
                else if (work.status === '완결') badgeHtml = `<span class="drawer-badge badge-end">완결</span>`;
                else if (isBreak) badgeHtml = `<span class="drawer-badge badge-break">자동휴재</span>`;

                // 🌟 서랍 모달: 이모티콘 완전 삭제 & 무조건 한 줄 방어!
                let cycleBadge = '';
                if (work.cycle && work.cycle.trim() !== '') {
                    const badgeBg = isDark ? '#1a233a' : '#e8f0fe';
                    const badgeColor = isDark ? '#8ab4f8' : '#1967d2';
                    const parts = work.cycle.split('+').map(p => p.trim());

                    if (parts.length === 1) {
                        // 1개일 때 이모티콘 삭제!
                        cycleBadge = `<span style="font-size: 12px; color: ${badgeColor}; background: ${badgeBg}; padding: 4px 6px; border-radius: 4px; margin-left: 6px; font-weight: normal; white-space: nowrap; display: inline-block; vertical-align: middle;">${parts[0]}</span>`;
                    } else {
                        const compressedParts = parts.map(p => {
                            let shortStr = p;
                            if (p.includes('10일 연재')) {
                                let match = p.match(/\((.*?)\)/);
                                shortStr = match ? match[1] : '10일';
                            } else if (p.includes('격주 연재')) {
                                let match = p.match(/\((.*?)\)/);
                                if (match) {
                                    const d = new Date(match[1]);
                                    shortStr = !isNaN(d) ? `${d.getMonth() + 1}/${d.getDate()}` : match[1];
                                } else {
                                    shortStr = '격주';
                                }
                            } else if (p.includes('휴재') || p.includes('휴')) {
                                if (p.includes('매월')) {
                                    let match = p.match(/(\d+)주차/);
                                    shortStr = match ? `${match[1]}주차 휴재` : '정기휴재'; // '주휴'를 '주차 휴재'로 변경!
                                } else {
                                    let match = p.match(/(\d+)연\s*(\d+)휴\s*(\d+)주차/);
                                    shortStr = match ? `${match[1]}연 ${match[2]}휴 (${match[3]})` : p.replace(/(\d+)연\s*(\d+)휴/, '$1연 $2휴');
                                }
                            }
                            return shortStr;
                        });

                        // 앞쪽에 있던 🔄 빼고 바로 합치기!
                        const joinedText = compressedParts.join('<span style="color:#888; margin: 0 2px;">+</span>');

                        cycleBadge = `<span style="font-size: 12px; color: ${badgeColor}; background: ${badgeBg}; padding: 4px 6px; border-radius: 4px; margin-left: 6px; font-weight: normal; white-space: nowrap; display: inline-block; vertical-align: middle;">${joinedText}</span>`;
                    }
                }

                // 요일 프리픽스 (특수 그룹에만 표시)
                let dayPrefixHtml = '';
                const regularDays = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];
                // 🌟 [수정] 10일 연재 그룹일 때는 이중으로 말머리 달지 않기!
                if (!regularDays.includes(groupName) && groupName !== '10일 연재') {
                    let shortDay = work.origDay.replace('요일', '');
                    dayPrefixHtml = `<span style="color: #aaa; font-weight: bold; margin-right: 8px; font-size: 13px; min-width: 24px;">[${shortDay}]</span>`;
                }

                const div = document.createElement('div');
                div.className = 'drawer-item';
                div.style.cursor = 'pointer';

                div.onclick = () => {
                    closeDrawerModal();
                    openActionModal(activePlt, work.origDay, work.origIdx);
                };

                div.innerHTML = `
                            ${dayPrefixHtml}
                            <span class="drawer-item-title">${work.title}</span>
                            ${cycleBadge}
                            ${badgeHtml}
                        `;
                itemsBox.appendChild(div);
            });

            groupDiv.appendChild(itemsBox);
            listEl.appendChild(groupDiv);
        }
    });

    if (totalWorksCount === 0) {
        const emptyMsg = document.createElement('p');
        emptyMsg.style.textAlign = 'center';
        emptyMsg.style.color = '#888';
        emptyMsg.style.marginTop = '40px';
        emptyMsg.style.fontSize = '14px';
        emptyMsg.textContent = '이 플랫폼에는 저장된 작품이 없습니다!';
        listEl.appendChild(emptyMsg);
    }

    document.getElementById('drawer-modal').style.display = 'flex';
}

function closeDrawerModal() {
    document.getElementById('drawer-modal').style.display = 'none';

    // 🌟 모달 닫을 때 버튼 색상 원상복구
    document.querySelectorAll('.day-btn').forEach(btn => {
        if (btn.dataset.day === viewDay) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
};

// --- 🎛️ 필터 및 정렬 모달창 관련 기능 ---


let horizontalSortables = {}; // 🌟 가로 스크롤 마법사 바구니

// 💡 방금 누른 필터 버튼이 어떤 플랫폼인지 기억할 변수(메모장)
let currentFilterPlt = '';

// 🌟 [업그레이드] 숨기기 스위치를 플랫폼별로 4개 달아줍니다!
let isHidingFinished = { lezhin: false, bomtoon: false, ridi: false, mrblue: false };

// 🌟 [핵심 로직] 페이지를 처음 켤 때, 로컬 스토리지에서 저장된 필터 기억을 꺼내옵니다!
const savedHideData = localStorage.getItem('mobo_hide_works_plt');
if (savedHideData) {
    // 포장지(문자열)를 뜯어서 다시 자바스크립트 주머니(객체)로 복구!
    isHidingFinished = JSON.parse(savedHideData);
}

// 1. 모달창 열기
function toggleFilterMenu(plt) {
    currentFilterPlt = plt;

    // 🌟 모달창 열 때, 지금 누른 플랫폼이 숨기기 상태인지 아닌지 확인해서 글씨를 맞춰줍니다!
    const hideText = document.getElementById('hide-text');
    if (isHidingFinished[currentFilterPlt]) {
        hideText.innerText = "휴재 및 완결 작품 꺼내기";
    } else {
        hideText.innerText = "휴재 및 완결 작품 숨기기";
    }

    document.getElementById('filter-modal').style.display = 'flex';
}

// 1. 순서 편집 창 열 때 불 켜기/끄기 자동 판독!
function startReorder() {
    closeFilterMenu();
    let pltName = '';
    if (currentFilterPlt === 'lezhin') pltName = '레진';
    else if (currentFilterPlt === 'bomtoon') pltName = '봄툰';
    else if (currentFilterPlt === 'ridi') pltName = '리디';
    else if (currentFilterPlt === 'mrblue') pltName = '미블';

    document.getElementById('reorder-title').textContent = `${pltName} (${viewDay}) 순서 편집`;

    // 🌟 [핵심] 현재 리스트가 가나다순인지 다가나순인지 똑똑하게 스캔하는 로직!
    const arr = state[currentFilterPlt][viewDay] || [];
    let isAZ = true;
    let isZA = true;

    // 카드가 2개 이상일 때만 앞뒤 글자 비교
    if (arr.length > 1) {
        for (let i = 0; i < arr.length - 1; i++) {
            let compare = arr[i].title.localeCompare(arr[i + 1].title, 'ko');
            if (compare > 0) isAZ = false; // 앞글자가 더 뒤쪽(ㅎ)이면 가나다(AZ) 아님
            if (compare < 0) isZA = false; // 앞글자가 더 앞쪽(ㄱ)이면 다가나(ZA) 아님
        }
    } else {
        isAZ = false; isZA = false; // 1개 이하면 굳이 불 켤 필요 없음
    }

    // 🌟 스캔 결과에 따라 똑똑하게 버튼 불 켜주기!
    const btnAZ = document.getElementById('btn-sort-az');
    const btnZA = document.getElementById('btn-sort-za');

    if (isAZ) {
        btnAZ.classList.add('active');
        btnZA.classList.remove('active');
    } else if (isZA) {
        btnZA.classList.add('active');
        btnAZ.classList.remove('active');
    } else {
        // 섞여 있으면 둘 다 끄기
        btnAZ.classList.remove('active');
        btnZA.classList.remove('active');
    }

    document.getElementById('reorder-modal').style.display = 'flex';
    renderReorderList();
}

// 3. 순서 편집 모달창 닫기 함수
function closeReorderModal() {
    document.getElementById('reorder-modal').style.display = 'none';
    renderAll(); // 혹시 순서가 바뀌었을지 모르니 닫을 때 메인 화면 새로고침!
}

// 2. 가나다 정렬 버튼 기능
function sortListAZ() {
    if (viewDay === '휴재' || viewDay === '완결') return alert("이 탭에선 자동 정렬을 할 수 없어요!");

    const arr = state[currentFilterPlt][viewDay];
    if (arr.length === 0) return;

    arr.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
    saveData();
    renderReorderList();

    // 🌟 탭 색상 변경 로직 (가나다에 불 켜고, 다가나 불 끄기)
    document.getElementById('btn-sort-az').classList.add('active');
    document.getElementById('btn-sort-za').classList.remove('active');
}

// 3. 다가나 정렬 버튼 기능
function sortListZA() {
    if (viewDay === '휴재' || viewDay === '완결') return alert("이 탭에선 자동 정렬을 할 수 없어요!");

    const arr = state[currentFilterPlt][viewDay];
    if (arr.length === 0) return;

    arr.sort((a, b) => b.title.localeCompare(a.title, 'ko'));
    saveData();
    renderReorderList();

    // 🌟 탭 색상 변경 로직 (다가나에 불 켜고, 가나다 불 끄기)
    document.getElementById('btn-sort-za').classList.add('active');
    document.getElementById('btn-sort-az').classList.remove('active');
}


// 모달창 닫기
function closeFilterMenu() {
    document.getElementById('filter-modal').style.display = 'none';
}

// 어두운 배경 클릭 시 모달창 닫기
document.getElementById('filter-modal').addEventListener('click', function (e) {
    if (e.target === this) {
        closeFilterMenu();
    }
});



// 🌟 [최종 완성본] 현재 선택한 플랫폼의 숨기기 스위치만 똑딱! 켜고 끄는 함수
function toggleHideWorks() {
    // 1. 해당 플랫폼의 상태만 반대로 뒤집기 (true <-> false)
    isHidingFinished[currentFilterPlt] = !isHidingFinished[currentFilterPlt];

    // 🌟 2. 핵심!! 플랫폼 4개의 상태가 담긴 주머니를 통째로 포장해서 장기 기억장치에 저장!
    localStorage.setItem('mobo_hide_works_plt', JSON.stringify(isHidingFinished));

    // 3. 버튼 글씨 바꾸기
    const hideTextBtn = document.getElementById('hide-text');
    if (isHidingFinished[currentFilterPlt]) {
        hideTextBtn.textContent = '휴재 및 완결 작품 꺼내기';
    } else {
        hideTextBtn.textContent = '휴재 및 완결 작품 숨기기';
    }

    // 🌟 4. 상태가 바뀌었으니 화면 전체를 다시 그려서 (renderAll) 숨김/표시 즉시 반영!
    renderAll();

    // 🌟 [여기에 추가!] 숨기기 토글 이벤트 쏘기! (켜졌는지 꺼졌는지 상태도 같이 보냄)
    trackClick('toggle_hide_works', {
        'platform': currentFilterPlt,
        'status': isHidingFinished[currentFilterPlt] ? 'hidden' : 'shown'
    });

    // 모달창 닫기
    closeFilterMenu();
}

// 💡 전역 변수로 Sortable 마법사를 담을 공간 준비
let reorderSortable = null;

// 🗂️ 세로 리스트를 그려주고 마법을 부여하는 함수
function renderReorderList() {
    const listEl = document.getElementById('reorder-list');
    listEl.innerHTML = '';

    // 🚨 휴재나 완결 탭은 순서 편집 막기
    if (viewDay === '휴재' || viewDay === '완결') {
        listEl.innerHTML = '<p style="text-align: center; color: #e60012; font-size: 14px; margin-top: 20px; font-weight: bold;">🚨 휴재/완결 탭에서는<br>순서를 편집할 수 없어요!</p><p style="text-align: center; color: #888; font-size: 12px;">(순서 변경은 각 요일 탭에서 진행해 주세요)</p>';
        return;
    }

    const works = state[currentFilterPlt][viewDay] || [];

    if (works.length === 0) {
        listEl.innerHTML = '<p style="text-align: center; color: #888; font-size: 14px;">작품이 없습니다!</p>';
        return;
    }

    // 작품들을 하나씩 세로 박스로 만들기
    works.forEach((work, idx) => {
        const div = document.createElement('div');
        div.dataset.idx = idx;

        // 🌟 JS에서는 인라인 스타일 빼고 깔끔하게 클래스 이름표만 붙여줍니다!
        div.className = 'reorder-list-item';

        // 🌟 [추가] 순서 편집 창에도 상태 뱃지를 달아줍니다!
        let badgeHtml = '';
        let isBreak = isWorkOnBreak(work);
        if (work.status === '휴재') {
            badgeHtml = `<span style="font-size: 11px; background: #e67e22; color: #fff; padding: 2px 5px; border-radius: 4px; margin-right: 8px; font-weight: bold;">휴재</span>`;
        } else if (work.status === '완결') {
            badgeHtml = `<span style="font-size: 11px; background: #7f8c8d; color: #fff; padding: 2px 5px; border-radius: 4px; margin-right: 8px; font-weight: bold;">완결</span>`;
        } else if (isBreak) {
            badgeHtml = `<span style="font-size: 11px; background: #e67e22; color: #fff; padding: 2px 5px; border-radius: 4px; margin-right: 8px; font-weight: bold;">자동휴재</span>`;
        }

        // 🌟 [디테일] 휴재작들은 살짝 반투명하게 만들어서 위계질서를 낮춰줍니다.
        if (isBreak) div.style.opacity = '0.5';

        div.innerHTML = `
                    ${badgeHtml}
                    <span class="reorder-item-title">${work.title}</span>
                    <span class="drag-handle">≡</span>
                `;
        listEl.appendChild(div);
    });

    // 🪄 [핵심] 여기서 SortableJS 마법 부여!
    if (reorderSortable) {
        reorderSortable.destroy();
    }

    reorderSortable = new Sortable(listEl, {
        animation: 150,
        handle: '.drag-handle',
        ghostClass: 'sortable-ghost',

        onEnd: function (evt) {
            const arr = state[currentFilterPlt][viewDay];

            // 배열에서 옛날 자리(oldIndex)에 있던 걸 뽑아서, 새 자리(newIndex)에 끼워 넣기!
            const draggedItem = arr.splice(evt.oldIndex, 1)[0];
            arr.splice(evt.newIndex, 0, draggedItem);

            // 🚨 [디테일] 유저가 직접 드래그해서 섞었으니, 더 이상 가나다순이 아님! 탭 버튼 불 끄기!
            document.getElementById('btn-sort-az').classList.remove('active');
            document.getElementById('btn-sort-za').classList.remove('active');

            // 데이터 영구 저장! (이때 만능 청소기가 뒤에서 휴재작을 쓸어 내림)
            saveData();

            // 🚨👇 [핵심 추가] 데이터가 갱신됐으니, 유저가 보고 있는 이 모달창도 1초 만에 새로고침!
            renderReorderList();
        }
    });
}

// ==========================================
// 🚀 안드로이드/스와이프 뒤로가기 완벽 방어 시스템
// ==========================================
window.addEventListener('load', () => {
    // 1. 앱이 켜질 때 '가짜 페이지'를 하나 밀어넣어서 뒤로가기 함정을 파둡니다.
    history.pushState(null, null, location.href);
});

window.addEventListener('popstate', (e) => {
    // 2. 유저가 '뒤로가기'를 누르면, 현재 열려있는 모든 모달창과 메뉴를 스캔합니다.
    const modals = document.querySelectorAll('.modal-overlay, #side-nav, .filter-modal-overlay');
    let isAnyModalOpen = false;

    modals.forEach(m => {
        if (m.style.display === 'flex' || m.style.display === 'block') {
            m.style.display = 'none'; // 열려있는 창을 조용히 닫아줍니다.
            isAnyModalOpen = true;
        }
    });

    if (isAnyModalOpen) {
        // 3. 창이 열려있었다면? 앱이 안 꺼지게 가짜 페이지를 다시 꽉 채워넣습니다! (함정 리필)
        history.pushState(null, null, location.href);

        // 덤으로 햄버거 버튼과 서랍장 탭 색상 원래대로 살려주기
        const topBar = document.querySelector('.top-util-bar');
        if (topBar) topBar.style.opacity = '1';

        if (typeof isTodayDeduction !== 'undefined') isTodayDeduction = false;

        document.querySelectorAll('.day-btn').forEach(btn => {
            if (typeof viewDay !== 'undefined' && btn.dataset.day === viewDay) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    } else {
        // 4. 열려있는 창이 아무것도 없다면? 그때는 진짜로 앱을 끕니다.
        history.back();
    }


});

window.addEventListener('scroll', function () {
    const utilBar = document.querySelector('.top-util-bar');

    // 🚨 모바일/PC 상관없이 현재 스크롤 위치를 가장 정확하게 짚어내는 식!
    const scrollPosition = window.scrollY || document.documentElement.scrollTop;

    if (utilBar) {
        if (scrollPosition > 50) {
            utilBar.classList.add('scroll-fixed');
        } else {
            utilBar.classList.remove('scroll-fixed');
        }
    }
}, { passive: true });



// ==========================================
// 🌙 다크모드 스위치 스와이프(밀기) 기능 추가!
// ==========================================
function initThemeSwitchSwipe() {
    const themeSwitch = document.querySelector('.header-theme-switch');
    if (!themeSwitch) return;

    let startX = 0;
    let isDragging = false;

    // 1. 손가락이 스위치에 닿았을 때 (시작 X좌표 기억)
    themeSwitch.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        isDragging = false;
    });

    // 2. 손가락을 움직일 때 (드래그 중이라고 표시)
    themeSwitch.addEventListener('touchmove', (e) => {
        isDragging = true;
    });

    // 3. 손가락을 뗐을 때 (왼쪽/오른쪽 판별해서 찰칵!)
    themeSwitch.addEventListener('touchend', (e) => {
        // 드래그를 안 하고 그냥 톡! 터치한 거면 원래 있던 onclick이 작동하도록 놔둡니다.
        if (!isDragging) return;

        const endX = e.changedTouches[0].clientX;
        const diffX = endX - startX; // 얼마나 이동했는지 계산
        const isDark = document.body.classList.contains('dark-mode');

        // 15px 이상 유의미하게 옆으로 밀었을 때만 작동!
        if (Math.abs(diffX) > 15) {
            e.preventDefault(); // 🚨 중요: 스와이프로 켰으니 뒤따라오는 '클릭' 이벤트가 중복 실행되는 걸 막아줍니다!

            if (diffX > 15 && !isDark) {
                // 오른쪽으로 슥~ 밀었는데 라이트 모드면? -> 다크모드 켜기!
                toggleDarkMode();
            } else if (diffX < -15 && isDark) {
                // 왼쪽으로 슥~ 밀었는데 다크 모드면? -> 다크모드 끄기!
                toggleDarkMode();
            }
        }
    });
}

/* =========================================
   🎉 폰트 업데이트 공지 팝업 (1회용 마법)
========================================= */

document.addEventListener('DOMContentLoaded', function () {
    // 1. 브라우저 기억상자에 'font_update_seen'이라는 도장이 찍혀있는지 확인합니다.
    const hasSeenNotice = localStorage.getItem('font_update_seen');
    const updateModal = document.getElementById('update-notice-modal');

    // 2. 도장이 없다면? (처음 들어온 유저라면) 팝업을 짠! 하고 보여줍니다.
    if (!hasSeenNotice && updateModal) {
        updateModal.style.display = 'flex';
    }
});

// 3. '확인했어요!' 버튼을 누르면 실행되는 함수
function closeUpdateNotice() {
    // 팝업을 숨기고
    document.getElementById('update-notice-modal').style.display = 'none';

    // 브라우저 기억상자에 "이 사람 팝업 봤음!" 하고 도장을 꾹 찍어줍니다. (이제 다신 안 뜸!)
    localStorage.setItem('font_update_seen', 'true');
}

// ☁️ 고화질 사진을 ImgBB 창고에 올리고 '주소(URL)'를 받아오는 함수
async function uploadImageToImgBB(base64Data) {
    const apiKey = '6963cfb507df01b542e8d66d26483e29';

    try {
        // 1. 순수 파일(Blob)로 변환 (글자가 깨져서 거절당하는 현상 완벽 방지)
        const arr = base64Data.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        const fileBlob = new Blob([u8arr], { type: mime });

        const formData = new FormData();
        formData.append('image', fileBlob, 'image.jpg');

        const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        // 🌟 2. 에러가 났을 때 '서버가 말하는 진짜 이유'를 화면에 띄워줍니다!
        if (!response.ok || !data.success) {
            console.error("ImgBB 거절 상세 정보:", data);
            alert(`🚨 ImgBB 업로드 실패!\n원인: ${data.error.message}\n(API 키 문제이거나 서버 오류입니다. API 키를 새로 발급받아 보세요!)`);
            throw new Error(data.error.message);
        }

        return data.data.url;

    } catch (error) {
        console.error("업로드 함수 에러:", error);
        throw error;
    }
}

/* =========================================================================
   🚚 [최종형] 유저 안심 실시간 현황 바 + 6초 안전 딜레이 통합 이사 시스템
========================================================================= */

// 1. 어떤 레이아웃 환경에서도 무조건 최상단에 노출되는 현황 바 UI 관리 함수
function updateMigrationUI(current, total) {
    let statusEl = document.getElementById('migration-status');

    // 만약 화면에 상태창 요소가 없다면 강제로 생성하여 주입
    if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.id = 'migration-status';
        // 모보 앱의 기존 CSS에 덮이지 않도록 !important를 활용해 스타일을 강제 고정합니다.
        statusEl.style.cssText = `
            position: fixed !important;
            left: 20px !important;
            bottom: 20px !important;
            background: rgba(20, 20, 20, 0.95) !important;
            color: #ffffff !important;
            padding: 12px 20px !important;
            border-radius: 10px !important;
            font-size: 13px !important;
            font-weight: 500 !important;
            z-index: 9999999 !important;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4) !important;
            letter-spacing: -0.5px !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            display: none !important;
            pointer-events: none !important;
        `;
        document.body.appendChild(statusEl);
    }

    // 진행 현황 글자 업데이트 및 화면 노출
    statusEl.innerText = `사진 안전하게 정리 중 (${current}/${total})`;
    statusEl.style.setProperty('display', 'block', 'important');

    // 모든 사진 이사가 완료되면 3초 후에 자연스럽게 사라집니다.
    if (current >= total) {
        setTimeout(() => {
            if (statusEl) statusEl.style.setProperty('display', 'none', 'important');
        }, 3000);
    }
}

// 2. 메인 이사 비동기 함수
async function silentAutoMigrateToImgBB() {
    // 중복 실행 방지 안전장치
    if (window.isMigrating) return;
    window.isMigrating = true;

    const platforms = ['lezhin', 'bomtoon', 'ridi', 'mrblue'];
    let worksToMigrate = [];
    let totalImages = 0;

    // [Step 1] 유저의 로컬 데이터 스캔 (전체 사진 수 및 이사 대상 분류)
    for (let plt of platforms) {
        if (!state[plt]) continue;
        for (let day of Object.keys(state[plt])) {
            for (let work of state[plt][day]) {
                if (work.img) {
                    totalImages++; // 전체 등록된 사진 카운트
                    // 아직 이사하지 않은 뚱뚱한 원본(Base64) 데이터만 선별
                    if (work.img.startsWith('data:image')) {
                        worksToMigrate.push(work);
                    }
                }
            }
        }
    }

    // 이사할 남은 사진이 없다면 즉시 종료하되, UI가 켜져 있다면 숨깁니다.
    if (worksToMigrate.length === 0) {
        window.isMigrating = false;
        let statusEl = document.getElementById('migration-status');
        if (statusEl) statusEl.style.setProperty('display', 'none', 'important');
        return;
    }

    // 이미 이사가 완료된 사진 개수 계산
    let migratedCount = totalImages - worksToMigrate.length;

    // [Step 2] 선별된 사진만 안전하게 순차 이사 시작
    for (let work of worksToMigrate) {
        // UI에 실시간 현황 전달 (현재 처리 중인 번호, 총 개수)
        updateMigrationUI(migratedCount + 1, totalImages);

        try {
            // 🌟 [핵심 방어막] 다음 사진을 보내기 전 무조건 6초 동안 대기
            await new Promise(resolve => setTimeout(resolve, 6000));

            // ImgBB 서버로 전송
            let newUrl = await uploadImageToImgBB(work.img);

            // 🌟 [엄격한 검증] 올바른 주소 형태로 응답이 왔을 때만 변환 성공 처리
            if (newUrl && newUrl.startsWith('http')) {
                work.img = newUrl;
                migratedCount++;
                saveData(true); // 1장이 성공할 때마다 즉시 폰의 로컬스토리지 금고에 박제!
            }
        } catch (e) {
            console.error(`[${work.title}] 사진 업로드 실패 (다시 시도):`, e);
            // 업로드 중 에러(400, 429 등)가 나도 catch문으로 안전하게 넘어가므로
            // 유저의 소중한 원본 데이터는 절대 지워지거나 변형되지 않고 그대로 유지됩니다.
        }
    }

    // 최종 완공 도장 쾅!
    updateMigrationUI(totalImages, totalImages);
    window.isMigrating = false;
    console.log("🤫 모든 유저의 데이터 최적화 이사가 안전하게 완료되었습니다.");
}

// 앱이 켜지고 화면이 다 그려진 후, 2초(2000ms) 뒤에 버벅임 없이 유저 몰래 실행!
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(silentAutoMigrateToImgBB, 6000);
});