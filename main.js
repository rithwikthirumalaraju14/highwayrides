import { createIntro } from './intro.js';
import { createMessageSequence, openingMessage } from './messages.js';
import { createMessageNavigation } from './navigation.js';

const introScreen = document.getElementById('intro-screen');
const enterButton = document.getElementById('enter-button');
const enterLabel = document.getElementById('enter-label');
const status = document.getElementById('loading-status');
const container = document.getElementById('canvas-container');
const journeyControls = document.getElementById('journey-controls');
const pauseButton = document.getElementById('pause-button');
document.getElementById('intro-message').textContent = openingMessage;
const intro = createIntro(introScreen, document.getElementById('intro-canvas'));
const messages = createMessageSequence(
    document.getElementById('subtitle-container'),
    document.getElementById('subtitle-text')
);
const navigation = createMessageNavigation(messages);

let phase = 'intro';
let highway;
let paused = false;
let loadAttempt = 0;

enterButton.addEventListener('click', async () => {
    if (phase !== 'intro') return;
    phase = 'loading';
    enterButton.disabled = true;
    enterLabel.textContent = 'Preparing your road…';
    introScreen.setAttribute('aria-busy', 'true');
    status.textContent = 'Preparing your moonlit road…';

    try {
        const departure = intro.beginJourney();
        // No WebGL context, highway geometry, or render loop exists before Enter.
        // Browsers cache failed module imports too. A fresh URL makes Retry
        // actually request the scene again after a temporary loading failure.
        const moduleUrl = new URL('./highway.js', import.meta.url);
        if (loadAttempt > 0) moduleUrl.searchParams.set('retry', String(loadAttempt));
        loadAttempt++;
        const { createHighway } = await import(moduleUrl.href);
        highway = createHighway(container, delta => messages.update(delta));
        await Promise.all([highway.prepare(), departure]);

        phase = 'transition';
        intro.stop();
        introScreen.classList.add('fade-out');
        await new Promise(resolve => setTimeout(resolve,
            matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700));

        intro.dispose();
        introScreen.hidden = true;
        introScreen.removeAttribute('aria-busy');
        container.removeAttribute('aria-hidden');
        container.inert = false;
        journeyControls.hidden = false;
        phase = 'scene';
        messages.start();
        navigation.show();
        highway.start();
        pauseButton.focus({ preventScroll: true });
    } catch (error) {
        highway?.dispose();
        highway = undefined;
        phase = 'intro';
        intro.reset();
        introScreen.removeAttribute('aria-busy');
        enterButton.disabled = false;
        enterLabel.textContent = 'Try again';
        status.textContent = 'The road couldn’t load. Check your connection and try again.';
        console.error('Could not start the highway:', error);
    }
});

pauseButton.addEventListener('click', () => {
    if (phase !== 'scene') return;
    paused = !paused;
    pauseButton.textContent = paused ? 'Resume journey' : 'Pause journey';
    pauseButton.setAttribute('aria-pressed', String(paused));
    navigation.setJourneyPaused(paused);
    if (paused) highway.pause();
    else highway.start();
});

window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    intro.dispose();
    navigation.dispose();
    messages.dispose();
    highway?.dispose();
});
