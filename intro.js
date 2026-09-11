import { createTextStream } from './text-stream.js';

// The artwork is static CSS/SVG. A short-lived word timer stops after the opening;
// stars repaint only for layout changes, never for individual revealed words.
export function createIntro(screen, canvas) {
    const context = canvas.getContext('2d');
    const stage = screen.querySelector('.intro-stage');
    const roadTrace = screen.querySelector('.intro-road-trace');
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const touch = matchMedia('(pointer: coarse)').matches;
    const stars = Array.from({ length: touch ? 24 : 38 }, () => {
        let x = Math.random();
        const y = Math.random() * 0.74;
        // Leave the central message and its pool of light quiet.
        if (y > 0.25 && x > 0.2 && x < 0.8) x = x < 0.5 ? x * 0.3 : 1 - (1 - x) * 0.3;
        return { x, y, radius: 0.45 + Math.random() * 0.7, opacity: 0.2 + Math.random() * 0.45 };
    });
    let frame = 0;
    let stopped = false;
    let departure;
    let wordTimer = 0;
    let lastWordTime = 0;
    const message = screen.querySelector('#intro-message');
    const opening = createTextStream(message, { onComplete: stopWordTimer });

    function stopWordTimer() {
        clearTimeout(wordTimer);
        wordTimer = 0;
    }

    function scheduleWord() {
        if (stopped || document.hidden || !opening.isStreaming) return;
        wordTimer = setTimeout(() => {
            wordTimer = 0;
            const now = performance.now();
            opening.update((now - lastWordTime) / 1000);
            lastWordTime = now;
            scheduleWord();
        }, Math.max(16, opening.timeUntilNextWord * 1000));
    }

    function drawStars() {
        frame = 0;
        if (!context || stopped || document.hidden) return;
        const width = stage.clientWidth;
        const height = stage.clientHeight;
        const ratio = Math.min(devicePixelRatio || 1, touch ? 1 : 1.5);
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        for (const star of stars) {
            context.fillStyle = `rgba(215, 220, 231, ${star.opacity})`;
            context.beginPath();
            context.arc(star.x * width, star.y * height, star.radius, 0, Math.PI * 2);
            context.fill();
        }
    }

    function scheduleDraw() {
        if (!frame && !stopped && !document.hidden) frame = requestAnimationFrame(drawStars);
    }

    function handleVisibility() {
        cancelAnimationFrame(frame);
        frame = 0;
        stopWordTimer();
        if (!document.hidden) {
            scheduleDraw();
            lastWordTime = performance.now();
            scheduleWord();
        }
    }

    function handleMotionChange() {
        if (reducedMotion.matches) departure?.finish();
    }

    function stop() {
        stopped = true;
        cancelAnimationFrame(frame);
        frame = 0;
        stopWordTimer();
    }

    const observer = new ResizeObserver(scheduleDraw);
    observer.observe(stage);
    window.addEventListener('resize', scheduleDraw);
    document.addEventListener('visibilitychange', handleVisibility);
    reducedMotion.addEventListener('change', handleMotionChange);
    scheduleDraw();
    opening.start(message.textContent);
    lastWordTime = performance.now();
    scheduleWord();

    return {
        beginJourney() {
            opening.revealAll();
            stopWordTimer();
            screen.classList.add('is-loading');
            departure?.cancel();
            if (reducedMotion.matches || !roadTrace.animate) return Promise.resolve();
            departure = roadTrace.animate([
                { transform: 'scaleY(0)', opacity: 0.2 },
                { transform: 'scaleY(1)', opacity: 1 }
            ], {
                duration: 900,
                easing: 'cubic-bezier(0.22, 0.65, 0.3, 1)',
                fill: 'forwards'
            });
            return departure.finished.catch(() => {});
        },
        reset() {
            departure?.cancel();
            departure = undefined;
            screen.classList.remove('is-loading', 'fade-out');
            stopped = false;
            scheduleDraw();
        },
        stop,
        dispose() {
            stop();
            opening.dispose();
            departure?.cancel();
            departure = undefined;
            observer.disconnect();
            window.removeEventListener('resize', scheduleDraw);
            document.removeEventListener('visibilitychange', handleVisibility);
            reducedMotion.removeEventListener('change', handleMotionChange);
            canvas.width = canvas.height = 1;
        }
    };
}
