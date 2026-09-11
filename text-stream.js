// Whole words keep emoji sequences intact. The caller supplies the clock, so
// road subtitles reuse the scene loop instead of starting another one.
export function createTextStream(element, {
    interactionTarget = element,
    scrollContainer,
    onComplete = () => {}
} = {}) {
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const events = new AbortController();
    const options = { signal: events.signal };
    const originalTitle = interactionTarget.getAttribute('title');
    let content = '';
    let words = [];
    let spans = [];
    let visibleCount = 0;
    let remaining = 0;
    let streaming = false;
    let disposed = false;
    let pointerStart;
    let pointerMoved = false;

    function updateAttributes() {
        element.dataset.streaming = String(streaming);
        interactionTarget.dataset.streaming = String(streaming);
        // Defer live announcements until complete rather than speaking each word.
        interactionTarget.setAttribute('aria-busy', String(streaming));
        if (streaming) interactionTarget.title = 'Tap or press Enter to show the full message';
        else if (originalTitle === null) interactionTarget.removeAttribute('title');
        else interactionTarget.title = originalTitle;
    }

    function delayAfter(word) {
        const trimmed = word.trim().replace(/["'”’\])]+$/u, '');
        const base = 0.13 + Math.min(Array.from(trimmed).length, 12) * 0.008;
        if (/[.!?…]$/u.test(trimmed)) return base + 0.38;
        if (/[,;:]$/u.test(trimmed)) return base + 0.16;
        return base;
    }

    function revealTo(count, followText) {
        const previous = spans[visibleCount - 1];
        const bounds = scrollContainer?.getBoundingClientRect();
        const previousBounds = previous?.getBoundingClientRect();
        const following = followText && bounds && (!previousBounds
            || (previousBounds.bottom >= bounds.top && previousBounds.bottom <= bounds.bottom + 8));
        previous?.classList.remove('stream-head');
        for (let index = visibleCount; index < count; index++) spans[index].classList.add('is-revealed');
        visibleCount = count;
        const latest = spans[visibleCount - 1];
        if (visibleCount < spans.length) latest?.classList.add('stream-head');
        if (following && latest) {
            const bottom = latest.getBoundingClientRect().bottom;
            if (bottom > bounds.bottom - 8) scrollContainer.scrollTop += bottom - bounds.bottom + 8;
        }
    }

    function finish(skipped = false) {
        streaming = false;
        remaining = 0;
        spans[visibleCount - 1]?.classList.remove('stream-head');
        updateAttributes();
        onComplete({ skipped });
    }

    function revealAll() {
        if (!streaming || disposed) return;
        // A deliberate reveal keeps the reader's scroll position.
        revealTo(spans.length, false);
        finish(true);
    }

    interactionTarget.addEventListener('pointerdown', event => {
        pointerStart = { x: event.clientX, y: event.clientY };
        pointerMoved = false;
    }, { ...options, passive: true });
    interactionTarget.addEventListener('pointermove', event => {
        if (pointerStart && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 8) pointerMoved = true;
    }, { ...options, passive: true });
    interactionTarget.addEventListener('pointercancel', () => { pointerMoved = true; pointerStart = undefined; }, options);
    interactionTarget.addEventListener('click', () => {
        pointerStart = undefined;
        if (!pointerMoved && !window.getSelection()?.toString()) revealAll();
    }, options);
    interactionTarget.addEventListener('keydown', event => {
        if (streaming && event.target === interactionTarget && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            revealAll();
        }
    }, options);
    reducedMotion.addEventListener('change', () => {
        if (reducedMotion.matches) revealAll();
    }, options);

    return {
        get isStreaming() { return streaming; },
        get timeUntilNextWord() { return remaining; },
        start(value, { immediate = false } = {}) {
            if (disposed) return;
            content = value;
            words = content.match(/\S+\s*|\s+/gu) || [];
            visibleCount = 0;
            streaming = true;
            updateAttributes();
            const fragment = document.createDocumentFragment();
            spans = words.map(word => {
                const span = document.createElement('span');
                span.className = 'stream-word';
                span.textContent = word;
                fragment.append(span);
                return span;
            });
            // Reserve the final line breaks so the landing button and subtitle
            // layout stay still while their words fade into view.
            element.replaceChildren(fragment);
            if (scrollContainer) scrollContainer.scrollTop = 0;
            if (immediate || reducedMotion.matches || words.length <= 1) {
                revealAll();
                return;
            }
            revealTo(1, false);
            remaining = delayAfter(words[0]);
        },
        update(delta) {
            if (disposed || !Number.isFinite(delta) || delta <= 0) return 0;
            if (!streaming) return delta;
            let unused = delta;
            while (streaming && unused >= remaining) {
                unused -= remaining;
                revealTo(visibleCount + 1, true);
                if (visibleCount === words.length) finish();
                else remaining = delayAfter(words[visibleCount - 1]);
            }
            if (streaming) { remaining -= unused; return 0; }
            return unused;
        },
        revealAll,
        dispose() {
            if (disposed) return;
            disposed = true;
            streaming = false;
            events.abort();
            element.textContent = content;
            updateAttributes();
            spans = [];
            words = [];
        }
    };
}
