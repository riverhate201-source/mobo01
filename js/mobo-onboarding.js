/* MoBo onboarding QA preview.
 * Activated only by ?moboTour=1. No automatic first-visit trigger.
 * No changes to saved work, wallet, attendance or notification preferences.
 */
(() => {
    'use strict';
    if (new URLSearchParams(window.location.search).get('moboTour') !== '1') return;


    const TOTAL = 7;
    const PHASES = [
        'overview',
        'day',
        'add',
        'title',
        'weekday',
        'coin',
        'save'
    ];

    const WEEKDAYS = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];
    const COPY = {

        overview: {
            title: '요일별 작품 모아보기',
            body: '요일별로 연재되는 작품을 모아볼 수 있습니다. ‘전체’ 탭에서는 모든 요일에 등록된 작품을 한눈에 확인할 수 있습니다.',
            hint: ''
        },
        day: {
            title: '해당 요일탭 선택하기',
            body: '이제 월요일 탭을 눌러보세요. 월요일에 연재되는 작품을 확인할 수 있습니다.',
            hint: '강조된 월요일 버튼을 눌러주세요.'
        },

        add: {
            title: '첫 작품 등록하기',
            body: '원하는 플랫폼에서 작품을 등록할 수 있습니다. 강조된 ‘+ 추가’ 버튼을 눌러주세요.',
            hint: '실제 작품 추가 화면이 열립니다.'
        },
        title: {
            title: '작품 제목 입력하기',
            body: '이제 작품을 등록해 보겠습니다. "테스트" 라는 제목을 입력해 보세요. 입력을 마치면 ‘다음’을 눌러주세요.',
            hint: '링크와 업로드 시간은 나중에 추가하셔도 됩니다.'
        },
        weekday: {
            title: '연재 요일 선택하기',
            body: '작품이 연재되는 요일을 이곳에서 선택할 수 있습니다. 현재는 월요일이 기본으로 선택되어 있습니다.',
            hint: '여러 요일에 연재되는 작품이라면 해당 요일을 추가로 선택할 수 있습니다.'
        },

        coin: {
            title: '1화당 필요 재화 입력하기',
            body: '작품 한 회차를 감상하는 데 필요한 재화를 입력해 주세요. 무료 작품은 0으로 입력하시면 됩니다.',
            hint: '플랫폼에 따라 코인, 캐시 또는 머니 단위로 관리됩니다.'
        },

        save: {
            title: '작품 저장하기',
            body: '입력한 제목과 요일을 확인한 후 ‘저장하기’를 눌러주세요. 작품이 실제 목록에 등록됩니다.',
            hint: '저장하지 않으려면 아래 ‘튜토리얼 종료’를 눌러주세요.'
        }
    };

    let root = null, card = null, current = null, active = false, timer = 0;
    let startCount = 0, tourOpenedModal = false, frame = 0;
    let focus = null, masks = [];

    let tutorialPlatform = null;

    let tutorialSavedIndex = -1;
    let tutorialSavedTitle = '';
    let tourOpenedActionModal = false;



    function visible(node) {
        return !!node && node.getClientRects().length > 0 &&
            getComputedStyle(node).visibility !== 'hidden';
    }
    function getTarget() {

        if (current === 'overview') {
            return document.querySelector('.day-nav');
        }

        if (current === 'day') {
            return document.querySelector(
                '.day-nav .day-btn[data-day="월요일"]'
            );
        }

        if (current === 'add') {
            return [...document.querySelectorAll('.webtoon-container .add-work-btn')].find(visible);
        }
        if (current === 'title') return document.getElementById('input-title');
        if (current === 'weekday') return document.querySelector('#day-selection-area > div');

        if (current === 'coin') {
            return document.getElementById('input-coin');
        }

        if (current === 'save') return document.querySelector('#custom-modal .modal-btns .save-btn');


        if (
            current === 'chapter2-cards' ||
            current === 'chapter2-summary' ||
            current === 'chapter2-filter'
        ) {
            let section = tutorialPlatform
                ? document.getElementById(
                    `${tutorialPlatform}-section`
                )
                : null;

            if (!section) {
                section = [...document.querySelectorAll(
                    '.webtoon-container'
                )].find(el =>
                    el.querySelector('.webtoon-card-link')
                );
            }

            if (current === 'chapter2-cards') {
                return section?.querySelector('.scroll-wrapper');
            }


            if (current === 'chapter2-filter') {
                return section?.querySelector('.filter-btn');
            }


            return section?.querySelector('.total-coin-banner');
        }




        if ([
            'chapter2-detail',
            'chapter2-info',
            'chapter2-image',
            'chapter2-progress',
            'chapter2-menu'
        ].includes(current)) {


            if (!tutorialPlatform || tutorialSavedIndex < 0) {
                return null;
            }

            const cards = document.querySelectorAll(
                `#${tutorialPlatform}-list .webtoon-card-link`
            );

            const savedCard = [...cards].find(card =>
                card.dataset.day === '월요일' &&
                Number(card.dataset.idx) === tutorialSavedIndex &&
                card.querySelector('.card-info .title')
                    ?.textContent.trim() === tutorialSavedTitle
            );

            if (!savedCard) return null;

            if (current === 'chapter2-info') {
                return savedCard.querySelector('.card-info');
            }


            if (current === 'chapter2-image') {
                return savedCard.querySelector('.card-thumbnail');
            }

            if (current === 'chapter2-progress') {
                return savedCard.querySelector(
                    '.quick-btn[onclick*="incrementProgress"]'
                );
            }

            if (current === 'chapter2-menu') {
                return savedCard.querySelector('.more-options-btn');
            }

            return savedCard;

        }


        if (current === 'chapter2-actions') {
            return document.querySelector(
                '#action-modal .action-btns-container'
            );
        }


        return null;
    }
    function hasTitle() {
        return !!document.getElementById('input-title')?.value.trim();
    }
    function hasDay() {
        return [...document.querySelectorAll('input[name="day-chk"]:checked')]
            .some(input => WEEKDAYS.includes(input.value));
    }

    function hasCoin() {
        const raw = document.getElementById('input-coin')?.value.trim() ?? '';

        return /^\d+$/.test(raw) &&
            Number.isSafeInteger(Number(raw)) &&
            Number(raw) <= 100000;
    }

    function workCount() {
        try {
            const raw = localStorage.getItem('WEBTOON_APP_STABLE_V1');
            const saved = raw ? JSON.parse(raw) : {};
            return Object.values(saved.state || {}).reduce((sum, platform) =>
                sum + Object.values(platform || {}).reduce((count, works) =>
                    count + (Array.isArray(works) ? works.length : 0), 0), 0);
        } catch (_) { return -1; }
    }
    function overlayClosed() {
        return document.getElementById('custom-modal')?.style.display === 'none';
    }
    function remove() {
        active = false;

        if (tourOpenedActionModal) {
            if (typeof closeActionModal === 'function') {
                closeActionModal();
            }

            tourOpenedActionModal = false;
        }

        unlockTutorialDays();
        document.body.classList.remove('mobo-tour-overview');
        window.clearTimeout(timer);
        window.cancelAnimationFrame(frame);
        window.removeEventListener('scroll', scheduleLayout, true);
        window.removeEventListener('resize', scheduleLayout);
        window.visualViewport?.removeEventListener('resize', scheduleLayout);
        window.visualViewport?.removeEventListener('scroll', scheduleLayout);
        document.removeEventListener('click', blockOverviewDayClick, true);

        document.removeEventListener('click', blockTutorialWeekday, true);
        document.removeEventListener('keydown', blockTutorialWeekday, true);

        document.removeEventListener('click', captureClick, false);
        document.removeEventListener('input', fieldUpdate, true);
        document.removeEventListener('change', fieldUpdate, true);
        document.removeEventListener('keydown', handleKeyboard, true);
        if (tourOpenedModal && !overlayClosed() && typeof closeAddModal === 'function') {
            closeAddModal();  // Discard only an unsaved tutorial form.
        }
        root?.remove();
        root = null;
        card = null;
        focus = null;
        masks = [];
    }



    function showChapterTwoStep(phase) {
        if (!active) return;

        const steps = {
            'chapter2-cards': {
                number: 1,
                title: '등록한 작품 살펴보기',
                body: '등록한 작품은 해당 플랫폼의 목록에 카드 형태로 표시됩니다. 작품별 제목과 감상 정보를 한눈에 확인할 수 있습니다.',
                next: 'chapter2-summary'
            },

            'chapter2-summary': {
                number: 2,
                title: '필요 재화와 정산 정보',
                body: '오늘의 필요 재화는 해당 요일의 작품을 감상하는 데 필요한 금액입니다. 정산 후 남는 재화도 함께 확인할 수 있습니다.',
                next: 'chapter2-filter'
            },


            'chapter2-filter': {
                number: 3,
                title: '작품 카드 설정',
                body: '이 아이콘에서는 작품의 표시 순서를 변경하거나 카드를 숨기는 등 목록의 표시 방식을 설정할 수 있습니다.',
                next: 'chapter2-detail'
            },


            'chapter2-detail': {
                number: 4,
                title: '작품 카드 살펴보기',
                body: '챕터 1에서 등록한 작품입니다. 이제 카드에 표시되는 정보를 하나씩 살펴보겠습니다.',
                next: 'chapter2-info'
            },

            'chapter2-info': {
                number: 5,
                title: '작품 기본 정보',
                body: '카드 아래쪽에서는 작품 제목과 연재 주기, 1화당 필요한 재화를 확인할 수 있습니다.',
                next: 'chapter2-image'
            },


            'chapter2-image': {
                number: 6,
                title: '작품 이미지와 링크',
                body: '카드 위쪽에는 작품 이미지와 현재 감상 진도가 표시됩니다. 작품 링크를 등록했다면 이미지 영역을 눌러 해당 작품 페이지로 이동할 수 있습니다.',
                hint: '이미지와 작품 링크는 나중에 작품 수정 기능에서 추가할 수도 있습니다.',
                next: 'chapter2-progress'
            },

            'chapter2-progress': {
                number: 7,
                title: '감상 진도 변경하기',
                body: '작품을 한 회차 더 감상했다면 ‘+1화’ 버튼으로 진도를 업데이트할 수 있습니다. 강조된 버튼을 한 번 눌러보세요.',
                hint: '진도 변경은 실제 작품 기록에 저장됩니다.',
                next: null
            },


            'chapter2-menu': {
                number: 8,
                title: '작품 관리 메뉴 열기',
                body: '작품 카드 오른쪽 위의 ‘⋮’ 버튼을 누르면 작품 관리 메뉴가 열립니다. 직접 눌러보세요.',
                hint: '강조된 버튼만 누를 수 있습니다.',
                next: null
            },

            'chapter2-actions': {
                number: 9,
                title: '작품 관리 기능 살펴보기',
                body: '이곳에서는 작품 상세 수정, 템플릿으로 복제, 다른 플랫폼으로 이동, 영구 삭제 기능을 사용할 수 있습니다.',
                hint: '지금은 메뉴의 구성만 살펴보겠습니다.',
                next: null
            }




        };

        const step = steps[phase];
        if (!step) return;

        current = phase;
        buildStage();

        // 이번 챕터의 소개 단계는 모두 클릭 차단


        focus.classList.toggle(
            'mobo-tour-blocked',
            ![
                'chapter2-progress',
                'chapter2-menu'
            ].includes(phase)
        );



        card.querySelector('.mobo-tour-step').textContent =
            `CHAPTER 2 · STEP ${step.number}`;

        card.querySelector('h3').textContent = step.title;

        card.querySelector('.mobo-tour-body').textContent =
            step.body;

        // 설명 단계에서는 불필요한 힌트 숨기기

        const hint = card.querySelector('.mobo-tour-hint');

        hint.textContent = step.hint || '';
        hint.style.display = step.hint ? '' : 'none';


        const nextButton = card.querySelector('.mobo-tour-next');



        if (
            phase === 'chapter2-progress' ||
            phase === 'chapter2-menu'
        ) {
            nextButton.style.display = 'none';


        } else if (step.next) {
            nextButton.onclick = () =>
                showChapterTwoStep(step.next);

        } else {
            // 다음 작품 관리 체험을 연결하기 전 임시 버튼
            nextButton.textContent = '소개 마치기';
            nextButton.onclick = remove;
        }


        const target = getTarget();

        if (!visible(target)) {
            hint.style.display = '';
            hint.textContent =
                '안내할 영역을 찾지 못했습니다. 작품 목록을 확인해 주세요.';

            nextButton.textContent = '닫기';
            nextButton.onclick = remove;
            return;
        }



        if (phase === 'chapter2-progress') {
            const progressBadge = target
                .closest('.webtoon-card-link')
                ?.querySelector('.progress-badge');

            const previousProgress =
                progressBadge?.textContent.trim();

            let transitionPending = false;

            target.addEventListener('click', () => {
                if (
                    !active ||
                    current !== 'chapter2-progress' ||
                    transitionPending
                ) {
                    return;
                }

                const updatedProgress =
                    progressBadge?.textContent.trim();

                // 실제 감상 진도가 변경되었을 때만 진행
                if (
                    progressBadge &&
                    updatedProgress !== previousProgress
                ) {
                    transitionPending = true;

                    // 대기 중 추가 클릭 차단
                    focus.classList.add('mobo-tour-blocked');

                    // 변경된 진도를 1초간 보여준 뒤 다음 단계로
                    timer = window.setTimeout(() => {
                        if (
                            active &&
                            current === 'chapter2-progress'
                        ) {
                            showChapterTwoStep('chapter2-menu');
                        }
                    }, 1000);
                }
            });
        }



        if (phase === 'chapter2-menu') {
            target.addEventListener('click', () => {
                if (!active || current !== 'chapter2-menu') {
                    return;
                }

                const actionModal =
                    document.getElementById('action-modal');

                // 실제 작품 관리 메뉴가 열렸는지 확인
                if (actionModal?.style.display === 'flex') {
                    tourOpenedActionModal = true;
                    showChapterTwoStep('chapter2-actions');
                }
            }, { once: true });
        }


        target.scrollIntoView({
            block: 'center',
            inline: 'nearest',
            behavior: 'instant'
        });

        layout();
    }



    function showChapterTwoIntro() {
        cover(
            '챕터 2 · 등록한 작품 관리하기',
            '앞서 등록한 작품을 목록에서 확인하고, 작품 관리 기능을 살펴보겠습니다.',
            '시작하기',
            'chapter2intro'
        );
    }


    function cover(title, body, primary, isFinal) {
        root.innerHTML = '';

        const bg = document.createElement('div');
        bg.className = 'mobo-tour-coverall';

        bg.innerHTML = `
        <section class="mobo-tour-welcome" role="dialog" aria-modal="true">
            <div class="mobo-tour-welcome-head">
                <span class="mobo-tour-brand">MOBO</span>
                <span class="mobo-tour-kicker">
                    ${isFinal === 'chapter2intro'
                ? 'CHAPTER 02'
                : isFinal
                    ? 'CHAPTER 01 · COMPLETE'
                    : 'GETTING STARTED'}
                </span>
            </div>

            <div class="mobo-tour-welcome-copy">
                <h2></h2>
                <p></p>
            </div>

            
<div class="mobo-tour-welcome-actions">
    <button class="mobo-tour-link" type="button"></button>

    <button class="mobo-tour-next" type="button">
        <span class="mobo-tour-next-label"></span>
        <i data-lucide="arrow-right"></i>
    </button>
</div>

        </section>
    `;

        bg.querySelector('h2').textContent = title;
        bg.querySelector('p').textContent = body;

        const startBtn = bg.querySelector('.mobo-tour-next');
        startBtn.querySelector('.mobo-tour-next-label').textContent = primary;

        startBtn.onclick = () => {

            if (isFinal === 'chapter2intro') {
                showChapterTwoStep('chapter2-cards');
            }
            else if (isFinal) {
                showChapterTwoIntro();
            } else {
                showPhase('overview');
            }
        };


        const laterBtn = bg.querySelector('.mobo-tour-link');
        laterBtn.textContent = isFinal ? '닫기' : '나중에 하기';
        laterBtn.onclick = remove;



        if (isFinal) {
            startBtn.querySelector(
                '[data-lucide="arrow-right"], svg'
            )?.remove();
        }

        root.append(bg);
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
        startBtn.focus({ preventScroll: true });
    }

    function buildStage() {
        root.innerHTML = '';
        masks = Array.from({ length: 4 }, () => {
            const mask = document.createElement('div');
            mask.className = 'mobo-tour-mask';
            root.append(mask);
            return mask;
        });
        focus = document.createElement('div');
        focus.className = 'mobo-tour-focus';
        focus.setAttribute('aria-hidden', 'true');
        root.append(focus);
        card = document.createElement('section');
        card.className = 'mobo-tour-card';
        card.setAttribute('role', 'status');
        card.setAttribute('aria-live', 'polite');
        card.innerHTML = `
          <span class="mobo-tour-step"></span>
          <h3></h3><p class="mobo-tour-body"></p>
          <p class="mobo-tour-hint"></p>
          <div class="mobo-tour-actions">
            <button class="mobo-tour-link" type="button">튜토리얼 종료</button>
            
<button class="mobo-tour-next" type="button">
    <span>다음</span>
    <i data-lucide="arrow-right"></i>
</button>

          </div>`;
        card.querySelector('.mobo-tour-link').onclick = remove;
        card.querySelector('.mobo-tour-next').onclick = next;
        root.append(card);

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

    }


    const tutorialDayLocks = new Map();

    function lockTutorialDays() {
        document
            .querySelectorAll('#day-selection-area input[name="day-chk"]')
            .forEach(input => {
                if (!tutorialDayLocks.has(input)) {
                    tutorialDayLocks.set(input, input.disabled);
                }

                input.disabled = true;
            });
    }

    function unlockTutorialDays() {
        tutorialDayLocks.forEach((wasDisabled, input) => {
            input.disabled = wasDisabled;
        });

        tutorialDayLocks.clear();
    }


    function showPhase(phase) {
        if (!active) return;

        current = phase;


        if (phase === 'weekday') {
            lockTutorialDays();
        } else {
            unlockTutorialDays();
        }


        document.body.classList.toggle(
            'mobo-tour-overview',
            phase === 'overview'
        );


        if (phase === 'save') {
            startCount = workCount();

            tutorialSavedTitle =
                document.getElementById('input-title')?.value.trim() || '';

            try {
                const saved = JSON.parse(
                    localStorage.getItem('WEBTOON_APP_STABLE_V1') || '{}'
                );

                tutorialSavedIndex =
                    saved.state?.[tutorialPlatform]?.['월요일']?.length ?? -1;

            } catch (error) {
                tutorialSavedIndex = -1;
            }
        }


        buildStage();


        focus.classList.toggle(
            'mobo-tour-blocked',
            phase === 'overview' || phase === 'weekday'
        );


        const c = COPY[phase];
        card.querySelector('.mobo-tour-step').textContent =
            'STEP ' + (PHASES.indexOf(phase) + 1) + ' / ' + TOTAL;
        card.querySelector('h3').textContent = c.title;
        card.querySelector('.mobo-tour-body').textContent = c.body;

        const hintEl = card.querySelector('.mobo-tour-hint');
        hintEl.textContent = c.hint || '';
        hintEl.hidden = !c.hint;

        const btn = card.querySelector('.mobo-tour-next');
        btn.style.display = ['overview', 'title', 'weekday', 'coin'].includes(phase) ? '' : 'none';
        fieldUpdate();
        const target = getTarget();
        if (!visible(target)) {
            card.querySelector('.mobo-tour-hint').textContent =
                '안내할 버튼을 찾지 못했습니다. 튜토리얼을 종료하고 다시 실행해 주세요.';
            masks.forEach(mask => { mask.style.inset = '0'; mask.style.width = '100%'; mask.style.height = '100%'; });
            focus.style.display = 'none';
            card.style.left = '14px';
            card.style.top = '28px';
            return;
        }

        target.scrollIntoView({
            block: 'center',
            inline: 'nearest',
            behavior: 'instant'
        });

        layout();

    }


    function next() {
        if (current === 'overview') {
            showPhase('day');

        } else if (current === 'title' && hasTitle()) {
            showPhase('weekday');

        } else if (current === 'weekday' && hasDay()) {
            showPhase('coin');

        } else if (current === 'coin' && hasCoin()) {
            showPhase('save');
        }
    }


    function fieldUpdate() {
        if (!card) return;
        const btn = card.querySelector('.mobo-tour-next');
        if (!btn) return;
        if (current === 'title') btn.disabled = !hasTitle();
        else if (current === 'weekday') btn.disabled = !hasDay();

        else if (current === 'coin') btn.disabled = !hasCoin();

    }


    function blockTutorialWeekday(event) {
        if (!active || current !== 'weekday') return;

        const target = event.target;

        if (!target.closest?.('#day-selection-area')) return;

        if (
            event.type === 'keydown' &&
            event.key !== ' ' &&
            event.key !== 'Enter'
        ) {
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
    }



    function blockOverviewDayClick(event) {
        if (!active || current !== 'overview') return;

        if (event.target.closest('.day-nav')) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    }


    function captureClick(event) {
        if (!active || !card || card.contains(event.target)) return;

        const target = getTarget();
        if (!target?.contains(event.target)) return;

        if (current === 'day') {
            showPhase('add');


        } else if (current === 'add') {
            tutorialPlatform = event.target
                .closest('.webtoon-container')
                ?.id.replace('-section', '') || null;

            tourOpenedModal = true;

            showPhase('title');

        } else if (current === 'save') {
            // 실제 저장 성공 여부를 확인한 뒤 진행
            checkSaved(0);
        }
    }

    function checkSaved(retry) {
        if (!active || current !== 'save') return;
        const newCount = workCount();
        if (overlayClosed() && newCount > startCount && startCount >= 0) {
            tourOpenedModal = false;
            current = 'done';

            cover(
                '첫 작품 등록을 완료했습니다!',
                '첫 번째 작품이 모보에 등록되었습니다. 다음 챕터에서는 등록한 작품을 확인하고 관리하는 방법을 알아보겠습니다.',
                '다음 챕터로 넘어가기',
                true
            );

            return;
        }

        if (retry < 200 && !overlayClosed()) {
            timer = window.setTimeout(
                () => checkSaved(retry + 1),
                150
            );
        }

    }
    function handleKeyboard(event) {
        if (!active) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            remove();
        }
        if (event.key === 'Tab' && card && current !== 'done') {
            const target = getTarget();
            const withinAllowed = card.contains(document.activeElement) ||
                target?.contains(document.activeElement);
            if (!withinAllowed) {
                event.preventDefault();
                const focusable = target?.matches('button,input,textarea,select') ?
                    target : target?.querySelector('button,input,textarea,select');
                (focusable || card.querySelector('button'))?.focus();
            }
        }
    }
    function scheduleLayout() {
        if (!active || !card || !current || current === 'done') return;
        window.cancelAnimationFrame(frame);
        frame = window.requestAnimationFrame(layout);
    }
    function layout() {
        const target = getTarget();
        if (!visible(target) || !card) return;

        let raw = target.getBoundingClientRect();

        if (current === 'chapter2-summary') {
            const balance = target
                .closest('.webtoon-container')
                ?.querySelector('.balance-info');

            if (visible(balance)) {
                const b = balance.getBoundingClientRect();

                raw = {
                    left: Math.min(raw.left, b.left),
                    top: Math.min(raw.top, b.top),
                    right: Math.max(raw.right, b.right),
                    bottom: Math.max(raw.bottom, b.bottom)
                };
            }
        }


        const w = window.innerWidth;
        const h = window.innerHeight;
        const pad = current === 'overview' ? 0 : 5;

        const left = Math.max(0, Math.min(w, raw.left - pad));
        const top = Math.max(0, Math.min(h, raw.top - pad));
        const right = Math.max(left, Math.min(w, raw.right + pad));
        const bottom = Math.max(top, Math.min(h, raw.bottom + pad));
        const setMask = (el, x, y, width, height) => {
            Object.assign(el.style, { left: x + 'px', top: y + 'px', width: Math.max(0, width) + 'px', height: Math.max(0, height) + 'px' });
        };
        setMask(masks[0], 0, 0, w, top);
        setMask(masks[1], 0, top, left, bottom - top);
        setMask(masks[2], right, top, w - right, bottom - top);
        setMask(masks[3], 0, bottom, w, h - bottom);
        Object.assign(focus.style, {
            display: 'block', left: left + 'px', top: top + 'px',
            width: (right - left) + 'px', height: (bottom - top) + 'px'
        });
        const vw = window.visualViewport;
        const visibleTop = vw ? vw.offsetTop : 0;
        const visibleBottom = vw ? vw.height + visibleTop : h;
        const cardW = card.offsetWidth, cardH = card.offsetHeight;
        const cardLeft = Math.max(14, Math.min(w - cardW - 14, left + (right - left) / 2 - cardW / 2));
        const below = bottom + 16, above = top - cardH - 16;
        let cardTop = below + cardH <= visibleBottom - 10 ? below :
            above >= visibleTop + 10 ? above :
                Math.max(visibleTop + 10, visibleBottom - cardH - 10);
        cardTop = Math.min(cardTop, h - cardH - 6);
        Object.assign(card.style, { left: cardLeft + 'px', top: cardTop + 'px' });
    }
    function begin() {
        active = true;
        root = document.createElement('div');
        root.id = 'mobo-tour-root';
        document.body.append(root);
        window.addEventListener('scroll', scheduleLayout, true);
        window.addEventListener('resize', scheduleLayout);
        window.visualViewport?.addEventListener('resize', scheduleLayout);
        window.visualViewport?.addEventListener('scroll', scheduleLayout);
        document.addEventListener('click', blockOverviewDayClick, true);

        document.addEventListener('click', blockTutorialWeekday, true);
        document.addEventListener('keydown', blockTutorialWeekday, true);

        document.addEventListener('click', captureClick, false);
        document.addEventListener('input', fieldUpdate, true);
        document.addEventListener('change', fieldUpdate, true);
        document.addEventListener('keydown', handleKeyboard, true);

        cover(
            '모보에 오신 것을 환영합니다.',
            '웹툰 연재 일정부터 코인·캐시 관리까지, 튜토리얼을 통해 모보의 주요 기능을 직접 사용하며 익혀보세요. ',
            '시작하기',
            false
        );

    }
    function waitForApp() {
        const openModal = [...document.querySelectorAll('.modal-overlay')]
            .some(el => visible(el) && getComputedStyle(el).display !== 'none');
        if (openModal) {
            window.setTimeout(waitForApp, 600);
            return;
        }
        begin();
    }
    window.addEventListener('load', () => window.setTimeout(waitForApp, 500), { once: true });
})();