(() => {
    const SECTIONS = ['notice', 'world', 'system', 'battle'];
    const BGM_VOLUME = 0.6;
    const STAGGER_MS = 90;
    const STATIC_MS = 900;
    const STATIC_PEAK = 0.5;
    const STATIC_FRAME_MS = 40;
    const STATIC_PIXEL = 3;

    const body = document.body;
    const intro = document.getElementById('intro-overlay');
    const bgm = document.getElementById('bgm');
    const pageBar = document.querySelector('.page-bar');
    const progress = document.querySelector('.scroll-progress span');
    const views = [...document.querySelectorAll('.view')];
    const soundButtons = document.querySelectorAll('[data-sound]');
    const tabs = document.querySelectorAll('.page-tabs [data-section]');

    let entered = false;
    let observer = null;
    let markObserver = null;
    let activeView = null;

    // 새로고침이나 재방문 시 주소에 남은 해시를 지워 항상 메인부터 시작
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);

    /* ---------- BGM ---------- */
    function fadeInBgm() {
        const start = performance.now();
        const step = (now) => {
            // 첫 프레임의 now는 start보다 살짝 이를 수 있어 0 미만이 되지 않게 제한
            const t = Math.max(0, Math.min((now - start) / 1500, 1));
            bgm.volume = BGM_VOLUME * t;
            if (t < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    function playBgm() {
        bgm.play().catch(updateSoundButtons);
    }

    function updateSoundButtons() {
        const on = !bgm.paused && !bgm.muted;
        soundButtons.forEach((button) => {
            button.textContent = on ? 'SOUND ON' : 'SOUND OFF';
            button.setAttribute('aria-pressed', String(on));
        });
    }

    function toggleSound() {
        if (bgm.paused || bgm.muted) {
            bgm.muted = false;
            playBgm();
        } else {
            bgm.muted = true;
        }
    }

    ['play', 'pause', 'volumechange'].forEach((type) => bgm.addEventListener(type, updateSoundButtons));

    // 앱 전환이나 탭 이동 시에는 음악을 멈췄다가, 돌아오면 다시 재생
    let resumeOnReturn = false;
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            resumeOnReturn = !bgm.paused;
            bgm.pause();
        } else if (resumeOnReturn) {
            playBgm();
        }
    });

    /* ---------- 문서 자동 구성 ---------- */
    // 넓은 표는 모바일에서 가로로 스크롤할 수 있게 감싸기
    document.querySelectorAll('.doc-body table').forEach((table) => {
        const wrap = document.createElement('div');
        wrap.className = 'table-wrap';
        wrap.tabIndex = 0;
        table.replaceWith(wrap);
        wrap.append(table);
    });

    // 본문 블록에 스크롤 등장 애니메이션 적용 (목록은 전체가 아니라 항목별로)
    document.querySelectorAll('.doc-body > :not(ul, ol), .doc-body li').forEach((block) => block.classList.add('reveal'));

    // 제목(h3)으로 왼쪽 목차 만들기
    const outlines = new Map();
    document.querySelectorAll('.page').forEach((page) => {
        const toc = document.createElement('nav');
        toc.className = 'doc-toc';
        toc.setAttribute('aria-label', '목차');
        toc.innerHTML = '<p>CONTENTS</p>';

        const items = [...page.querySelectorAll('.doc-body h3')].map((heading) => {
            const button = document.createElement('button');
            button.textContent = heading.textContent;
            button.addEventListener('click', () => heading.scrollIntoView({ behavior: 'smooth' }));
            toc.append(button);
            return { heading, button };
        });

        page.prepend(toc);
        outlines.set(page, items);
    });

    function updateOutline() {
        const items = outlines.get(activeView);
        if (!items) return;

        const line = pageBar.offsetHeight + 80;
        const current = items.filter(({ heading }) => heading.getBoundingClientRect().top < line).pop();
        items.forEach((item) => {
            if (item === current) item.button.setAttribute('aria-current', 'true');
            else item.button.removeAttribute('aria-current');
        });
    }

    /* ---------- 스크롤 등장 ---------- */
    function watchReveals(view) {
        if (observer) observer.disconnect();

        const items = view.querySelectorAll('.reveal');
        items.forEach((item) => {
            item.classList.remove('is-in');
            item.style.removeProperty('--delay');
        });

        observer = new IntersectionObserver((entries) => {
            entries
                .filter((entry) => entry.isIntersecting)
                .forEach((entry, index) => {
                    // 한 번에 보이는 요소끼리 순서대로 시차를 두고 등장
                    entry.target.style.setProperty('--delay', `${index * STAGGER_MS}ms`);
                    entry.target.classList.add('is-in');
                    observer.unobserve(entry.target);
                });
        }, {
            // 메인은 스크롤 없이 메뉴가 전부 보여야 하므로 하단 여백을 두지 않음
            rootMargin: view.id === 'view-main' ? '0px' : '0px 0px -10% 0px',
            threshold: 0.05,
        });

        // 숨김 해제 직후의 레이아웃이 반영된 뒤에 관찰 시작
        requestAnimationFrame(() => items.forEach((item) => observer.observe(item)));

        watchMarks(view);
    }

    /* ---------- 형광펜 ---------- */
    function watchMarks(view) {
        if (markObserver) markObserver.disconnect();

        const marks = view.querySelectorAll('mark');
        marks.forEach((mark) => mark.classList.remove('is-drawn'));

        // 화면 아래쪽 22%를 지나 읽는 위치에 들어왔을 때 긋기
        markObserver = new IntersectionObserver((entries) => {
            entries.filter((entry) => entry.isIntersecting).forEach((entry) => {
                entry.target.classList.add('is-drawn');
                markObserver.unobserve(entry.target);
            });
        }, { rootMargin: '0px 0px -22% 0px' });

        requestAnimationFrame(() => marks.forEach((mark) => markObserver.observe(mark)));
    }

    function updateProgress() {
        const max = document.documentElement.scrollHeight - window.innerHeight;

        // 문서 끝에서는 읽는 위치까지 올라오지 못한 형광펜과 등장 요소도 마저 처리
        if (activeView && max - window.scrollY <= 2) {
            activeView.querySelectorAll('mark').forEach((mark) => mark.classList.add('is-drawn'));
            activeView.querySelectorAll('.reveal').forEach((item) => item.classList.add('is-in'));
        }

        const ratio = max > 0 ? Math.min(window.scrollY / max, 1) : 0;
        progress.style.setProperty('--progress', ratio);
        updateOutline();
    }

    /* ---------- 페이지 전환 ---------- */
    function currentSection() {
        return SECTIONS.indexOf(location.hash.slice(1));
    }

    function render({ focus = true } = {}) {
        const section = currentSection();
        const target = document.getElementById(section < 0 ? 'view-main' : `view-section-${section}`);

        // 해시 이동 시 hashchange와 popstate가 함께 발생하므로 중복 렌더링 방지
        if (target === activeView) return;
        activeView = target;

        views.forEach((view) => { view.hidden = view !== target; });
        pageBar.hidden = section < 0;
        tabs.forEach((tab) => {
            if (Number(tab.dataset.section) === section) tab.setAttribute('aria-current', 'page');
            else tab.removeAttribute('aria-current');
        });

        window.scrollTo(0, 0);
        watchReveals(target);
        updateProgress();

        const heading = target.querySelector('h2');
        if (focus && heading) heading.focus({ preventScroll: true });
    }

    function go(hash) {
        if (location.hash.slice(1) === hash) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (hash) {
            location.hash = hash;
        } else {
            // 메인으로 돌아갈 때 주소 끝에 #이 남지 않게 처리
            history.pushState(null, '', location.pathname + location.search);
            render();
        }
    }

    document.addEventListener('click', (event) => {
        const button = event.target.closest('[data-section], [data-home], [data-sound]');
        if (!button) return;

        if ('sound' in button.dataset) toggleSound();
        else if ('home' in button.dataset) go('');
        else go(SECTIONS[Number(button.dataset.section)]);
    });

    window.addEventListener('hashchange', () => { if (entered) render(); });
    window.addEventListener('popstate', () => { if (entered) render(); });
    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress);

    /* ---------- 인트로 ---------- */
    // 저해상도로 그린 뒤 확대해서 굵은 TV 노이즈 입자를 만듦
    function playStatic(onPeak) {
        const canvas = document.getElementById('static-noise');
        const width = Math.ceil(window.innerWidth / STATIC_PIXEL);
        const height = Math.ceil(window.innerHeight / STATIC_PIXEL);
        canvas.width = width;
        canvas.height = height;
        canvas.hidden = false;

        const ctx = canvas.getContext('2d');
        const image = ctx.createImageData(width, height);
        const pixels = new Uint32Array(image.data.buffer);
        const start = performance.now();
        let lastDraw = -Infinity;
        let peaked = false;

        const draw = (intensity) => {
            const alpha = Math.round(intensity * 255) << 24;
            let tear = 0;
            for (let y = 0, i = 0; y < height; y += 1) {
                // 가끔 밝은 가로줄이 몇 줄씩 이어지며 화면이 찢어지는 느낌을 줌
                if (tear > 0) tear -= 1;
                else if (Math.random() < 0.012) tear = 1 + Math.floor(Math.random() * 6);
                const base = tear > 0 ? 130 : 0;
                for (let x = 0; x < width; x += 1, i += 1) {
                    const v = Math.min(255, base + Math.floor(Math.random() * 200));
                    pixels[i] = alpha | (v << 16) | (v << 8) | v;
                }
            }
            ctx.putImageData(image, 0, 0);
        };

        const step = (now) => {
            const t = Math.max(0, (now - start) / STATIC_MS);
            if (!peaked && t >= STATIC_PEAK) {
                peaked = true;
                onPeak();
            }
            if (t >= 1) {
                canvas.hidden = true;
                return;
            }
            // 프레임을 일부러 낮춰 지지직거리는 질감을 살림
            if (now - lastDraw >= STATIC_FRAME_MS) {
                lastDraw = now;
                const intensity = t < STATIC_PEAK
                    ? (t / STATIC_PEAK) ** 2
                    : (1 - (t - STATIC_PEAK) / (1 - STATIC_PEAK)) * (0.65 + Math.random() * 0.35);
                draw(intensity);
            }
            requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    function enter() {
        if (entered) return;
        entered = true;

        // 브라우저 자동재생 정책 때문에 터치 이벤트 안에서 바로 재생해야 함
        bgm.volume = 0;
        playBgm();
        fadeInBgm();

        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            intro.classList.add('is-glitching');
            playStatic(() => {
                // 노이즈가 화면을 가린 순간 메인으로 교체
                intro.hidden = true;
                body.classList.remove('is-locked');
                render({ focus: false });
            });
            return;
        }

        // 움직임 줄이기 설정에서는 깜빡임 없이 페이드만 적용
        intro.classList.add('is-leaving');
        body.classList.remove('is-locked');

        setTimeout(() => render({ focus: false }), 400);
        setTimeout(() => { intro.hidden = true; }, 1000);
    }

    intro.addEventListener('click', enter);
    intro.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            enter();
        }
    });

    updateSoundButtons();
})();
