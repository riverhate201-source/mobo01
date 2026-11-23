/* MoBo onboarding QA preview.
 * Activated only by ?moboTour=1. No automatic first-visit trigger.
 * No changes to saved work, wallet, attendance or notification preferences.
 */
(() => {
    'use strict';
    if (new URLSearchParams(window.location.search).get('moboTour') !== '1') return;

    const TOTAL = 5;
    const PHASES = ['day', 'add', 'title', 'weekday', 'save'];
    const WEEKDAYS = ['월요일','화요일','수요일','목요일','금요일','토요일','일요일'];
    const COPY = {
        day: {
            title: '연재 요일 살펴보기',
            body: '요일별 작품을 확인할 수 있습니다. 먼저 강조된 ‘전체’ 버튼을 눌러주세요.',
            hint: '강조된 버튼만 터치할 수 있습니다.'
        },
        add: {
            title: '첫 작품 등록하기',
            body: '원하는 플랫폼에서 작품을 등록할 수 있습니다. 강조된 ‘+ 추가’ 버튼을 눌러주세요.',
            hint: '실제 작품 추가 화면이 열립니다.'
        },
        title: {
            title: '작품 제목 입력하기',
            body: '현재 감상 중인 웹툰의 제목을 입력해 주세요. 입력을 마치면 ‘다음’을 눌러주세요.',
            hint: '링크와 업로드 시간은 나중에 추가하셔도 됩니다.'
        },
        weekday: {
            title: '연재 요일 선택하기',
            body: '작품이 연재되는 요일을 선택해 주세요. 여러 요일을 선택할 수도 있습니다.',
            hint: '기본 요일만 안내합니다. 특수 연재 주기는 나중에 설정할 수 있습니다.'
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

    function visible(node) {
        return !!node && node.getClientRects().length > 0 &&
            getComputedStyle(node).visibility !== 'hidden';
    }
    function getTarget() {
        if (current === 'day') return document.querySelector('.day-nav .day-btn[data-day="전체"]');
        if (current === 'add') {
            return [...document.querySelectorAll('.webtoon-container .add-work-btn')].find(visible);
        }
        if (current === 'title') return document.getElementById('input-title');
        if (current === 'weekday') return document.querySelector('#day-selection-area > div');
        if (current === 'save') return document.querySelector('#custom-modal .modal-btns .save-btn');
        return null;
    }
    function hasTitle() {
        return !!document.getElementById('input-title')?.value.trim();
    }
    function hasDay() {
        return [...document.querySelectorAll('input[name="day-chk"]:checked')]
            .some(input => WEEKDAYS.includes(input.value));
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
        window.clearTimeout(timer);
        window.cancelAnimationFrame(frame);
        window.removeEventListener('scroll', scheduleLayout, true);
        window.removeEventListener('resize', scheduleLayout);
        window.visualViewport?.removeEventListener('resize', scheduleLayout);
        window.visualViewport?.removeEventListener('scroll', scheduleLayout);
        document.removeEventListener('click', captureClick, true);
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
    function cover(title, body, primary, isFinal) {
        root.innerHTML = '';
        const bg = document.createElement('div');
        bg.className = 'mobo-tour-coverall';
        bg.innerHTML = `<section class="mobo-tour-welcome" role="dialog" aria-modal="true">
          <div class="mobo-tour-welcome-mark" aria-hidden="true">mo</div>
          <h2></h2><p></p>
          <button class="mobo-tour-next" type="button"></button>
          <button class="mobo-tour-link" type="button">튜토리얼 종료</button>
        </section>`;
        bg.querySelector('h2').textContent = title;
        bg.querySelector('p').textContent = body;
        const button = bg.querySelector('.mobo-tour-next');
        button.textContent = primary;
        button.onclick = () => isFinal ? remove() : showPhase('day');
        bg.querySelector('.mobo-tour-link').onclick = remove;
        root.append(bg);
        button.focus({preventScroll:true});
    }
    function buildStage() {
        root.innerHTML = '';
        masks = Array.from({length:4}, () => {
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
        card.setAttribute('role','status');
        card.setAttribute('aria-live','polite');
        card.innerHTML = `
          <span class="mobo-tour-step"></span>
          <h3></h3><p class="mobo-tour-body"></p>
          <p class="mobo-tour-hint"></p>
          <div class="mobo-tour-actions">
            <button class="mobo-tour-link" type="button">튜토리얼 종료</button>
            <button class="mobo-tour-next" type="button">다음</button>
          </div>`;
        card.querySelector('.mobo-tour-link').onclick = remove;
        card.querySelector('.mobo-tour-next').onclick = next;
        root.append(card);
    }
    function showPhase(phase) {
        if (!active) return;
        current = phase;
        if (phase === 'add') {
            // The real add button may be below the fold.
            document.getElementById('custom-modal')?.style.display === 'none';
        }
        if (phase === 'save') startCount = workCount();
        buildStage();
        const c = COPY[phase];
        card.querySelector('.mobo-tour-step').textContent =
            'STEP ' + (PHASES.indexOf(phase) + 1) + ' / ' + TOTAL;
        card.querySelector('h3').textContent = c.title;
        card.querySelector('.mobo-tour-body').textContent = c.body;
        card.querySelector('.mobo-tour-hint').textContent = c.hint;
        const btn = card.querySelector('.mobo-tour-next');
        btn.style.display = ['title','weekday'].includes(phase) ? '' : 'none';
        fieldUpdate();
        const target = getTarget();
        if (!visible(target)) {
            card.querySelector('.mobo-tour-hint').textContent =
                '안내할 버튼을 찾지 못했습니다. 튜토리얼을 종료하고 다시 실행해 주세요.';
            masks.forEach(mask => {mask.style.inset='0';mask.style.width='100%';mask.style.height='100%';});
            focus.style.display = 'none';
            card.style.left = '14px';
            card.style.top = '28px';
            return;
        }
        target.scrollIntoView({block:'center',inline:'nearest',behavior:'smooth'});
        scheduleLayout();
        timer = window.setTimeout(scheduleLayout, 420);
    }
    function next() {
        if (current === 'title' && hasTitle()) showPhase('weekday');
        else if (current === 'weekday' && hasDay()) showPhase('save');
    }
    function fieldUpdate() {
        if (!card) return;
        const btn = card.querySelector('.mobo-tour-next');
        if (!btn) return;
        if (current === 'title') btn.disabled = !hasTitle();
        else if (current === 'weekday') btn.disabled = !hasDay();
    }
    function captureClick(event) {
        if (!active || !card || card.contains(event.target)) return;
        const target = getTarget();
        if (!target?.contains(event.target)) return;
        if (current === 'day') {
            window.setTimeout(() => showPhase('add'), 70);
        } else if (current === 'add') {
            tourOpenedModal = true;
            window.setTimeout(() => showPhase('title'), 120);
        } else if (current === 'save') {
            // Observe actual persisted addition, not the click alone.
            window.setTimeout(() => checkSaved(0), 230);
        }
    }
    function checkSaved(retry) {
        if (!active || current !== 'save') return;
        const newCount = workCount();
        if (overlayClosed() && newCount > startCount && startCount >= 0) {
            tourOpenedModal = false;
            current = 'done';
            cover('첫 작품을 등록하셨습니다!', '잘하셨습니다. 이제 등록한 작품을 요일별 목록에서 확인할 수 있습니다. 다른 기능은 다음 단계에서 함께 살펴보겠습니다.', '모보 둘러보기 완료', true);
            return;
        }
        if (retry < 30 && !overlayClosed()) {
            timer = window.setTimeout(() => checkSaved(retry + 1), 300);
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
        const raw = target.getBoundingClientRect();
        const w = window.innerWidth, h = window.innerHeight, pad = 5;
        const left = Math.max(0, Math.min(w, raw.left - pad));
        const top = Math.max(0, Math.min(h, raw.top - pad));
        const right = Math.max(left, Math.min(w, raw.right + pad));
        const bottom = Math.max(top, Math.min(h, raw.bottom + pad));
        const setMask = (el,x,y,width,height) => {
            Object.assign(el.style,{left:x+'px',top:y+'px',width:Math.max(0,width)+'px',height:Math.max(0,height)+'px'});
        };
        setMask(masks[0],0,0,w,top);
        setMask(masks[1],0,top,left,bottom-top);
        setMask(masks[2],right,top,w-right,bottom-top);
        setMask(masks[3],0,bottom,w,h-bottom);
        Object.assign(focus.style,{display:'block',left:left+'px',top:top+'px',
            width:(right-left)+'px',height:(bottom-top)+'px'});
        const vw = window.visualViewport;
        const visibleTop = vw ? vw.offsetTop : 0;
        const visibleBottom = vw ? vw.height + visibleTop : h;
        const cardW = card.offsetWidth, cardH = card.offsetHeight;
        const cardLeft = Math.max(14,Math.min(w-cardW-14,left+(right-left)/2-cardW/2));
        const below = bottom + 16, above = top - cardH - 16;
        let cardTop = below + cardH <= visibleBottom - 10 ? below :
            above >= visibleTop + 10 ? above :
            Math.max(visibleTop+10,visibleBottom-cardH-10);
        cardTop = Math.min(cardTop, h-cardH-6);
        Object.assign(card.style,{left:cardLeft+'px',top:cardTop+'px'});
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
        document.addEventListener('click', captureClick, true);
        document.addEventListener('input', fieldUpdate, true);
        document.addEventListener('change', fieldUpdate, true);
        document.addEventListener('keydown', handleKeyboard, true);
        cover('모보에 오신 것을 환영합니다!', '주요 기능을 직접 사용하면서 알아보세요. 기록은 직접 저장하실 때만 변경됩니다. 안내되는 부분 외의 터치는 잠시 제한됩니다.', '튜토리얼 시작하기', false);
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
    window.addEventListener('load', () => window.setTimeout(waitForApp, 500), {once:true});
})();
