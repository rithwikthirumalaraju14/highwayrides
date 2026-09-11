import { messageStops } from './messages.js';

export function createMessageNavigation(sequence) {
    const reader = document.getElementById('reader');
    const title = document.getElementById('message-title');
    const counter = document.getElementById('message-counter');
    const previous = document.getElementById('previous-message');
    const next = document.getElementById('next-message');
    const autoReading = document.getElementById('auto-reading');
    const status = document.getElementById('reading-status');
    const mapToggle = document.getElementById('map-toggle');
    const dialog = document.getElementById('journey-map');
    const stopList = document.getElementById('map-stops');
    const events = new AbortController();
    const options = { signal: events.signal };
    let journeyPaused = false;

    const stopButtons = messageStops.map((stop, index) => {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'map-stop';
        button.dataset.stop = String(index);
        const number = document.createElement('span');
        number.className = 'stop-number';
        number.textContent = String(index + 1).padStart(2, '0');
        const label = document.createElement('span');
        label.className = 'stop-label';
        label.textContent = stop.title;
        const state = document.createElement('span');
        state.className = 'stop-state';
        button.append(number, label, state);
        item.append(button);
        stopList.append(item);
        button.addEventListener('click', () => {
            sequence.select(index);
            closeMap();
        }, options);
        return { button, state };
    });

    function sync(state) {
        title.textContent = state.title;
        counter.textContent = `${String(state.index + 1).padStart(2, '0')} / ${String(state.count).padStart(2, '0')}`;
        counter.setAttribute('aria-label', `Message ${state.index + 1} of ${state.count}`);
        previous.disabled = state.isFirst;
        next.disabled = state.isLast;
        autoReading.disabled = state.isLast;
        autoReading.setAttribute('aria-pressed', String(state.automatic));
        autoReading.textContent = state.isLast ? 'Last stop' : state.automatic ? 'Pause auto-read' : 'Resume auto-read';
        status.textContent = journeyPaused
            ? 'Journey paused · You can still browse the messages'
            : state.isLast
                ? 'End of the road · Revisit any stop on the map'
                : state.automatic
                    ? 'Automatic reading · Skip ahead whenever you like'
                    : 'Manual reading · Take your time, or resume auto-read';

        stopButtons.forEach(({ button, state: stopState }, index) => {
            const current = index === state.index;
            const visited = state.visited.includes(index);
            if (current) button.setAttribute('aria-current', 'step');
            else button.removeAttribute('aria-current');
            button.classList.toggle('is-visited', visited);
            stopState.textContent = current ? 'Here' : visited ? 'Visited' : 'Open';
        });
    }

    function openMap() {
        if (dialog.open) return;
        sequence.setSuspended(true);
        dialog.showModal();
        mapToggle.setAttribute('aria-expanded', 'true');
        const current = stopButtons[sequence.getState().index].button;
        current.focus({ preventScroll: true });
        current.scrollIntoView({ block: 'nearest' });
    }

    function finishClosingMap() {
        // Native close events are queued. Ignore an old event if the reader has
        // already reopened the map, or if the close was handled synchronously.
        if (dialog.open || mapToggle.getAttribute('aria-expanded') !== 'true') return;
        sequence.setSuspended(false);
        mapToggle.setAttribute('aria-expanded', 'false');
        mapToggle.focus({ preventScroll: true });
    }

    function closeMap() {
        if (!dialog.open) return;
        dialog.close();
        finishClosingMap();
    }

    previous.addEventListener('click', () => {
        sequence.previous();
        closeMap();
    }, options);
    next.addEventListener('click', () => {
        sequence.next();
        closeMap();
    }, options);
    autoReading.addEventListener('click', () => {
        sequence.setAutomatic(!sequence.getState().automatic);
        closeMap();
    }, options);
    mapToggle.addEventListener('click', openMap, options);
    document.getElementById('close-map').addEventListener('click', closeMap, options);
    dialog.addEventListener('close', finishClosingMap, options);
    dialog.addEventListener('cancel', event => {
        event.preventDefault();
        closeMap();
    }, options);
    dialog.addEventListener('click', event => {
        if (event.target !== dialog) return;
        const bounds = dialog.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right
            || event.clientY < bounds.top || event.clientY > bounds.bottom) closeMap();
    }, options);

    const unsubscribe = sequence.subscribe(sync);
    return {
        show() { reader.hidden = false; },
        setJourneyPaused(paused) {
            journeyPaused = paused;
            sync(sequence.getState());
        },
        dispose() {
            events.abort();
            unsubscribe();
            if (dialog.open) dialog.close();
        }
    };
}
