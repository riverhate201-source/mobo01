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

    // [추가] 3. 격주 연재 '자동휴재' 판독
    if (work.cycle && work.cycle.includes('격주 연재')) {
        const match = work.cycle.match(/격주 연재\s*\((\d{1,2})\/(\d{1,2})\)/);

        if (match) {
            const targetMonth = Number(match[1]);
            const targetDay = Number(match[2]);
            const today = getWebtoonDate();

            if (
                targetMonth !== today.getMonth() + 1 ||
                targetDay !== today.getDate()
            ) {
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

    // 3. 격주 연재: 연재 예정일이 아니면 자동휴재
    if (work.cycle && work.cycle.includes('격주 연재')) {
        return isWorkOnAutoBreak(work);
    }

    return false;
}



// 🌟 [수정] 어떤 플랫폼인지(platform)를 넘겨받아서 봄툰만 특별 관리합니다!
function isDateMatch(cycleStr, dateObj, platform = '') {
    if (!cycleStr || !cycleStr.includes("10일 연재")) return false;
    let match = cycleStr.match(/\((.*?)\)/);
    if (!match) return false;

    let nums = match[1].match(/\d+/g);
    if (!nums) return false;

    let daysArr = nums.map(Number);

    // 🌟 [핵심] 봄툰은 당일 22시에 업로드되므로, 앱 기준일에서 하루를 빼서 현실 날짜에 맞춥니다!
    let checkDate = new Date(dateObj);
    if (platform === 'bomtoon') {
        checkDate.setDate(checkDate.getDate() - 1);
    }

    let todayDate = checkDate.getDate();
    let lastDayOfMonth = new Date(checkDate.getFullYear(), checkDate.getMonth() + 1, 0).getDate();

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

// QA-044D-3D-3B | 멀티탭 데이터 충돌 방지
let moboMainLastSavedRaw =
    localStorage.getItem(STORAGE_KEY);

let moboMainTabStale = false;
let moboMainStaleWarned = false;

function moboMainTabIsStale() {
    if (moboMainTabStale) return true;

    try {
        return localStorage.getItem(STORAGE_KEY) !==
            moboMainLastSavedRaw;
    } catch (error) {
        console.error('MoBo 멀티탭 상태 확인 실패:', error);
        return true;
    }
}

// 다른 탭이 통합 작품 데이터를 변경하면 감지
window.addEventListener('storage', event => {
    if (event.storageArea !== localStorage) return;

    if (
        event.key !== STORAGE_KEY &&
        event.key !== null
    ) return;

    if (event.newValue !== moboMainLastSavedRaw) {
        moboMainTabStale = true;

        console.warn(
            'MoBo · 다른 탭에서 데이터 변경 감지. ' +
            '현재 탭은 새로고침 전까지 저장을 제한합니다.'
        );
    }
});


// 플랫폼별 기본 정렬 방식
let platformSortModes = {
    lezhin: 'manual',
    bomtoon: 'manual',
    ridi: 'manual',
    mrblue: 'manual'
};

// 플랫폼 기본 정렬보다 우선하는 요일별 커스텀 설정
let manualDayOverrides = {
    lezhin: {},
    bomtoon: {},
    ridi: {},
    mrblue: {}
};

function getEffectiveSortMode(plt, day) {
    // 특별 탭은 가나다·다나가 정렬의 적용 대상에서 제외
    if (!isReorderableDay(day)) {
        return 'manual';
    }

    return manualDayOverrides[plt]?.[day] === true
        ? 'manual'
        : (platformSortModes[plt] || 'manual');
}

// 저장된 원본 배열은 바꾸지 않고 제목만 비교
function compareWorkTitlesByMode(a, b, plt, day) {
    const mode = getEffectiveSortMode(plt, day);

    if (mode === 'manual') return 0;

    const result = String(a.title || '').localeCompare(
        String(b.title || ''), 'ko'
    );

    return mode === 'za' ? -result : result;
}


let state = {
    lezhin: { "월요일": [], "화요일": [], "수요일": [], "목요일": [], "금요일": [], "토요일": [], "일요일": [], "10일 연재": [], "격주 연재": [] },
    bomtoon: { "월요일": [], "화요일": [], "수요일": [], "목요일": [], "금요일": [], "토요일": [], "일요일": [], "10일 연재": [], "격주 연재": [] },
    ridi: { "월요일": [], "화요일": [], "수요일": [], "목요일": [], "금요일": [], "토요일": [], "일요일": [], "10일 연재": [], "격주 연재": [] },
    mrblue: { "월요일": [], "화요일": [], "수요일": [], "목요일": [], "금요일": [], "토요일": [], "일요일": [], "10일 연재": [], "격주 연재": [] }
};

let platformOrder = JSON.parse(localStorage.getItem('platformOrder')) || ['lezhin', 'bomtoon', 'ridi', 'mrblue'];

window.onload = function () {
    requestNotificationPermission(); // 1. 권한 확인 (기존과 똑같이 맨 위!)

    // 🛡️ [안전장치 1] 데이터 부르다 꼬여도 앱 멈추지 않게 방어!
    try { loadAllData(); } catch (e) { console.error("데이터 로드 에러:", e); }

    // cleanupIncorrectHistoryV2();
    applyTheme();

    // 🛡️ [안전장치 2] 오프라인이라 아이콘(lucide) 인터넷에서 못 가져와도 에러 안 나게 방어!
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    } else {
        console.warn("오프라인 상태라 외부 아이콘 로드를 건너뜁니다.");
    }

    checkCoinExpiration();
    checkSaleDays();
    checkAttendanceReset();

    // 🌟 [유일하게 추가된 줄] 오프라인일 때 통계창이 증발하는 걸 막기 위해 이걸 정산창보다 먼저 실행하게 끌어올렸어요!
    updateWeeklyStatUI();

    // 복귀 여부부터 확인
    checkMoboReturnVisit();

    // 이후 일반 정산 검사
    askForDeduction();

    // 복귀·정산 팝업이 없을 때만 출석 확인
    checkAndShowAttendPopup();

    // 화면을 그리기 전에 연재일 갱신
    autoUpdatePastBiweeklyDates();

    viewDay = days[getWebtoonDate().getDay()];
    renderAll();
    initScroll();

    checkStorage();
    checkBackupStatus();
    updatePlatformOrder();
    checkRemoteUpdate(); // 2. 업데이트 소식 체크
    initThemeSwitchSwipe();

    // 모보 기준 날짜가 바뀌는 순간 자동 갱신
    let lastCheckedWebtoonDay = formatDate(getWebtoonDate());

    setInterval(() => {
        if (document.hidden) return;

        const currentWebtoonDay = formatDate(getWebtoonDate());

        // 날짜가 그대로면 아무 작업도 하지 않음
        if (currentWebtoonDay === lastCheckedWebtoonDay) return;

        lastCheckedWebtoonDay = currentWebtoonDay;

        // 다음 격주 연재일 갱신
        autoUpdatePastBiweeklyDates();

        // 갱신된 날짜를 카드와 뱃지에 즉시 표시
        renderAll();

    }, 15 * 1000);
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

// ==========================================
// 모보 장기 미접속 복귀 안내 시스템
// ==========================================

const MOBO_LAST_OPENED_KEY = 'moboReturnLastOpenedAt';
const MOBO_RETURN_PENDING_KEY = 'moboReturnPendingDays';

function checkMoboReturnVisit() {
    const now = Date.now();

    // 이전 접속 시각 가져오기
    const rawPrevious = localStorage.getItem(MOBO_LAST_OPENED_KEY);
    const previous = rawPrevious ? Number(rawPrevious) : NaN;

    // 마지막 접속 시각 갱신
    localStorage.setItem(MOBO_LAST_OPENED_KEY, String(now));

    let absentDays = 0;

    if (Number.isFinite(previous) && previous > 0 && previous <= now) {
        absentDays = Math.floor(
            (now - previous) / (24 * 60 * 60 * 1000)
        );
    }

    // 14일 이상 미접속한 경우 복귀 안내 기록
    if (absentDays >= 14) {
        localStorage.setItem(
            MOBO_RETURN_PENDING_KEY,
            String(absentDays)
        );
    }

    const pendingDays =
        Number(localStorage.getItem(MOBO_RETURN_PENDING_KEY));

    const banner = document.getElementById('mobo-return-banner');
    const bannerText = document.getElementById('mobo-return-banner-text');

    if (!banner || !bannerText) return;

    // 복귀 안내 대상이 아니면 배너 숨김
    if (!Number.isSafeInteger(pendingDays) || pendingDays < 14) {
        banner.style.display = 'none';
        return;
    }

    bannerText.textContent =
        `${pendingDays}일 만의 방문! 복귀 정리 안내를 확인해 보세요.`;

    banner.style.display = 'flex';

    // 복귀 안내가 아직 남아 있다면 새로고침 후에도 우선 표시
    if (pendingDays >= 20) {
        openMoboReturnModal();
    }
}


// 복귀 안내 모달 열기
function openMoboReturnModal() {
    const days = Number(
        localStorage.getItem(MOBO_RETURN_PENDING_KEY)
    );

    if (!Number.isSafeInteger(days) || days < 14) return;

    const modal = document.getElementById('mobo-return-modal');
    const message = document.getElementById('mobo-return-message');

    if (!modal || !message) return;

    const isLongReturn = days >= 30;
    const needsSelectionGuide = days >= 20 && days < 30;

    // 복귀 기간 표시
    message.textContent =
        `${days}일 만에 모보에 돌아오셨네요!`;

    const title = document.getElementById('mobo-return-title');
    const description =
        modal.querySelector('.mobo-return-description');
    const guide =
        modal.querySelector('.mobo-return-guide span');

    if (title) {
        title.textContent = isLongReturn
            ? '다시 시작해 볼까요?'
            : '오랜만이에요!';
    }

    if (description) {
        description.textContent = isLongReturn
            ? '그동안 밀린 정산을 건너뛰고, 오늘부터 다시 시작할 수 있어요.'
            : '오랜만에 돌아오셨네요. 기존 모보를 계속 이용해 보세요.';
    }

    if (guide) {
        guide.textContent = isLongReturn
            ? '과거 미정산은 다시 표시되지 않아요. 기존 지갑 잔액과 작품 정보, 월말정산 기록은 그대로 유지돼요.'
            : '기존 작품이나 정산 기록이 변경되지는 않아요.';
    }

    // 복귀 기간별 버튼 구분
    const skipBtn =
        document.getElementById('mobo-return-skip-btn');

    const dismissBtn =
        document.getElementById('mobo-return-dismiss-btn');

    if (skipBtn) {
        skipBtn.style.display = days >= 20 ? 'block' : 'none';

        skipBtn.textContent = needsSelectionGuide
            ? '모두 건너뛰기'
            : '건너뛰고 시작하기';

        skipBtn.classList.toggle('save-btn', !needsSelectionGuide);
        skipBtn.classList.toggle('cancel-btn', needsSelectionGuide);
    }

    if (dismissBtn) {
        dismissBtn.style.display = isLongReturn ? 'none' : 'block';

        dismissBtn.textContent = needsSelectionGuide
            ? '밀린 작품 정산하기'
            : '시작하기';

        dismissBtn.classList.toggle('save-btn', needsSelectionGuide);
        dismissBtn.classList.toggle('cancel-btn', !needsSelectionGuide);
    }

    // 14~29일은 '시작하기' 버튼만 표시
    // 30일 이상은 '나중에 하기' 버튼 표시
    const laterBtn = document.getElementById('mobo-return-later-btn');

    if (laterBtn) {
        laterBtn.style.display = isLongReturn ? 'block' : 'none';
    }

    modal.style.display = 'flex';
}

// 14~19일은 기존 시작하기,
// 20~29일은 밀린 작품 정산하기
function handleMoboReturnStart() {
    const pendingDays = Number(
        localStorage.getItem(MOBO_RETURN_PENDING_KEY)
    );

    // 14~19일 기존 동작 유지
    if (
        !Number.isSafeInteger(pendingDays) ||
        pendingDays < 20 ||
        pendingDays >= 30
    ) {
        dismissMoboReturnNotice();
        return;
    }

    // 복귀 안내 완료
    dismissMoboReturnNotice();

    // 기존 밀린 정산 검사 및 팝업 열기
    askForDeduction();

    const deductionModal =
        document.getElementById('deduction-modal');

    if (
        !deductionModal ||
        deductionModal.style.display !== 'flex'
    ) {
        alert('현재 정산할 밀린 작품이 없습니다.');
    }
}

// 나중에 하기: 모달만 닫고 배너 유지
function closeMoboReturnModal() {
    document.getElementById('mobo-return-modal').style.display = 'none';

    setTimeout(checkAndShowAttendPopup, 0);
}


// 이번 안내 숨기기: 복귀 안내 상태만 해제
function dismissMoboReturnNotice() {
    localStorage.removeItem(MOBO_RETURN_PENDING_KEY);

    document.getElementById('mobo-return-modal').style.display = 'none';
    document.getElementById('mobo-return-banner').style.display = 'none';

    setTimeout(checkAndShowAttendPopup, 0);
}

// 30일 이상 복귀자: 과거 미정산 건너뛰기
// 장기 미접속 복귀: 과거 정산 건너뛰기
function skipMoboPastDeductions() {
    const pendingDays = Number(
        localStorage.getItem(MOBO_RETURN_PENDING_KEY)
    );

    if (!Number.isSafeInteger(pendingDays) || pendingDays < 20) {
        return false;
    }

    // 20~29일은 기존 확인창 유지
    if (
        pendingDays < 30 &&
        !confirm(
            '밀린 정산을 모두 건너뛰시겠습니까?\n' +
            '건너뛴 과거 내역은 다시 표시되지 않습니다.'
        )
    ) {
        return false;
    }

    // 변경 가능성이 있는 저장 항목
    const keys = [
        'lastCheckDate',
        MOBO_RETURN_PENDING_KEY,
        'currentWeekStr',
        'weeklySpent',
        'weeklySpentWon',
        STORAGE_KEY
    ];

    const beforeStorage = new Map();

    // 기존 밀린 정산 목록 및 모드 보관
    const beforePending = pendingDeductions;
    const beforeDaysStr = pendingDaysStr;
    const beforeToday = isTodayDeduction;

    // 주간 갱신 도중 변경될 수 있는 작품 주기 보관
    const beforeCycles = [];

    const returnModal = document.getElementById(
        'mobo-return-modal'
    );

    const returnBanner = document.getElementById(
        'mobo-return-banner'
    );

    const modalDisplay = returnModal?.style.display;
    const bannerDisplay = returnBanner?.style.display;

    try {
        // 실제 저장값을 변경하기 전에 원본 보관
        keys.forEach(key => {
            beforeStorage.set(
                key,
                localStorage.getItem(key)
            );
        });

        // 작품 연재 주차 변경에 대비
        Object.values(state).forEach(dayMap => {
            Object.values(dayMap || {}).forEach(list => {
                if (!Array.isArray(list)) return;

                list.forEach(work => {
                    beforeCycles.push({
                        work,
                        value: work.cycle,
                        existed: Object.prototype.hasOwnProperty.call(
                            work,
                            'cycle'
                        )
                    });
                });
            });
        });

        const todayStr = formatDate(getWebtoonDate());
        const lastCheckDate = beforeStorage.get('lastCheckDate');

        // 미래 정산 기준일은 그대로 유지
        if (!lastCheckDate || lastCheckDate < todayStr) {
            localStorage.setItem(
                'lastCheckDate',
                todayStr
            );
        }

        // 과거 정산 목록 초기화
        pendingDeductions = {
            lezhin: [],
            bomtoon: [],
            ridi: [],
            mrblue: []
        };

        pendingDaysStr = '';
        isTodayDeduction = false;

        // 후속 정산 검사가 실행되도록 복귀 대기 상태 해제
        // 단, 아직 화면의 복귀 안내는 닫지 않음
        localStorage.removeItem(MOBO_RETURN_PENDING_KEY);

        // 기존 주간 통계 및 연재 주차 갱신
        askForDeduction();
        updateWeeklyStatUI();

        // 통합 데이터까지 저장됐는지 확인
        if (saveData(true) !== true) {
            throw new Error('복귀 건너뛰기 통합 저장 실패');
        }

        // 모든 처리가 성공한 뒤에만 복귀 안내 닫기
        dismissMoboReturnNotice();

        return true;

    } catch (error) {
        console.error(
            '복귀 건너뛰기 중 오류:',
            error
        );

        // 정산 목록과 모드 복구
        pendingDeductions = beforePending;
        pendingDaysStr = beforeDaysStr;
        isTodayDeduction = beforeToday;

        // 갱신 중 변경된 작품 주기 복구
        beforeCycles.forEach(({ work, value, existed }) => {
            if (existed) {
                work.cycle = value;
            } else {
                delete work.cycle;
            }
        });

        let restored = true;

        // 변경된 저장 항목 복구
        for (const [key, oldValue] of beforeStorage) {
            try {
                if (localStorage.getItem(key) === oldValue) {
                    continue;
                }

                if (oldValue === null) {
                    localStorage.removeItem(key);
                } else {
                    localStorage.setItem(key, oldValue);
                }

            } catch (rollbackError) {
                restored = false;

                console.error(
                    '복귀 건너뛰기 복구 실패:',
                    key,
                    rollbackError
                );
            }
        }

        // 복귀 안내 화면 복구
        if (returnModal) {
            returnModal.style.display = modalDisplay;
        }

        if (returnBanner) {
            returnBanner.style.display = bannerDisplay;
        }

        try {
            updateWeeklyStatUI();
        } catch (uiError) {
            console.error(
                '통계 화면 복구 실패:',
                uiError
            );
        }

        if (restored) {
            alert(
                '복귀 정리를 저장하지 못했습니다.\n' +
                '이전 상태로 복구했습니다.'
            );
        } else {
            alert(
                '저장과 일부 복구에 실패했습니다.\n' +
                '기존 백업을 확인해 주세요.'
            );
        }

        return false;
    }
}


let attendWarningShownThisPage = false;

function checkAndShowAttendPopup() {
    if (attendWarningShownThisPage) return;

    // 20일 이상 복귀 안내가 아직 처리되지 않았다면 출석 보류
    const pendingReturnDays = Number(
        localStorage.getItem(MOBO_RETURN_PENDING_KEY)
    );

    if (pendingReturnDays >= 20) return;

    // 밀린 정산 기준일이 오늘보다 이전이면 출석 보류
    const lastCheckDate = localStorage.getItem('lastCheckDate');
    const todayStr = formatDate(getWebtoonDate());

    if (lastCheckDate && lastCheckDate < todayStr) {
        return;
    }

    const deductionModal = document.getElementById('deduction-modal');
    const returnModal = document.getElementById('mobo-return-modal');

    // 복귀 또는 정산 팝업이 열려 있다면 출석 안내 보류
    if (
        deductionModal?.style.display === 'flex' ||
        returnModal?.style.display === 'flex'
    ) {
        return;
    }

    const lAttend = localStorage.getItem('lezhinAttend') === 'true';
    const bAttend = localStorage.getItem('bomtoonAttend') === 'true';

    const missing = [];

    if (!lAttend) missing.push('레진');
    if (!bAttend) missing.push('봄툰');

    if (!missing.length) return;

    const message = document.getElementById('attend-missing-text');
    const modal = document.getElementById('attend-warning-modal');

    if (!message || !modal) return;

    message.innerHTML = `(현재 <b>${missing.join(', ')}</b> 출석 전입니다)`;

    modal.style.display = 'flex';
    attendWarningShownThisPage = true;
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

        // 만료 타이머 삭제
        localStorage.removeItem('lezhinBonusExpire');

        // 차감된 잔액을 통합 저장 데이터에도 반영
        saveData(true);
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

    // 이전 계산 결과가 중복으로 담기지 않도록 초기화
    moboCumInvalidateClassic();

    // 누적 계산 화면이 열려 있었더라도 일반 계산기로 시작
    moboCumBack();
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

    // 빠른 차감 입력 초기화
    document.getElementById('quick-deduct-platform').value = 'lezhin';
    document.getElementById('quick-deduct-amount').value = '';
    document.getElementById('quick-deduct-title').value = '';
    updateQuickDeductLabel();
    updateQuickDeductionPreview();

    // 기본 탭: 정주행 계산
    setCalcMode('calc');

    document.getElementById('calc-modal').style.display = 'flex';



    setTimeout(() => {
        const isCalcActive =
            document.getElementById('calc-mode-calc')
                .classList.contains('active');

        const isModalOpen =
            document.getElementById('calc-modal')
                .style.display === 'flex';

        if (isCalcActive && isModalOpen) {
            document.getElementById('calc-total').focus();
        }
    }, 100);

}

function closeCalcModal() {
    document.getElementById('calc-modal').style.display = 'none';
}


// 정주행 계산 / 빠른 차감 탭 전환
function setCalcMode(mode) {
    const isQuick = mode === 'quick';

    // 일반 계산기와 빠른 차감은 기존 레이아웃 사용
    document.getElementById('calc-modal')
        ?.classList.remove('mobo-cum-contained');

    // 일반 계산기 / 빠른 차감에서는 닫기 버튼 표시
    const closeButton = document.getElementById('calc-main-close');

    if (closeButton) {
        closeButton.style.removeProperty('display');
    }

    // 탭을 누르면 누적 화면에서 기존 화면으로 복귀
    const classic = document.getElementById('calc-classic-view');
    const cumulative = document.getElementById('mobo-cum-view');

    if (classic) classic.style.display = 'block';
    if (cumulative) cumulative.style.display = 'none';

    // 선택한 탭에 맞춰 모달 제목 변경
    const modalTitle = document.getElementById('calc-modal-title');

    if (modalTitle) {
        modalTitle.textContent = '계산기';
    }

    const calcTab = document.getElementById('calc-mode-calc');
    const quickTab = document.getElementById('calc-mode-quick');

    const calcSection = document.getElementById('calc-standard-section');
    const quickSection = document.getElementById('calc-quick-section');

    // 선택한 화면만 표시
    calcSection.style.display = isQuick ? 'none' : 'block';
    quickSection.style.display = isQuick ? 'block' : 'none';

    // 탭 선택 상태 변경
    calcTab.classList.toggle('active', !isQuick);
    quickTab.classList.toggle('active', isQuick);

    calcTab.setAttribute('aria-selected', String(!isQuick));
    quickTab.setAttribute('aria-selected', String(isQuick));
}

// =========================================
// 모보 누적 계산기 V1
// 기존 지갑 / 정산 / 진도와 완전히 독립
// =========================================

const MOBO_CUM_KEY = 'MOBO_CUMULATIVE_CALC_V1';

const MOBO_CUM_PLATFORMS = {
    lezhin: ['레진', 'C'],
    bomtoon: ['봄툰', 'C'],
    ridi: ['리디', '캐시'],
    mrblue: ['미블', '머니']
};

let moboCumEditingId = null;
let moboCumEditingOriginal = null;
let moboCumSaving = false;

// 코인백·캐시백·머니백 비율 입력 제한 (0~100%)
function moboLimitCoinbackPercent(input, allowDecimal = false) {
    const value = input.value;

    // 일반 계산기: 정수만 허용
    // 누적 계산기: 소수점 둘째 자리까지 허용
    const validFormat = allowDecimal
        ? /^\d{0,3}(\.\d{0,2})?$/.test(value)
        : /^\d{0,3}$/.test(value);

    const validRange =
        value === '' ||
        (value !== '.' && Number(value) <= 100);

    if (validFormat && validRange) {
        // 정상 입력일 때만 마지막 유효 값 저장
        input.dataset.lastValidPercent = value;
    } else {
        // 문자·음수·100 초과 입력은 이전 정상 값으로 복원
        input.value = input.dataset.lastValidPercent ?? '';
    }
}

// 계산값 검증 및 계산
function moboCumCalculate(values) {
    const int = value => {
        const raw = String(value ?? '').trim();

        return /^\d+$/.test(raw)
            ? Number(raw)
            : NaN;
    };

    const total = int(values.total);
    const current = int(values.current);
    const price = int(values.price);

    const percentRaw =
        String(values.percent ?? '').trim();

    if (!/^\d+(?:\.\d{1,2})?$/.test(percentRaw)) {
        return null;
    }

    const percent = Number(percentRaw);

    if (
        !Number.isSafeInteger(total) ||
        total < 1 ||
        total > 100000 ||

        !Number.isSafeInteger(current) ||
        current < 0 ||
        current >= total ||

        !Number.isSafeInteger(price) ||
        price < 0 ||
        price > 100000 ||

        !Number.isFinite(percent) ||
        percent < 0 ||
        percent > 1000
    ) {
        return null;
    }

    const amount = (total - current) * price;

    // 비율을 100배 정수화해 소수점 오차 최소화
    const numerator =
        amount * Math.round(percent * 100);

    if (
        !Number.isSafeInteger(amount) ||
        !Number.isSafeInteger(numerator)
    ) {
        return null;
    }

    return {
        total,
        current,
        price,
        percent,
        amount,
        cashback: Math.floor(numerator / 10000)
    };
}


// 저장된 누적 목록 읽기 + 손상 검증
function moboCumRead() {
    try {
        const raw = localStorage.getItem(MOBO_CUM_KEY);

        if (raw === null) return [];

        const parsed = JSON.parse(raw);

        if (
            parsed?.version !== 1 ||
            !Array.isArray(parsed.items) ||
            parsed.items.length > 200
        ) {
            throw Error('누적 계산 목록 구조 오류');
        }

        const ids = new Set();

        for (const item of parsed.items) {
            const calc =
                item && moboCumCalculate(item);

            if (
                !item ||
                typeof item.id !== 'string' ||
                item.id.length > 100 ||
                !item.id ||
                ids.has(item.id) ||

                typeof item.title !== 'string' ||
                !item.title.trim() ||
                item.title.length > 80 ||

                !Object.prototype.hasOwnProperty.call(
                    MOBO_CUM_PLATFORMS,
                    item.platform
                ) ||

                typeof item.included !== 'boolean' ||
                !calc ||
                item.amount !== calc.amount ||
                item.cashback !== calc.cashback
            ) {
                throw Error('누적 계산 항목 오류');
            }

            ids.add(item.id);
        }

        return parsed.items;

    } catch (error) {
        console.warn(
            '누적 계산 목록 읽기 실패:',
            error
        );

        // 손상된 데이터를 임의로 덮어쓰지 않음
        return null;
    }
}


// 목록 저장: 성공 확인 후에만 화면 변경
function moboCumWrite(items) {
    try {
        localStorage.setItem(
            MOBO_CUM_KEY,
            JSON.stringify({
                version: 1,
                items
            })
        );

        return true;

    } catch (error) {
        console.error(
            '누적 계산 목록 저장 실패:',
            error
        );

        alert(
            '계산 목록을 저장하지 못했어요.\n' +
            '저장 공간이나 브라우저 설정을 확인해 주세요.'
        );

        return false;
    }
}

// =========================================
// 기존 정주행 계산기 → 누적 계산에 담기
// =========================================

let moboCumLastClassicSnapshot = null;


// 계산값이 바뀌면 이전 계산 결과 무효화
function moboCumInvalidateClassic() {
    moboCumLastClassicSnapshot = null;

    [
        'mobo-cum-add-coin',
        'mobo-cum-add-other'
    ].forEach(id => {
        const button = document.getElementById(id);

        if (button) {
            button.disabled = true;
        }
    });
}


// 기존 정주행 계산기 입력값 검사
function moboCumClassicDraft() {
    const get = id =>
        document.getElementById(id);

    const unit = get('calc-platform')?.value;

    if (!['coin', 'cash', 'won'].includes(unit)) {
        return null;
    }

    const isCoinback =
        get('calc-coinback-toggle')?.checked === true;

    const percentRaw = isCoinback
        ? get('calc-coinback-percent').value.trim()
        : '0';

    // 기존 계산기는 코인백 %를 정수로 처리하므로
    // 누적 저장에서도 정수 비율만 허용
    if (!/^\d+$/.test(percentRaw)) {
        return null;
    }

    const currentRaw =
        get('calc-current').value.trim();

    const values = {
        total: get('calc-total').value,
        current: currentRaw === '' ? '0' : currentRaw,
        price: get('calc-price').value,
        percent: percentRaw
    };

    const result = moboCumCalculate(values);

    if (!result) return null;

    // 0원에 코인백을 적용하면 기존 계산기에
    // 추가 시청 가능 화수가 NaN으로 표시될 수 있음
    if (isCoinback && result.price === 0) {
        return null;
    }

    return {
        unit,
        ...result
    };
}


// 기존 계산기의 실제 계산 완료 결과 기록
function moboCumCaptureClassicResult() {
    const draft = moboCumClassicDraft();

    if (
        draft &&
        Number.isSafeInteger(currentCalcCoin) &&
        draft.amount === currentCalcCoin
    ) {
        moboCumLastClassicSnapshot =
            JSON.stringify(draft);
    } else {
        moboCumLastClassicSnapshot = null;
    }

    const ready =
        moboCumLastClassicSnapshot !== null;

    [
        'mobo-cum-add-coin',
        'mobo-cum-add-other'
    ].forEach(id => {
        const button = document.getElementById(id);

        if (button) {
            button.disabled = !ready;
        }
    });
}


// 결과 화면의 버튼 위치 변경
function moboCumPlaceButtons(unit) {
    const row = document.getElementById(
        'mobo-cum-deduct-actions'
    );

    const deductButton = document.getElementById(
        'calc-deduct-btn'
    );

    if (!row || !deductButton) return;

    const isCoin = unit === 'coin';

    row.classList.toggle(
        'mobo-cum-paired',
        !isCoin
    );

    // 리디·미블은 글자가 두 줄로 내려가지 않도록 축약
    deductButton.textContent = isCoin
        ? '지갑에서 바로 차감하기'
        : '바로 차감하기';
}

// =========================================
// 누적 계산 - 작품명 입력 팝업
// =========================================

// 기존 누적 담기 버튼에서 호출
function moboCumAddFromClassic() {
    const draft = moboCumClassicDraft();

    // 계산 완료 여부 확인
    if (
        !draft ||
        !moboCumLastClassicSnapshot ||
        JSON.stringify(draft) !== moboCumLastClassicSnapshot
    ) {
        alert(
            '계산 결과를 다시 확인해 주세요.\n' +
            '「얼마나 필요할까?」를 먼저 눌러 주세요.'
        );
        return;
    }

    // 코인 플랫폼은 지갑 선택 필수
    if (draft.unit === 'coin') {
        const wallet = document.getElementById(
            'calc-deduct-wallet'
        )?.value;

        if (!['lezhin', 'bomtoon'].includes(wallet)) {
            alert('레진 또는 봄툰 지갑을 먼저 선택해 주세요.');
            return;
        }
    }

    // 저장 목록이 정상인지 먼저 검사
    const items = moboCumRead();

    if (items === null) {
        alert('기존 계산 목록을 읽을 수 없어요.');
        return;
    }

    if (items.length >= 200) {
        alert('누적 계산 목록은 최대 200개까지 저장할 수 있어요.');
        return;
    }

    const dialog = document.getElementById(
        'mobo-cum-name-dialog'
    );

    const input = document.getElementById(
        'mobo-cum-name-input'
    );

    // 매번 새로운 작품명 입력
    input.value = '';
    dialog.style.display = 'flex';

    setTimeout(() => input.focus(), 0);
}


// 취소하거나 저장이 성공한 경우 닫기
function moboCumCloseNameDialog() {
    const dialog = document.getElementById(
        'mobo-cum-name-dialog'
    );

    dialog.style.display = 'none';
}


// 팝업의 담기 버튼
function moboCumConfirmName(event) {
    event.preventDefault();

    const dialog = document.getElementById(
        'mobo-cum-name-dialog'
    );

    if (dialog.style.display !== 'flex') return;

    const input = document.getElementById(
        'mobo-cum-name-input'
    );

    const button = document.getElementById(
        'mobo-cum-name-confirm'
    );

    if (button.disabled) return;

    button.disabled = true;

    try {
        // 기존 누적 저장 로직 실행
        moboCumCommitFromClassic(input.value);
    } finally {
        button.disabled = false;
    }
}

// 현재 계산 결과를 누적 계산에 추가
function moboCumCommitFromClassic(nameFromPopup = '') {
    const draft = moboCumClassicDraft();

    if (
        !draft ||
        !moboCumLastClassicSnapshot ||
        JSON.stringify(draft) !==
        moboCumLastClassicSnapshot
    ) {
        alert(
            '계산 내용이 변경되었어요.\n' +
            '「얼마나 필요할까?」를 다시 눌러 주세요.'
        );

        return;
    }

    // 레진 / 봄툰은 현재 지갑 선택값으로 구분
    const platform = draft.unit === 'coin'
        ? document.getElementById(
            'calc-deduct-wallet'
        ).value

        : draft.unit === 'cash'
            ? 'ridi'
            : 'mrblue';

    if (
        !Object.prototype.hasOwnProperty.call(
            MOBO_CUM_PLATFORMS,
            platform
        )
    ) {
        alert('레진 또는 봄툰 지갑을 선택해 주세요.');
        return;
    }

    // 마지막에 저장된 목록을 다시 읽음
    const items = moboCumRead();

    if (items === null) {
        alert(
            '기존 계산 목록을 읽지 못했어요.\n' +
            '데이터 보호를 위해 추가를 중단합니다.'
        );

        return;
    }

    if (items.length >= 200) {
        alert('누적 계산 목록은 최대 200개까지 저장할 수 있어요.');
        return;
    }

    // 사용자가 바로 담을 수 있도록 자동 작품명 부여
    let number = 1;

    const usedTitles = new Set(
        items.map(item => item.title)
    );

    while (usedTitles.has(`작품 ${number}`)) {
        number++;
    }

    // 기존 항목과 충돌하지 않는 고유 ID
    let id;

    do {
        id =
            `${Date.now().toString(36)}-` +
            Math.random().toString(36).slice(2, 10);
    } while (items.some(item => item.id === id));

    const entry = {
        id,
        title: nameFromPopup.trim() || `작품 ${number}`,
        platform,

        total: draft.total,
        current: draft.current,
        price: draft.price,
        percent: draft.percent,

        amount: draft.amount,
        cashback: draft.cashback,

        included: true
    };

    // 저장이 성공했을 때만 완료 처리
    if (!moboCumWrite([...items, entry])) {
        return;
    }

    // 실제 저장 성공 후에만 팝업 닫기
    moboCumCloseNameDialog();

    // 누적 담기 성공 후 일반 계산기 전체 초기화
    moboCumInvalidateClassic();

    currentCalcCoin = 0;

    // 플랫폼을 기본값으로 복원하고
    // 화수·가격·코인백·결과창 초기화
    document.getElementById('calc-platform').value = 'coin';
    updateCalcLabels();

    // 이전에 선택했던 지갑도 초기화
    const wallet = document.getElementById('calc-deduct-wallet');

    if (wallet) {
        wallet.value = '';
    }

    // 이전 잔액 부족 안내 초기화
    const notice = document.getElementById('calc-balance-notice');

    if (notice) {
        notice.textContent = '';
        notice.style.display = 'none';
    }

    // 다음 작품 입력 준비
    document.getElementById('calc-total').focus();

    // 저장 완료 토스트
    showToast('누적 계산에 추가했어요!');
}


// 입력값을 바꾸면 누적 담기 비활성화
document.addEventListener('input', event => {
    if (
        event.target?.matches(
            '#calc-total, ' +
            '#calc-current, ' +
            '#calc-price, ' +
            '#calc-coinback-percent'
        )
    ) {
        moboCalcClearResult();
    }
});

document.addEventListener('change', event => {
    if (
        event.target?.matches(
            '#calc-platform, #calc-coinback-toggle'
        )
    ) {
        moboCalcClearResult();
    }
});

// 안전한 HTML 요소 생성
function moboCumNode(tag, className, content) {
    const node = document.createElement(tag);

    if (className) {
        node.className = className;
    }

    if (content !== undefined) {
        node.textContent = content;
    }

    return node;
}

// 플랫폼별 접힘 / 펼침 상태 유지
const moboCumGroupOpenState = new Map();

// 누적 목록 화면 출력
function moboCumRender() {
    const container =
        document.getElementById('mobo-cum-items');

    const clearButton =
        document.getElementById('mobo-cum-clear');

    const items = moboCumRead();

    // 목록을 다시 그릴 때 플랫폼별 스크롤 위치 기억
    const previousScroll = new Map(
        [...container.querySelectorAll('.mobo-cum-work-scroll')]
            .map(list => [
                list.dataset.platform,
                list.scrollTop
            ])
    );

    // 플랫폼 목록 전체의 현재 스크롤 위치 기억
    const previousOuterScroll = container.scrollTop;

    container.replaceChildren();

    container.replaceChildren();

    clearButton.disabled =
        items !== null && items.length === 0;

    // 실제 차감할 작품이 있을 때만 버튼 활성화
    const checkoutButton =
        document.getElementById('mobo-cum-checkout');

    if (checkoutButton) {
        checkoutButton.disabled =
            items === null ||
            !items.some(item =>
                item.included && item.amount > 0
            ) ||
            moboCumCheckoutBusy;
    }

    // 손상된 저장 목록은 자동 삭제하지 않음
    if (items === null) {
        container.appendChild(
            moboCumNode(
                'p',
                'mobo-cum-hint',
                '저장된 계산 목록을 읽을 수 없어요. ' +
                '기존 데이터를 보호하기 위해 추가와 수정을 막았어요. ' +
                '초기화하면 이전 목록이 삭제돼요.'
            )
        );

        return;
    }

    if (items.length === 0) {
        container.appendChild(
            moboCumNode(
                'p',
                'mobo-cum-empty',
                '아직 담은 작품이 없어요. '
            )
        );

        return;
    }

    // 플랫폼별 합계 및 작품 목록
    for (
        const [platform, [label, unit]]
        of Object.entries(MOBO_CUM_PLATFORMS)
    ) {
        const groupItems = items.filter(
            item => item.platform === platform
        );

        if (!groupItems.length) continue;

        // 플랫폼별 혜택 명칭
        const benefitLabel =
            platform === 'ridi' ? '캐시백' :
                platform === 'mrblue' ? '머니백' :
                    '코인백';

        // '빼기'로 제외한 작품은 합산하지 않음
        const chosen = groupItems.filter(
            item => item.included
        );

        const sum = key => chosen.reduce(
            (n, item) => n + item[key],
            0
        );

        const section = moboCumNode(
            'section',
            'mobo-cum-group'
        );

        // 첫 번째 플랫폼은 펼침, 나머지는 접힘
        // 사용자가 변경한 상태는 다시 그려도 유지
        const expanded = moboCumGroupOpenState.has(platform)
            ? moboCumGroupOpenState.get(platform)
            : container.children.length === 0;

        moboCumGroupOpenState.set(platform, expanded);

        // 플랫폼 제목과 접기/펼치기 화살표
        const header = moboCumNode(
            'div',
            'mobo-cum-group-head'
        );

        const heading = moboCumNode(
            'h4',
            'mobo-cum-group-title',
            `${label} · ${chosen.length}/${groupItems.length}개 포함`
        );

        const foldButton = moboCumNode(
            'button',
            'mobo-cum-fold-button'
        );

        foldButton.type = 'button';

        foldButton.setAttribute(
            'aria-expanded',
            String(expanded)
        );

        foldButton.setAttribute(
            'aria-controls',
            `mobo-cum-list-${platform}`
        );

        foldButton.setAttribute(
            'aria-label',
            `${label} 목록 ${expanded ? '접기' : '펼치기'}`
        );

        // Lucide 화살표
        const foldIcon = moboCumNode('i');

        foldIcon.setAttribute(
            'data-lucide',
            'chevron-down'
        );

        foldIcon.setAttribute('aria-hidden', 'true');

        foldButton.appendChild(foldIcon);

        header.append(heading, foldButton);
        section.appendChild(header);

        // 플랫폼별 작품 목록 영역
        const workList = moboCumNode(
            'div',
            'mobo-cum-work-list'
        );

        workList.id = `mobo-cum-list-${platform}`;

        // 펼침 상태에 따라 애니메이션 클래스 적용
        workList.classList.toggle('is-open', expanded);

        // 이미 펼쳐진 목록은 바로 스크롤 가능
        workList.classList.toggle('is-scroll-ready', expanded);

        // 실제 작품과 스크롤이 들어갈 내부 영역
        const workScroll = moboCumNode(
            'div',
            'mobo-cum-work-scroll'
        );

        workScroll.dataset.platform = platform;
        workScroll.inert = !expanded;

        workList.setAttribute(
            'aria-hidden',
            String(!expanded)
        );

        workList.appendChild(workScroll);

        // 화살표 클릭 시 부드럽게 접기 / 펼치기
        // 펼침 애니메이션이 끝난 뒤 스크롤 활성화
        workList.addEventListener('transitionend', event => {
            if (
                event.target !== workList ||
                event.propertyName !== 'grid-template-rows'
            ) {
                return;
            }

            if (workList.classList.contains('is-open')) {
                workList.classList.add('is-scroll-ready');
            }
        });

        // 접기 / 펼치기
        foldButton.onclick = () => {
            const next = !moboCumGroupOpenState.get(platform);

            moboCumGroupOpenState.set(platform, next);

            // 움직이는 동안 스크롤바 숨기기
            workList.classList.remove('is-scroll-ready');

            // 접기 / 펼치기 애니메이션
            workList.classList.toggle('is-open', next);

            // 모션 최소화 설정에서는 즉시 활성화
            if (
                next &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ) {
                workList.classList.add('is-scroll-ready');
            }

            workScroll.inert = !next;

            workList.setAttribute(
                'aria-hidden',
                String(!next)
            );

            foldButton.setAttribute(
                'aria-expanded',
                String(next)
            );

            foldButton.setAttribute(
                'aria-label',
                `${label} 목록 ${next ? '접기' : '펼치기'}`
            );
        };

        // 총 구매 비용 / 예상 코인백 가로 배치
        const summary = moboCumNode(
            'div',
            'mobo-cum-summary-row'
        );

        const purchase = moboCumNode(
            'div',
            'mobo-cum-summary-cell'
        );

        purchase.append(
            moboCumNode(
                'span',
                'mobo-cum-summary-label',
                '총 구매 비용'
            ),
            moboCumNode(
                'strong',
                'mobo-cum-summary-value',
                `${sum('amount').toLocaleString()} ${unit}`
            )
        );

        const cashback = moboCumNode(
            'div',
            'mobo-cum-summary-cell'
        );

        cashback.append(
            moboCumNode(
                'span',
                'mobo-cum-summary-label',
                `예상 ${benefitLabel}`
            ),
            moboCumNode(
                'strong',
                'mobo-cum-summary-value is-cashback',
                `+${sum('cashback').toLocaleString()} ${unit}`
            )
        );

        summary.append(purchase, cashback);
        section.appendChild(summary);

        // 작품별 카드
        groupItems.forEach(item => {
            const card = moboCumNode(
                'div',
                `mobo-cum-card${item.included ? '' : ' is-excluded'}`
            );

            const title = moboCumNode(
                'div',
                'mobo-cum-card-title',
                item.title
            );

            const desc = moboCumNode(
                'div',
                'mobo-cum-card-desc',
                `${item.amount.toLocaleString()} ${unit}` +
                ` · ${benefitLabel} +${item.cashback.toLocaleString()} ${unit}` +
                (item.included ? '' : ' · 합계에서 제외')
            );

            const actions = moboCumNode(
                'div',
                'mobo-cum-actions'
            );

            const toggle = moboCumNode(
                'button',
                'mobo-cum-mini',
                item.included ? '제외' : '포함'
            );

            toggle.type = 'button';
            toggle.onclick = () => moboCumToggle(item.id);

            const edit = moboCumNode(
                'button',
                'mobo-cum-mini',
                '수정'
            );

            edit.type = 'button';
            edit.onclick = () => moboCumShowEditor(item.id);

            const remove = moboCumNode(
                'button',
                'mobo-cum-mini danger',
                '삭제'
            );

            remove.type = 'button';
            remove.onclick = () => moboCumRemove(item.id);

            actions.append(toggle, edit, remove);

            // 작품명과 금액을 왼쪽에 묶기
            const info = moboCumNode(
                'div',
                'mobo-cum-card-info'
            );

            info.append(title, desc);

            // 왼쪽 작품 정보 / 오른쪽 버튼 3개
            card.append(info, actions);

            // 실제 스크롤 영역에 작품 추가
            workScroll.appendChild(card);
        });

        // 합계 아래에 작품 목록 추가
        section.appendChild(workList);

        container.appendChild(section);

        // 화면 갱신 전 스크롤 위치 복원
        workList.scrollTop =
            previousScroll.get(platform) || 0;
    }

    // 새로 생성된 화살표를 Lucide 아이콘으로 변환
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // 목록을 다시 그린 뒤 기존 스크롤 위치 복원
    container.scrollTop = previousOuterScroll;
}


// 화면 전환 시 스크롤 맨 위로
function moboCumScrollTop() {
    const content = document.querySelector(
        '#calc-modal > .modal-content'
    );

    if (content) {
        content.scrollTop = 0;
    }
}

// =========================================
// 누적 계산 - PC 모달 전체 마우스 휠 스크롤
// =========================================

document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('calc-modal');

    if (!modal) return;

    const modalContent = modal.querySelector('.modal-content');

    modal.addEventListener('wheel', (event) => {

        // 누적 계산 화면에서만 작동
        if (!modal.classList.contains('mobo-cum-contained')) {
            return;
        }

        // 모달 바깥 배경에서는 작동하지 않음
        if (!modalContent.contains(event.target)) {
            return;
        }

        // 작품 수정 화면에서는 기존 스크롤 유지
        const listScreen = document.getElementById(
            'mobo-cum-list-screen'
        );

        if (
            !listScreen ||
            getComputedStyle(listScreen).display === 'none'
        ) {
            return;
        }

        // 전체 플랫폼 목록
        const platformList = document.getElementById(
            'mobo-cum-items'
        );

        if (!platformList) return;

        // 플랫폼 목록 안에서는 브라우저의 자연스러운 스크롤 사용
        // 각 플랫폼 내부의 작품 목록 스크롤도 그대로 유지
        if (platformList.contains(event.target)) {
            return;
        }

        const direction = Math.sign(event.deltaY);

        if (!direction) return;

        // 마우스가 플랫폼 내부 작품 목록 위에 있는지 확인
        const workScroll = event.target instanceof Element
            ? event.target.closest('.mobo-cum-work-scroll')
            : null;

        if (
            workScroll &&
            platformList.contains(workScroll)
        ) {
            const canScrollInside = direction > 0
                ? workScroll.scrollTop + workScroll.clientHeight
                < workScroll.scrollHeight - 1
                : workScroll.scrollTop > 1;

            // 작품 목록을 더 스크롤할 수 있으면 기존 동작 유지
            if (canScrollInside) {
                return;
            }
        }

        // 전체 플랫폼 목록에 스크롤할 내용이 없으면 종료
        if (
            platformList.scrollHeight <=
            platformList.clientHeight + 1
        ) {
            return;
        }

        // 모달 내부 휠을 플랫폼 목록 스크롤로 전달
        event.preventDefault();

        // 마우스 휠 / 터치패드 단위 차이 반영
        const multiplier =
            event.deltaMode === 1 ? 16 :
                event.deltaMode === 2 ? platformList.clientHeight :
                    1;

        // 모달의 제목이나 하단 버튼 위에서는
        // 플랫폼 목록을 부드럽게 스크롤
        platformList.scrollBy({
            top: event.deltaY * multiplier,
            behavior: 'smooth'
        });

    }, { passive: false });
});


// 일반 계산기 화면으로 돌아가기
function moboCumBack() {
    // 기존 탭 메뉴는 항상 표시
    document.getElementById(
        'calc-main-header'
    ).style.display = 'block';

    // 정주행 계산기 화면 복원
    document.getElementById(
        'calc-classic-view'
    ).style.display = 'block';

    document.getElementById(
        'mobo-cum-view'
    ).style.display = 'none';

    // 정주행 계산기 탭 선택
    setCalcMode('calc');

    moboCumScrollTop();
}


// 누적 계산 화면 열기
function moboCumOpen() {
    // 누적 계산도 정주행 계산기의 하위 기능
    setCalcMode('calc');

    // 누적 계산에서만 높이 제한 + 내부 스크롤 적용
    document.getElementById('calc-modal')
        ?.classList.add('mobo-cum-contained');

    // 상단 탭 메뉴 유지
    document.getElementById(
        'calc-main-header'
    ).style.display = 'block';

    // 기존 계산기 입력 화면만 숨김
    document.getElementById(
        'calc-classic-view'
    ).style.display = 'none';

    // 누적 계산 화면 표시
    document.getElementById(
        'mobo-cum-view'
    ).style.display = 'block';

    // 누적 계산 화면에서는 하단 닫기 버튼 숨기기
    const closeButton = document.getElementById('calc-main-close');

    if (closeButton) {
        closeButton.style.display = 'none';
    }

    moboCumShowList();
}


// 누적 목록 화면
function moboCumShowList() {
    moboCumEditingId = null;
    moboCumEditingOriginal = null;

    // 목록 화면에서는 기본 제목 표시
    document.getElementById(
        'mobo-cum-page-title'
    ).textContent = '누적 계산';

    document.getElementById(
        'mobo-cum-list-screen'
    ).style.display = 'flex';

    document.getElementById(
        'mobo-cum-editor-screen'
    ).style.display = 'none';

    moboCumRender();
    moboCumScrollTop();
}


// 새 작품 추가 또는 기존 작품 수정
function moboCumShowEditor(id = null) {
    const items = moboCumRead();

    if (!items) {
        return alert('계산 목록을 읽지 못했어요.');
    }

    const item = id === null
        ? null
        : items.find(i => i.id === id);

    if (id !== null && !item) {
        return alert(
            '다른 창에서 작품이 변경됐어요.\n' +
            '목록을 다시 확인해 주세요.'
        );
    }

    moboCumEditingId = id;

    moboCumEditingOriginal = item
        ? JSON.stringify(item)
        : null;

    // 작업 유형에 따라 상단 제목 변경
    document.getElementById(
        'mobo-cum-page-title'
    ).textContent = item
            ? '작품 수정'
            : '새 작품 계산';

    // 작업 유형에 따라 저장 버튼 문구 변경
    document.getElementById(
        'mobo-cum-save'
    ).textContent = item
            ? '수정 완료'
            : '계산 목록에 추가';

    document.getElementById(
        'mobo-cum-title'
    ).value = item?.title || '';

    document.getElementById(
        'mobo-cum-platform'
    ).value = item?.platform || 'lezhin';

    document.getElementById(
        'mobo-cum-total'
    ).value = item?.total ?? '';

    document.getElementById(
        'mobo-cum-current'
    ).value = item?.current ?? 0;

    document.getElementById(
        'mobo-cum-price'
    ).value = item?.price ?? '';

    document.getElementById(
        'mobo-cum-back-toggle'
    ).checked = (item?.percent ?? 0) > 0;

    document.getElementById(
        'mobo-cum-percent'
    ).value = item?.percent || '100';

    document.getElementById(
        'mobo-cum-editor-screen'
    ).style.display = 'block';

    document.getElementById(
        'mobo-cum-list-screen'
    ).style.display = 'none';

    moboCumToggleBack();
    moboCumScrollTop();
}


// 코인백 설정 보이기 / 숨기기
function moboCumToggleBack() {
    const on = document.getElementById(
        'mobo-cum-back-toggle'
    ).checked;

    document.getElementById(
        'mobo-cum-back-area'
    ).style.display = on ? 'block' : 'none';

    moboCumPreview();
}


// 폼 입력값에서 독립된 계산 결과 생성
function moboCumDraft() {
    const platform = document.getElementById(
        'mobo-cum-platform'
    ).value;

    if (
        !Object.prototype.hasOwnProperty.call(
            MOBO_CUM_PLATFORMS,
            platform
        )
    ) {
        return null;
    }

    const values = {
        total: document.getElementById(
            'mobo-cum-total'
        ).value,

        current: document.getElementById(
            'mobo-cum-current'
        ).value,

        price: document.getElementById(
            'mobo-cum-price'
        ).value,

        percent: document.getElementById(
            'mobo-cum-back-toggle'
        ).checked
            ? document.getElementById(
                'mobo-cum-percent'
            ).value
            : '0'
    };

    // 새로 입력하거나 수정하는 비율은 최대 100%
    if (Number(values.percent) > 100) {
        return null;
    }

    const calculation = moboCumCalculate(values);

    return calculation
        ? { platform, ...calculation }
        : null;
}


// 입력에 따른 실시간 결과 미리보기
function moboCumPreview() {
    const result = document.getElementById(
        'mobo-cum-preview'
    );

    const button = document.getElementById(
        'mobo-cum-save'
    );

    const draft = moboCumDraft();

    button.disabled = !draft;

    if (!draft) {
        result.textContent =
            '총 화수·진도·가격·코인백 비율을 확인해 주세요.';

        return;
    }

    const unit =
        MOBO_CUM_PLATFORMS[draft.platform][1];

    result.textContent =
        `구매 ${draft.total - draft.current}화` +
        ` · 총 ${draft.amount.toLocaleString()} ${unit}` +
        ` · 구매 후 예상 코인백` +
        ` +${draft.cashback.toLocaleString()} ${unit}`;
}


// 계산 결과 추가 / 수정 저장
function moboCumSaveEntry() {
    if (moboCumSaving) return;

    const draft = moboCumDraft();

    if (!draft) {
        return alert('계산 입력값을 확인해 주세요.');
    }

    // 저장 직전에 최신 목록을 다시 읽음
    const items = moboCumRead();

    if (!items) {
        return alert(
            '기존 계산 목록을 읽을 수 없어 저장을 중단했어요.'
        );
    }

    if (
        moboCumEditingId === null &&
        items.length >= 200
    ) {
        return alert(
            '계산 목록은 최대 200개까지 저장할 수 있어요.'
        );
    }

    const original = moboCumEditingId === null
        ? null
        : items.find(
            i => i.id === moboCumEditingId
        );

    // 다른 탭에서 수정한 내용을 덮어쓰지 않음
    if (
        moboCumEditingId !== null &&
        (
            !original ||
            JSON.stringify(original) !==
            moboCumEditingOriginal
        )
    ) {
        return alert(
            '다른 창에서 계산 내용이 바뀌었어요.\n' +
            '목록에서 다시 수정해 주세요.'
        );
    }

    const title =
        document.getElementById(
            'mobo-cum-title'
        ).value.trim() ||
        `작품 ${items.length + 1}`;

    // 똑같은 작품 / 똑같은 계산 중복 확인
    const duplicated = items.some(item =>
        item.id !== moboCumEditingId &&
        item.title === title &&
        item.platform === draft.platform &&
        item.total === draft.total &&
        item.current === draft.current &&
        item.price === draft.price &&
        item.percent === draft.percent
    );

    if (
        duplicated &&
        !confirm(
            '같은 계산 내용이 이미 있어요.\n' +
            '그래도 추가할까요?'
        )
    ) {
        return;
    }

    const next = {
        id: original?.id ||
            `${Date.now().toString(36)}-` +
            Math.random().toString(36).slice(2, 10),

        title,
        ...draft,

        // 기존 작품 수정 시 포함 여부 유지
        included: original?.included ?? true
    };

    const updated = original
        ? items.map(item =>
            item.id === original.id ? next : item
        )
        : [...items, next];

    moboCumSaving = true;

    try {
        if (moboCumWrite(updated)) {
            moboCumShowList();
        }
    } finally {
        moboCumSaving = false;
    }
}


// 빼기 / 다시 더하기
function moboCumToggle(id) {
    const items = moboCumRead();

    if (!items) return;

    const next = items.map(item =>
        item.id === id
            ? { ...item, included: !item.included }
            : item
    );

    if (moboCumWrite(next)) {
        moboCumRender();
    }
}


// 작품 하나 완전히 삭제
function moboCumRemove(id) {
    const items = moboCumRead();

    if (!items) return;

    const item = items.find(i => i.id === id);

    if (
        !item ||
        !confirm(
            `'${item.title}' 계산 기록을 삭제할까요?`
        )
    ) {
        return;
    }

    if (
        moboCumWrite(
            items.filter(i => i.id !== id)
        )
    ) {
        moboCumRender();
    }
}


// 목록 전체 초기화
function moboCumClear() {
    const items = moboCumRead();

    if (items && items.length === 0) return;

    if (
        !confirm(
            '누적 계산 목록 전체를 삭제할까요?\n' +
            '기존 계산 기록은 복구할 수 없어요.'
        )
    ) {
        return;
    }

    try {
        localStorage.removeItem(MOBO_CUM_KEY);
        moboCumRender();

    } catch (error) {
        alert('목록을 초기화하지 못했어요.');
        console.error(error);
    }
}

// =========================================
// 누적 계산 목록 → 실제 지갑 일괄 차감
// =========================================

let moboCumCheckoutBusy = false;

function moboCumCheckout() {
    if (moboCumCheckoutBusy) return;

    const items = moboCumRead();

    if (!items) {
        alert('계산 목록을 읽을 수 없어 차감을 중단했어요.');
        return;
    }

    // 빼기로 제외한 작품은 차감 대상이 아님
    const included = items.filter(item => item.included);
    const charged = included.filter(item => item.amount > 0);

    if (!charged.length) {
        alert('차감할 작품이 없어요.');
        return;
    }

    const platforms = ['lezhin', 'bomtoon', 'ridi', 'mrblue'];

    const walletKeys = {
        lezhin: 'lWallet',
        bomtoon: 'bWallet',
        ridi: 'rWallet',
        mrblue: 'mWallet'
    };

    const totals = {
        lezhin: 0,
        bomtoon: 0,
        ridi: 0,
        mrblue: 0
    };

    // 저장된 작품의 계산값을 다시 검증
    for (const item of charged) {
        const calc = moboCumCalculate(item);

        if (
            !platforms.includes(item.platform) ||
            !calc ||
            calc.amount !== item.amount ||
            calc.cashback !== item.cashback
        ) {
            alert('계산 정보가 올바르지 않아 차감을 중단했어요.');
            return;
        }

        totals[item.platform] += item.amount;

        if (!Number.isSafeInteger(totals[item.platform])) {
            alert('차감 금액이 너무 커서 처리할 수 없어요.');
            return;
        }
    }

    const lines = platforms
        .filter(plt => totals[plt] > 0)
        .map(plt => {
            const [name, unit] = MOBO_CUM_PLATFORMS[plt];

            return `${name}: ${totals[plt].toLocaleString()} ${unit}`;
        });

    const confirmed = confirm(
        `포함된 ${charged.length}개 작품을 실제 지갑에서 차감할까요?\n\n` +
        lines.join('\n') +
        '\n\n월말정산과 주간 통계에도 기록됩니다.' +
        '\n예상 코인백은 차감액에서 빼지 않습니다.' +
        '\n완료된 작품은 누적 목록에서 제거됩니다.' +
        '\n\n진행할까요?'
    );

    if (!confirmed) return;

    const button = document.getElementById('mobo-cum-checkout');

    moboCumCheckoutBusy = true;
    if (button) button.disabled = true;

    // 지갑·월말정산·통계·누적 목록 모두 복구 대상
    const protectedKeys = [
        STORAGE_KEY,
        MOBO_CUM_KEY,
        'lWallet',
        'bWallet',
        'rWallet',
        'mWallet',
        'lezhinExpire',
        'bomtoonExpire',
        'ridiExpire',
        'mrblueExpire',
        'lezhinBonusExpire',
        'monthlyHistory',
        'weeklySpent',
        'weeklySpentWon'
    ];

    let before = null;
    let mutationStarted = false;
    let committed = false;

    try {
        before = new Map(
            protectedKeys.map(key => [
                key,
                localStorage.getItem(key)
            ])
        );

        // 확인창이 떠 있는 동안 다른 탭에서 목록이
        // 변경되었다면 기존 계산을 덮어쓰지 않음
        const originalCart = before.get(MOBO_CUM_KEY);

        const originalParsed = originalCart
            ? JSON.parse(originalCart)
            : null;

        if (
            !originalParsed ||
            JSON.stringify(originalParsed.items) !==
            JSON.stringify(items)
        ) {
            throw new Error('계산 목록이 변경되었습니다.');
        }

        const today = getKSTDate();

        const monthKey =
            `${today.getFullYear()}-` +
            String(today.getMonth() + 1).padStart(2, '0');

        const history = JSON.parse(
            localStorage.getItem('monthlyHistory') || '{}'
        );

        if (
            !history ||
            typeof history !== 'object' ||
            Array.isArray(history)
        ) {
            throw new Error('월말정산 기록 구조 오류');
        }

        if (!history[monthKey]) {
            history[monthKey] = {};
        }

        for (const plt of platforms) {
            if (!history[monthKey][plt]) {
                history[monthKey][plt] = {};
            }

            if (
                typeof history[monthKey][plt] !== 'object' ||
                Array.isArray(history[monthKey][plt])
            ) {
                throw new Error('플랫폼 정산 기록 구조 오류');
            }
        }

        // 작품별로 월말정산 기록 작성
        for (const item of charged) {
            const records = history[monthKey][item.platform];

            const old = records[item.title] ?? 0;
            const next = old + item.amount;

            if (
                !Number.isSafeInteger(old) ||
                old < 0 ||
                !Number.isSafeInteger(next)
            ) {
                throw new Error('월말정산 금액 오류');
            }

            records[item.title] = next;
        }

        const changes = new Map();

        let coinSpent = 0;
        let otherSpent = 0;

        // 플랫폼별 소멸 재화와 일반 지갑 계산
        for (const plt of platforms) {
            const amount = totals[plt];

            if (amount <= 0) continue;

            const expireKey = plt + 'Expire';
            const rawExpire = localStorage.getItem(expireKey);

            const expire = rawExpire
                ? JSON.parse(rawExpire)
                : null;

            let remaining = amount;

            if (expire && expire.amount != null) {
                const expireAmount = Number(expire.amount);

                if (
                    !Number.isSafeInteger(expireAmount) ||
                    expireAmount < 0
                ) {
                    throw new Error('소멸 예정 재화 오류');
                }

                const used = Math.min(expireAmount, remaining);

                remaining -= used;

                if (used > 0) {
                    const nextExpire = expireAmount - used;

                    changes.set(
                        expireKey,
                        nextExpire === 0
                            ? null
                            : JSON.stringify({
                                ...expire,
                                amount: nextExpire
                            })
                    );
                }
            }

            if (remaining > 0) {
                const walletKey = walletKeys[plt];

                const wallet = Number(
                    localStorage.getItem(walletKey) ?? '0'
                );

                const nextWallet = wallet - remaining;

                if (
                    !Number.isSafeInteger(wallet) ||
                    !Number.isSafeInteger(nextWallet)
                ) {
                    throw new Error('지갑 잔액 오류');
                }

                // 기존 모보와 동일하게 마이너스 잔액 허용
                changes.set(walletKey, String(nextWallet));
            }

            if (plt === 'lezhin' || plt === 'bomtoon') {
                coinSpent += amount;
            } else {
                otherSpent += amount;
            }
        }

        const oldWeekly = Number(
            localStorage.getItem('weeklySpent') ?? '0'
        );

        const oldWeeklyWon = Number(
            localStorage.getItem('weeklySpentWon') ?? '0'
        );

        const nextWeekly = oldWeekly + coinSpent;
        const nextWeeklyWon = oldWeeklyWon + otherSpent;

        if (
            !Number.isSafeInteger(nextWeekly) ||
            !Number.isSafeInteger(nextWeeklyWon) ||
            !Number.isSafeInteger(oldWeekly) ||
            !Number.isSafeInteger(oldWeeklyWon)
        ) {
            throw new Error('주간 사용 통계 오류');
        }

        changes.set(
            'monthlyHistory',
            JSON.stringify(history)
        );

        changes.set('weeklySpent', String(nextWeekly));
        changes.set('weeklySpentWon', String(nextWeeklyWon));

        // 기존 레진 차감 규칙 유지
        if (totals.lezhin > 0) {
            changes.set('lezhinBonusExpire', null);
        }

        // 실제 저장 시작
        mutationStarted = true;

        for (const [key, value] of changes) {
            if (value === null) {
                localStorage.removeItem(key);
            } else {
                localStorage.setItem(key, value);
            }
        }

        // 모보 통합 저장
        if (saveData(true) !== true) {
            throw new Error('모보 통합 저장 실패');
        }

        // 성공적으로 차감한 작품만 목록에서 제거
        // '빼기'로 제외했던 작품은 보존
        const remainingItems = items.filter(
            item => !item.included
        );

        localStorage.setItem(
            MOBO_CUM_KEY,
            JSON.stringify({
                version: 1,
                items: remainingItems
            })
        );

        committed = true;

    } catch (error) {
        console.error('누적 계산 지갑 차감 실패:', error);

        // 변경을 시작했다면 이전 저장값으로 복원
        let rollbackOK = true;

        if (mutationStarted && before) {
            for (const [key, value] of before) {
                try {
                    if (localStorage.getItem(key) === value) {
                        continue;
                    }

                    if (value === null) {
                        localStorage.removeItem(key);
                    } else {
                        localStorage.setItem(key, value);
                    }
                } catch (rollbackError) {
                    rollbackOK = false;
                    console.error(
                        '누적 차감 복구 실패:',
                        key,
                        rollbackError
                    );
                }
            }
        }

        if (rollbackOK) {
            alert(
                '차감을 완료하지 못했어요.\n' +
                '변경된 데이터는 이전 상태로 복구했습니다.'
            );
        } else {
            alert(
                '저장 오류 후 일부 데이터 복구에도 실패했어요.\n' +
                '추가 차감을 하지 말고 기존 백업을 확인해 주세요.'
            );
        }

    } finally {
        moboCumCheckoutBusy = false;

        if (button) {
            button.disabled = false;
        }
    }

    if (!committed) return;

    // 실제 저장 완료 후에만 화면 갱신
    try {
        refreshBalance();
        updateWeeklyStatUI();
        moboCumRender();
    } catch (uiError) {
        console.error('차감 후 화면 갱신 오류:', uiError);
    }

    showToast('선택한 작품의 지갑 차감을 완료했어요!');
}

// 다른 브라우저 탭에서 목록 변경 시 화면 갱신
window.addEventListener('storage', event => {
    if (
        event.key !== MOBO_CUM_KEY &&
        event.key !== null
    ) {
        return;
    }

    const view = document.getElementById(
        'mobo-cum-view'
    );

    const list = document.getElementById(
        'mobo-cum-list-screen'
    );

    if (
        view?.style.display === 'block' &&
        list?.style.display === 'block'
    ) {
        moboCumRender();
    }
});

// 빠른 차감 및 구매 화수 입력 제한
function moboLimitPositiveInteger(input) {
    const value = input.value;

    const valid =
        /^\d{0,16}$/.test(value) &&
        (
            value === '' ||
            Number.isSafeInteger(Number(value))
        );

    if (valid) {
        input.dataset.lastValidPositiveInteger = value;
        return;
    }

    const previous =
        input.dataset.lastValidPositiveInteger ?? '';

    input.value =
        /^\d{0,16}$/.test(previous) &&
            (
                previous === '' ||
                Number.isSafeInteger(Number(previous))
            )
            ? previous
            : '';
}

// 빠른 차감 중복 실행 방지
let quickDeductionInProgress = false;



function updateQuickDeductLabel() {
    const platformSelect = document.getElementById('quick-deduct-platform');
    const label = document.getElementById('quick-deduct-amount-label');

    // HTML 요소가 없더라도 계산기 실행을 막지 않도록 보호
    if (!platformSelect || !label) return;

    const units = {
        lezhin: '코인',
        bomtoon: '코인',
        ridi: '캐시',
        mrblue: '머니'
    };

    const unit = units[platformSelect.value] || '코인';

    label.textContent = `사용 ${unit}`;
}


/**
 * 차감 후 예상 지갑 잔액 계산
 * 실제 지갑과 정산 기록은 변경하지 않음
 */
function getDeductionPreview(plt, amount) {
    const walletKeys = {
        lezhin: 'lWallet',
        bomtoon: 'bWallet',
        ridi: 'rWallet',
        mrblue: 'mWallet'
    };

    const walletKey = walletKeys[plt];
    const expense = Number(amount);

    // 잘못된 플랫폼이나 금액은 계산하지 않음
    if (!walletKey || !Number.isSafeInteger(expense) || expense <= 0) {
        return null;
    }

    // 현재 일반 지갑 잔액
    const currentWallet =
        parseInt(localStorage.getItem(walletKey) || '0', 10) || 0;

    // 기존 차감 로직과 동일하게 소멸 예정 재화 확인
    const expireData =
        JSON.parse(localStorage.getItem(plt + 'Expire') || 'null');

    const expireBalance =
        Math.max(0, parseInt(expireData?.amount, 10) || 0);

    // 소멸 예정 재화를 먼저 사용
    const usedExpire = Math.min(expense, expireBalance);

    // 나머지만 일반 지갑에서 차감
    const usedWallet = expense - usedExpire;

    // 예상 잔액 (마이너스 허용)
    const expectedWallet = currentWallet - usedWallet;

    return {
        currentWallet,
        expireBalance,
        usedExpire,
        usedWallet,
        expectedWallet,
        isInsufficient: expectedWallet < 0
    };
}


/**
 * 빠른 차감 잔액 부족 안내
 * 실제 지갑이나 정산 기록은 변경하지 않음
 */
function updateQuickDeductionPreview() {
    const select = document.getElementById('quick-deduct-platform');
    const input = document.getElementById('quick-deduct-amount');
    const notice = document.getElementById('quick-deduct-balance-notice');

    if (!select || !input || !notice) return;

    const rawAmount = input.value.trim();
    const amount = Number(rawAmount);

    // 기존 안내 초기화
    notice.style.display = 'none';
    notice.textContent = '';

    // 올바른 금액을 입력했을 때만 계산
    if (
        !/^\d+$/.test(rawAmount) ||
        !Number.isSafeInteger(amount) ||
        amount <= 0
    ) {
        return;
    }

    // 1단계에서 만든 예상 잔액 함수 사용
    const preview = getDeductionPreview(select.value, amount);

    // 잔액이 충분하면 아무것도 표시하지 않음
    if (!preview || !preview.isInsufficient) return;

    const units = {
        lezhin: '코인',
        bomtoon: '코인',
        ridi: '캐시',
        mrblue: '머니'
    };

    const unit = units[select.value];

    notice.textContent =
        `ⓘ 차감 후 예상 잔액: ${formatNum(preview.expectedWallet)} ${unit} `;

    notice.style.display = 'block';
}

// 플랫폼이나 사용 금액이 달라질 때 자동 갱신
document.addEventListener('DOMContentLoaded', () => {
    const platformSelect =
        document.getElementById('quick-deduct-platform');

    const amountInput =
        document.getElementById('quick-deduct-amount');


    if (platformSelect && amountInput) {
        platformSelect.addEventListener('change', () => {
            // 플랫폼 변경 시 사용 금액 초기화
            amountInput.value = '';

            // 기존 잔액 부족 안내도 초기화
            updateQuickDeductionPreview();
        });
    }


    if (amountInput) {
        amountInput.addEventListener(
            'input',
            updateQuickDeductionPreview
        );
    }
});




// 빠른 차감 실행
function quickDeductFromModal() {

    if (quickDeductionInProgress) return;

    const plt = document.getElementById('quick-deduct-platform').value;

    const rawAmount = document.getElementById('quick-deduct-amount').value.trim();

    const title =
        document.getElementById('quick-deduct-title').value.trim()
        || '기타 지출';

    const platforms = {
        lezhin: '레진',
        bomtoon: '봄툰',
        ridi: '리디',
        mrblue: '미블'
    };

    const units = {
        lezhin: '코인',
        bomtoon: '코인',
        ridi: '캐시',
        mrblue: '머니'
    };

    const amount = Number(rawAmount);

    // 플랫폼 검증
    if (!Object.prototype.hasOwnProperty.call(platforms, plt)) {
        alert('플랫폼을 다시 선택해 주세요.');
        return;
    }

    // 차감 금액 검증
    if (
        !/^\d+$/.test(rawAmount) ||
        !Number.isSafeInteger(amount) ||
        amount <= 0
    ) {
        alert('사용 금액은 1 이상의 정수로 입력해 주세요.');
        return;
    }

    // 최종 확인
    const confirmed = confirm(
        `${platforms[plt]}에서 ${formatNum(amount)} ${units[plt]}를 차감하고\n` +
        `월말정산에 [${title}]으로 기록할까요?`
    );

    if (!confirmed) return;

    const submitBtn = document.getElementById('quick-deduct-submit');

    quickDeductionInProgress = true;
    submitBtn.disabled = true;

    try {
        // 차감이 성공했을 때만 계산기 닫기
        const deducted = executeDeduction(plt, title, amount);

        if (deducted !== true) return;

        closeCalcModal();

    } finally {
        submitBtn.disabled = false;
        quickDeductionInProgress = false;
    }
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


// 정주행 계산기: 차감 지갑 선택창 준비
function prepareCalcWalletChoice(unit) {
    const wrap = document.getElementById('calc-wallet-wrap');
    const select = document.getElementById('calc-deduct-wallet');
    if (!wrap || !select) return;

    const choices = {
        coin: [
            ['lezhin', '레진코믹스 (코인)'],
            ['bomtoon', '봄툰 (코인)']
        ],
        cash: [
            ['ridi', '리디 (캐시)']
        ],
        won: [
            ['mrblue', '미블 (머니)']
        ]
    };

    select.replaceChildren();

    // 레진/봄툰만 직접 선택
    if (unit === 'coin') {
        wrap.style.display = 'block';
        select.add(new Option('차감할 지갑 선택', ''));

        choices.coin.forEach(([value, text]) => {
            select.add(new Option(text, value));
        });
    } else if (unit === 'cash') {
        // 리디는 자동 선택
        wrap.style.display = 'none';
        select.add(new Option('리디 (캐시)', 'ridi'));
        select.value = 'ridi';
    } else if (unit === 'won') {
        // 미블은 자동 선택
        wrap.style.display = 'none';
        select.add(new Option('미블 (머니)', 'mrblue'));
        select.value = 'mrblue';
    } else {
        wrap.style.display = 'none';
    }
    updateCalcBalanceNotice();

    // 코인 / 캐시 / 머니에 따라 버튼 위치 변경
    moboCumPlaceButtons(unit);
}


// 정주행 계산기: 잔액 부족 안내만 표시
function updateCalcBalanceNotice() {
    const wallet =
        document.getElementById('calc-deduct-wallet')?.value;

    const notice =
        document.getElementById('calc-balance-notice');

    if (!notice) return;

    notice.style.display = 'none';
    notice.textContent = '';

    if (!wallet || currentCalcCoin <= 0) return;

    // 1단계에서 만든 공통 예상 잔액 함수
    const preview = getDeductionPreview(wallet, currentCalcCoin);

    if (!preview || !preview.isInsufficient) return;


    const unit =
        wallet === 'ridi' ? '캐시' :
            wallet === 'mrblue' ? '머니' : 'C';


    notice.textContent =
        `ⓘ 차감 후 예상 잔액 ${formatNum(preview.expectedWallet)} ${unit}`;

    notice.style.display = 'block';
}

// 정주행 계산기: 0~100,000 범위의 정수만 입력
function moboLimitCalcInteger(input) {
    const value = input.value;

    const isValid =
        /^\d{0,6}$/.test(value) &&
        (value === '' || Number(value) <= 100000);

    if (isValid) {
        input.dataset.lastValidCalc = value;
    } else {
        input.value = input.dataset.lastValidCalc ?? '';
    }
}


// 이전 계산 결과 및 차감 금액 초기화
function moboCalcClearResult() {
    moboCumInvalidateClassic();

    currentCalcCoin = 0;

    const resultBox =
        document.getElementById('calc-result-box');

    if (resultBox) {
        resultBox.style.display = 'none';
    }

    const notice =
        document.getElementById('calc-balance-notice');

    if (notice) {
        notice.style.display = 'none';
        notice.textContent = '';
    }
}

// 수정: 계산기 로직 (JS에 숨어있던 인라인 색상 주입 로직 완전 제거!)
function calculateCoins() {
    // 이전 결과와 차감 금액 초기화
    moboCalcClearResult();

    const get = id => document.getElementById(id);

    const totalRaw = get('calc-total').value.trim();
    const currentRaw = get('calc-current').value.trim();
    const priceRaw = get('calc-price').value.trim();

    const plt = get('calc-platform').value;

    const isCoinback =
        get('calc-coinback-toggle').checked;

    const percentRaw = isCoinback
        ? get('calc-coinback-percent').value.trim()
        : '0';

    // 정수 이외의 입력은 계산하지 않음
    if (
        !/^\d+$/.test(totalRaw) ||
        !/^\d*$/.test(currentRaw) ||
        !/^\d+$/.test(priceRaw)
    ) {
        alert(
            '화수와 가격은 0 이상의 정수로 입력해 주세요.'
        );
        return;
    }

    // 코인백은 최대 100%
    if (
        isCoinback &&
        (
            !/^\d{1,3}$/.test(percentRaw) ||
            Number(percentRaw) > 100
        )
    ) {
        alert(
            '돌려받는 비율은 0~100%로 입력해 주세요.'
        );
        return;
    }

    // 기존 누적 계산의 검증 함수를 재사용
    const calc = moboCumCalculate({
        total: totalRaw,
        current: currentRaw === '' ? '0' : currentRaw,
        price: priceRaw,
        percent: percentRaw
    });

    if (!calc) {
        alert(
            '입력값을 확인해 주세요.\n\n' +
            '총 화수: 1~100,000화\n' +
            '현재 진도: 총 화수보다 작게\n' +
            '1화당 가격: 0~100,000'
        );
        return;
    }

    // 0으로 나누는 상황 방지
    if (isCoinback && calc.price === 0) {
        alert(
            '코인백을 계산하려면 ' +
            '1화당 가격이 1 이상이어야 해요.'
        );
        return;
    }

    if (!['coin', 'cash', 'won'].includes(plt)) {
        alert('계산 플랫폼을 다시 선택해 주세요.');
        return;
    }

    const remainEp = calc.total - calc.current;
    const needCoin = calc.amount;

    currentCalcCoin = needCoin;

    // 플랫폼별 단위
    let unit = 'C';

    if (plt === 'cash') {
        unit = '캐시';
    } else if (plt === 'won') {
        unit = '머니';
    }

    // 계산 결과 표시
    get('calc-remain-ep').textContent =
        formatNum(remainEp);

    get('calc-need-coin').textContent =
        formatNum(needCoin) + ' ' + unit;

    const coinbackResultArea =
        get('calc-coinback-result');

    if (isCoinback) {
        const backCoin = calc.cashback;

        const extraEp =
            Math.floor(backCoin / calc.price);

        get('calc-back-coin').textContent =
            formatNum(backCoin) + ' ' + unit;

        get('calc-extra-ep').textContent =
            formatNum(extraEp);

        coinbackResultArea.style.display = 'block';
    } else {
        coinbackResultArea.style.display = 'none';
    }

    get('calc-result-box').style.display = 'block';

    // 기존 지갑 선택 기능 유지
    prepareCalcWalletChoice(plt);

    // 정상 계산 결과만 누적 담기 허용
    moboCumCaptureClassicResult();
}


// 🌟 [통합 결제 시스템] 지갑 차감 + 가계부 작성 + 통계 업데이트를 한 번에!
function executeDeduction(plt, title, amount) {
    if (amount <= 0) return false;

    // 차감 과정에서 변경될 수 있는 저장 데이터 보관
    const protectedKeys = [
        plt.charAt(0) + 'Wallet',
        plt + 'Expire',
        'monthlyHistory',
        'weeklySpent',
        'weeklySpentWon',
        'lezhinBonusExpire',
        STORAGE_KEY
    ];

    let before;

    try {
        before = new Map(
            protectedKeys.map(key => [
                key,
                localStorage.getItem(key)
            ])
        );
    } catch (error) {
        console.error('차감 전 데이터 확인 실패:', error);
        alert('저장소를 확인할 수 없어 차감을 중단했습니다.');
        return false;
    }

    try {
        let remainingAmount = amount; // 기존 차감 계산 유지

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

        // 통합 저장까지 완료되어야 최종 성공
        if (saveData() !== true) {
            throw new Error('통합 데이터 저장 실패');
        }

    } catch (error) {
        console.error(
            '차감 중 오류: 저장 데이터 복구 시도',
            error
        );

        let restored = true;

        // 변경된 항목만 이전 값으로 복원
        for (const [key, value] of before) {
            try {
                if (localStorage.getItem(key) === value) {
                    continue;
                }

                if (value === null) {
                    localStorage.removeItem(key);
                } else {
                    localStorage.setItem(key, value);
                }

            } catch (rollbackError) {
                restored = false;

                console.error(
                    '차감 복구 실패:',
                    key,
                    rollbackError
                );
            }
        }

        // 복구된 값을 화면에도 반영
        try {
            updateWeeklyStatUI();
            refreshBalance();
        } catch (uiError) {
            console.error(
                '복구 후 화면 갱신 실패:',
                uiError
            );
        }

        if (restored) {
            alert(
                '저장에 실패해 차감을 취소했습니다.\n' +
                '지갑과 정산 기록을 이전 값으로 복구했습니다.'
            );
        } else {
            alert(
                '저장 실패 후 일부 데이터 복구에도 실패했습니다.\n' +
                '앱을 계속 사용하지 말고 기존 백업을 확인해 주세요.'
            );
        }

        return false;
    }

    // 모든 저장이 성공했을 때만 실행
    refreshBalance();

    alert(
        `성공! [${title}] 작품에 ` +
        `${formatNum(amount)} 만큼 차감되고 ` +
        `월말정산에 기록되었습니다!`
    );

    return true;
}

// 🌟 [신규] 계산기에서 바로 차감 버튼 눌렀을 때 작동하는 함수
function deductFromCalculator() {
    if (currentCalcCoin <= 0) return alert("차감할 금액이 없습니다!");


    // 화면에서 선택한 실제 지갑 사용
    const exactPlt =
        document.getElementById('calc-deduct-wallet')?.value;

    const unit = document.getElementById('calc-platform').value;

    const allowedWallets = {
        coin: ['lezhin', 'bomtoon'],
        cash: ['ridi'],
        won: ['mrblue']
    };

    // 지갑을 선택하지 않았거나 선택값이 올바르지 않으면 중단
    if (!allowedWallets[unit]?.includes(exactPlt)) {
        alert('차감할 지갑을 먼저 선택해 주세요.');
        return;
    }


    // 🌟 [신규 로직] 선택된 플랫폼에 맞춰서 진짜 단위를 꺼내옵니다!
    let unitStr = '코인';
    if (exactPlt === 'ridi') unitStr = '캐시';
    else if (exactPlt === 'mrblue') unitStr = '머니';

    // 🌟 [수정] '원' 대신 진짜 단위(unitStr)를 넣어서 자연스럽게 물어보기!
    const workTitle = prompt(`총 ${formatNum(currentCalcCoin)} ${unitStr} 차감됩니다.\n월말정산에 기록될 '작품 이름'을 적어주세요!`);

    if (!workTitle) return alert("작품 이름이 없어 차감이 취소되었습니다.");

    // 저장 실패 시 계산기를 유지하여 다시 확인할 수 있도록 함
    if (executeDeduction(exactPlt, workTitle, currentCalcCoin) !== true) {
        return;
    }

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
            if (!isWorkOnBreak(w) && isDateMatch(w.cycle, todayObj, plt) && w.lastDeductDate !== nowStr) {
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


// 지난 격주 연재일 확인 (저장된 다음 연재일 기준)
function wasBiweeklyReleaseOn(work, checkDate) {
    const match = work.cycle?.match(
        /격주 연재\s*\((\d{1,2})\/(\d{1,2})\)/
    );

    if (!match) return false;

    const today = getWebtoonDate();
    const month = Number(match[1]);
    const day = Number(match[2]);

    // 저장된 격주 날짜를 실제 날짜로 해석
    const anchor = new Date(
        today.getFullYear(), month - 1, day
    );

    // 잘못된 날짜 방어
    if (
        anchor.getMonth() !== month - 1 ||
        anchor.getDate() !== day
    ) return false;

    // 날짜 차이는 UTC 기준으로 계산해 오차 방지
    const civilUTC = date => Date.UTC(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
    );

    const todayUTC = civilUTC(today);
    let anchorUTC = civilUTC(anchor);

    if (anchorUTC - todayUTC > 180 * 86400000) {
        anchor.setFullYear(anchor.getFullYear() - 1);
        anchorUTC = civilUTC(anchor);
    } else if (todayUTC - anchorUTC > 180 * 86400000) {
        anchor.setFullYear(anchor.getFullYear() + 1);
        anchorUTC = civilUTC(anchor);
    }

    const checkUTC = civilUTC(checkDate);

    // 정확히 14일 간격에 해당하는 날짜만 연재일
    return (
        (anchorUTC - checkUTC) % (14 * 86400000) === 0
    );
}


// 밀린 정산: 해당 날짜가 실제 휴재일이었는지 판정
function isWorkOnBreakOnDate(work, checkDate) {
    // 수동 휴재와 완결은 기존대로 정산에서 제외
    if (work.status === '휴재' || work.status === '완결') {
        return true;
    }

    const cycle = work.cycle || '';

    // 날짜가 속한 주의 월요일을 UTC 기준으로 계산
    const getMondayUTC = date => {
        const utc = Date.UTC(
            date.getFullYear(),
            date.getMonth(),
            date.getDate()
        );

        const weekday = new Date(utc).getUTCDay();
        return utc - ((weekday + 6) % 7) * 86400000;
    };

    // 1. N연 M휴: 현재 주차에서 과거 주차를 역산
    const runMatch = cycle.match(
        /(\d+)연\s*(\d+)휴\s*(\d+)주차/
    );

    if (runMatch) {
        const runWeeks = Number(runMatch[1]);
        const breakWeeks = Number(runMatch[2]);
        const currentWeek = Number(runMatch[3]);
        const totalWeeks = runWeeks + breakWeeks;

        if (
            totalWeeks > 0 &&
            currentWeek >= 1 &&
            currentWeek <= totalWeeks
        ) {
            const elapsedWeeks = Math.round(
                (
                    getMondayUTC(getWebtoonDate()) -
                    getMondayUTC(checkDate)
                ) / (7 * 86400000)
            );

            const pastWeek = (
                (
                    (currentWeek - 1 - elapsedWeeks) %
                    totalWeeks + totalWeeks
                ) % totalWeeks
            ) + 1;

            if (pastWeek > runWeeks) return true;
        }
    }

    // 2. 매월 지정 주차 휴재: 해당 과거 월을 기준으로 검사
    const monthlyMatch = cycle.match(
        /매월\s*(\d+)주차\s*휴재/
    );

    if (monthlyMatch) {
        const targetWeek = Number(monthlyMatch[1]);

        const lastDay = new Date(
            checkDate.getFullYear(),
            checkDate.getMonth() + 1,
            0
        ).getDate();

        const maxWeek = Math.ceil(lastDay / 7);
        const effectiveWeek = Math.min(targetWeek, maxWeek);
        const checkWeek = Math.ceil(checkDate.getDate() / 7);

        if (checkWeek === effectiveWeek) return true;
    }

    return false;
}

// 작품 등록일 이전의 회차는 밀린 정산 대상에서 제외
function isWorkEligibleForPastDeduction(work, checkDate) {
    const registeredOn = work.registeredOn;

    if (
        typeof registeredOn === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(registeredOn) &&
        formatDate(checkDate) < registeredOn
    ) {
        return false;
    }

    // 예전 작품은 등록일 정보가 없으므로 기존 규칙 유지
    return !isWorkOnBreakOnDate(work, checkDate);
}

function askForDeduction() {

    // 20일 이상 복귀 선택이 끝나기 전에는
    // 밀린 정산창을 자동으로 열지 않음
    const pendingReturnDays = Number(
        localStorage.getItem(MOBO_RETURN_PENDING_KEY)
    );

    if (pendingReturnDays >= 20) {
        return;
    }

    const webtoonDate = getWebtoonDate();
    const nowStr = formatDate(webtoonDate);
    let last = localStorage.getItem('lastCheckDate');
    if (!last) { last = nowStr; localStorage.setItem('lastCheckDate', nowStr); }

    const dayOfWeek = webtoonDate.getDay(); const mondayDate = new Date(webtoonDate); mondayDate.setDate(webtoonDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
    const weekStr = formatDate(mondayDate);

    // 실제로 몇 주가 지났는지 계산 (연말·연초 대응)
    const previousWeekStr = localStorage.getItem('currentWeekStr');

    if (previousWeekStr !== weekStr) {
        const weekToUTC = (str) => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(str || '')) return null;

            const [y, m, d] = str.split('-').map(Number);
            const ms = Date.UTC(y, m - 1, d);
            const date = new Date(ms);

            if (
                date.getUTCFullYear() !== y ||
                date.getUTCMonth() + 1 !== m ||
                date.getUTCDate() !== d
            ) return null;

            return ms;
        };

        const previousUTC = weekToUTC(previousWeekStr);
        const currentUTC = weekToUTC(weekStr);

        // 이전 기록이 없는 경우 기존 동작(+1주) 유지
        const elapsedWeeks = previousUTC === null
            ? 1
            : Math.max(
                0,
                Math.floor((currentUTC - previousUTC) / (7 * 86400000))
            );

        // 기기 시간이 과거로 변경된 경우에는 주차를 되돌리지 않음
        if (previousUTC === null || currentUTC >= previousUTC) {

            if (elapsedWeeks > 0) {
                // 새로운 주의 통계 초기화
                localStorage.setItem('weeklySpent', '0');
                localStorage.setItem('weeklySpentWon', '0');

                ['lezhin', 'bomtoon', 'ridi', 'mrblue'].forEach(plt => {
                    const updatedById = new Map();

                    Object.keys(state[plt]).forEach(day => {
                        state[plt][day].forEach(work => {

                            // 동일 작품이 여러 요일에 있으면 결과만 동기화
                            if (work.id && updatedById.has(work.id)) {
                                work.cycle = updatedById.get(work.id);
                                return;
                            }

                            if (typeof work.cycle !== 'string') return;

                            const pattern = /(\d+)연\s*(\d+)휴\s*(\d+)주차/;
                            const match = work.cycle.match(pattern);

                            if (!match) return;

                            const totalWeeks =
                                Number(match[1]) + Number(match[2]);

                            const previousPosition = Number(match[3]);

                            if (
                                !Number.isSafeInteger(totalWeeks) ||
                                totalWeeks <= 0 ||
                                !Number.isSafeInteger(previousPosition) ||
                                previousPosition <= 0
                            ) return;

                            // 경과한 주 수를 반영하고 마지막 뒤에는 1주차로
                            const newPosition = (
                                (previousPosition - 1 +
                                    (elapsedWeeks % totalWeeks)) % totalWeeks
                            ) + 1;

                            // 다른 연재 방식의 날짜는 건드리지 않음
                            work.cycle = work.cycle.replace(
                                pattern,
                                `${match[1]}연 ${match[2]}휴 ${newPosition}주차`
                            );

                            if (work.id) {
                                updatedById.set(work.id, work.cycle);
                            }
                        });
                    });
                });

                // 기존 자동 정렬과 화면 갱신은 주차 저장 후 수행

                console.log(
                    `연재 주차를 ${elapsedWeeks}주 반영했습니다.`
                );
            }


            // 마지막으로 처리한 주 기록
            localStorage.setItem('currentWeekStr', weekStr);

            // 주차 기록을 완료한 뒤 통합 데이터 저장
            saveData(elapsedWeeks === 0);

        }
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
                (state[plt][d] || []).forEach((w, i) => {
                    if (
                        isWorkEligibleForPastDeduction(w, check) &&
                        w.lastDeductDate !== checkStr
                    ) {
                        pendingDeductions[plt].push({
                            day: d,
                            idx: i,
                            work: w
                        });
                    }
                });

                // 🚨🚨 10일 연재: && w.lastDeductDate !== checkStr 추가!
                (state[plt]["10일 연재"] || []).forEach((w, i) => {
                    if (
                        isWorkEligibleForPastDeduction(w, check) &&
                        isDateMatch(w.cycle, check, plt) &&
                        w.lastDeductDate !== checkStr
                    ) {
                        pendingDeductions[plt].push({
                            day: "10일 연재",
                            idx: i,
                            work: w
                        });
                    }
                });

                // 🌟 [최종 추가 2] 밀린 정산 할 때도 격주 연재 방 확인해!
                // 밀린 격주 연재: 과거의 실제 연재일을 확인
                (state[plt]["격주 연재"] || []).forEach((w, i) => {
                    if (
                        isWorkEligibleForPastDeduction(w, check) &&
                        w.lastDeductDate !== checkStr &&
                        wasBiweeklyReleaseOn(w, check)
                    ) {
                        pendingDeductions[plt].push({
                            day: "격주 연재",
                            idx: i,
                            work: w
                        });
                    }
                });
            });

            check.setDate(check.getDate() + 1);
        }

        const hasWorks = platformOrder.some(plt => pendingDeductions[plt].length > 0);

        // 🌟 [핵심 수정] 정산 팝업을 띄우기 '전'에 무조건 통계부터 화면에 그리게 끌어올림!
        updateWeeklyStatUI();

        if (hasWorks) {
            pendingDaysStr = ds.join(', '); showDeductionModal(); return;
        } else {
            localStorage.setItem('lastCheckDate', nowStr);
        }
    }
    // (기존의 맨 밑에 있던 updateWeeklyStatUI()는 지워주셔도 됩니다!)
}

// 오늘·어제 정산: 체크한 작품 기준 예상 잔액 안내
// 실제 지갑, 작품, 정산 기록은 변경하지 않음
function updateDeductionBalanceNotice() {
    const notice = document.getElementById('deduction-balance-notice');
    if (!notice) return;

    const labels = {
        lezhin: ['레진', 'C'],
        bomtoon: ['봄툰', 'C'],
        ridi: ['리디', '캐시'],
        mrblue: ['미블', '머니']
    };

    const insufficient = [];

    platformOrder.forEach(plt => {
        const total = (pendingDeductions[plt] || []).reduce((sum, item, i) => {
            const checkbox = document.getElementById(`deduct-chk-${plt}-${i}`);

            if (!checkbox || !checkbox.checked) return sum;

            // 기존 정산과 동일하게 작품 금액 합산
            return sum + (parseInt(item.work.coin) || 0);
        }, 0);

        if (total <= 0) return;

        // 기존에 만든 예상 잔액 함수 재사용
        const preview = getDeductionPreview(plt, total);

        if (preview && preview.isInsufficient) {
            const [name, unit] = labels[plt];

            insufficient.push(
                `${name} ${formatNum(preview.expectedWallet)} ${unit}`
            );
        }
    });

    notice.textContent = insufficient.length
        ? `ⓘ 차감 후 예상 잔액: ${insufficient.join(' · ')}`
        : '';

    notice.style.display = insufficient.length ? 'block' : 'none';
}



function showDeductionModal() {
    const listEl = document.getElementById('deduction-list');
    listEl.innerHTML = '';

    // 화면에서만 작품별로 묶기
    // 기존 개별 정산 데이터는 그대로 유지
    const groupedByPlatform = {};
    let originalCount = 0;
    let groupedCount = 0;

    platformOrder.forEach(plt => {
        const groups = new Map();

        (pendingDeductions[plt] || []).forEach((item, i) => {
            // 동일 플랫폼 + 동일 작품 ID 기준
            const key = item.work.id
                ? `id:${item.work.id}`
                : `legacy:${item.day}:${item.idx}`;

            if (!groups.has(key)) {
                groups.set(key, {
                    title: item.work.title,
                    indices: [],
                    amount: 0
                });
            }

            const group = groups.get(key);
            group.indices.push(i);
            group.amount += parseInt(item.work.coin, 10) || 0;
            originalCount++;
        });

        groupedByPlatform[plt] = groups;
        groupedCount += groups.size;
    });

    // 밀린 정산 요일 안내 + 기존 작품별 묶음 요약 유지
    let popupMsg = isTodayDeduction
        ? `오늘 볼 ${groupedCount}개 작품을 미리 정산할까요?`
        : `밀린 정산 ${originalCount}건 · ${groupedCount}개 작품<br><span style="display:inline-block;margin-top:8px;">밀린 요일: ${pendingDaysStr}</span>`;

    const todayDate = getKSTDate().getDate();

    // 기존 플랫폼 할인일 안내 유지
    if (todayDate === 20 && platformOrder.includes('lezhin')) {
        popupMsg += `<br><span style="color:#e60012; font-size:12px; font-weight:bold;">(오늘 레진 20일 코인 할인 날이에요!)</span>`;
    }

    if (todayDate === 22 && platformOrder.includes('bomtoon')) {
        popupMsg += `<br><span style="color:#ff69b4; font-size:12px; font-weight:bold;">(오늘 봄툰 22일 코인 할인 날이에요!)</span>`;
    }

    document.getElementById('deduction-msg').innerHTML = popupMsg;

    const platformInfo = {
        lezhin: ['레진', '#e60012', 'C'],
        bomtoon: ['봄툰', '#ff69b4', 'C'],
        ridi: ['리디', '#1e90ff', '캐시'],
        mrblue: ['미블', '#004e9a', '머니']
    };

    // 플랫폼별로 묶인 작품 표시
    platformOrder.forEach(plt => {
        const [pltName, color, unit] = platformInfo[plt];

        groupedByPlatform[plt].forEach(group => {
            const row = document.createElement('div');
            row.style.cssText = 'margin-bottom:8px;font-size:14px;';

            const label = document.createElement('label');
            label.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;width:100%;';

            // 이용자에게 보이는 작품별 체크박스
            const groupCheckbox = document.createElement('input');
            groupCheckbox.type = 'checkbox';
            groupCheckbox.checked = true;
            groupCheckbox.style.cssText = 'width:16px;height:16px;flex-shrink:0;margin:0;';

            const titleBox = document.createElement('span');
            titleBox.style.cssText = 'flex:1;min-width:0;';

            const title = document.createElement('span');
            title.textContent = `[${pltName}] ${group.title}`;
            title.style.cssText = 'display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
            titleBox.appendChild(title);

            // 같은 작품이 여러 번 밀린 경우만 횟수 표시
            if (group.indices.length > 1) {
                const count = document.createElement('small');
                count.textContent = `미정산 ${group.indices.length}회`;
                count.style.cssText = 'display:block;margin-top:3px;font-size:11px;color:#888;';
                titleBox.appendChild(count);
            }

            // 합산된 총 차감 금액
            const price = document.createElement('span');
            price.textContent = `${formatNum(group.amount)} ${unit}`;
            price.style.cssText = `color:${color};font-weight:bold;white-space:nowrap;flex-shrink:0;`;

            label.append(groupCheckbox, titleBox, price);
            row.appendChild(label);

            // 기존 정산 시스템에서 사용하는 체크박스 유지
            // 화면에만 보이지 않도록 처리
            const originals = document.createElement('span');
            originals.style.display = 'none';

            group.indices.forEach(i => {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = `deduct-chk-${plt}-${i}`;
                checkbox.checked = true;
                originals.appendChild(checkbox);
            });

            row.appendChild(originals);

            // 작품 체크박스와 기존 개별 항목을 동기화
            groupCheckbox.addEventListener('change', () => {
                originals.querySelectorAll('input').forEach(checkbox => {
                    checkbox.checked = groupCheckbox.checked;
                });

                // 기존 지갑 잔액 미리보기 갱신
                updateDeductionBalanceNotice();
            });

            listEl.appendChild(row);
        });
    });

    // 기존 잔액 미리보기와 모달 열기
    updateDeductionBalanceNotice();
    // 밀린 정산일 때만 건너뛰기 안내 표시
    const skipNotice = document.getElementById('deduction-skip-notice');

    if (skipNotice) {
        skipNotice.style.display =
            isTodayDeduction ? 'none' : 'block';
    }
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



// 🌟 [진짜 최종 복구본] 당일 밤 10시가 지나면, 격주 날짜 넘기기 & 휴재 복귀까지 알아서 척척!
function autoUpdatePastBiweeklyDates() {
    let isUpdated = false;
    const today = getWebtoonDate(); // 웹툰 기준 시간 (밤 10시가 넘으면 이미 내일임!)
    today.setHours(0, 0, 0, 0);
    const todayStr = formatDate(today); // 예: 6월 24일 밤 10시 1분 -> "2026-06-25"

    ['lezhin', 'bomtoon', 'ridi', 'mrblue'].forEach(plt => {
        Object.keys(state[plt]).forEach(day => {
            state[plt][day].forEach(work => {

                // 🔥 1. [완성형] 휴재 복귀 시 부활 + 원래 요일의 원래 순서로 이사!
                if (work.status === '휴재' && work.breakDate) {
                    if (todayStr >= work.breakDate) {
                        work.status = '연재중';
                        work.breakDate = '';

                        // 🌟 [핵심 1] 원래 집(origDay)으로 이사
                        if (
                            work.origDay &&
                            work.origDay !== day &&
                            work.origDay !== '휴재' &&
                            work.origDay !== '10일 연재' &&
                            work.origDay !== '격주 연재' &&
                            Array.isArray(state[plt][work.origDay])
                        ) {
                            let targetArr = state[plt][work.origDay];

                            // 중복 방지 체크
                            if (!targetArr.some(w => w.id === work.id)) {
                                // 🌟 [핵심 2] 원래 인덱스 위치에 정확히 끼워 넣기
                                if (work.origIdx !== undefined && work.origIdx <= targetArr.length) {
                                    targetArr.splice(work.origIdx, 0, work);
                                } else {
                                    targetArr.push(work);
                                }

                                // 🌟 [핵심 3] 이사 온 후, 해당 요일의 전체 인덱스를 최신화!
                                targetArr.forEach((w, i) => w.origIdx = i);
                            }

                            // 휴재 탭(현재의 day) 리스트에서 삭제
                            state[plt][day] = state[plt][day].filter(w => w.id !== work.id);
                        }
                        isUpdated = true;
                    }
                }
                // 🔥 2. 기존 로직 (격주 연재 날짜 넘기기)
                if (work.cycle && work.cycle.includes('격주 연재')) {
                    let match = work.cycle.match(/\((.*?)\)/);
                    if (match) {
                        let parts = match[1].split('/');
                        if (parts.length === 2) {
                            let tMonth = parseInt(parts[0]) - 1;
                            let tDate = parseInt(parts[1]);

                            let targetDate = new Date(today.getFullYear(), tMonth, tDate);
                            targetDate.setHours(0, 0, 0, 0);

                            if (targetDate.getTime() - today.getTime() > 180 * 24 * 60 * 60 * 1000) {
                                targetDate.setFullYear(today.getFullYear() - 1);
                            } else if (today.getTime() - targetDate.getTime() > 180 * 24 * 60 * 60 * 1000) {
                                targetDate.setFullYear(today.getFullYear() + 1);
                            }

                            // 밤 10시가 지나 앱 기준일이 다음 날이면 다음 연재일로 이동
                            if (targetDate < today) {
                                while (targetDate < today) {
                                    targetDate.setDate(targetDate.getDate() + 14);
                                }

                                // 격주 연재 날짜만 변경 (다른 주기 문구 보존)
                                work.cycle = work.cycle.replace(
                                    /격주 연재\s*\(\d{1,2}\/\d{1,2}\)/,
                                    `격주 연재 (${targetDate.getMonth() + 1}/${targetDate.getDate()})`
                                );

                                isUpdated = true;
                            }
                        }
                    }
                }
            });
        });
    });

    if (isUpdated) {
        saveData(true); // 조용히 데이터 저장
        console.log("밤 10시가 지나, 휴재 복귀 및 격주 업데이트가 완료되었습니다!");
    }
}

// 밀린 정산 중복 실행 방지
let moboDeductionSaving = false;

function processDeduction() {
    if (moboDeductionSaving) return false;

    const modal = document.getElementById('deduction-modal');

    // 정산창이 닫힌 상태에서는 중복 처리하지 않음
    if (!modal || modal.style.display !== 'flex') {
        return false;
    }

    const selected = [];
    let totalPendingCount = 0;

    platformOrder.forEach(plt => {
        const items = pendingDeductions[plt] || [];

        totalPendingCount += items.length;

        items.forEach((item, i) => {
            const checkbox = document.getElementById(
                `deduct-chk-${plt}-${i}`
            );

            if (checkbox?.checked) {
                selected.push({ plt, item });
            }
        });
    });

    // 선택하지 않았다면 기존 안내 유지
    if (!selected.length) {
        alert(
            '정산할 작품을 선택해 주세요.\n' +
            '전체를 건너뛰려면 「모두 건너뛰기」를 눌러 주세요.'
        );
        return false;
    }

    // 변경될 수 있는 저장 항목 보호
    const protectedKeys = [
        STORAGE_KEY,
        'lWallet',
        'bWallet',
        'rWallet',
        'mWallet',
        'lezhinExpire',
        'bomtoonExpire',
        'ridiExpire',
        'mrblueExpire',
        'lezhinBonusExpire',
        'monthlyHistory',
        'weeklySpent',
        'weeklySpentWon',
        'lastCheckDate',
        'lastPartialDeductDate'
    ];

    let beforeStorage;

    // 기존 작품 객체와 배열 참조까지 보존
    const beforeWorks = new Map();
    const beforeLists = [];
    const beforeTodayMode = isTodayDeduction;

    try {
        beforeStorage = new Map(
            protectedKeys.map(key => [
                key,
                localStorage.getItem(key)
            ])
        );

        Object.entries(state).forEach(([plt, dayMap]) => {
            Object.entries(dayMap).forEach(([day, list]) => {
                if (!Array.isArray(list)) return;

                beforeLists.push({
                    plt,
                    day,
                    list,
                    items: list.slice()
                });

                list.forEach(work => {
                    if (!beforeWorks.has(work)) {
                        beforeWorks.set(work, { ...work });
                    }
                });
            });
        });

    } catch (error) {
        console.error('정산 전 상태 확인 실패:', error);

        alert(
            '정산 데이터를 확인할 수 없어 처리를 중단했습니다.'
        );

        return false;
    }

    moboDeductionSaving = true;

    const totals = {
        lezhin: 0,
        bomtoon: 0,
        ridi: 0,
        mrblue: 0
    };

    try {
        const todayKST = getKSTDate();
        const nowStr = formatDate(getWebtoonDate());

        const monthKey =
            `${todayKST.getFullYear()}-${String(
                todayKST.getMonth() + 1
            ).padStart(2, '0')}`;

        const monthlyHistory = JSON.parse(
            localStorage.getItem('monthlyHistory')
        ) || {};

        if (!monthlyHistory[monthKey]) {
            monthlyHistory[monthKey] = {
                lezhin: {},
                bomtoon: {},
                ridi: {},
                mrblue: {}
            };
        }

        // 선택한 작품의 정산 금액과 날짜 계산
        selected.forEach(({ plt, item }) => {
            const cost = parseInt(item.work.coin, 10) || 0;

            totals[plt] += cost;

            if (cost > 0) {
                if (!monthlyHistory[monthKey][plt]) {
                    monthlyHistory[monthKey][plt] = {};
                }

                const title = item.work.title;

                monthlyHistory[monthKey][plt][title] =
                    (monthlyHistory[monthKey][plt][title] || 0)
                    + cost;
            }

            // 같은 작품 ID는 기존처럼 정산일 동기화
            if (item.work.id) {
                Object.values(state[plt]).forEach(list => {
                    list.forEach(work => {
                        if (work.id === item.work.id) {
                            work.lastDeductDate = nowStr;
                        }
                    });
                });

            } else {
                item.work.lastDeductDate = nowStr;
            }
        });

        const totalCost = Object.values(totals).reduce(
            (sum, amount) => sum + amount,
            0
        );

        if (totalCost > 0) {

            // 소멸 예정 재화를 먼저 사용한 뒤 일반 지갑 차감
            const deductWallet = (plt, amount) => {
                if (amount <= 0) return;

                const expireKey = plt + 'Expire';

                const expire = JSON.parse(
                    localStorage.getItem(expireKey)
                );

                let remaining = amount;

                if (
                    expire &&
                    (parseInt(expire.amount, 10) || 0) > 0
                ) {
                    const available = parseInt(
                        expire.amount,
                        10
                    );

                    const used = Math.min(
                        available,
                        remaining
                    );

                    expire.amount = available - used;
                    remaining -= used;

                    if (expire.amount <= 0) {
                        localStorage.removeItem(expireKey);
                    } else {
                        localStorage.setItem(
                            expireKey,
                            JSON.stringify(expire)
                        );
                    }
                }

                // 기존 마이너스 잔액 허용 유지
                if (remaining > 0) {
                    const walletKey =
                        plt.charAt(0) + 'Wallet';

                    const wallet = parseInt(
                        localStorage.getItem(walletKey) || '0',
                        10
                    );

                    localStorage.setItem(
                        walletKey,
                        String(wallet - remaining)
                    );
                }
            };

            Object.entries(totals).forEach(
                ([plt, amount]) => {
                    deductWallet(plt, amount);
                }
            );

            if (totals.lezhin > 0) {
                localStorage.removeItem(
                    'lezhinBonusExpire'
                );
            }

            // 기존 주간 통계 반영
            addWeeklySpent(
                totals.lezhin + totals.bomtoon,
                totals.ridi + totals.mrblue
            );

            localStorage.setItem(
                'monthlyHistory',
                JSON.stringify(monthlyHistory)
            );
        }

        // 오늘 작품 일부 정산 기능 유지
        if (isTodayDeduction) {
            if (selected.length < totalPendingCount) {
                isTodayDeduction = false;

                localStorage.setItem(
                    'lastPartialDeductDate',
                    nowStr
                );

            } else {
                localStorage.removeItem(
                    'lastPartialDeductDate'
                );
            }
        }

        // 정산 완료 기준일 저장
        const finishDate = getWebtoonDate();

        if (isTodayDeduction) {
            finishDate.setDate(
                finishDate.getDate() + 1
            );
        }

        localStorage.setItem(
            'lastCheckDate',
            formatDate(finishDate)
        );

        // 기존 격주 연재 갱신 유지
        autoUpdatePastBiweeklyDates();

        // 작품·지갑·정산 기준을 모두 반영한 최종 저장
        if (saveData(true) !== true) {
            throw new Error(
                '밀린 정산 통합 저장 실패'
            );
        }

    } catch (error) {
        console.error(
            '밀린 정산 취소: 저장 실패',
            error
        );

        // 변경된 작품 정보를 원래 객체에 복구
        beforeWorks.forEach((old, work) => {
            Object.keys(work).forEach(key => {
                if (
                    !Object.prototype.hasOwnProperty.call(
                        old,
                        key
                    )
                ) {
                    delete work[key];
                }
            });

            Object.assign(work, old);
        });

        // 자동 갱신 중 이동한 작품 배열도 복구
        beforeLists.forEach(({
            plt,
            day,
            list,
            items
        }) => {
            list.splice(
                0,
                list.length,
                ...items
            );

            state[plt][day] = list;
        });

        isTodayDeduction = beforeTodayMode;

        let rollbackFailed = false;

        // 지갑·정산 기록·저장 기준 복구
        for (const [key, value] of beforeStorage) {
            try {
                if (
                    localStorage.getItem(key) === value
                ) {
                    continue;
                }

                if (value === null) {
                    localStorage.removeItem(key);
                } else {
                    localStorage.setItem(key, value);
                }

            } catch (rollbackError) {
                rollbackFailed = true;

                console.error(
                    '정산 복구 실패:',
                    key,
                    rollbackError
                );
            }
        }

        try {
            updateWeeklyStatUI();
            refreshBalance();
        } catch (uiError) {
            console.error(
                '정산 복구 화면 갱신 실패:',
                uiError
            );
        }

        if (rollbackFailed) {
            alert(
                '정산 저장과 일부 복구에 실패했습니다.\n' +
                '앱을 계속 사용하지 말고 백업을 확인해 주세요.'
            );
        } else {
            alert(
                '저장에 실패하여 정산을 취소했습니다.\n' +
                '지갑·작품 정산일·기록을 복구했습니다.'
            );
        }

        // 실패 시 정산창 유지
        return false;

    } finally {
        moboDeductionSaving = false;
    }

    // 최종 저장 성공 후에만 정산창 닫기
    modal.style.display = 'none';
    isTodayDeduction = false;

    try {
        updateWeeklyStatUI();
        refreshBalance();
        renderAll();

        // 출석은 정산 종료 후
        setTimeout(
            checkAndShowAttendPopup,
            0
        );

    } catch (uiError) {
        console.error(
            '정산 저장 후 화면 갱신 오류:',
            uiError
        );
    }

    let message = '성공적으로 정산되었습니다!\n';

    if (totals.lezhin > 0) {
        message += `- 레진 정산: ${totals.lezhin} C\n`;
    }

    if (totals.bomtoon > 0) {
        message += `- 봄툰 정산: ${totals.bomtoon} C\n`;
    }

    if (totals.ridi > 0) {
        message += `- 리디 정산: ${totals.ridi} 캐시\n`;
    }

    if (totals.mrblue > 0) {
        message += `- 미블 정산: ${totals.mrblue} 머니\n`;
    }

    if (
        Object.values(totals).every(
            amount => amount === 0
        )
    ) {
        message += '(무료 감상 등 0원 정산 완료!)';
    }

    alert(message);
    return true;
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

    setTimeout(checkAndShowAttendPopup, 0);
}

function finishDeduction() {
    const modal = document.getElementById('deduction-modal');

    // 이미 닫힌 정산창은 다시 처리하지 않음
    if (!modal || modal.style.display !== 'flex') {
        return false;
    }

    const dateToSave = getWebtoonDate();

    if (isTodayDeduction) {
        dateToSave.setDate(dateToSave.getDate() + 1);
    }

    let originalDate;
    let originalMainData;
    let snapshotReady = false;

    try {
        // 변경 전 정산 기준과 통합 저장 데이터를 보관
        originalDate = localStorage.getItem('lastCheckDate');
        originalMainData = localStorage.getItem(STORAGE_KEY);
        snapshotReady = true;

        // 정산 기준일 변경
        localStorage.setItem(
            'lastCheckDate',
            formatDate(dateToSave)
        );

        // 통합 저장까지 성공해야 정산 완료
        if (saveData(true) !== true) {
            throw new Error('정산 기준일 통합 저장 실패');
        }

    } catch (error) {
        console.error('정산 완료 저장 실패:', error);

        let rollbackFailed = !snapshotReady;

        // 변경 전 날짜와 통합 저장 데이터 복구
        if (snapshotReady) {
            for (const [key, value] of [
                ['lastCheckDate', originalDate],
                [STORAGE_KEY, originalMainData]
            ]) {
                try {
                    if (localStorage.getItem(key) === value) {
                        continue;
                    }

                    if (value === null) {
                        localStorage.removeItem(key);
                    } else {
                        localStorage.setItem(key, value);
                    }

                } catch (restoreError) {
                    rollbackFailed = true;

                    console.error(
                        '정산 기준 복구 실패:',
                        key,
                        restoreError
                    );
                }
            }
        }

        if (rollbackFailed) {
            alert(
                '정산 저장과 일부 복구에 실패했습니다.\n' +
                '기존 백업을 확인해 주세요.'
            );
        } else {
            alert(
                '정산 저장에 실패했습니다.\n' +
                '정산창을 유지하고 이전 기준일로 복구했습니다.'
            );
        }

        // 실패하면 창과 정산 모드를 그대로 유지
        return false;
    }

    // 저장 성공 후에만 정산창 닫기
    modal.style.display = 'none';
    isTodayDeduction = false;

    // 정산 저장 성공 후 격주 연재 갱신
    try {
        autoUpdatePastBiweeklyDates();
    } catch (error) {
        console.error('정산 후 연재일 갱신 오류:', error);
    }

    // 화면 갱신
    try {
        updateWeeklyStatUI();
        refreshBalance();
        renderAll();
    } catch (error) {
        console.error('정산 완료 후 화면 갱신 오류:', error);
    }

    // 모든 처리가 끝난 다음 출석 확인
    setTimeout(checkAndShowAttendPopup, 0);

    return true;
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
    // 기존 함수 호출과의 호환성을 위해 유지
    // 사용자가 직접 정한 저장 순서는 절대 변경하지 않음
    // 휴재 작품의 화면 정렬은 renderList()에서만 처리
}


// 1. 데이터 불러오기
function loadAllData() {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
        const p = JSON.parse(data);
        state = p.state || state;


        // 백업에 정렬 설정이 있다면 함께 복원
        if (p.platformSortModes &&
            typeof p.platformSortModes === 'object') {

            Object.keys(platformSortModes).forEach(plt => {
                const mode = p.platformSortModes[plt];

                if (['manual', 'az', 'za'].includes(mode)) {
                    platformSortModes[plt] = mode;
                }
            });
        }

        if (p.manualDayOverrides &&
            typeof p.manualDayOverrides === 'object') {

            Object.keys(manualDayOverrides).forEach(plt => {
                const saved = p.manualDayOverrides[plt];

                if (!saved || typeof saved !== 'object') return;

                Object.keys(state[plt] || {}).forEach(day => {
                    if (saved[day] === true) {
                        manualDayOverrides[plt][day] = true;
                    }
                });
            });
        }


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
        // 백업의 지갑과 정산 기록을 모두 불러온 뒤 저장
        if (migratedCount > 0) {
            saveData(true);
        }
    }

    // 🚨 앱을 켤 때마다 자동으로 청소기를 싹~ 돌려서 휴재작들을 전부 뒤로 밀어냅니다!
    forceSortBreaks();
}

// 2. 데이터 저장하기 (🌟 완전 무소음 완벽판!)
function saveData(silent = false) {
    // QA-044D-3D-3B | 오래된 탭 저장 차단
    if (moboMainTabIsStale()) {
        if (!moboMainStaleWarned) {
            moboMainStaleWarned = true;

            alert(
                '다른 모보 탭에서 데이터가 변경됐어요.\n\n' +
                '오래된 데이터로 덮어쓰지 않도록 ' +
                '현재 탭의 저장을 차단했습니다.\n\n' +
                '다른 탭에서 최신 데이터가 저장됐는지 확인하고, ' +
                '이 탭을 새로고침해 주세요.\n\n' +
                '현재 탭에서 저장하지 않은 변경 사항은 ' +
                '새로고침 시 사라질 수 있어요.'
            );
        }

        return false;
    }

    if (!silent) {
        forceSortBreaks();
    }

    const d = {
        state: state,
        platformSortModes: platformSortModes,
        manualDayOverrides: manualDayOverrides,
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
        bomtoonAttend: localStorage.getItem('bomtoonAttend') || 'false',

        // 백업에도 포함할 주차·정산·복귀 기준
        currentWeekStr: localStorage.getItem('currentWeekStr'),
        lastCheckDate: localStorage.getItem('lastCheckDate'),
        lastPartialDeductDate: localStorage.getItem('lastPartialDeductDate'),
        lezhinBonusExpire: localStorage.getItem('lezhinBonusExpire'),
        moboReturnLastOpenedAt: localStorage.getItem(MOBO_LAST_OPENED_KEY),
        moboReturnPendingDays: localStorage.getItem(MOBO_RETURN_PENDING_KEY)
    };

    try {
        const serialized = JSON.stringify(d);

        localStorage.setItem(STORAGE_KEY, serialized);

        // 이 탭에서 정상 저장한 최신 데이터 기록
        moboMainLastSavedRaw = serialized;
    } catch (error) {
        console.error('모보 데이터 저장 실패:', error);

        if (
            error.name === 'QuotaExceededError' ||
            error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
        ) {
            alert("모보의 저장 공간(5MB)이 꽉 찼습니다!\n새로운 내용을 저장하려면 기존 작품의 '사진'을 몇 개 삭제해 주세요.");
        } else {
            alert("데이터 저장 중 알 수 없는 오류가 발생했습니다.");
        }

        return false;
    }

    // 저장 성공 후 화면 갱신은 별도로 처리
    if (!silent) {
        try {
            renderAll();
            checkStorage();
        } catch (error) {
            console.error('모보 화면 갱신 오류:', error);
        }
    }

    // QA-044D-3C
    // 로컬 저장 성공 후 알림 일정 동기화 요청
    if (typeof moboQueueScheduleAutoSync === 'function') {
        moboQueueScheduleAutoSync();
    }

    return true;
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

// =========================================
// 연재일 미설정 작품 안내
// 일괄 등록 시 날짜가 없는 작품만 감지
// =========================================


// 날짜를 설정하지 않은 작품인지 판정
function moboIsPendingSchedule(work) {
    const cycle = String(work?.cycle ?? '').trim();

    return (
        cycle === '10일 연재' ||
        cycle === '격주 연재'
    );
}


// 전체 플랫폼에서 미설정 작품 찾기
function moboGetPendingSchedules() {
    const pending = [];
    const seen = new Set();

    for (const platform of [
        'lezhin',
        'bomtoon',
        'ridi',
        'mrblue'
    ]) {
        const platformWorks = state?.[platform] || {};

        for (const [day, works] of Object.entries(platformWorks)) {
            if (!Array.isArray(works)) continue;

            works.forEach((work, index) => {
                if (!moboIsPendingSchedule(work)) return;

                // 같은 작품이 여러 목록에 있어도 중복 표시 방지
                const key = work.id
                    ? `${platform}:${work.id}`
                    : `${platform}:${day}:${index}`;

                if (seen.has(key)) return;

                seen.add(key);

                pending.push({
                    platform,
                    day,
                    index,
                    title: String(work.title || '제목 없음'),
                    cycle: String(work.cycle).trim()
                });
            });
        }
    }

    return pending;
}


// 메인 화면 안내 업데이트
function moboUpdatePendingScheduleBanner() {
    const banner = document.getElementById(
        'mobo-pending-schedule-banner'
    );

    const title = document.getElementById(
        'mobo-pending-schedule-count'
    );

    const detail = document.getElementById(
        'mobo-pending-schedule-detail'
    );

    if (!banner || !title || !detail) return;

    const pending = moboGetPendingSchedules();

    // 미설정 작품이 없다면 안내 숨기기
    banner.style.display =
        pending.length ? 'block' : 'none';

    if (!pending.length) return;

    const tenDayCount = pending.filter(
        work => work.cycle === '10일 연재'
    ).length;

    const biweeklyCount =
        pending.length - tenDayCount;

    title.textContent =
        `연재일 설정이 필요한 작품 ${pending.length}개`;

    detail.textContent =
        `10일 연재 ${tenDayCount}개 · ` +
        `격주 연재 ${biweeklyCount}개`;
}


// 미설정 작품 목록 열기
function moboOpenPendingScheduleList() {
    const modal = document.getElementById(
        'mobo-pending-schedule-modal'
    );

    const list = document.getElementById(
        'mobo-pending-schedule-list'
    );

    if (!modal || !list) return;

    const pending = moboGetPendingSchedules();

    list.replaceChildren();

    const platformLabels = {
        lezhin: '레진',
        bomtoon: '봄툰',
        ridi: '리디',
        mrblue: '미블'
    };

    pending.forEach(item => {

        // 작품별 수정 버튼
        const button = document.createElement('button');

        button.type = 'button';
        button.className = 'mobo-pending-schedule-item';

        const info = document.createElement('span');
        info.className = 'mobo-pending-schedule-info';

        const name = document.createElement('strong');
        name.textContent = item.title;

        const subtitle = document.createElement('small');

        subtitle.textContent =
            `${platformLabels[item.platform]} · ` +
            `${item.cycle} · 날짜 미설정`;

        const edit = document.createElement('span');
        edit.className = 'mobo-pending-schedule-edit';
        edit.textContent = '수정';

        info.append(name, subtitle);
        button.append(info, edit);

        button.addEventListener('click', () => {

            // 목록이 열린 사이 작품이 변경됐는지 확인
            const work =
                state[item.platform]?.[item.day]?.[item.index];

            if (!moboIsPendingSchedule(work)) {
                moboOpenPendingScheduleList();
                return;
            }

            // 기존 작품 상세 수정 기능 재사용
            actionPlt = item.platform;
            actionOrigDay = item.day;
            actionIdx = item.index;

            moboClosePendingScheduleList();

            editFromAction();
        });

        list.appendChild(button);
    });

    modal.style.display = 'flex';
}


// 미설정 작품 목록 닫기
function moboClosePendingScheduleList() {
    const modal = document.getElementById(
        'mobo-pending-schedule-modal'
    );

    if (modal) {
        modal.style.display = 'none';
    }
}

function renderAll() {
    ['lezhin', 'bomtoon', 'ridi', 'mrblue'].forEach(plt => {
        const el = document.getElementById(plt + '-day-display');
        if (el) el.textContent = viewDay;
    });
    document.querySelectorAll('.day-btn').forEach(btn => { if (btn.dataset.day === viewDay) btn.classList.add('active'); else btn.classList.remove('active'); });

    ['lezhin', 'bomtoon', 'ridi', 'mrblue'].forEach(plt => renderList(plt));

    refreshBalance();

    // 작품 등록·수정·삭제 후 연재일 미설정 안내 갱신
    moboUpdatePendingScheduleBanner();
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


// 격주 연재 뱃지 표시 문구만 변경 (저장 데이터 유지)
function formatBiweeklyBadgeText(cyclePart) {
    const match = cyclePart.match(
        /격주 연재\s*\((\d{1,2})\/(\d{1,2})\)/
    );

    if (!match) return cyclePart;

    const today = getWebtoonDate();
    const month = Number(match[1]);
    const day = Number(match[2]);

    const label = (
        today.getMonth() + 1 === month &&
        today.getDate() === day
    ) ? '오늘' : '다음';

    return `격주 · ${label} ${month}/${day}`;
}


function hasWorkReturnedForViewedDay(work, dayStr) {
    const regularDays = [
        '월요일', '화요일', '수요일', '목요일',
        '금요일', '토요일', '일요일'
    ];

    return regularDays.includes(dayStr) &&
        work.status === '휴재' &&
        typeof work.breakDate === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(work.breakDate) &&
        formatDate(getTargetDateForViewDay(dayStr)) >= work.breakDate;
}



function isWorkOnBreakForViewedDay(work, dayStr) {
    const regularDays = [
        '월요일', '화요일', '수요일', '목요일',
        '금요일', '토요일', '일요일'
    ];

    if (!regularDays.includes(dayStr)) {
        return isWorkOnBreak(work);
    }

    const targetDate = getTargetDateForViewDay(dayStr);
    const hasReturned = hasWorkReturnedForViewedDay(work, dayStr);

    // 완결이나 복귀일 이전의 수동 휴재는 그대로 유지
    if (
        work.status === '완결' ||
        (work.status === '휴재' && !hasReturned)
    ) {
        return true;
    }

    // 복귀일 이후라면 화면에서만 연재중으로 판단
    const viewWork = hasReturned
        ? { ...work, status: '연재중' }
        : work;

    // 정기휴재 주기 역시 선택한 날짜 기준
    if (isWorkOnBreakOnDate(viewWork, targetDate)) {
        return true;
    }

    // 격주 연재일 판정
    return (work.cycle || '').includes('격주 연재') &&
        !isBiweeklyReleaseOnViewedDate(work, targetDate);
}




function renderList(platform) {
    const listEl = document.getElementById(`${platform}-list`);

    // 기존에 표시된 썸네일 이미지 기억하기
    const loadedThumbs = new Map();

    listEl.querySelectorAll('.card-thumbnail[data-bg]').forEach(thumb => {
        if (thumb.style.backgroundImage &&
            thumb.style.backgroundImage !== 'none') {
            loadedThumbs.set(
                thumb.dataset.bg,
                thumb.style.backgroundImage
            );
        }
    });

    listEl.innerHTML = '';
    let displayWorks = [];
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
                    // 🌟 [중요 누락 복구!] 전용 탭에서도 오늘 연재일인지 꼼꼼하게 날짜 계산!
                    let isTodayRelease = false;
                    let match = work.cycle.match(/\((.*?)\)/);
                    if (match) {
                        const parts = match[1].split('/');
                        if (parts.length === 2) {
                            const dDate = new Date(todayObj.getFullYear(), parseInt(parts[0]) - 1, parseInt(parts[1]));
                            // 해가 바뀌었을 때 (연도 역전) 보정
                            if (dDate.getTime() - todayObj.getTime() > 180 * 24 * 60 * 60 * 1000) {
                                dDate.setFullYear(todayObj.getFullYear() - 1);
                            }
                            if (dDate.getMonth() === todayObj.getMonth() && dDate.getDate() === todayObj.getDate()) {
                                isTodayRelease = true;
                            }
                        }
                    }

                    // 연재중·휴재·완결 관계없이 격주 연재 탭에 표시
                    displayWorks.push({
                        ...work,
                        origDay: d,
                        origIdx: idx,
                        isTodayBiweekly: isTodayRelease
                    });
                    // 🌟 카드를 화면에 그리기 직전에 무적의 서열을 정리합니다!
                    displayWorks.sort((a, b) => {
                        // 1순위: 메인 탭 VIP 주인공 (10일/격주) - 단, 휴재나 완결이 아닐 때!
                        const isVipA = (a.isToday10Day || a.isTodayBiweekly) && !isWorkOnBreak(a);
                        const isVipB = (b.isToday10Day || b.isTodayBiweekly) && !isWorkOnBreak(b);
                        if (isVipA && !isVipB) return -1;
                        if (!isVipA && isVipB) return 1;

                        // 2순위: 휴재 작품들 완벽 서열 정리 (가장 빠른 복귀일 -> 장기 휴재/완결)
                        const hasDateA = a.status === '휴재' && a.breakDate && a.breakDate.trim() !== "";
                        const hasDateB = b.status === '휴재' && b.breakDate && b.breakDate.trim() !== "";

                        // 💡 둘 다 확정 복귀일이 있다면? -> 날짜가 가장 가까운(빠른) 순서대로 1등!
                        if (hasDateA && hasDateB) {
                            return new Date(a.breakDate) - new Date(b.breakDate);
                        }

                        // 💡 둘 중 하나만 확정 복귀일이 있다면? -> 날짜 있는 녀석을 장기휴재보다 위로 올리기!
                        if (hasDateA && !hasDateB) return -1;
                        if (!hasDateA && hasDateB) return 1;

                        return 0; // 나머지는 기존 순서 유지 (장기휴재끼리, 완결끼리)
                    });
                }
            });
        });
    }

    else if (viewDay === '10일 연재') {
        (state[platform]["10일 연재"] || []).forEach((work, idx) => {
            // 🌟 [중요 누락 복구!] 10일 연재 전용 탭에서도 주인공 판독기 가동!
            let isTodayRelease = isDateMatch(work.cycle, todayObj, platform);
            // 🚨 VIP 이름표(isToday10Day) 부착!
            displayWorks.push({ ...work, origDay: "10일 연재", origIdx: idx, isToday10Day: isTodayRelease });
        });
    }

    else {
        (state[platform][viewDay] || []).forEach((work, idx) => { displayWorks.push({ ...work, origDay: viewDay, origIdx: idx }); });

        // 🌟 [핵심] 현재 보고 있는 탭의 '정확한 달력 날짜'를 구합니다! (예: 2026-06-24)
        const targetDate = getTargetDateForViewDay(viewDay);
        const targetDateStr = formatDate(targetDate);

        // 🌟 일반 요일 탭에서 10일 연재작 등판!
        (state[platform]["10일 연재"] || []).forEach((work, idx) => {
            if (isDateMatch(work.cycle, targetDate, platform)) {
                displayWorks.push({ ...work, origDay: "10일 연재", origIdx: idx, isToday10Day: true });
            }
        });

        // 🔥 일반 요일 탭에서 격주 연재작 등판!
        (state[platform]["격주 연재"] || []).forEach((work, idx) => {
            if (work.cycle && work.cycle.includes('격주 연재')) {
                let match = work.cycle.match(/\((.*?)\)/);
                if (match) {
                    const parts = match[1].split('/');
                    if (parts.length === 2) {
                        const d = new Date(targetDate.getFullYear(), parseInt(parts[0]) - 1, parseInt(parts[1]));
                        if (d.getTime() - targetDate.getTime() > 180 * 24 * 60 * 60 * 1000) d.setFullYear(targetDate.getFullYear() - 1);
                        if (d.getMonth() === targetDate.getMonth() && d.getDate() === targetDate.getDate()) {
                            displayWorks.push({ ...work, origDay: "격주 연재", origIdx: idx, isTodayBiweekly: true });
                        }
                    }
                }
            }
        });

        // 🚨 [수정된 강제 소환 로직] 다른 폴더 작품 중 복귀 '날짜'가 정확히 오늘인 녀석만 소환!
        Object.keys(state[platform]).forEach(dayKey => {
            if (dayKey !== viewDay && dayKey !== "10일 연재" && dayKey !== "격주 연재") {
                (state[platform][dayKey] || []).forEach((work, idx) => {
                    if (work.status === '휴재' && work.breakDate && work.breakDate.trim() !== "") {
                        // 🌟 요일(수요일)만 비교하는 게 아니라, 달력 날짜(YYYY-MM-DD)가 완벽히 같을 때만 소환!
                        if (work.breakDate === targetDateStr) {
                            const isAlreadyIn = displayWorks.some(w => w.title === work.title);
                            if (!isAlreadyIn) {
                                displayWorks.push({ ...work, origDay: dayKey, origIdx: idx });
                            }
                        }
                    }
                });
            }
        });
    }

    // 🌟 [핵심 방어막] 소환됐든 원래 폴더에 있었든, 탭 날짜와 복귀 날짜가 같으면 무조건 VIP 이름표 부착!
    const targetDateForTag = getTargetDateForViewDay(viewDay);
    const targetDateStrForTag = formatDate(targetDateForTag);

    displayWorks.forEach(work => {
        if (work.status === '휴재' && work.breakDate && work.breakDate.trim() !== "") {
            // 🌟 여기서도 요일이 아니라, 정확한 날짜로 깐깐하게 검사합니다!
            if (work.breakDate === targetDateStrForTag) {
                work.isReturningToday = true; // 🚨 VIP 프리패스 통과!
            }
        }
    });


    // 🌟 [1단계: 필터링 완벽 수정] 숨기기 기능은 오직 '메인 화면(월~일)'에서만 작동!
    const regularDays = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];

    if (regularDays.includes(viewDay)) {
        if (isHidingFinished[platform]) {
            displayWorks = displayWorks.filter(work => {
                if (work.status === '완결') return false;
                if (work.isReturningToday) return true;

                return !isWorkOnBreakForViewedDay(work, viewDay);
            });
        }
    }

    // 🌟 [2단계: 최종 보스 서열 정리] 휴재 탭과 일반 탭을 완벽하게 나눠서 줄 세우기!
    // 휴재 탭: 일반 복귀일과 격주 다음 연재일을 함께 정렬
    if (viewDay === '휴재' || viewDay === '휴재 중인 작품' ||
        viewDay.includes('휴재') || viewDay === '휴재 및 완결') {

        const today = getWebtoonDate();
        today.setHours(0, 0, 0, 0);

        const dayMs = 24 * 60 * 60 * 1000;

        const getBreakSortInfo = (work) => {

            // 1. 직접 지정한 복귀일을 가장 먼저 사용
            if (work.status === '휴재' && work.breakDate) {
                const date = new Date(`${work.breakDate}T00:00:00`);

                if (!Number.isNaN(date.getTime())) {
                    return [0, date.getTime()];
                }
            }

            // 2. 자동휴재 중인 격주 작품의 다음 연재일
            if (
                work.status === '연재중' &&
                work.cycle?.includes('격주 연재')
            ) {
                const match = work.cycle.match(
                    /격주 연재\s*\((\d{1,2})\/(\d{1,2})\)/
                );

                if (match) {
                    const month = Number(match[1]);
                    const day = Number(match[2]);

                    const nextDate = new Date(
                        today.getFullYear(), month - 1, day
                    );

                    // 잘못된 날짜는 정렬 기준으로 사용하지 않음
                    if (
                        nextDate.getMonth() === month - 1 &&
                        nextDate.getDate() === day
                    ) {

                        // 연말·연초 연도 보정
                        if (nextDate - today > 180 * dayMs) {
                            nextDate.setFullYear(
                                today.getFullYear() - 1
                            );
                        } else if (today - nextDate > 180 * dayMs) {
                            nextDate.setFullYear(
                                today.getFullYear() + 1
                            );
                        }

                        // 이미 지난 날짜라면 다음 격주 연재일 계산
                        while (nextDate < today) {
                            nextDate.setDate(nextDate.getDate() + 14);
                        }

                        return [0, nextDate.getTime()];
                    }
                }
            }

            // 3. 날짜 없는 자동휴재 → 장기휴재 순서 유지
            return [
                isWorkOnAutoBreak(work) ? 1 : 2,
                Infinity
            ];
        };

        displayWorks.sort((a, b) => {
            const [rankA, dateA] = getBreakSortInfo(a);
            const [rankB, dateB] = getBreakSortInfo(b);

            if (rankA !== rankB) return rankA - rankB;

            // 날짜가 있는 작품끼리는 빠른 날짜부터
            if (rankA === 0) return dateA - dateB;

            // 그 외에는 기존 작품 순서 유지
            return 0;
        });


    } else if (viewDay !== '전체') {

        // 저장 순서는 그대로 두고 화면 표시 순서만 변경
        displayWorks.sort((a, b) => {

            // 일반 요일 탭에서는 휴재 작품을 화면 뒤쪽으로
            if (regularDays.includes(viewDay)) {
                const aBreak = isWorkOnBreakForViewedDay(a, viewDay);
                const bBreak = isWorkOnBreakForViewedDay(b, viewDay);

                if (aBreak !== bBreak) {
                    return aBreak ? 1 : -1;
                }

                // 휴재 작품끼리는 저장된 상대적 순서 유지
                if (aBreak && bBreak) {
                    return 0;
                }
            }

            // 기존 10일·격주 연재일 우선 표시 유지
            const isVipA =
                (a.isToday10Day || a.isTodayBiweekly) &&
                a.status !== '휴재';

            const isVipB =
                (b.isToday10Day || b.isTodayBiweekly) &&
                b.status !== '휴재';

            if (isVipA && !isVipB) return -1;
            if (!isVipA && isVipB) return 1;

            // 다른 요일에서 복귀한 작품만 우선 표시
            // 원래 요일로 복귀한 작품은 기존 자리 유지

            const todayStr = formatDate(getWebtoonDate());

            const returnA = a.isReturningToday &&
                a.breakDate > todayStr;

            const returnB = b.isReturningToday &&
                b.breakDate > todayStr;


            if (returnA && !returnB) return -1;
            if (!returnA && returnB) return 1;

            if (returnA && returnB) {
                return new Date(a.breakDate) - new Date(b.breakDate);
            }

            // 특별 연재·복귀 미리보기 우선순위 다음으로
            // 플랫폼 정렬 방식 적용
            return compareWorkTitlesByMode(a, b, platform, viewDay);
        });
    }


    // 🌟 [3단계: 빈 화면 처리] 만약 오늘 볼 작품이 0개라면? 안내 문구 띄우기!
    if (displayWorks.length === 0) {
        listEl.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; text-align: center; width: 100%; padding: 30px 0;">
            <p style="margin: 0; margin-top:5px; font-size: 11px; font-weight: bold; color: #555;">오늘은 연재 작품이 없어요!</p>
            <p style="margin: 5px 0 0 0; font-size: 11px; color: #aaa;">여유롭게 정주행은 어떠신가요?</p>
        </div>
        `;
        return;
    }

    // 실제 연재주기 또는 복귀일 뱃지가 있는 경우에만
    // 뱃지가 없는 다른 작품에 매주연재를 보충
    const hasOriginalBadgeInList = displayWorks.some(work =>
        (work.status === '휴재' && !!work.breakDate) ||
        (work.cycle && work.cycle.trim() !== '')
    );

    // 🌟 [4단계: 카드 그리기] 이미 필터링과 정렬이 끝났으니, 여기선 그냥 그리기만 하면 됩니다!
    displayWorks.forEach((work, index) => {
        // 🚨 주의: 이 아래에는 if (isHidingFinished) 로 시작하는 숨김 코드가 일절 없어야 합니다! 🚨
        const hasImg = work.img && work.img !== "";
        let statusBadge = "";
        const hasReturnedForView = hasWorkReturnedForViewedDay(work, viewDay);
        let isBreak = isWorkOnBreakForViewedDay(work, viewDay);

        // 🌟 1. 상태 뱃지 (휴재/완결) - 날짜 중복 제거하고 깔끔하게 텍스트만!
        if (work.status === '휴재' && !hasReturnedForView) {
            // 🌟 [최종 방어] breakDate가 아예 없거나(구버전 데이터), 빈 문자열이면 무조건 '장기 휴재'!
            const isLongBreak = !work.breakDate || work.breakDate.trim() === "";
            const label = isLongBreak ? '[장기휴재]' : '[휴재]';
            statusBadge = `<span style="background: #e67e22; color: #fff; padding: 3px 6px; border-radius: 4px; font-size: 12px; font-weight: 500;">${label}</span>`;
        } else if (work.status === '완결') {
            statusBadge = `<span style="background: #7f8c8d; color: #fff; padding: 3px 6px; border-radius: 4px; font-size: 12px; font-weight: 500;">[완결]</span>`;
        } else if (isBreak) {
            statusBadge = `<span style="background: #e67e22; color: #fff; padding: 3px 6px; border-radius: 4px; font-size: 12px; font-weight: 500;">[자동휴재]</span>`;
        }


        // 🌟 메인 화면: 이모티콘 완전 삭제 & 무조건 한 줄 방어!
        let cycleTag = '';

        // 🌟 [신규] 복귀 일정이 있는 휴재작은 주기 대신 '복귀일'을 띄워줍니다!
        if (work.status === '휴재' && work.breakDate) {
            let breakStr = `${work.breakDate.substring(5).replace('-', '/')} 복귀`;
            cycleTag = `
                <div style="width: 100%; overflow-x: auto; white-space: nowrap; padding-bottom: 2px; scrollbar-width: none; margin-bottom: 4px;">
                    <span style="background: rgba(230, 126, 34, 0.1); color: #d35400; padding: 4px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; display: inline-block; border: 1px solid rgba(230, 126, 34, 0.3);">
                        ${breakStr}
                    </span>
                </div>`;
        }

        // 휴재가 아니면 기존 연재 주기 로직 그대로 유지!
        else if (work.cycle && work.cycle.trim() !== '') {

            const parts = work.cycle.split('+')
                .map(p => formatBiweeklyBadgeText(p.trim()));


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
                            shortStr = match[1];
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

        // 기존 뱃지가 없는 작품에만 기본 연재 뱃지 추가
        if (!cycleTag) {
            const weeklyNames = {
                '월요일': '월요',
                '화요일': '화요',
                '수요일': '수요',
                '목요일': '목요',
                '금요일': '금요',
                '토요일': '토요',
                '일요일': '일요'
            };

            const dayName = weeklyNames[work.origDay];
            let defaultBadge = '';

            if (dayName) {
                if (viewDay === '휴재' || viewDay === '완결') {
                    defaultBadge = `${dayName}연재`;
                } else if (
                    regularDays.includes(viewDay) &&
                    hasOriginalBadgeInList
                ) {
                    defaultBadge = '매주연재';
                }
            }

            if (defaultBadge) {
                cycleTag = `
                    <div style="width: 100%; overflow-x: auto; white-space: nowrap; padding-bottom: 2px; scrollbar-width: none; margin-bottom: 4px;">
                        <span style="background: rgba(255, 244, 212, 0.95); color: #dd8a5b; padding: 4px 3px; border-radius: 4px; font-size: 11px; font-weight: normal; display: inline-block;">
                            ${defaultBadge}
                        </span>
                    </div>`;
            }
        }

        // 3. 시간 뱃지 (제일 밑에 쌓임!)
        const timeBadge = work.time ? `<span style="background: #f9f9f9; color: #333; padding: 4px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">${work.time}</span>` : '';

        const card = document.createElement('div'); card.className = `webtoon-card-link ${platform}-card`;

        // 🌟 오늘이 10일 연재일이거나 OR 격주 연재일인 경우 하이라이트 테두리!

        if (
            work.status === '연재중' &&
            !isWorkOnBreak(work) &&
            (
                work.isToday10Day ||
                work.isTodayBiweekly ||
                (
                    viewDay === '10일 연재' &&
                    isDateMatch(work.cycle, todayObj)
                )
            )
        ) {

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

        let isStrike = (
            (work.status !== '연재중' && !hasReturnedForView) ||
            isBreak
        );
        let unit = 'C';
        if (platform === 'ridi') unit = '캐시';
        else if (platform === 'mrblue') unit = '머니';

        const hasUrl = work.url && work.url.trim() !== "";
        const imgOnClick = hasUrl ? `onclick="window.open('${work.url}', '_blank')"` : "";
        const cursorStyle = hasUrl ? "cursor: pointer;" : "";



        card.innerHTML = `
    <div class="card-thumbnail lazy-bg" ${imgOnClick} data-bg="${work.img || ''}" style="${cursorStyle}; position: relative;">
        
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
        // 이전에 로딩된 이미지는 즉시 복원
        const thumbnail = card.querySelector('.card-thumbnail');
        const loadedBackground = loadedThumbs.get(work.img);

        if (thumbnail && loadedBackground) {
            thumbnail.style.backgroundImage = loadedBackground;
            thumbnail.classList.remove('lazy-bg');
        }

        listEl.appendChild(card);
    });

    checkScrollArrows();
    applyLazyLoading();
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

    // 전체 카드 재생성 없이 데이터만 저장
    saveData(true);

    // 클릭한 카드의 진도 표시만 업데이트
    const progressBadge =
        document.getElementById(`prog-${plt}-${day}-${idx}`);

    if (progressBadge) {
        progressBadge.textContent = newProg;
    }

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

    // 연재 주기에 따른 자동휴재 정렬 유지
    forceSortBreaks();

    // 전체 화면을 다시 그리지 않고 데이터만 저장
    saveData(true);

    // 변경된 플랫폼의 작품 목록만 갱신
    renderList(plt);

    // 주차 변화에 따른 필요 코인 등 갱신
    refreshBalance();
}


// 현재 탭의 작품 수와 필요 코인 계산

// 특정 날짜가 격주 작품의 연재일인지 확인
function isBiweeklyReleaseOnViewedDate(work, date) {
    const match = (work.cycle || '').match(
        /격주 연재\s*\((\d{1,2})\/(\d{1,2})\)/
    );

    return !!match &&
        Number(match[1]) === date.getMonth() + 1 &&
        Number(match[2]) === date.getDate();
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
            lT = lezhinWorks.filter(w => !isWorkOnBreak(w) && isDateMatch(w.cycle, todayObj, 'lezhin')).reduce((s, i) => s + (parseInt(i.coin) || 0), 0);
            bT = bomtoonWorks.filter(w => !isWorkOnBreak(w) && isDateMatch(w.cycle, todayObj, 'bomtoon')).reduce((s, i) => s + (parseInt(i.coin) || 0), 0);
            rT = ridiWorks.filter(w => !isWorkOnBreak(w) && isDateMatch(w.cycle, todayObj, 'ridi')).reduce((s, i) => s + (parseInt(i.coin) || 0), 0);
            mT = mrblueWorks.filter(w => !isWorkOnBreak(w) && isDateMatch(w.cycle, todayObj, 'mrblue')).reduce((s, i) => s + (parseInt(i.coin) || 0), 0);
        }

        else {

            lT = lezhinWorks.filter(w => !isWorkOnBreakForViewedDay(w, viewDay)).reduce((s, i) => s + (parseInt(i.coin) || 0), 0);
            bT = bomtoonWorks.filter(w => !isWorkOnBreakForViewedDay(w, viewDay)).reduce((s, i) => s + (parseInt(i.coin) || 0), 0);
            rT = ridiWorks.filter(w => !isWorkOnBreakForViewedDay(w, viewDay)).reduce((s, i) => s + (parseInt(i.coin) || 0), 0);
            mT = mrblueWorks.filter(w => !isWorkOnBreakForViewedDay(w, viewDay)).reduce((s, i) => s + (parseInt(i.coin) || 0), 0);

        }

        // 요일 탭에 해당하는 10일·격주 작품 금액만 추가
        if (days.includes(viewDay)) {
            const targetDate = getTargetDateForViewDay(viewDay);

            const specialExtra = plt => {
                const seenIds = new Set(
                    (state[plt][viewDay] || [])
                        .map(w => w.id)
                        .filter(Boolean)
                );

                let extra = 0;

                const addIfDue = (work, scheduled) => {
                    const effectiveWork = hasWorkReturnedForViewedDay(work, viewDay)
                        ? { ...work, status: '연재중' }
                        : work;

                    if (!scheduled ||
                        isWorkOnBreakOnDate(effectiveWork, targetDate)) return;

                    // 동일 작품 중복 합산 방지
                    if (work.id && seenIds.has(work.id)) return;
                    if (work.id) seenIds.add(work.id);

                    extra += parseInt(work.coin, 10) || 0;
                };

                (state[plt]['10일 연재'] || []).forEach(work => {
                    addIfDue(
                        work,
                        isDateMatch(work.cycle, targetDate, plt)
                    );
                });

                (state[plt]['격주 연재'] || []).forEach(work => {
                    addIfDue(
                        work,
                        isBiweeklyReleaseOnViewedDate(work, targetDate)
                    );
                });

                return extra;
            };

            lT += specialExtra('lezhin');
            bT += specialExtra('bomtoon');
            rT += specialExtra('ridi');
            mT += specialExtra('mrblue');


            // 다른 요일에 등록됐지만 선택한 날짜에 복귀하는 작품도 합산
            const returningExtra = plt => {
                const targetDateStr = formatDate(targetDate);

                // 이미 현재 요일 탭에 표시될 작품 제목 기록
                const seenTitles = new Set(
                    (state[plt][viewDay] || []).map(w => w.title)
                );

                // 10일·격주 작품과 중복 합산 방지
                (state[plt]['10일 연재'] || []).forEach(w => {
                    if (isDateMatch(w.cycle, targetDate, plt)) {
                        seenTitles.add(w.title);
                    }
                });

                (state[plt]['격주 연재'] || []).forEach(w => {
                    if (isBiweeklyReleaseOnViewedDate(w, targetDate)) {
                        seenTitles.add(w.title);
                    }
                });

                let extra = 0;

                Object.entries(state[plt]).forEach(([dayKey, works]) => {
                    if (
                        dayKey === viewDay ||
                        dayKey === '10일 연재' ||
                        dayKey === '격주 연재'
                    ) return;

                    works.forEach(work => {
                        if (
                            work.status !== '휴재' ||
                            work.breakDate !== targetDateStr ||
                            seenTitles.has(work.title)
                        ) return;

                        seenTitles.add(work.title);

                        // 복귀일이라도 정기휴재일이면 코인 합산 제외
                        if (!isWorkOnBreakForViewedDay(work, viewDay)) {
                            extra += parseInt(work.coin, 10) || 0;
                        }
                    });
                });

                return extra;
            };

            lT += returningExtra('lezhin');
            bT += returningExtra('bomtoon');
            rT += returningExtra('ridi');
            mT += returningExtra('mrblue');

        }
    }

    else {
        const checkMatch = (w) => (viewDay === '격주 연재') ? (w.cycle && w.cycle.includes('격주 연재')) : (w.status === viewDay);

        Object.keys(state.lezhin).forEach(d => { (state.lezhin[d] || []).forEach(w => { if (w.status === viewDay) lCount++; }); });
        Object.keys(state.bomtoon).forEach(d => { (state.bomtoon[d] || []).forEach(w => { if (w.status === viewDay) bCount++; }); });
        Object.keys(state.ridi).forEach(d => { (state.ridi[d] || []).forEach(w => { if (w.status === viewDay) rCount++; }); });
        Object.keys(state.mrblue).forEach(d => { (state.mrblue[d] || []).forEach(w => { if (w.status === viewDay) mCount++; }); });

        // 격주 탭: 작품 수와 오늘 연재 금액 계산
        if (viewDay === '격주 연재') {
            const biweeklySummary = plt => {
                const seenIds = new Set();
                let count = 0;
                let total = 0;

                Object.values(state[plt]).forEach(list => {
                    list.forEach(work => {
                        if (!(work.cycle || '').includes('격주 연재')) {
                            return;
                        }

                        if (work.id && seenIds.has(work.id)) return;
                        if (work.id) seenIds.add(work.id);

                        count++;

                        if (
                            !isWorkOnBreakOnDate(work, todayObj) &&
                            isBiweeklyReleaseOnViewedDate(work, todayObj)
                        ) {
                            total += parseInt(work.coin, 10) || 0;
                        }
                    });
                });

                return { count, total };
            };

            const lBi = biweeklySummary('lezhin');
            const bBi = biweeklySummary('bomtoon');
            const rBi = biweeklySummary('ridi');
            const mBi = biweeklySummary('mrblue');

            lCount = lBi.count; bCount = bBi.count;
            rCount = rBi.count; mCount = mBi.count;

            lT = lBi.total; bT = bBi.total;
            rT = rBi.total; mT = mBi.total;
        }
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

// =========================================
// 모보 10일 연재 자동완성
// 입력 중: 회색 추천 표시
// 입력 종료: 추천 날짜 확정
// =========================================


// 1. 입력한 글자로 시작하는 연재일 추천
function moboGetTenDaySuggestion(value) {
    const raw = String(value ?? '').trim();

    if (!raw) return null;

    // 시작일 1~10일
    for (let start = 1; start <= 11; start++) {
        const completed =
            `${start}/${start + 10}/${start + 20}`;

        // 실제 입력한 부분은 그대로 유지
        if (
            completed.startsWith(raw) &&
            completed !== raw
        ) {
            return completed;
        }
    }

    return null;
}


// 2. 입력 중 회색 추천값 표시
// 10일 연재 실시간 슬래시 + 회색 자동완성
function moboUpdateTenDaySuggestion(input, event) {
    const original = input.value;

    const atEnd =
        input.selectionStart === original.length &&
        input.selectionEnd === original.length;

    const deleting =
        event?.inputType?.startsWith('delete') ?? false;

    // 입력 중에는 슬래시를 실시간 자동 삽입
    // 삭제 중이나 중간 글자 수정 중에는 강제로 변경하지 않음
    if (atEnd && !deleting) {
        let digits = original.replace(/\D/g, '');

        const firstLength =
            /^(10|11)/.test(digits) ? 2 : 1;

        digits = digits.slice(0, firstLength + 4);

        let formatted = digits.slice(0, firstLength);

        // 1은 10의 시작일 수도 있으므로 잠시 대기
        // 2~9는 즉시 슬래시 삽입
        // 10은 두 번째 숫자가 입력되면 슬래시 삽입
        const addFirstSlash =
            (firstLength === 2 && digits.length >= 2) ||
            (
                firstLength === 1 &&
                (
                    digits.length > 1 ||
                    /^[2-9]$/.test(digits) ||
                    original.includes('/')
                )
            );

        if (addFirstSlash) {
            formatted += '/';
        }

        if (digits.length > firstLength) {
            const middle = digits.slice(
                firstLength,
                firstLength + 2
            );

            formatted += middle;

            if (middle.length === 2) {
                formatted += '/';
            }

            formatted += digits.slice(firstLength + 2);
        }

        if (formatted !== original) {
            input.value = formatted;
            input.setSelectionRange(
                formatted.length,
                formatted.length
            );
        }
    }

    // 아직 입력하지 않은 부분만 회색으로 추천
    const ghost =
        document.getElementById('mobo-ten-day-ghost');

    const typed =
        document.getElementById('mobo-ten-day-typed');

    const suffix =
        document.getElementById('mobo-ten-day-suffix');

    if (!ghost || !typed || !suffix) return;

    const suggestion =
        moboGetTenDaySuggestion(input.value);

    if (
        !suggestion ||
        document.activeElement !== input ||
        input.selectionStart !== input.value.length
    ) {
        ghost.style.display = 'none';
        return;
    }

    typed.textContent = input.value;

    suffix.textContent =
        suggestion.slice(input.value.length);

    const style = getComputedStyle(input);

    ghost.style.font = style.font;
    ghost.style.letterSpacing = style.letterSpacing;
    ghost.style.lineHeight = style.lineHeight;

    ghost.style.display = 'block';
}


// 3. 입력창을 벗어나면 자동완성 확정
function moboCompleteTenDayDates(input) {
    if (!input) return;

    const raw = input.value.trim();

    const suggestion =
        moboGetTenDaySuggestion(raw);

    if (suggestion) {

        // 3 → 3/13/23
        // 10 → 10/20/30
        // 3/13 → 3/13/23
        input.value = suggestion;

    } else if (/^\d{5,6}$/.test(raw)) {

        // 숫자만 모두 직접 입력한 경우
        // 31323 → 3/13/23
        // 102030 → 10/20/30

        const firstLength =
            /^(10|11)/.test(raw) ? 2 : 1;

        if (raw.length === firstLength + 4) {
            input.value = [
                raw.slice(0, firstLength),
                raw.slice(
                    firstLength,
                    firstLength + 2
                ),
                raw.slice(firstLength + 2)
            ].join('/');
        }
    }

    // 추천 표시 제거
    const ghost =
        document.getElementById('mobo-ten-day-ghost');

    if (ghost) {
        ghost.style.display = 'none';
    }
}

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


    // 마지막 연재 요일이나 주기를 해제했을 때 휴재 상태 검사
    if (changedEl) {
        const statusSelect = document.getElementById('input-status');

        const hasDay = Array.from(dayChecks).some(chk => chk.checked);
        const hasBiweekly = typeSelect?.value === '격주 연재';

        if (
            statusSelect?.value === '휴재' &&
            !hasDay &&
            !hasBiweekly
        ) {
            // 연재 정보가 없다면 휴재 상태를 유지하지 않음
            statusSelect.value = '연재중';

            // 이전 복귀 날짜 초기화
            const breakDate = document.getElementById('break-return-date');
            if (breakDate) breakDate.value = '';

            clearActiveBreakBtns();
            toggleBreakSettingRow(statusSelect);

            alert(
                '연재 요일 또는 연재주기를 최소 하나 선택해야 휴재 상태를 유지할 수 있어요.'
            );
        }
    }


    // 2. [입력창 노출 관리]
    // 10일 연재 칸 보이기/숨기기
    const tenDayWrap =
        document.getElementById('mobo-ten-day-wrap');

    if (chk10 && tenDayWrap) {
        tenDayWrap.style.display =
            chk10.checked ? 'block' : 'none';
    }

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
    updateBreakReturnDateMin();

    if (document.getElementById('input-status')?.value === '휴재') {
        toggleBreakSettingRow(
            document.getElementById('input-status')
        );
    }

    updateBiweeklyBreakSummary();

    toggleBreakSettingRow(document.getElementById('input-status'));
}

function removeSelectedImage() { tempImg = ""; document.getElementById('image-input').value = ""; document.getElementById('image-status-text').textContent = "사진이 삭제되었습니다."; document.getElementById('image-status-text').style.color = "#e60012"; document.getElementById('remove-img-btn').style.display = 'none'; }

// 작품 추가·수정: 구매 화수 입력 팝업
let addDeductSaving = false;

function handleAddDeductChange(checkbox) {
    if (!checkbox.checked) return;

    const titleInput = document.getElementById('input-title');
    const coinInput = document.getElementById('input-coin');

    const title = titleInput.value.trim();
    const price = Number(coinInput.value.trim());

    const selectedDays =
        document.querySelectorAll('input[name="day-chk"]:checked').length;

    const cycleType =
        document.getElementById('input-cycle-type').value;

    // 필수 입력 확인
    if (!title) {
        alert('먼저 작품 제목을 입력해 주세요.');
        checkbox.checked = false;
        titleInput.focus();
        return;
    }

    if (!Number.isSafeInteger(price) || price <= 0) {
        alert('1화당 코인·캐시·머니를 1 이상의 정수로 입력해 주세요.');
        checkbox.checked = false;
        coinInput.focus();
        return;
    }

    if (!selectedDays && cycleType !== '격주 연재') {
        alert('먼저 연재 요일을 선택해 주세요.');
        checkbox.checked = false;
        return;
    }

    // 입력창 초기화 후 팝업 열기
    document.getElementById('add-deduct-buy-count').value = '';

    updateAddDeductModalPreview();

    document.getElementById('add-deduct-modal').style.display = 'flex';
}


// 구매 화수 변경 시 예상 잔액 계산
function updateAddDeductModalPreview() {
    const input = document.getElementById('add-deduct-buy-count');
    const totalEl = document.getElementById('add-deduct-total');
    const warningEl = document.getElementById('add-deduct-warning');
    const applyBtn = document.getElementById('add-deduct-apply');

    const countRaw = input.value.trim();
    const count = Number(countRaw);

    const price = Number(document.getElementById('input-coin').value);
    const cost = count * price;

    const valid =
        /^\d+$/.test(countRaw) &&
        Number.isSafeInteger(count) &&
        count > 0 &&
        Number.isSafeInteger(price) &&
        price > 0 &&
        Number.isSafeInteger(cost);

    const unit =
        currentPlatform === 'ridi' ? '캐시' :
            currentPlatform === 'mrblue' ? '머니' : 'C';

    totalEl.textContent = valid
        ? `총 차감 금액: ${formatNum(cost)} ${unit}`
        : '';

    totalEl.style.display = valid ? 'block' : 'none';

    warningEl.textContent = '';
    warningEl.style.display = 'none';

    applyBtn.disabled = !valid || addDeductSaving;

    if (!valid) return;

    // 기존 예상 잔액 계산 함수 재사용
    const preview = getDeductionPreview(currentPlatform, cost);

    if (preview && preview.isInsufficient) {
        warningEl.textContent =
            `ⓘ 차감 후 예상 잔액: ${formatNum(preview.expectedWallet)} ${unit}`;

        warningEl.style.display = 'block';
    }
}


// 취소 시 체크 해제, 저장 및 차감 없음
function cancelAddDeductModal() {
    if (addDeductSaving) return;

    document.getElementById('add-deduct-modal').style.display = 'none';
    document.getElementById('add-deduct-chk').checked = false;
}


// 적용하기 = 작품 저장 + 지갑 차감
async function applyAddDeductAndSave() {
    if (addDeductSaving) return;

    const raw =
        document.getElementById('add-deduct-buy-count').value.trim();

    const buyCount = Number(raw);
    const price = Number(document.getElementById('input-coin').value);
    const cost = buyCount * price;

    if (!/^\d+$/.test(raw) ||
        !Number.isSafeInteger(buyCount) ||
        buyCount <= 0 ||
        !Number.isSafeInteger(price) ||
        price <= 0 ||
        !Number.isSafeInteger(cost)) {

        alert('구매 화수를 1 이상의 정수로 입력해 주세요.');
        return;
    }

    // 중복 클릭 및 중복 차감 방지
    addDeductSaving = true;

    const btn = document.getElementById('add-deduct-apply');
    btn.disabled = true;

    try {
        const saved = await saveWorkFinal(buyCount);

        // 작품 저장까지 성공했을 때만 팝업 닫기
        if (saved === true) {
            document.getElementById('add-deduct-modal').style.display = 'none';
        }
    } catch (err) {
        console.error('작품 저장 및 차감 실패:', err);
        alert('저장 중 오류가 발생했어요. 다시 확인해 주세요.');
    } finally {
        addDeductSaving = false;
        btn.disabled = false;
    }
}

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

    // 🌟 [추가] 저장된 복귀일을 달력에 다시 불러오고, 휴재면 달력창 띄워주기!
    const breakDateInput = document.getElementById('break-return-date');
    if (breakDateInput) breakDateInput.value = work.breakDate || "";

    // 상태에 맞춰 연재주기창/달력창 스위치 찰칵!
    if (typeof toggleBreakSettingRow === "function") {
        toggleBreakSettingRow(document.getElementById('input-status'));
    }

    // 🚨 [장기 휴재 파란 테두리 미리 켜두기 로직]
    if (typeof clearActiveBreakBtns === "function") clearActiveBreakBtns();
    const longBreakBtn = document.querySelector('button[onclick*="clearBreakDate"]');

    if (work.status === '휴재' && (!work.breakDate || work.breakDate.trim() === "")) {
        if (longBreakBtn) longBreakBtn.classList.add('active-btn', 'active-btn-long-break');
    } else {
        if (longBreakBtn) longBreakBtn.classList.remove('active-btn', 'active-btn-long-break');
    }

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

    updateBiweeklyBreakSummary();

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

    updateBiweeklyBreakSummary();

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

    if (document.getElementById('break-return-date')) document.getElementById('break-return-date').value = '';

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

    // 새 작품 추가 시 상태값 초기화
    const statusSelect = document.getElementById('input-status');
    statusSelect.value = (viewDay === '휴재' || viewDay === '완결')
        ? viewDay
        : '연재중';

    // 이전 작품의 휴재 설정 화면이 남지 않도록 즉시 동기화
    toggleBreakSettingRow(statusSelect);

    // 이전에 눌렀던 휴재 버튼의 선택 표시도 초기화
    clearActiveBreakBtns();
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



function getMinimumBreakReturnDate() {
    if (document.getElementById('input-status')?.value !== '휴재') {
        return '';
    }

    const today = getWebtoonDate();
    today.setHours(0, 0, 0, 0);

    // 10일 연재: 다음 실제 연재일
    if (document.getElementById('chk-10day')?.checked) {
        const next = getNextTenDayBreakDate(today, true);
        return next ? formatDate(next) : '';
    }

    // 격주 연재: 다음 14일 주기의 연재일
    if (document.getElementById('input-cycle-type')?.value === '격주 연재') {
        const next = getBiweeklyBreakStartDate();
        return next ? formatDate(next) : '';
    }

    const weekdays = [
        '월요일', '화요일', '수요일', '목요일',
        '금요일', '토요일', '일요일'
    ];

    const selectedDays = Array.from(
        document.querySelectorAll('input[name="day-chk"]:checked')
    )
        .map(el => el.value)
        .filter(day => weekdays.includes(day));

    let minimumDate = '';

    selectedDays.forEach(day => {
        const nextDate = getTargetDateForViewDay(day);

        if (formatDate(nextDate) < formatDate(today)) {
            nextDate.setDate(nextDate.getDate() + 7);
        }

        const nextStr = formatDate(nextDate);

        // 복수 요일은 가장 빠른 연재 예정일 사용
        if (!minimumDate || nextStr < minimumDate) {
            minimumDate = nextStr;
        }
    });

    return minimumDate;
}


// 달력에서 선택 가능한 최소 날짜 갱신
function updateBreakReturnDateMin() {
    const input = document.getElementById('break-return-date');
    if (!input) return;

    input.min = getMinimumBreakReturnDate();
}


// 10일·격주 연재의 실제 연재일인지 검사
function isScheduledBreakReturnDate(dateStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;

    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);

    if (formatDate(date) !== dateStr) return false;

    // 10일 연재: 매월 지정한 날짜만 선택
    if (document.getElementById('chk-10day')?.checked) {
        const raw =
            document.getElementById('input-10day-dates')?.value.trim()
            || '';

        const match = raw.match(
            /^\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*$/
        );

        if (!match) return false;

        const releaseDays = match.slice(1).map(Number);

        if (releaseDays.some(n => n < 1 || n > 31)) {
            return false;
        }

        const lastDay = new Date(year, month, 0).getDate();

        // 30일 또는 31일이 없는 달은 말일로 변경
        return releaseDays.some(n =>
            Math.min(n, lastDay) === day
        );
    }

    // 격주 연재: 다음 실제 연재일로부터 14일 간격
    if (
        document.getElementById('input-cycle-type')?.value
        === '격주 연재'
    ) {
        const anchor = getBiweeklyBreakStartDate();
        if (!anchor) return false;

        const utcDay = d => Date.UTC(
            d.getFullYear(),
            d.getMonth(),
            d.getDate()
        );

        const difference = utcDay(date) - utcDay(anchor);

        return difference >= 0 &&
            difference % (14 * 86400000) === 0;
    }

    // 일반 요일 작품은 기존 날짜 선택 방식 유지
    return true;
}


// 날짜를 직접 입력하거나 요일을 변경해도 저장 전 검사

function validateBreakReturnDate(fromPicker = false) {
    const status = document.getElementById('input-status')?.value;
    if (status !== '휴재') return true;

    const input = document.getElementById('break-return-date');

    const checkedCount = document.querySelectorAll(
        'input[name="day-chk"]:checked'
    ).length;

    const isBiweekly =
        document.getElementById('input-cycle-type')?.value
        === '격주 연재';

    const reject = message => {
        alert(message);

        // 경고창에서 확인을 누른 후 잘못된 날짜 삭제
        if (input) {
            input.value = '';
            input.min = getMinimumBreakReturnDate();
        }

        input?.focus();
        return false;
    };

    if (checkedCount === 0 && !isBiweekly) {
        return reject('연재 요일을 1개 이상 선택해 주세요.');
    }

    // 미정은 장기휴재로 허용
    if (!input?.value) return true;

    const minimumDate = getMinimumBreakReturnDate();

    if (!minimumDate) {
        return reject(
            '연재주기 또는 기준 연재일을 먼저 확인해 주세요.'
        );
    }

    if (input.value < minimumDate) {
        return reject(
            `복귀 날짜가 너무 빨라요!\n` +
            `${minimumDate} 이후 날짜로 설정해 주세요.`
        );
    }

    if (!isScheduledBreakReturnDate(input.value)) {
        return reject(
            '선택한 날짜가 실제 연재주기와 맞지 않아요!\n' +
            '연재 예정일을 다시 선택해 주세요.'
        );
    }

    return true;
}

// 작품 1화당 가격: 0~100,000 정수만 허용
function moboLimitWorkPrice(input) {
    const value = input.value;

    const isValid =
        /^\d{0,6}$/.test(value) &&
        (value === '' || Number(value) <= 100000);

    if (isValid) {
        input.dataset.lastValidWorkPrice = value;
    } else {
        const previous =
            input.dataset.lastValidWorkPrice ?? '';

        input.value =
            /^\d{0,6}$/.test(previous) &&
                (previous === '' || Number(previous) <= 100000)
                ? previous
                : '';
    }
}

// 작품 추가·수정 시 연재 일정 입력값 검증
function moboValidateScheduleForm() {
    const tenDayChecked =
        document.getElementById('chk-10day')?.checked === true;

    // 1. 10일 연재 날짜 검사
    if (tenDayChecked) {
        const input =
            document.getElementById('input-10day-dates');

        const raw = input.value.trim();

        const match = raw.match(
            /^\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*$/
        );

        const days = match
            ? match.slice(1).map(Number)
            : null;

        if (
            !days ||
            days.some(day => day < 1 || day > 31) ||
            new Set(days).size !== 3 ||
            days[0] >= days[1] ||
            days[1] >= days[2]
        ) {
            alert(
                '10일 연재 날짜를 확인해 주세요.\n' +
                '예: 10/20/30\n' +
                '1~31 사이의 서로 다른 날짜 3개를 순서대로 입력해 주세요.'
            );

            input.focus();
            return false;
        }
    }

    // 2. 연재 주기 및 주차 검사
    const cycleType =
        document.getElementById('input-cycle-type').value;

    const weekInput =
        document.getElementById('input-cycle-week');

    const raw = weekInput.value.trim();

    if (!cycleType) return true;

    // 격주 연재는 기준 날짜 필수
    if (cycleType === '격주 연재') {
        const match = raw.match(
            /^(\d{4})-(\d{2})-(\d{2})$/
        );

        let valid = false;

        if (match) {
            const year = Number(match[1]);
            const month = Number(match[2]);
            const day = Number(match[3]);

            const date = new Date(
                year,
                month - 1,
                day
            );

            valid = formatDate(date) === raw;
        }

        if (!valid) {
            alert(
                '격주 연재의 기준 날짜를 선택해 주세요.'
            );

            weekInput.focus();
            return false;
        }

        return true;
    }

    // 매월 특정 주 휴재: 1~5주차만 허용
    if (
        cycleType === '매월 특정 주 휴재' ||
        cycleType === '매월 특정주 휴재'
    ) {
        if (!/^[1-5]$/.test(raw)) {
            alert(
                '매월 휴재 주차는 1~5 사이로 입력해 주세요.'
            );

            weekInput.focus();
            return false;
        }

        return true;
    }

    // 3연 1휴, 5연 1휴 등의 주차 검사
    const cycleMatch =
        cycleType.match(/^(\d+)연\s+(\d+)휴$/);

    if (cycleMatch) {
        const maxWeek =
            Number(cycleMatch[1]) +
            Number(cycleMatch[2]);

        const week = Number(raw);

        if (
            !/^\d+$/.test(raw) ||
            !Number.isSafeInteger(week) ||
            week < 1 ||
            week > maxWeek
        ) {
            alert(
                `${cycleType}의 주차는 ` +
                `1~${maxWeek} 사이의 정수로 입력해 주세요.`
            );

            weekInput.focus();
            return false;
        }
    }

    return true;
}

async function saveWorkFinal(buyCount = null) {
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

        // 일괄 등록 전에 요일별 기존 작품 수 보관
        const previousLengths = Object.fromEntries(
            dayList.map(day => [
                day,
                state[currentPlatform][day].length
            ])
        );

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

                    if (day === '10일 연재') {
                        defaultCycle = "10일 연재";
                    } else if (day === '격주 연재') {
                        defaultCycle = "격주 연재";
                    }

                    const workData = {
                        id: workId, title: title, url: "", cycle: defaultCycle,
                        coin: defaultCoin, progress: "1화", status: targetStatus,
                        img: "", time: "", lastDeductDate: "",
                        registeredOn: formatDate(getWebtoonDate())
                    };
                    state[currentPlatform][day].push({ ...workData });
                    addedCount++;
                });
            }
        });

        if (addedCount === 0) return alert("추가할 작품 제목을 하나 이상 적어주세요!");

        // 저장 실패 시 이번에 추가한 작품만 취소
        if (saveData() !== true) {
            dayList.forEach(day => {
                state[currentPlatform][day].length =
                    previousLengths[day];
            });

            return false;
        }

        autoUpdatePastBiweeklyDates();
        renderAll();

        // 🌟 [핵심] 단일 추가나 복제를 했을 때도 똑같이 시간을 되돌려줍니다!
        const nowStrSingle = formatDate(getWebtoonDate());
        if (localStorage.getItem('lastCheckDate') > nowStrSingle) {
            localStorage.setItem('lastCheckDate', nowStrSingle);
        }
        localStorage.removeItem('lastPartialDeductDate');

        trackClick('batch_add_works_tags', { 'platform': currentPlatform, 'count': addedCount });

        // 🌟 alert 지우고 토스트로 변경!
        showToast(`총 ${addedCount}개의 작품 추가 완료!`);

        closeAddModal();
        return;
    }

    // 연재 일정 입력값을 먼저 검증
    if (!moboValidateScheduleForm()) return false;

    // 복귀일이 연재 예정일보다 빠르면 저장하지 않음
    if (!validateBreakReturnDate()) return false;

    // 차감 체크 상태에서 일반 저장 버튼을 눌러도
    // 구매 화수 팝업을 먼저 열도록 처리
    const requestedDeduction = document.getElementById('add-deduct-chk');

    if (requestedDeduction && requestedDeduction.checked && buyCount === null) {
        handleAddDeductChange(requestedDeduction);
        return false;
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

        const input =
            document.getElementById('input-10day-dates');

        // 저장 직전 자동완성 확정
        moboCompleteTenDayDates(input);

        const tenDayDates = input.value.trim();

        // 날짜가 있으면 실제 연재일 저장
        // 날짜가 없으면 임시 상태로 저장
        if (tenDayDates) {
            cycleParts.push(
                `10일 연재 (${tenDayDates})`
            );
        } else {
            cycleParts.push("10일 연재");
        }
    }

    const cycleStr = cycleParts.join(" + ");
    const coinRaw =
        document.getElementById('input-coin').value.trim();

    // 문자·음수·소수·지수 표기·범위 초과 차단
    if (
        coinRaw !== '' &&
        (
            !/^\d+$/.test(coinRaw) ||
            !Number.isSafeInteger(Number(coinRaw)) ||
            Number(coinRaw) > 100000
        )
    ) {
        alert('1화당 가격은 0~100,000 사이의 정수로 입력해 주세요.');
        return false;
    }

    // 기존 빈칸 = 0 정책 유지
    const coin = coinRaw === '' ? 0 : Number(coinRaw);
    const progress = document.getElementById('input-progress').value || "1화";
    const time = document.getElementById('input-time').value.trim();
    const targetStatus = document.getElementById('input-status').value;
    const breakReturnDate = document.getElementById('break-return-date') ? document.getElementById('break-return-date').value : "";

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
    let registeredOn = formatDate(getWebtoonDate());

    if (editMode) {
        const originalWork = state[currentPlatform][actionOrigDay][actionIdx];
        if (originalWork.id) {
            workId = originalWork.id;
        } else {
            isOldGhost = true;
            workId = Date.now().toString();
        }
        oldDeductDate = originalWork.lastDeductDate || "";
        registeredOn = originalWork.registeredOn || "";
    } else {
        workId = Date.now().toString() + "_" + Math.random().toString(36).substr(2, 5);
    }

    let finalDeductDate = oldDeductDate;
    let deductionAmount = 0;

    const deductChk = document.getElementById('add-deduct-chk');

    if (deductChk && deductChk.checked) {

        // 잘못된 구매 화수와 금액 방지
        if (!Number.isSafeInteger(coin) ||
            coin <= 0 ||
            !Number.isSafeInteger(buyCount) ||
            buyCount <= 0 ||
            !Number.isSafeInteger(buyCount * coin)) {

            alert('구매 화수와 1화당 금액을 확인해 주세요.');
            return false;
        }

        // 아직 지갑에서 차감하지 않고 금액만 준비
        deductionAmount = buyCount * coin;

        // 정상 저장될 작품의 마지막 정산일
        finalDeductDate = formatDate(getWebtoonDate());
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
        lastDeductDate: finalDeductDate,
        registeredOn: registeredOn,
        breakDate: breakReturnDate
    };
    // 🚨 여기까지 추가 완료 🚨

    // 저장 실패 시 복구할 기존 작품 목록 보관
    const previousPlatformState = JSON.parse(
        JSON.stringify(state[currentPlatform])
    );

    if (editMode) {
        Object.keys(state[currentPlatform]).forEach(day => {
            const arr = state[currentPlatform][day];
            let targetIdx = -1;

            if (!isOldGhost) targetIdx = arr.findIndex(w => w.id === workId);
            else {
                // ID가 없는 구버전 작품은 제목만으로
                // 다른 요일의 작품을 동일 작품으로 판단하지 않음
                if (day === actionOrigDay) {
                    targetIdx = actionIdx;
                }
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

    if (saveData() !== true) {
        // 저장에 실패했다면 작품 목록을 이전 상태로 복구
        state[currentPlatform] = previousPlatformState;
        return false;
    }

    // 작품 저장 후 실제 지갑 차감
    if (deductionAmount > 0) {
        let deductionSucceeded = false;

        try {
            deductionSucceeded =
                executeDeduction(
                    currentPlatform,
                    title,
                    deductionAmount
                ) === true;

        } catch (error) {
            console.error('작품 등록 후 차감 오류:', error);
        }

        // 차감에 실패했다면 작품 추가·수정도 취소
        if (!deductionSucceeded) {

            // 기존 작품 목록 복구
            state[currentPlatform] = previousPlatformState;

            // 먼저 저장됐던 작품 변경도 되돌리기
            let restored = false;

            try {
                restored = saveData(true) === true;
            } catch (error) {
                console.error('작품 데이터 복구 저장 실패:', error);
            }

            if (!restored) {
                alert(
                    '차감 실패 후 작품 데이터 복구 저장에도 실패했습니다.\n' +
                    '앱을 계속 사용하지 말고 기존 백업을 확인해 주세요.'
                );

                return false;
            }

            renderAll();
            return false;
        }
    }

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

    // 🌟 [추가] 창이 닫히면서 부드럽게 성공 알림 띄우기!
    if (editMode) {
        showToast(`[${title}] 수정 완료!`);
    } else {
        showToast(`[${title}] 추가 완료!`);
    }

    return true;
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


// 지갑 입력값이 안전한 정수인지 확인
function moboIsWalletInteger(value, allowNegative = false) {
    const raw = String(value ?? '');

    const validFormat = allowNegative
        ? /^-?\d+$/.test(raw)
        : /^\d+$/.test(raw);

    return validFormat &&
        Number.isSafeInteger(Number(raw));
}


// 지갑 입력 중 문자·소수·범위 초과값 차단
function moboLimitWalletInteger(input, allowNegative = false) {
    const value = input.value;

    // 빈칸과 음수 입력 중인 '-'는 임시 허용
    const isTemporary =
        value === '' ||
        (allowNegative && value === '-');

    if (
        isTemporary ||
        moboIsWalletInteger(value, allowNegative)
    ) {
        input.dataset.lastValidWallet = value;
    } else {
        input.value =
            input.dataset.lastValidWallet ?? '';
    }
}
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

    // 이전 입력값을 다른 플랫폼에 잘못 적용하지 않도록 초기화
    const balanceInput =
        document.getElementById('coin-input-val');

    const expireInput =
        document.getElementById('expire-coin-val');

    balanceInput.dataset.lastValidWallet =
        moboIsWalletInteger(balanceInput.value, true)
            ? balanceInput.value
            : '';

    expireInput.dataset.lastValidWallet =
        moboIsWalletInteger(expireInput.value)
            ? expireInput.value
            : '';
    // 창 띄우기
    document.getElementById('coin-update-modal').style.display = 'flex';
}

// 2. 모달창을 닫는 함수
function closeCoinModal() {
    document.getElementById('coin-update-modal').style.display = 'none';
}

// 3. 모달창에서 [저장하기] 버튼을 눌렀을 때 실행되는 함수
function saveCoinUpdate() {
    const balanceRaw =
        document.getElementById('coin-input-val').value.trim();

    const expireRaw =
        document.getElementById('expire-coin-val').value.trim();

    const expDate =
        document.getElementById('expire-date-val').value;

    // 일반 지갑: 음수 허용, 정수만 저장
    if (
        balanceRaw !== '' &&
        !moboIsWalletInteger(balanceRaw, true)
    ) {
        alert('지갑 잔액은 정수로 입력해 주세요.');
        return;
    }

    // 소멸 예정 재화: 1 이상의 정수만 저장
    if (
        expireRaw !== '' &&
        (
            !moboIsWalletInteger(expireRaw) ||
            Number(expireRaw) < 1
        )
    ) {
        alert('소멸 예정 수량은 1 이상의 정수로 입력해 주세요.');
        return;
    }

    // 기존 빈 잔액 = 0 정책 유지
    const newBal =
        balanceRaw === '' ? '0' : String(Number(balanceRaw));

    const expAmt = expireRaw;

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
    // 최신 데이터 저장에 성공했을 때만 백업 진행
    if (saveData() !== true) return;

    const d = localStorage.getItem(STORAGE_KEY);
    if (!d) return alert("백업할 데이터가 없습니다!");

    // 누적 계산 목록도 백업 파일에 포함
    const cumulativeItems = moboCumRead();

    if (cumulativeItems === null) {
        alert(
            '누적 계산 목록을 읽을 수 없어 백업을 중단했어요.\n' +
            '기존 목록은 변경되지 않았습니다.'
        );
        return;
    }

    // 기존 모보 백업 데이터는 그대로 유지
    const backupData = JSON.parse(d);

    backupData.moboCumulativeCalc = {
        version: 1,
        items: cumulativeItems
    };

    const date = getKSTDate();
    const dateString = date.getFullYear() + String(date.getMonth() + 1).padStart(2, '0') + String(date.getDate()).padStart(2, '0');
    const fileName = `mobo_backup_${dateString}.txt`;
    const blob = new Blob([JSON.stringify(backupData)], { type: 'text/plain' });
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

// 구버전 백업 호환성 보완
// 원본 백업 객체는 변경하지 않음
function prepareLegacyMoboBackup(source) {
    const result = { data: source, changes: [] };

    if (
        !source ||
        typeof source !== 'object' ||
        Array.isArray(source) ||
        !source.state ||
        typeof source.state !== 'object' ||
        Array.isArray(source.state)
    ) {
        return result;
    }

    // 복사본에서만 누락된 구조 보완
    const data = JSON.parse(JSON.stringify(source));
    result.data = data;

    const platforms = ['lezhin', 'bomtoon', 'ridi', 'mrblue'];

    const weekdays = [
        '월요일', '화요일', '수요일', '목요일',
        '금요일', '토요일', '일요일'
    ];

    const allDays = [
        ...weekdays, '10일 연재', '격주 연재'
    ];

    const has = (obj, key) =>
        Object.prototype.hasOwnProperty.call(obj, key);

    // 1. 누락된 요일 목록 보완
    for (const plt of platforms) {
        const folders = data.state[plt];

        if (
            !folders ||
            typeof folders !== 'object' ||
            Array.isArray(folders)
        ) continue;

        // 플랫폼의 모든 목록이 사라졌다면 자동 보완하지 않음
        if (!allDays.some(day => has(folders, day))) continue;

        for (const day of weekdays) {
            if (!has(folders, day)) {
                folders[day] = [];

                result.changes.push(
                    `${plt}: ${day} 빈 목록 추가`
                );
            }
        }
    }

    // 2. 월말정산의 누락된 플랫폼 항목 보완
    const history = data.monthlyHistory;

    if (
        history &&
        typeof history === 'object' &&
        !Array.isArray(history)
    ) {
        for (const [month, records] of Object.entries(history)) {
            if (
                !records ||
                typeof records !== 'object' ||
                Array.isArray(records)
            ) continue;

            // 모든 플랫폼 기록이 사라진 달은 자동 보완하지 않음
            if (!platforms.some(plt => has(records, plt))) continue;

            for (const plt of platforms) {
                if (!has(records, plt)) {
                    records[plt] = {};

                    result.changes.push(
                        `${month}: ${plt} 빈 정산 기록 추가`
                    );
                }
            }
        }
    }

    return result;
}

// 백업 파일 구조 검사: 기존 데이터를 덮어쓰기 전에 확인
function isValidMoboBackup(data) {
    const platforms = ['lezhin', 'bomtoon', 'ridi', 'mrblue'];

    if (!data || typeof data !== 'object' || Array.isArray(data) ||
        !data.state || typeof data.state !== 'object' ||
        Array.isArray(data.state)) {
        return false;
    }

    // 플랫폼별 작품 목록의 구조 확인
    for (const plt of platforms) {
        const folders = data.state[plt];

        if (!folders || typeof folders !== 'object' ||
            Array.isArray(folders)) return false;

        // 월요일~일요일 필수 목록 검사
        const requiredDays = [
            '월요일', '화요일', '수요일', '목요일',
            '금요일', '토요일', '일요일'
        ];

        if (!requiredDays.every(day => Array.isArray(folders[day]))) {
            return false;
        }

        for (const works of Object.values(folders)) {
            if (!Array.isArray(works)) return false;

            if (!works.every(w =>
                w && typeof w === 'object' &&
                !Array.isArray(w) &&
                typeof w.title === 'string' &&
                (w.img == null || typeof w.img === 'string')
            )) return false;
        }
    }

    // 4개 플랫폼 지갑 정보가 정상인지 확인
    for (const key of ['lWallet', 'bWallet', 'rWallet', 'mWallet']) {
        const value = data[key];

        if (!/^-?\d+$/.test(String(value)) ||
            !Number.isSafeInteger(Number(value))) {
            return false;
        }
    }

    if (data.platformOrder != null &&
        (!Array.isArray(data.platformOrder) ||
            !data.platformOrder.every(plt =>
                platforms.includes(plt)))) {
        return false;
    }

    // 월말정산 기록의 내부 구조 검사
    if (data.monthlyHistory != null) {
        if (
            typeof data.monthlyHistory !== 'object' ||
            Array.isArray(data.monthlyHistory)
        ) {
            return false;
        }

        for (const [month, monthData] of Object.entries(data.monthlyHistory)) {
            // YYYY-MM 형식 및 월별 기록 확인
            if (
                !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
                !monthData ||
                typeof monthData !== 'object' ||
                Array.isArray(monthData)
            ) {
                return false;
            }

            // 각 플랫폼의 작품별 정산 기록 확인
            for (const plt of platforms) {
                const records = monthData[plt];

                if (
                    !records ||
                    typeof records !== 'object' ||
                    Array.isArray(records)
                ) {
                    return false;
                }

                for (const amount of Object.values(records)) {
                    if (
                        typeof amount !== 'number' ||
                        !Number.isSafeInteger(amount) ||
                        amount < 0
                    ) {
                        return false;
                    }
                }
            }
        }
    }

    return true;
}

// 누적 계산 백업 구조 검사
function isValidMoboCumBackup(data) {
    if (
        !data ||
        typeof data !== 'object' ||
        Array.isArray(data) ||
        data.version !== 1 ||
        !Array.isArray(data.items) ||
        data.items.length > 200
    ) {
        return false;
    }

    const ids = new Set();

    for (const item of data.items) {
        const calc = item && moboCumCalculate(item);

        if (
            !item ||
            typeof item.id !== 'string' ||
            !item.id ||
            item.id.length > 100 ||
            ids.has(item.id) ||

            typeof item.title !== 'string' ||
            !item.title.trim() ||
            item.title.length > 80 ||

            !Object.prototype.hasOwnProperty.call(
                MOBO_CUM_PLATFORMS,
                item.platform
            ) ||

            typeof item.included !== 'boolean' ||
            !calc ||
            item.amount !== calc.amount ||
            item.cashback !== calc.cashback
        ) {
            return false;
        }

        ids.add(item.id);
    }

    return true;
}


// 🚨 브라우저가 절대 무시할 수 없는 가장 튼튼하고 똑똑한 복구+이사 함수! (철벽 방어 유지, 구글 연동만 제거)
function handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = async function (e) {
        // 복원에 실패했을 때 되돌릴 기존 저장값
        const protectedKeys = [
            STORAGE_KEY,
            MOBO_CUM_KEY,
            'currentWeekStr',
            'lastCheckDate',
            'lastPartialDeductDate',
            'lezhinBonusExpire',
            MOBO_LAST_OPENED_KEY,
            MOBO_RETURN_PENDING_KEY
        ];

        const savedBeforeImport = new Map(
            protectedKeys.map(key => [
                key, localStorage.getItem(key)
            ])
        );

        let saveStarted = false;
        let preventReload = null;

        try {
            const content = e.target.result;

            // 구버전 데이터의 누락 항목을 복사본에서 보완
            const prepared = prepareLegacyMoboBackup(JSON.parse(content));
            const parsedData = prepared.data;

            // 보완한 데이터도 기존의 엄격한 검증을 통과해야 함
            if (!isValidMoboBackup(parsedData)) {
                throw new Error('모보 백업 구조가 올바르지 않습니다.');
            }

            // 구버전 백업에는 누적 계산 정보가 없을 수 있음
            const hasCumulativeBackup =
                Object.prototype.hasOwnProperty.call(
                    parsedData,
                    'moboCumulativeCalc'
                );

            // 누적 계산 정보가 있다면 저장 전에 검증
            if (
                hasCumulativeBackup &&
                !isValidMoboCumBackup(parsedData.moboCumulativeCalc)
            ) {
                throw new Error(
                    '누적 계산 백업 구조가 올바르지 않습니다.'
                );
            }

            // 누락 항목이 있었다면 사용자에게 먼저 확인
            if (prepared.changes.length > 0) {
                const changesText = prepared.changes.join('\n');

                const approved = confirm(
                    '오래된 백업의 누락 항목을 보완했습니다.\n\n' +
                    changesText +
                    '\n\n없는 항목만 빈 목록으로 채웠습니다. ' +
                    '원래 그곳에 작품이 있었는지는 확인할 수 없습니다.\n' +
                    '원본 백업 파일은 변경되지 않습니다. 복원을 계속할까요?'
                );

                if (!approved) return;
            }

            if (parsedData && parsedData.state) {


                // 🌟 [핵심 방어 2] 새로고침/뒤로가기 방어막 켜기!
                preventReload = (e) => {
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

                // 사진 처리가 끝난 뒤에만 최종 저장 시작
                saveStarted = true;
                localStorage.setItem(STORAGE_KEY, JSON.stringify(parsedData));

                // 새 백업에 누적 계산 목록이 있을 때만 복원
                if (hasCumulativeBackup) {
                    localStorage.setItem(
                        MOBO_CUM_KEY,
                        JSON.stringify(parsedData.moboCumulativeCalc)
                    );
                }

                // 백업에 담긴 주차·정산·복귀 기준도 함께 복원
                const restoreOptional = (key, value) => {
                    if (value === undefined || value === null || value === '') {
                        localStorage.removeItem(key);
                    } else {
                        localStorage.setItem(key, String(value));
                    }
                };

                const today = getWebtoonDate();
                const monday = new Date(today);
                monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
                const isSavedDate = value =>
                    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

                // 구버전 백업에는 해당 값이 없으므로 현재 기준으로 시작
                restoreOptional('currentWeekStr',
                    isSavedDate(parsedData.currentWeekStr)
                        ? parsedData.currentWeekStr
                        : formatDate(monday));

                restoreOptional('lastCheckDate',
                    isSavedDate(parsedData.lastCheckDate)
                        ? parsedData.lastCheckDate
                        : formatDate(today));

                restoreOptional('lastPartialDeductDate',
                    isSavedDate(parsedData.lastPartialDeductDate)
                        ? parsedData.lastPartialDeductDate
                        : null);

                restoreOptional('lezhinBonusExpire',
                    Number(parsedData.lezhinBonusExpire) > 0
                        ? parsedData.lezhinBonusExpire
                        : null);

                restoreOptional(MOBO_LAST_OPENED_KEY,
                    Number(parsedData.moboReturnLastOpenedAt) > 0
                        ? parsedData.moboReturnLastOpenedAt
                        : Date.now());

                restoreOptional(MOBO_RETURN_PENDING_KEY,
                    Number(parsedData.moboReturnPendingDays) >= 14
                        ? parsedData.moboReturnPendingDays
                        : null);

                // 🚨 [유일하게 지워진 부분!] 파이어베이스 클라우드 업로드 함수 삭제 완료! 🚨

                // 🌟 [방어 해제] 무사히 끝났으니 새로고침 방어막 끄기
                window.removeEventListener('beforeunload', preventReload);

                alert(`복원 성공! 화면을 새로고침합니다.`);
                location.reload();
            } else {
                throw new Error("잘못된 형식입니다.");
            }

        } catch (err) {
            console.error('복원 실패:', err);

            let rollbackFailed = false;

            // 저장 도중 실패했다면 기존 값으로 되돌리기
            if (saveStarted) {
                for (const [key, original] of savedBeforeImport) {
                    try {
                        if (original === null) {
                            localStorage.removeItem(key);
                        } else {
                            localStorage.setItem(key, original);
                        }
                    } catch (rollbackErr) {
                        rollbackFailed = true;
                        console.error(
                            '원본 복구 실패:', key, rollbackErr
                        );
                    }
                }
            }

            alert(rollbackFailed
                ? '복원에 실패했고 일부 원본 복구도 실패했습니다. 앱을 새로고침하기 전에 별도 백업 파일을 보관해 주세요.'
                : '백업 복원에 실패했습니다. 기존 모보 데이터는 변경하지 않았거나 원래 상태로 복구했습니다.');

        } finally {
            // 성공·실패 여부와 관계없이 새로고침 방어 해제
            if (preventReload) {
                window.removeEventListener(
                    'beforeunload', preventReload
                );
            }

            document.getElementById(
                'backup-file-input'
            ).value = '';
        }
    };

    // 백업 파일을 읽지 못했을 때 오류 안내
    reader.onerror = function () {
        console.error('모보 백업 파일 읽기 실패:', reader.error);

        alert('백업 파일을 읽지 못했습니다. 파일을 다시 선택해 주세요.');

        const input = document.getElementById('backup-file-input');
        if (input) {
            input.value = '';
        }
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

        let work = state[actionPlt][actionOrigDay][actionIdx];

        // 잘못 중복된 작품 ID가 있다면 삭제 중단
        if (work.id) {
            const conflictingId = Object.values(state[actionPlt]).some(list => {
                if (!Array.isArray(list)) return false;

                const sameIdWorks = list.filter(
                    item => item.id === work.id
                );

                return sameIdWorks.length > 1 ||
                    sameIdWorks.some(item => item.title !== work.title);
            });

            if (conflictingId) {
                alert(
                    '작품 ID가 충돌해 삭제를 중단했습니다.\n' +
                    '백업을 보관하고 작품 정보를 확인해 주세요.'
                );
                return;
            }
        }

        // 실행 취소를 위해 삭제할 작품의 위치와 데이터만 보관
        const deletedEntries = [];

        Object.keys(state[actionPlt]).forEach(day => {
            state[actionPlt][day].forEach((candidate, index) => {
                const removed = work.id
                    ? candidate.id === work.id
                    : day === actionOrigDay && index === actionIdx;

                if (removed) {
                    deletedEntries.push({
                        day,
                        index,
                        work: JSON.parse(JSON.stringify(candidate))
                    });
                }
            });
        });

        stateBackupForUndo = {
            type: 'single-delete',
            platform: actionPlt,
            entries: deletedEntries
        };

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
        showUndoToast("작품이 삭제되었습니다.");
    }
}

// 3. 토스트 팝업 띄우기 함수 (이게 꼭 있어야 팝업이 나타나요!)
function showUndoToast(msg) {
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

    if (typeof stateBackupForUndo === 'string') {
        // 기존 일괄 작업의 실행 취소 방식 유지
        state = JSON.parse(stateBackupForUndo);

    } else if (
        stateBackupForUndo.type === 'single-delete' ||
        stateBackupForUndo.type === 'bulk-delete'
    ) {
        // 일반 작품 삭제는 삭제된 작품만 복구
        const { platform, entries } = stateBackupForUndo;

        entries.forEach(({ day, index, work }) => {
            const list = state[platform]?.[day];

            if (!Array.isArray(list)) return;

            // 이미 동일 ID의 작품이 있다면 중복 복구 방지
            if (
                work.id &&
                list.some(item => item.id === work.id)
            ) {
                return;
            }

            // 다른 작품의 수정 내용은 유지하면서 원래 위치에 복구
            list.splice(
                Math.min(index, list.length),
                0,
                work
            );
        });

    } else if (stateBackupForUndo.type === 'bulk-resume') {
        // 장기휴재 일괄 전환 시 변경한 상태만 복구
        const { platform, entries } = stateBackupForUndo;

        entries.forEach(({
            work,
            status,
            breakDate,
            hadBreakDate
        }) => {
            // 작품이 여전히 목록에 존재하는지 확인
            const stillExists = Object.values(
                state[platform] || {}
            ).some(list =>
                Array.isArray(list) && list.includes(work)
            );

            if (!stillExists) return;

            // 전환 이후 상태가 다시 변경되었다면 덮어쓰지 않음
            if (
                work.status !== '연재중' ||
                work.breakDate !== ''
            ) {
                return;
            }

            // 기존 휴재 상태 복구
            work.status = status;

            if (hadBreakDate) {
                work.breakDate = breakDate;
            } else {
                delete work.breakDate;
            }
        });

    } else {
        return;
    }

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

// 🔍 검색 기능 (진짜 형광펜 감성! 글씨 벌어짐 완벽 해결!)
function performSearch() {
    const query = document.getElementById('search-input').value.trim().toLowerCase();
    const listEl = document.getElementById('search-result-list');
    listEl.innerHTML = '';

    if (!query) {
        listEl.innerHTML = '<p style="text-align:center; color:#888; font-size:14px;">검색어를 입력해주세요.</p>';
        return;
    }

    let foundWorks = [];
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

        let originalTitle = item.work.title;
        let lowerTitle = originalTitle.toLowerCase();
        let queryLen = query.length;
        let highlightedTitle = "";

        let startIndex = 0;
        let index = lowerTitle.indexOf(query);

        while (index !== -1) {
            highlightedTitle += originalTitle.substring(startIndex, index);
            let matchText = originalTitle.substring(index, index + queryLen);

            // 🌟 [수정 완료] 글씨 색깔 건드리지 않음! 패딩/마진 완전 삭제! 
            // 뒤에 '66'을 붙여서 투명도 40%의 진짜 예쁜 형광펜 배경색만 입혀줍니다!
            highlightedTitle += `<span style="background-color: ${color}66;">${matchText}</span>`;

            startIndex = index + queryLen;
            index = lowerTitle.indexOf(query, startIndex);
        }
        highlightedTitle += originalTitle.substring(startIndex);

        const div = document.createElement('div');
        div.style.borderBottom = '1px solid #eee';
        div.style.padding = '10px 0';
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';

        div.innerHTML = `
            <div style="flex:1; overflow:hidden;">
                <div style="font-size:11px; color:#888;">[${pltName}] ${item.day}</div>
                <div style="font-size:14px; font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${highlightedTitle}</div>
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

// 지갑 아래 페이지 점 클릭으로 이동
document.addEventListener('DOMContentLoaded', () => {
    const slider = document.getElementById('wallet-slider');
    if (!slider) return;

    const pages = slider.querySelectorAll('.snap-page');
    const dots = document.querySelectorAll('.wallet-pagination .dot');

    dots.forEach((dot, i) => {
        if (!pages[i]) return;

        // 기존 span을 키보드로도 조작 가능하게 설정
        dot.setAttribute('role', 'button');
        dot.tabIndex = 0;
        dot.setAttribute(
            'aria-label',
            i === 0 ? '첫 번째 지갑 보기' : '두 번째 지갑 보기'
        );

        const moveWallet = () => {
            slider.scrollTo({
                left: pages[i].offsetLeft - pages[0].offsetLeft,
                behavior: 'smooth'
            });
        };

        dot.addEventListener('click', moveWallet);

        dot.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                moveWallet();
            }
        });
    });
});

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
    // 1. 일반 모달창들
    // 계산기 모달은 바깥을 클릭해도 닫히지 않도록 보호
    if (
        event.target.classList.contains('modal-overlay') &&
        event.target.id !== 'calc-modal'
    ) {

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


// 1. 유저가 다른 앱에서 모보로 돌아왔을 때 확인하기!
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {

        // 1순위: 장기 미접속 복귀 여부 먼저 확인
        checkMoboReturnVisit();

        // 2순위: 기존 업데이트 확인
        checkRemoteUpdate();

        // 3순위: 일반 정산 확인
        // 30일 이상 복귀자는 askForDeduction 내부에서 제외
        if (typeof askForDeduction === 'function') {
            askForDeduction();
        }

        // 4순위: 기존 연재 일정 및 화면 갱신
        autoUpdatePastBiweeklyDates();
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
                // 🌟 서랍 모달용 뱃지 로직
                let badgeHtml = '';
                let isBreak = isWorkOnAutoBreak(work);


                const compactTenDayBadge =
                    (work.status === '휴재' || isBreak) &&
                    (work.cycle || '').includes('10일 연재') &&
                    !(work.status === '휴재' && work.breakDate);


                if (work.status === '휴재') {
                    // 🌟 [최종 방어] 기존 유저 데이터까지 모두 포용하는 장기 휴재 로직
                    const isLongBreak = !work.breakDate || work.breakDate.trim() === "";
                    const label = isLongBreak ? '장기 휴재' : '휴재';
                    badgeHtml = `<span class="drawer-badge badge-break">${label}</span>`;
                }
                else if (work.status === '완결') {
                    badgeHtml = `<span class="drawer-badge badge-end">완결</span>`;
                }
                else if (isBreak) {
                    badgeHtml = `<span class="drawer-badge badge-break">자동휴재</span>`;
                }

                // 🌟 서랍 모달: 이모티콘 완전 삭제 & 무조건 한 줄 방어!
                let cycleBadge = '';

                // 🌟 [수정] 서랍에서도 날짜가 있을 때만 보여주고 미정이면 아예 안 달기!
                // 🌟 [신규] 서랍에서도 복귀일 띄우기!
                if (work.status === '휴재' && work.breakDate) {
                    let breakStr = `${work.breakDate.substring(5).replace('-', '/')} 복귀`;
                    const badgeBg = isDark ? '#3d2516' : '#fef0e6';
                    const badgeColor = isDark ? '#e67e22' : '#d35400';
                    cycleBadge = `<span style="font-size: 11px; color: ${badgeColor}; background: ${badgeBg}; padding: 4px 6px; border-radius: 4px; margin-left: 6px; font-weight: bold; white-space: nowrap; display: inline-block; vertical-align: middle; border: 1px solid rgba(230,126,34,0.3);">${breakStr}</span>`;
                }
                else if (work.cycle && work.cycle.trim() !== '') {
                    const badgeBg = isDark ? '#1a233a' : '#e8f0fe';
                    const badgeColor = isDark ? '#8ab4f8' : '#1967d2';
                    const displayCycle = compactTenDayBadge
                        ? work.cycle.replace(
                            /10일\s*연재\s*\(([^)]+)\)/g,
                            '($1)'
                        )
                        : work.cycle;

                    const parts = displayCycle.split('+')
                        .map(p => formatBiweeklyBadgeText(p.trim()));

                    if (parts.length === 1) {
                        // 1개일 때 이모티콘 삭제!
                        cycleBadge = `<span class="drawer-cycle-badge" style="font-size: 12px; color: ${badgeColor}; background: ${badgeBg}; padding: 4px 6px; border-radius: 4px; margin-left: 6px; font-weight: normal; white-space: nowrap; display: inline-block; vertical-align: middle;">${parts[0]}</span>`;
                    } else {
                        const compressedParts = parts.map(p => {
                            let shortStr = p;
                            if (p.includes('10일 연재')) {
                                let match = p.match(/\((.*?)\)/);
                                shortStr = match ? match[1] : '10일';
                            } else if (p.includes('격주 연재')) {
                                let match = p.match(/\((.*?)\)/);
                                if (match) {
                                    shortStr = match[1];
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

                    if (work.origDay === '10일 연재') {
                        shortDay = '10일';
                    }

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

// 순서 편집은 일반 요일 탭에서만 허용
function isReorderableDay(day) {
    return [
        '월요일', '화요일', '수요일', '목요일',
        '금요일', '토요일', '일요일'
    ].includes(day);
}

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

    const hideText = document.getElementById('hide-text');
    // 🌟 [핵심] HTML에 있는 두 번째 하얀 버튼 전체를 정확한 ID로 콕 집어냅니다!
    const hideBtn = document.getElementById('toggle-hide-btn');

    if (hideText) {
        if (isHidingFinished[currentFilterPlt]) {
            hideText.innerText = "휴재 및 완결 작품 꺼내기";
        } else {
            hideText.innerText = "휴재 및 완결 작품 숨기기";
        }
    }

    // 🌟 [무적 숨기기] 탭 이름이 '휴재'나 '완결'일 때는 하얀 버튼 전체를 흔적도 없이 날려버립니다!

    if (hideBtn) {
        const hideToggleUnavailable = [
            '휴재',
            '완결',
            '10일 연재',
            '격주 연재'
        ].includes(viewDay);

        hideBtn.style.display =
            hideToggleUnavailable ? 'none' : '';
    }


    // 완결 탭에서는 순서 편집 대신 작품 정리 버튼 표시

    // 완결 / 휴재 / 10일 연재 / 격주 연재 작품 관리
    const isManageTab = [
        '완결',
        '휴재',
        '10일 연재',
        '격주 연재'
    ].includes(viewDay);

    // 현재 탭에 따라 작품 정리 버튼 표시
    const manageBtn = document.getElementById('finished-cleanup-btn');

    manageBtn.style.display = isManageTab ? '' : 'none';

    // 현재 탭에 맞게 메뉴 이름 변경
    const manageBtnText = manageBtn.querySelector('span');

    if (manageBtnText) {
        manageBtnText.textContent =
            viewDay === '휴재'
                ? '휴재 작품 관리 및 정리'
                : `${viewDay} 작품 정리하기`;
    }

    // 기존 요일별 순서 편집 조건 유지
    document.getElementById('filter-reorder-btn').style.display =
        isReorderableDay(viewDay) ? '' : 'none';

    // 설정 메뉴 열기
    document.getElementById('filter-modal').style.display = 'flex';

}


// ========================================
// 완결 작품 정리하기 - 일괄 선택 및 삭제
// ========================================

let finishedCleanupPlatform = '';
let finishedCleanupTab = '';
let finishedCleanupWorks = [];

// 1. 완결 작품 정리 창 열기

function openFinishedCleanup() {

    const manageTabs = [
        '완결',
        '휴재',
        '10일 연재',
        '격주 연재'
    ];

    if (
        !manageTabs.includes(viewDay) ||
        !state[currentFilterPlt]
    ) return;

    finishedCleanupPlatform = currentFilterPlt;
    finishedCleanupTab = viewDay;
    finishedCleanupWorks = [];


    // 장기휴재만 선택 버튼은 휴재 탭에서만 표시
    const selectLongBtn = document.getElementById(
        'finished-cleanup-select-long'
    );


    if (selectLongBtn) {
        selectLongBtn.style.display =
            finishedCleanupTab === '휴재' ? '' : 'none';

        selectLongBtn.textContent = '장기휴재만 선택';
    }




    // 현재 작품 관리 탭에 맞는 상단 안내 문구
    const cleanupHelp = document.getElementById(
        'finished-cleanup-help'
    );

    if (cleanupHelp) {
        cleanupHelp.textContent =
            finishedCleanupTab === '휴재'
                ? '장기휴재 작품만 연재중으로 전환할 수 있어요.'
                : '삭제할 작품을 선택해 주세요.';
    }



    const seenIds = new Set();


    Object.keys(state[finishedCleanupPlatform]).forEach(day => {
        (state[finishedCleanupPlatform][day] || []).forEach(work => {

            const cycle = String(work.cycle || '');

            const matches =

                // 완결 작품
                (
                    finishedCleanupTab === '완결' &&
                    work.status === '완결'
                ) ||

                // 휴재 작품: 수동휴재 + 자동휴재
                (
                    finishedCleanupTab === '휴재' &&
                    work.status !== '완결' &&
                    isWorkOnBreak(work)
                ) ||

                // 10일 연재 작품
                (
                    finishedCleanupTab === '10일 연재' &&
                    day === '10일 연재'
                ) ||

                // 격주 연재 작품
                (
                    finishedCleanupTab === '격주 연재' &&
                    cycle.includes('격주 연재')
                );

            if (!matches) return;


            // 같은 작품이 여러 요일에 있어도 한 번만 표시
            if (work.id && seenIds.has(work.id)) return;
            if (work.id) seenIds.add(work.id);

            finishedCleanupWorks.push({
                id: work.id || null,
                ref: work,
                title: work.title || '제목 없음'
            });
        });
    });

    // 완결 작품이 없으면 안내 후 종료
    if (finishedCleanupWorks.length === 0) {
        closeFilterMenu();
        alert('관리할 작품이 없어요.');

        finishedCleanupWorks = [];
        finishedCleanupPlatform = '';
        finishedCleanupTab = '';
        return;
    }

    const names = {
        lezhin: '레진',
        bomtoon: '봄툰',
        ridi: '리디',
        mrblue: '미스터블루'
    };


    document.getElementById('finished-cleanup-title').textContent =
        `${names[finishedCleanupPlatform] || finishedCleanupPlatform} ` +
        (
            finishedCleanupTab === '휴재'
                ? '휴재 작품 관리 및 정리'
                : `${finishedCleanupTab} 작품 정리하기`
        );

    const list = document.getElementById('finished-cleanup-list');
    list.replaceChildren();

    if (!finishedCleanupWorks.length) {
        const empty = document.createElement('p');
        empty.textContent = '정리할 완결 작품이 없어요!';
        empty.style.cssText =
            'text-align:center;color:#888;font-size:13px;padding:20px 0;';
        list.appendChild(empty);
    }



    // 휴재 작품 관리: 장기휴재 → 복귀예정 → 자동휴재
    if (finishedCleanupTab === '휴재') {

        const getPriority = (entry) => {
            const work = entry.ref;
            const returnDate = String(work.breakDate || '').trim();

            if (work.status === '휴재') {
                return returnDate ? 1 : 0;
            }

            if (isWorkOnAutoBreak(work)) {
                return 2;
            }

            return 3;
        };


        finishedCleanupWorks.sort((a, b) => {
            const priorityA = getPriority(a);
            const priorityB = getPriority(b);

            // 1. 장기휴재 → 복귀예정 → 자동휴재
            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }

            // 2. 복귀예정 작품은 복귀일이 빠른 순서대로
            if (priorityA === 1) {
                const dateA = String(a.ref.breakDate || '')
                    .trim().replace(/[./]/g, '-');

                const dateB = String(b.ref.breakDate || '')
                    .trim().replace(/[./]/g, '-');

                return dateA.localeCompare(dateB);
            }

            // 3. 나머지 작품은 기존 순서 유지
            return 0;
        });

    }

    // 작품별 체크박스 만들기
    finishedCleanupWorks.forEach((entry, index) => {
        const label = document.createElement('label');

        label.style.cssText =
            'display:flex;align-items:center;gap:10px;' +
            'padding:12px 9px;border-bottom:1px solid rgba(128,128,128,.15);' +
            'cursor:pointer;';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = String(index);
        checkbox.className = 'finished-cleanup-check';
        checkbox.style.cssText =
            'width:18px;height:18px;flex:none;margin:0;' +
            'padding:0;accent-color:#444;';

        checkbox.addEventListener(
            'change',
            updateFinishedCleanupCount
        );



        const name = document.createElement('span');
        name.textContent = entry.title;
        name.style.cssText =
            'font-size:14px;line-height:1.4;overflow-wrap:anywhere;';

        // 작품명과 뱃지를 배치하는 영역
        const info = document.createElement('div');
        info.style.cssText =
            'display:flex;flex-direction:column;' +
            'gap:3px;min-width:0;flex:1;';

        const titleRow = document.createElement('div');
        titleRow.style.cssText =
            'display:flex;align-items:center;flex-wrap:wrap;' +
            'gap:6px;min-width:0;';

        titleRow.appendChild(name);

        // 휴재 탭에서만 뱃지 표시
        if (finishedCleanupTab === '휴재') {

            const work = entry.ref;
            const returnDate = String(work.breakDate || '').trim();

            const badge = document.createElement('span');
            badge.className = 'cleanup-status-badge';

            if (work.status === '휴재' && !returnDate) {
                badge.textContent = '장기휴재';
                badge.classList.add('cleanup-badge-long');

            } else if (work.status === '휴재' && returnDate) {
                badge.textContent = '복귀예정';
                badge.classList.add('cleanup-badge-return');

            } else if (isWorkOnAutoBreak(work)) {
                badge.textContent = '자동휴재';
                badge.classList.add('cleanup-badge-auto');
            }

            if (badge.textContent) {
                titleRow.appendChild(badge);
            }

            info.appendChild(titleRow);

            // 복귀 예정 작품만 날짜 표시
            if (work.status === '휴재' && returnDate) {
                const dateText = document.createElement('small');
                dateText.className = 'cleanup-return-date';
                dateText.textContent = `${returnDate} 복귀`;

                info.appendChild(dateText);
            }

        } else {
            info.appendChild(titleRow);
        }

        label.append(checkbox, info);


        list.appendChild(label);
    });

    const selectAll = document.getElementById('finished-cleanup-all');
    selectAll.checked = false;
    selectAll.disabled = finishedCleanupWorks.length === 0;

    updateFinishedCleanupCount();

    closeFilterMenu();
    document.getElementById('finished-cleanup-modal').style.display = 'flex';
}

// 2. 선택한 작품 개수 표시
function updateFinishedCleanupCount() {
    const checks = Array.from(
        document.querySelectorAll(
            '#finished-cleanup-list .finished-cleanup-check'
        )
    );

    const count = checks.filter(c => c.checked).length;
    const selectAll = document.getElementById('finished-cleanup-all');

    selectAll.checked =
        checks.length > 0 && count === checks.length;

    selectAll.indeterminate =
        count > 0 && count < checks.length;

    document.getElementById('finished-cleanup-count').textContent =
        `${count}개 선택됨`;


    // =====================================
    // 탭별 작품 관리 버튼 설정
    // =====================================

    const deleteBtn = document.getElementById(
        'finished-cleanup-delete'
    );

    const resumeBtn = document.getElementById(
        'finished-cleanup-resume'
    );

    const cancelBtn = document.getElementById(
        'finished-cleanup-cancel'
    );

    const isBreakTab = finishedCleanupTab === '휴재';

    // 휴재 탭: 연재중 전환 / 삭제
    // 나머지 탭: 취소 / 삭제
    if (resumeBtn) {
        resumeBtn.style.display = isBreakTab ? '' : 'none';
    }

    if (cancelBtn) {
        cancelBtn.style.display = isBreakTab ? 'none' : '';
    }

    // 기존 삭제 기능 유지
    deleteBtn.style.display = '';
    deleteBtn.disabled = count === 0;
    deleteBtn.textContent = `선택한 ${count}개 삭제`;
    deleteBtn.style.opacity = count === 0 ? '0.4' : '1';

    // 현재 체크된 작품 확인
    const selected = checks
        .filter(checkbox => checkbox.checked)
        .map(checkbox =>
            finishedCleanupWorks[Number(checkbox.value)]
        )
        .filter(Boolean);

    // 장기휴재 작품만 연재중 전환 허용
    // 같은 작품 ID로 등록된 다른 요일도 검사
    const canResume = isBreakTab &&
        count > 0 &&
        selected.every(entry => {

            let found = false;
            let eligible = true;

            Object.values(
                state[finishedCleanupPlatform] || {}
            ).forEach(works => {

                if (!Array.isArray(works)) return;

                works.forEach(work => {

                    const sameWork = entry.id
                        ? work.id === entry.id
                        : work === entry.ref;

                    if (!sameWork) return;

                    found = true;

                    if (
                        work.status !== '휴재' ||
                        String(work.breakDate || '').trim()
                    ) {
                        eligible = false;
                    }
                });
            });

            return found && eligible;
        });

    if (resumeBtn) {

        // 3-3에서 전환 함수를 추가하면 자동 활성화
        const handlerReady =
            typeof resumeFinishedSelected === 'function';

        const enabled = canResume && handlerReady;

        resumeBtn.disabled = !enabled;

        resumeBtn.textContent =
            `${count}개 연재중 전환`;

        resumeBtn.style.opacity = enabled ? '1' : '0.4';

        resumeBtn.title = !canResume
            ? '복귀일 없는 장기휴재 작품만 전환할 수 있어요.'
            : !handlerReady
                ? '연재중 전환 기능 연결 전이에요.'
                : '';
    }

}


// 휴재 작품 관리: 장기휴재 작품만 일괄 선택

function selectLongBreakCleanupWorks() {
    if (finishedCleanupTab !== '휴재') return;

    const checks = Array.from(
        document.querySelectorAll(
            '#finished-cleanup-list .finished-cleanup-check'
        )
    );

    const longBreakChecks = [];

    // 연재중 전환이 가능한 장기휴재 작품 찾기
    checks.forEach(checkbox => {
        const entry = finishedCleanupWorks[Number(checkbox.value)];
        if (!entry) return;

        let found = false;
        let eligible = true;

        Object.values(
            state[finishedCleanupPlatform] || {}
        ).forEach(works => {
            if (!Array.isArray(works)) return;

            works.forEach(work => {
                const sameWork = entry.id
                    ? work.id === entry.id
                    : work === entry.ref;

                if (!sameWork) return;

                found = true;

                if (
                    work.status !== '휴재' ||
                    String(work.breakDate || '').trim()
                ) {
                    eligible = false;
                }
            });
        });

        if (found && eligible) {
            longBreakChecks.push(checkbox);
        }
    });

    if (longBreakChecks.length === 0) {
        showToast('선택할 수 있는 장기휴재 작품이 없어요.');
        return;
    }

    // 모든 장기휴재 작품이 선택되어 있는지 확인
    const allSelected = longBreakChecks.every(
        checkbox => checkbox.checked
    );

    if (allSelected) {
        // 두 번째 클릭: 장기휴재 선택 해제
        longBreakChecks.forEach(checkbox => {
            checkbox.checked = false;
        });

        showToast('장기휴재 작품 선택을 해제했어요.');

    } else {
        // 첫 번째 클릭: 장기휴재 작품만 선택
        checks.forEach(checkbox => {
            checkbox.checked = longBreakChecks.includes(checkbox);
        });

        showToast(
            `장기휴재 작품 ${longBreakChecks.length}개를 선택했어요.`
        );
    }

    updateFinishedCleanupCount();

    // 버튼 문구도 선택 상태에 맞게 변경
    const btn = document.getElementById(
        'finished-cleanup-select-long'
    );

    if (btn) {
        btn.textContent = allSelected
            ? '장기휴재만 선택'
            : '장기휴재 선택 해제';
    }
}



// 3. 전체 선택 또는 전체 해제
function toggleAllFinishedCleanup(checked) {
    document.querySelectorAll(
        '#finished-cleanup-list .finished-cleanup-check'
    ).forEach(checkbox => {
        checkbox.checked = checked;
    });

    updateFinishedCleanupCount();
}

// 4. 창 닫기
function closeFinishedCleanup() {
    document.getElementById('finished-cleanup-modal').style.display = 'none';

    finishedCleanupWorks = [];
    finishedCleanupPlatform = '';
    finishedCleanupTab = '';
}


// ========================================
// 휴재 작품 관리 - 장기휴재 작품 연재중 전환
// ========================================
function resumeFinishedSelected() {

    // 휴재 탭에서만 실행
    if (finishedCleanupTab !== '휴재') return;

    const plt = finishedCleanupPlatform;

    if (!state[plt]) return;

    // 체크된 작품 가져오기
    const selected = Array.from(
        document.querySelectorAll(
            '#finished-cleanup-list .finished-cleanup-check:checked'
        )
    )
        .map(checkbox =>
            finishedCleanupWorks[Number(checkbox.value)]
        )
        .filter(Boolean);

    if (!selected.length) return;

    const worksToResume = new Set();

    // 선택한 작품과 같은 ID를 가진 요일별 카드 확인
    for (const entry of selected) {

        const copies = [];

        Object.keys(state[plt]).forEach(day => {
            (state[plt][day] || []).forEach(work => {

                const sameWork = entry.id
                    ? work.id === entry.id
                    : work === entry.ref;

                if (sameWork) {
                    copies.push(work);
                }
            });
        });

        // 작품이 없거나 다른 요일에 상태가 다르면 중단
        if (
            copies.length === 0 ||
            copies.some(work =>
                work.status !== '휴재' ||
                String(work.breakDate || '').trim() !== ''
            )
        ) {
            alert(
                `"${entry.title}"은(는) 장기휴재 상태가 아니거나\n` +
                '다른 요일에 등록된 작품의 상태가 달라요.\n\n' +
                '복귀 예정·자동휴재 작품은 전환할 수 없어요.'
            );
            return;
        }

        copies.forEach(work => worksToResume.add(work));
    }

    // 변경 전 최종 확인
    const confirmed = confirm(
        `선택한 ${selected.length}개 작품을 연재중으로 전환할까요?\n\n` +
        selected.map(entry => `• ${entry.title}`).join('\n')
    );

    if (!confirmed) return;

    // 상태가 변경되는 작품만 실행 취소용으로 보관
    const backup = {
        type: 'bulk-resume',
        platform: plt,
        entries: Array.from(worksToResume, work => ({
            work,
            status: work.status,
            breakDate: work.breakDate,
            hadBreakDate: Object.prototype.hasOwnProperty.call(
                work, 'breakDate'
            )
        }))
    };

    // 기존 연재 요일과 연재주기는 유지
    worksToResume.forEach(work => {
        work.status = '연재중';
        work.breakDate = '';
    });

    // 실행 취소 연결
    stateBackupForUndo = backup;

    // 모달 닫기
    closeFinishedCleanup();

    // 변경 사항 저장 및 화면 갱신
    saveData();

    showUndoToast(
        `${selected.length}개 작품을 연재중으로 전환했어요.`
    );
}


// 5. 선택한 완결 작품 삭제
function deleteFinishedSelected() {
    const selected = Array.from(
        document.querySelectorAll(
            '#finished-cleanup-list .finished-cleanup-check'
        )
    )
        .filter(checkbox => checkbox.checked)
        .map(checkbox =>
            finishedCleanupWorks[Number(checkbox.value)]
        )
        .filter(Boolean);

    if (!selected.length || !state[finishedCleanupPlatform]) return;


    // 실수 방지를 위한 첫 번째 삭제 확인
    const confirmed = confirm(
        `선택한 ${selected.length}개 작품을 삭제할까요?\n` +
        '같은 플랫폼의 다른 요일에 등록된 동일 작품도 삭제돼요.\n' +
        '지갑 잔액과 과거 정산 내역은 유지됩니다.'
    );

    if (!confirmed) return;


    // ========================================
    // 자동휴재 / 복귀 예정 작품 삭제 시 추가 확인
    // ========================================

    if (finishedCleanupTab !== '완결') {

        const warningWorks = [];

        selected.forEach(entry => {

            const warningTypes = new Set();

            // 같은 작품이 다른 요일에도 등록되어 있다면
            // 해당 카드들의 상태까지 확인
            Object.values(
                state[finishedCleanupPlatform] || {}
            ).forEach(works => {

                (works || []).forEach(work => {

                    const sameWork = entry.id
                        ? work.id === entry.id
                        : work === entry.ref;

                    if (!sameWork) return;

                    // 복귀일이 정해진 휴재 작품
                    if (
                        work.status === '휴재' &&
                        String(work.breakDate || '').trim()
                    ) {
                        warningTypes.add(
                            `복귀 예정: ${work.breakDate}`
                        );
                    }

                    // 현재 자동휴재 중인 작품
                    else if (
                        work.status !== '휴재' &&
                        work.status !== '완결' &&
                        isWorkOnAutoBreak(work)
                    ) {
                        warningTypes.add('자동휴재 중');
                    }

                });
            });

            if (warningTypes.size > 0) {

                warningWorks.push(
                    `• ${entry.title} (${Array.from(warningTypes).join(', ')})`
                );

            }
        });

        // 보호 대상 작품이 포함된 경우에만 2차 확인
        if (warningWorks.length > 0) {

            const warningMessage =
                '다음 작품은 자동휴재 중이거나 ' +
                '복귀일이 정해져 있어요.\n\n' +
                warningWorks.join('\n') +
                '\n\n이 작품들을 포함해 정말 삭제할까요?';

            if (!confirm(warningMessage)) {
                return;
            }
        }
    }



    // 동일한 작품 ID를 가진 요일별 카드 함께 삭제
    const idsToRemove = new Set(
        selected.filter(entry => entry.id).map(entry => entry.id)
    );

    // ID 없는 구형 데이터도 처리
    const legacyToRemove = new Set(
        selected.filter(entry => !entry.id).map(entry => entry.ref)
    );

    // 삭제되는 작품의 데이터와 원래 위치만 보관
    const backup = {
        type: 'bulk-delete',
        platform: finishedCleanupPlatform,
        entries: Object.entries(
            state[finishedCleanupPlatform]
        ).flatMap(([day, works]) =>
            (Array.isArray(works) ? works : []).flatMap(
                (work, index) => {
                    const shouldRemove =
                        (work.id && idsToRemove.has(work.id)) ||
                        legacyToRemove.has(work);

                    return shouldRemove
                        ? [{
                            day,
                            index,
                            work: JSON.parse(JSON.stringify(work))
                        }]
                        : [];
                }
            )
        )
    };

    let removed = 0;

    Object.keys(state[finishedCleanupPlatform]).forEach(day => {
        state[finishedCleanupPlatform][day] =
            (state[finishedCleanupPlatform][day] || []).filter(work => {

                const shouldRemove =
                    (work.id && idsToRemove.has(work.id)) ||
                    legacyToRemove.has(work);

                if (shouldRemove) removed++;

                return !shouldRemove;
            });
    });

    if (!removed) return;

    // 기존 실행 취소 시스템과 연결
    stateBackupForUndo = backup;

    closeFinishedCleanup();

    // 작품 변경 사항 저장 및 화면 갱신
    saveData();


    showUndoToast(
        `${selected.length}개 작품을 삭제했어요.`
    );

}


// 1. 순서 편집 창 열 때 불 켜기/끄기 자동 판독!
function startReorder() {
    // 일반 요일 탭이 아니면 순서 편집 차단
    if (!isReorderableDay(viewDay)) {
        closeFilterMenu();
        return;
    }
    closeFilterMenu();
    let pltName = '';
    if (currentFilterPlt === 'lezhin') pltName = '레진';
    else if (currentFilterPlt === 'bomtoon') pltName = '봄툰';
    else if (currentFilterPlt === 'ridi') pltName = '리디';
    else if (currentFilterPlt === 'mrblue') pltName = '미블';

    document.getElementById('reorder-title').textContent = `${pltName} (${viewDay}) 순서 편집`;

    refreshReorderSortButtons();

    document.getElementById('reorder-modal').style.display = 'flex';
    renderReorderList();
}

// 3. 순서 편집 모달창 닫기 함수
function closeReorderModal() {
    document.getElementById('reorder-modal').style.display = 'none';
    renderAll(); // 혹시 순서가 바뀌었을지 모르니 닫을 때 메인 화면 새로고침!
}


// 현재 적용 중인 정렬 버튼 표시
function refreshReorderSortButtons() {
    const mode = getEffectiveSortMode(
        currentFilterPlt, viewDay
    );

    document.getElementById('btn-sort-az')
        .classList.toggle('active', mode === 'az');

    document.getElementById('btn-sort-za')
        .classList.toggle('active', mode === 'za');

    document.getElementById('btn-sort-custom')
        .classList.toggle('active', mode === 'manual');
}


function setPlatformSortMode(mode) {
    if (!isReorderableDay(viewDay)) {
        alert('이 탭에선 자동 정렬을 할 수 없어요!');
        return;
    }

    const plt = currentFilterPlt;

    // 이미 같은 정렬 방식이고 요일별 예외도 없다면 변경하지 않음
    const sameMode =
        platformSortModes[plt] === mode &&
        !Object.values(manualDayOverrides[plt] || {})
            .some(value => value === true);

    if (sameMode) return;

    platformSortModes[plt] = mode;
    manualDayOverrides[plt] = {};

    saveData();
    renderReorderList();
    refreshReorderSortButtons();

    const platformName = {
        lezhin: '레진',
        bomtoon: '봄툰',
        ridi: '리디',
        mrblue: '미블'
    }[plt] || '해당 플랫폼';

    const sortName = mode === 'az' ? '가나다순' : '다나가순';

    showToast(
        `${platformName}의 모든 요일에 ${sortName}을 적용했어요.`
    );
}


// 가나다순 버튼
function sortListAZ() {
    setPlatformSortMode('az');
}

// 다나가순 버튼
function sortListZA() {
    setPlatformSortMode('za');
}


function sortListCustom() {
    if (!isReorderableDay(viewDay)) {
        alert('이 탭에선 순서를 편집할 수 없어요!');
        return;
    }

    const plt = currentFilterPlt;

    // 이미 커스텀 모드라면 중복 안내하지 않음
    if (getEffectiveSortMode(plt, viewDay) === 'manual') {
        return;
    }

    manualDayOverrides[plt][viewDay] = true;

    saveData();
    renderReorderList();
    refreshReorderSortButtons();

    const platformName = {
        lezhin: '레진',
        bomtoon: '봄툰',
        ridi: '리디',
        mrblue: '미블'
    }[plt] || '해당 플랫폼';

    showToast(
        `${platformName} ${viewDay}을 커스텀 순서로 변경했어요.`
    );
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

    // 연재 중 작품과 휴재·완결·자동휴재 작품 구분
    const isReorderInactive = work =>
        work.status === '휴재' ||
        work.status === '완결' ||
        isWorkOnBreakForViewedDay(work, viewDay);

    // 실제 저장 순서는 바꾸지 않고 화면에서만 그룹 정렬

    const orderedWorks = [...works].sort((a, b) => {
        // 1순위: 연재 중 → 휴재·완결
        const breakDiff =
            Number(isReorderInactive(a)) -
            Number(isReorderInactive(b));

        if (breakDiff !== 0) return breakDiff;

        // 2순위: 플랫폼에서 선택한 정렬 방식
        return compareWorkTitlesByMode(
            a, b, currentFilterPlt, viewDay
        );
    });



    if (works.length === 0) {
        listEl.innerHTML = '<p style="text-align: center; color: #888; font-size: 14px;">작품이 없습니다!</p>';
        return;
    }

    // 작품들을 하나씩 세로 박스로 만들기
    orderedWorks.forEach((work, idx) => {
        const div = document.createElement('div');
        div.dataset.idx = idx;
        div.dataset.group = isReorderInactive(work)
            ? 'inactive' : 'active';

        // 🌟 JS에서는 인라인 스타일 빼고 깔끔하게 클래스 이름표만 붙여줍니다!
        div.className = 'reorder-list-item';

        // 🌟 [추가] 순서 편집 창에도 상태 뱃지를 달아줍니다!
        let badgeHtml = '';
        let isBreak = isReorderInactive(work);
        if (work.status === '휴재') {
            // 🌟 [최종 방어] 기존 유저 데이터까지 모두 포용하는 장기 휴재 로직
            const isLongBreak = !work.breakDate || work.breakDate.trim() === "";
            const label = isLongBreak ? '장기 휴재' : '휴재';
            badgeHtml = `<span style="font-size: 11px; background: #e67e22; color: #fff; padding: 2px 5px; border-radius: 4px; margin-right: 8px; font-weight: bold;">${label}</span>`;
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

        // 다른 구역으로 드래그할 수 없게 제한
        onMove: function (evt) {
            return evt.related &&
                evt.dragged.dataset.group ===
                evt.related.dataset.group;
        },


        onEnd: function (evt) {
            if (evt.oldIndex === evt.newIndex) return;

            const plt = currentFilterPlt;
            const day = viewDay;
            const arr = state[plt][day];

            // 사용자가 팝업에서 실제로 배치한 순서
            const displayedOrder = Array.from(listEl.children)
                .map(el => orderedWorks[Number(el.dataset.idx)]);

            if (
                displayedOrder.length !== arr.length ||
                displayedOrder.some(work => !work)
            ) {
                renderReorderList();
                return;
            }

            const active = displayedOrder.filter(
                work => !isReorderInactive(work)
            );

            const inactive = displayedOrder.filter(
                work => isReorderInactive(work)
            );

            let ai = 0;
            let ii = 0;

            // 휴재 작품의 원래 슬롯은 보존하면서
            // 두 그룹 내부의 수동 정렬 결과만 저장
            state[plt][day] = arr.map(work =>
                isReorderInactive(work)
                    ? inactive[ii++]
                    : active[ai++]
            );

            // 드래그한 요일만 커스텀으로 전환
            manualDayOverrides[plt][day] = true;

            saveData();
            renderReorderList();
            refreshReorderSortButtons();
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
            alert(`🚨 썸네일 업로드 실패!\n원인: ${data.error.message}\n(현재 업로드가 몰려 속도가 지연되고 있습니다. 잠시 후 다시 시도해 주세요! (30분~3일))`);
            throw new Error(data.error.message);
        }

        return data.data.url;

    } catch (error) {
        console.error("업로드 함수 에러:", error);
        throw error;
    }
}



function updateBiweeklyBreakSummary() {
    const summary = document.getElementById(
        'biweekly-break-summary'
    );
    const summaryText = document.getElementById(
        'biweekly-break-summary-text'
    );
    const breakRow = document.getElementById(
        'break-setting-row'
    );
    const btnBreak1 = document.getElementById('btn-break-1');
    const btnBreak2 = document.getElementById('btn-break-2');

    if (!summary || !summaryText) return;

    const isBreak =
        document.getElementById('input-status')?.value === '휴재';

    const isBiweekly =
        document.getElementById('input-cycle-type')?.value === '격주 연재';

    const showBiweekly = isBreak && isBiweekly;

    // 격주 휴재일 때만 요약줄과 전용 버튼 디자인 표시
    summary.style.display = showBiweekly ? 'flex' : 'none';
    breakRow?.classList.toggle(
        'biweekly-break-mode',
        showBiweekly
    );

    if (!showBiweekly) return;

    const nextDate = getNextBiweeklyReleaseDate();

    if (!nextDate) {
        summaryText.textContent =
            '격주 연재 · 기준일 미설정';

        if (btnBreak1) {
            btnBreak1.innerHTML =
                '<span class="break-btn-label">다음 회차 복귀</span>' +
                '<small class="break-btn-date">날짜 미정</small>';

            btnBreak1.setAttribute(
                'onclick',
                "setBreakBiweeklyReturn('next', this)"
            );
        }

        if (btnBreak2) {
            btnBreak2.innerHTML =
                '<span class="break-btn-label">한 회차 더 쉬기</span>' +
                '<small class="break-btn-date">날짜 미정</small>';

            btnBreak2.setAttribute(
                'onclick',
                "setBreakBiweeklyReturn('skip', this)"
            );
        }

        return;
    }

    // 다음 연재 예정일
    const nextText =
        `${nextDate.getMonth() + 1}/${nextDate.getDate()}`;

    // 한 회차 건너뛴 복귀 예정일
    const skipDate = new Date(nextDate);
    skipDate.setDate(skipDate.getDate() + 14);

    const skipText =
        `${skipDate.getMonth() + 1}/${skipDate.getDate()}`;

    // 요약줄 업데이트
    summaryText.textContent =
        `다음 연재 예정일 · ${nextText} · 14일 간격`;

    // 첫 번째 버튼
    if (btnBreak1) {
        btnBreak1.innerHTML =
            '<span class="break-btn-label">다음 회차 복귀</span>' +
            `<small class="break-btn-date">${nextText}</small>`;

        btnBreak1.setAttribute(
            'onclick',
            "setBreakBiweeklyReturn('next', this)"
        );
    }

    // 두 번째 버튼
    if (btnBreak2) {
        btnBreak2.innerHTML =
            '<span class="break-btn-label">한 회차 더 쉬기</span>' +
            `<small class="break-btn-date">${skipText}</small>`;

        btnBreak2.setAttribute(
            'onclick',
            "setBreakBiweeklyReturn('skip', this)"
        );
    }
}



// 🌟 '연재 중 / 휴재' 상태 바뀔 때 달력 나타나게 하는 함수
function toggleBreakSettingRow(selectElement, fromUser = false) {
    let statusValue = "";
    if (selectElement) {
        statusValue = selectElement.value;
    } else {
        const backupSelect = document.getElementById('input-status'); // 예은님 상태창 ID에 맞게!
        if (backupSelect) statusValue = backupSelect.value;
    }


    // 사용자가 직접 휴재를 선택했을 때만 검사
    if (fromUser && statusValue === '휴재') {
        const hasDay = document.querySelector(
            'input[name="day-chk"]:checked'
        );

        const hasBiweekly =
            document.getElementById('input-cycle-type')?.value
            === '격주 연재';

        if (!hasDay && !hasBiweekly) {
            alert('휴재로 변경하려면 연재 요일을 1개 이상 선택해 주세요.');

            selectElement.value = '연재중';
            statusValue = '연재중';
        }
    }

    const cycleRow = document.getElementById('cycle-row');
    const breakRow = document.getElementById('break-setting-row');

    if (!cycleRow || !breakRow) return;

    // 🔥 [핵심 개선] 현재 작품이 '격주 연재'인지 확인해서 버튼 똑똑하게 변신!
    const cycleSelect = document.getElementById('input-cycle-type');
    const btnBreak1 = document.getElementById('btn-break-1');
    const btnBreak2 = document.getElementById('btn-break-2');

    if (cycleSelect && btnBreak1 && btnBreak2) {
        if (cycleSelect.value === '격주 연재') {
            // 💡 격주 연재면 스케줄 안 꼬이게 2주(1회), 4주(2회)로 변경!
            btnBreak1.innerText = '+2주';
            btnBreak1.setAttribute('onclick', 'setBreakWeeks(2, this)');

            btnBreak2.innerText = '+4주';
            btnBreak2.setAttribute('onclick', 'setBreakWeeks(4, this)'); // 달(Month) 대신 정확히 4주로 더함
        } else if (document.getElementById('chk-10day')?.checked) {
            // 10일 연재: 다음 회차 또는 한 달 뒤
            btnBreak1.innerText = '+1회';
            btnBreak1.setAttribute('onclick', "setBreakTenDay('next', this)");

            btnBreak2.innerText = '+1달';
            btnBreak2.setAttribute('onclick', "setBreakTenDay('month', this)");

        } else {
            // 💡 일반 연재면 원래대로!
            btnBreak1.innerText = '+1주';
            btnBreak1.setAttribute('onclick', 'setBreakWeeks(1, this)');

            btnBreak2.innerText = '+1달';
            btnBreak2.setAttribute('onclick', 'setBreakMonths(1, this)');
        }
    }

    // 휴재일 때만 달력 보이기
    if (statusValue === '휴재') {
        cycleRow.style.display = 'none';
        breakRow.style.display = 'flex';
    } else {
        cycleRow.style.display = 'flex';
        breakRow.style.display = 'none';
    }

    updateBreakReturnDateMin();
    updateBiweeklyBreakSummary();
}


// 🌟 1. 버튼 색상(활성화 상태) 초기화 함수
function clearActiveBreakBtns() {
    document.querySelectorAll('.break-btn').forEach(btn => {
        // 🚨 기존 'active-btn' 뿐만 아니라, 'active-btn-long-break' 파란 테두리도 싹 다 지우라고 추가!
        btn.classList.remove('active-btn', 'active-btn-long-break');
    });
}

// 격주 연재: 다음 연재 예정일을 기준으로 계산
function getBiweeklyBreakStartDate() {
    const raw = document.getElementById('input-cycle-week')?.value || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;

    const [year, month, day] = raw.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (formatDate(date) !== raw) return null;

    const today = getWebtoonDate();
    today.setHours(0, 0, 0, 0);

    // 기존 M/D 저장 형식의 연도 변경 보정
    if (editMode) {
        const original = state[actionPlt]?.[actionOrigDay]?.[actionIdx];
        const saved = original?.cycle?.match(
            /격주 연재\s*\((\d{1,2})\/(\d{1,2})\)/
        );

        if (
            saved &&
            year === today.getFullYear() &&
            month === Number(saved[1]) &&
            day === Number(saved[2]) &&
            date.getTime() - today.getTime() > 180 * 86400000
        ) {
            date.setFullYear(date.getFullYear() - 1);
        }
    }

    while (date < today) {
        date.setDate(date.getDate() + 14);
    }

    return date;
}


// 10일 연재: 다음 실제 연재 날짜 검색
function getNextTenDayBreakDate(referenceDate, includeToday) {
    const raw =
        document.getElementById('input-10day-dates')?.value.trim()
        || '';

    const releaseDays = [
        ...new Set(
            (raw.match(/\d+/g) || [])
                .map(Number)
                .filter(day => day >= 1 && day <= 31)
        )
    ].sort((a, b) => a - b);

    if (!releaseDays.length) return null;

    const reference = new Date(
        referenceDate.getFullYear(),
        referenceDate.getMonth(),
        referenceDate.getDate()
    );

    for (let offset = 0; offset < 15; offset++) {
        const first = new Date(
            reference.getFullYear(),
            reference.getMonth() + offset,
            1
        );

        const lastDay = new Date(
            first.getFullYear(),
            first.getMonth() + 1,
            0
        ).getDate();

        for (const day of releaseDays) {
            const candidate = new Date(
                first.getFullYear(),
                first.getMonth(),
                Math.min(day, lastDay)
            );

            if (
                candidate > reference ||
                (includeToday &&
                    candidate.getTime() === reference.getTime())
            ) {
                return candidate;
            }
        }
    }

    return null;
}


// 10일 연재 전용 +1회 / +1달 버튼
function setBreakTenDay(mode, btnElement) {
    const dateInput = document.getElementById('break-return-date');
    if (!dateInput) return;

    const wasEmpty = !dateInput.value;

    const base = wasEmpty
        ? getNextTenDayBreakDate(getWebtoonDate(), true)
        : getBreakStartDate(dateInput, '');

    if (!base) {
        showToast('10일 연재 날짜를 확인해 주세요.');
        return;
    }

    let target;

    if (mode === 'next') {
        // 다음 연재 회차로 이동
        target = getNextTenDayBreakDate(base, false);

    } else if (mode === 'month') {
        // 한 달을 더한 뒤 실제 연재일로 맞춤
        const originalDay = base.getDate();

        const monthDate = new Date(
            base.getFullYear(),
            base.getMonth() + 1,
            1
        );

        const lastDay = new Date(
            monthDate.getFullYear(),
            monthDate.getMonth() + 1,
            0
        ).getDate();

        monthDate.setDate(Math.min(originalDay, lastDay));
        target = getNextTenDayBreakDate(monthDate, true);

    } else {
        return;
    }

    if (!target) return;

    dateInput.value = formatDate(target);

    if (wasEmpty) {
        showToast('다음 10일 연재 예정일을 기준으로 설정됩니다.');
    }

    clearActiveBreakBtns();

    if (btnElement?.classList) {
        btnElement.classList.add('active-btn');
    }

    dateInput.classList.remove('flash-effect');
    void dateInput.offsetWidth;
    dateInput.classList.add('flash-effect');
}

// 휴재 버튼에서 사용할 작품의 원래 연재 요일
function getBreakWorkday() {
    const weekdays = [
        '월요일', '화요일', '수요일', '목요일',
        '금요일', '토요일', '일요일'
    ];

    const checkedDays = Array.from(
        document.querySelectorAll('input[name="day-chk"]:checked')
    )
        .map(input => input.value)
        .filter(day => weekdays.includes(day));

    // 여러 요일 작품이라면 지금 수정 중인 카드의 요일 우선
    if (editMode && checkedDays.includes(actionOrigDay)) {
        return actionOrigDay;
    }

    return checkedDays[0] || '';
}

// 날짜가 비어 있으면 이번 주의 원래 연재일을 기준으로
function getBreakStartDate(dateInput, weekday) {
    if (!dateInput.value) {
        return weekday
            ? getTargetDateForViewDay(weekday)
            : getWebtoonDate();
    }

    // 기존 날짜가 있으면 해당 날짜에서 이어서 계산
    const [year, month, day] = dateInput.value
        .split('-')
        .map(Number);

    return new Date(year, month - 1, day);
}

// 계산된 날짜 이후 처음 맞는 원래 연재 요일 찾기
function alignBreakWeekday(date, weekday) {
    const dayIndexes = {
        '일요일': 0,
        '월요일': 1,
        '화요일': 2,
        '수요일': 3,
        '목요일': 4,
        '금요일': 5,
        '토요일': 6
    };

    if (dayIndexes[weekday] === undefined) return;

    const extraDays =
        (dayIndexes[weekday] - date.getDay() + 7) % 7;

    date.setDate(date.getDate() + extraDays);
}


function getNextBiweeklyReleaseDate() {
    const date = getBiweeklyBreakStartDate();
    if (!date) return null;

    const today = getWebtoonDate();
    today.setHours(0, 0, 0, 0);

    // 기준일이 오늘이면 다음 격주 연재일로 이동
    if (date <= today) {
        date.setDate(date.getDate() + 14);
    }

    return date;
}



/* 격주 연재 전용 복귀 날짜 설정 */
function setBreakBiweeklyReturn(mode, btnElement) {
    const dateInput = document.getElementById('break-return-date');
    if (!dateInput) return;

    // 저장된 격주 기준일을 토대로 다음 연재일 계산
    const nextDate = getNextBiweeklyReleaseDate();

    if (!nextDate) {
        showToast('격주 연재 기준일을 먼저 설정해 주세요.');
        return;
    }

    if (mode === 'skip') {
        // 다음 회차를 한 번 건너뛰고 그다음 회차에 복귀
        nextDate.setDate(nextDate.getDate() + 14);
    } else if (mode !== 'next') {
        return;
    }

    // 기존 입력 날짜와 관계없이 항상 다음 예정일 기준
    dateInput.value = formatDate(nextDate);

    clearActiveBreakBtns();

    if (btnElement?.classList) {
        btnElement.classList.add('active-btn');
    }

    dateInput.classList.remove('flash-effect');
    void dateInput.offsetWidth;
    dateInput.classList.add('flash-effect');
}

// 🌟 주 단위 더하기 (+1주 등 버튼용)
function setBreakWeeks(arg1, arg2) {
    const dateInput = document.getElementById('break-return-date');
    if (!dateInput) return;

    const weeks = (typeof arg1 === 'object')
        ? Number(arg2) : Number(arg1);

    const btnElement = (typeof arg1 === 'object')
        ? arg1 : arg2;

    const weekday = getBreakWorkday();
    const wasEmpty = !dateInput.value;

    const isBiweekly =
        document.getElementById('input-cycle-type')?.value === '격주 연재';

    const d = (wasEmpty && isBiweekly)
        ? getBiweeklyBreakStartDate()
        : getBreakStartDate(dateInput, weekday);

    if (!d) {
        showToast('격주 연재일을 먼저 설정해 주세요.');
        return;
    }

    // 해당 연재일을 기준으로 주차 추가
    d.setDate(d.getDate() + weeks * 7);

    // 원래 연재 요일 유지
    alignBreakWeekday(d, weekday);

    dateInput.value = formatDate(d);

    if (wasEmpty && typeof showToast === 'function') {
        showToast(
            isBiweekly
                ? '다음 격주 연재일을 기준으로 설정됩니다.'
                : weekday
                    ? `이번 주 ${weekday} 기준으로 설정됩니다.`
                    : '오늘 기준으로 설정됩니다.'
        );
    }

    if (typeof clearActiveBreakBtns === 'function') {
        clearActiveBreakBtns();
    }

    if (btnElement && btnElement.classList) {
        btnElement.classList.add('active-btn');
    }

    dateInput.classList.remove('flash-effect');
    void dateInput.offsetWidth;
    dateInput.classList.add('flash-effect');
}

// 🌟 달 단위 더하기 (+1달 버튼용)
function setBreakMonths(arg1, arg2) {
    const dateInput = document.getElementById('break-return-date');
    if (!dateInput) return;

    const months = (typeof arg1 === 'object')
        ? Number(arg2) : Number(arg1);

    const btnElement = (typeof arg1 === 'object')
        ? arg1 : arg2;

    const weekday = getBreakWorkday();
    const wasEmpty = !dateInput.value;
    const d = getBreakStartDate(dateInput, weekday);

    // 달력상 한 달 뒤 날짜 계산
    const originalDay = d.getDate();

    d.setDate(1);
    d.setMonth(d.getMonth() + months);

    // 31일 등이 없는 달에서는 마지막 날짜 사용
    const lastDay = new Date(
        d.getFullYear(), d.getMonth() + 1, 0
    ).getDate();

    d.setDate(Math.min(originalDay, lastDay));

    // 한 달 뒤부터 처음 맞는 원래 연재 요일 찾기
    alignBreakWeekday(d, weekday);

    dateInput.value = formatDate(d);

    if (wasEmpty && typeof showToast === 'function') {
        showToast(
            weekday
                ? `이번 주 ${weekday} 기준, 한 달 뒤 첫 ${weekday}로 설정됩니다.`
                : '오늘 기준으로 설정됩니다.'
        );
    }

    if (typeof clearActiveBreakBtns === 'function') {
        clearActiveBreakBtns();
    }

    if (btnElement && btnElement.classList) {
        btnElement.classList.add('active-btn');
    }

    dateInput.classList.remove('flash-effect');
    void dateInput.offsetWidth;
    dateInput.classList.add('flash-effect');
}

// 🍞 토스트 팝업을 띄우는 마법의 함수!
function showToast(message) {
    const toast = document.getElementById('mobo-toast');
    toast.innerText = message; // 원하는 메시지를 쏙 넣고
    toast.classList.add('show'); // 짠! 하고 나타나게 함

    // 2.5초 뒤에 알아서 스르륵 사라지게 타이머 설정
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2500);
}


function clearBreakDate(btnElement) {
    const dateInput = document.getElementById('break-return-date');

    // 클릭하기 전 미정 버튼이 활성화되어 있었는지 확인
    const wasActive = btnElement?.classList.contains('active-btn');

    // 기존 버튼 선택 상태 초기화
    clearActiveBreakBtns();

    // 미정이 이미 활성화되어 있었다면 해제만 진행
    if (wasActive) {
        showToast("미정 설정을 해제했어요.");
        return;
    }

    // 미정 활성화
    dateInput.value = '';

    if (btnElement) {
        btnElement.classList.add(
            'active-btn',
            'active-btn-long-break'
        );
    }

    dateInput.classList.remove('flash-effect');
    void dateInput.offsetWidth;
    dateInput.classList.add('flash-effect');

    showToast("복귀 일정이 없는 장기 휴재로 설정됩니다.");
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

// 2. 메인 이사 비동기 함수 (데이터 충돌 완벽 방어판!)
async function silentAutoMigrateToImgBB() {
    // 중복 실행 방지 안전장치
    if (window.isMigrating) return;
    window.isMigrating = true;

    const platforms = ['lezhin', 'bomtoon', 'ridi', 'mrblue'];
    let worksToMigrate = [];
    let liveWorksMap = {}; // 🌟 [속도 100배 상승] 마법의 지름길
    let totalImages = 0;

    // [Step 1] 유저의 로컬 데이터 스캔 (전체 사진 수 및 이사 대상 분류)
    for (let plt of platforms) {
        if (!state[plt]) continue;
        for (let day of Object.keys(state[plt])) {
            for (let work of state[plt][day]) {
                if (!work.id) work.id = 'legacy_' + Math.random().toString(36).substr(2, 9);

                if (work.img) {
                    totalImages++; // 전체 등록된 사진 카운트

                    // 🌟 작품의 고유 ID를 열쇠로 삼아 지도를 만듭니다
                    if (work.id) liveWorksMap[work.id] = work;

                    // 아직 이사하지 않은 뚱뚱한 원본(Base64) 데이터만 선별
                    if (work.img.startsWith('data:image')) {
                        worksToMigrate.push({ id: work.id, base64: work.img, title: work.title });
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
    for (let item of worksToMigrate) {
        // UI에 실시간 현황 전달 (현재 처리 중인 번호, 총 개수)
        updateMigrationUI(migratedCount + 1, totalImages);

        try {
            // 🌟 [핵심 방어막] 다음 사진을 보내기 전 무조건 6초 동안 대기
            await new Promise(resolve => setTimeout(resolve, 6000));

            // ImgBB 서버로 전송
            let newUrl = await uploadImageToImgBB(item.base64);

            // 🌟 [엄격한 검증] 올바른 주소 형태로 응답이 왔을 때만 변환 성공 처리
            if (newUrl && newUrl.startsWith('http')) {
                // 🌟 [핵심 개선] 지도에서 ID만 부르면 0.001초 만에 최신 데이터를 찾습니다!
                let liveWork = liveWorksMap[item.id];

                if (liveWork) {
                    liveWork.img = newUrl; // 핀셋 교체
                    migratedCount++;
                    saveData(true); // 1장이 성공할 때마다 즉시 무소음으로 금고에 박제!
                }
            }
        } catch (e) {
            console.error(`[${item.title}] 사진 업로드 실패 (다시 시도):`, e);
            // 업로드 중 에러(400, 429 등)가 나도 catch문으로 안전하게 넘어가므로
            // 유저의 소중한 원본 데이터는 절대 지워지거나 변형되지 않고 그대로 유지됩니다.
        }
    }

    // 최종 완공 도장 쾅!
    updateMigrationUI(totalImages, totalImages);
    window.isMigrating = false;
    console.log("🤫 모든 유저의 데이터 최적화 이사가 안전하게 완료되었습니다.");
}

// 앱이 켜지고 화면이 다 그려진 후, 6초(6000ms) 뒤에 버벅임 없이 유저 몰래 실행!
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(silentAutoMigrateToImgBB, 6000);
});

// 🚀 화면에 나타나는 순간 사진을 불러오는 레이지 로딩 감시자!
function applyLazyLoading() {
    const lazyBgs = document.querySelectorAll('.lazy-bg');

    if ('IntersectionObserver' in window) {
        let lazyBgObserver = new IntersectionObserver(function (entries, observer) {
            entries.forEach(function (entry) {
                // 🌟 유저가 스크롤을 내려서 카드가 화면에 보이기 시작하면!
                if (entry.isIntersecting) {
                    let lazyBg = entry.target;
                    if (lazyBg.dataset.bg) {
                        // 숨겨놨던 주소를 꺼내서 진짜 배경 이미지로 넣어줍니다.
                        lazyBg.style.backgroundImage = `url('${lazyBg.dataset.bg}')`;
                    }
                    lazyBg.classList.remove('lazy-bg');
                    lazyBgObserver.unobserve(lazyBg); // 일 다 했으니 감시 종료
                }
            });
        });

        lazyBgs.forEach(function (lazyBg) {
            lazyBgObserver.observe(lazyBg); // 감시 시작!
        });
    } else {
        // 혹시 아주 옛날 폰을 쓰는 유저를 위한 방어막
        lazyBgs.forEach(function (lazyBg) {
            if (lazyBg.dataset.bg) lazyBg.style.backgroundImage = `url('${lazyBg.dataset.bg}')`;
        });
    }
}