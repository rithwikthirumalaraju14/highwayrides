import { createTextStream } from './text-stream.js';

const messageParagraphs = [
    "Hey, deyam... I know you're pretty upset about this, but I still want to clarify something because I don't want you to misunderstand what all of this meant to me.",
    "I did care about you back then, maybe a little less than I do now 😅, but that doesn't mean you were just another person to me. And honestly, I hate lying to you or anyone I'm close to, so I'm telling you this as honestly as I can.",
    "But I was still pretty much interested in you back then 😅. Maybe you can ask Manogna 😂. I even asked her once what you were using because I noticed your face was really clear and good back then, and your hair especially used to catch my attention when you were on the scooty 😅. So I definitely wasn't looking at you like just another person.",
    "And honestly, sometimes I did wonder how things would've been if you were the person standing in that place instead 😅. I never really said anything about it back then, but those thoughts were definitely there....",
    "And about the chocolates, I genuinely don't usually give chocolates or food items to people. Ask my sister or anyone close to me, I haven't even given anything like that to Manogna 😅. So even I don't know why I gave them to you. I just wanted to, and seeing you happy about it made me happy too 🤷🏻‍♀️. And I loved DC a lot back then, probably more than I liked you 😂, so if I actually wanted the chocolates, I would've just eaten them myself 😅(as always).",
    "And about the websites, I've only made them for two people, you and Chitti Akka.... Chitti is my elder sister, and I genuinely care about her, so obviously I wanted to make something for her birthday. But that doesn't mean what I did for you was something I normally do for everyone. & a she always brings me chocolates and food items to eat. Unlike us, she actually brings healthy snacks 😂",
    "So please don't think you simply imagined being special and that everything started because of some misunderstanding. Maybe you gave certain things more meaning at the beginning than I did at that exact point, but I wouldn't have continued getting this close to you if I didn't genuinely want to.",
    "I don't build things for every girl I know 😭😂. I genuinely love building things specifically for you, and even now, if I get an idea that I know you'll like, my first thought is usually, \"I should make this for her\" 😅.",
    "So maybe the starting point wasn't exactly the same from both our sides, but I don't think everything that happened after that was imaginary or meaningless. You became special to me because of everything that happened between us, not because of one chocolate or one website. 💙",
    "The moon is beautiful, isn't it........?"
];

export const openingMessage = messageParagraphs[0];
const stopTitles = [
    'Before we begin',
    'I did care',
    'I noticed you',
    'The quiet “what if”',
    'The chocolates',
    'The websites',
    'It wasn’t imagined',
    'Made for you',
    'What was real',
    'The moon'
];
export const messageStops = stopTitles.map((title, index) => ({ title, text: messageParagraphs[index] }));

// Typing and automatic progression share the journey clock. Map selections
// reveal immediately so quick navigation still works while driving is paused.
export function createMessageSequence(container, text) {
    let index = 0;
    let remaining = 0;
    let automatic = false;
    let started = false;
    let suspended = false;
    let readingPaused = false;
    const visited = new Set([0]); // The opening paragraph is read before Enter.
    const listeners = new Set();
    const stream = createTextStream(text, {
        interactionTarget: container,
        scrollContainer: container,
        onComplete({ skipped }) {
            // Instant/reduced-motion reveals still need enough time to read.
            if (skipped) remaining = 3 + messageStops[index].text.length * 0.07;
        }
    });

    function readingHold() {
        return Math.max(4, Math.min(8, messageStops[index].text.split(/\s+/u).length * 0.07));
    }

    function getState() {
        return {
            index, automatic, started, streaming: stream.isStreaming,
            count: messageStops.length,
            title: messageStops[index].title,
            isFirst: index === 0,
            isLast: index === messageStops.length - 1,
            visited: [...visited]
        };
    }

    function notify() {
        const state = getState();
        listeners.forEach(listener => listener(state));
    }

    function show(nextIndex, immediate = false) {
        index = nextIndex;
        visited.add(index);
        remaining = readingHold();
        readingPaused = false;
        if (index === messageStops.length - 1) automatic = false;
        container.classList.replace('subtitle-hidden', 'subtitle-visible');
        stream.start(messageStops[index].text, { immediate });
        notify();
    }

    function select(nextIndex) {
        if (!started || !Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex >= messageStops.length) return;
        automatic = false;
        show(nextIndex, true);
    }

    return {
        start() {
            if (started) return;
            started = true;
            automatic = true;
            show(1); // Continue after the paragraph already shown in the intro.
        },
        getState,
        subscribe(listener) {
            listeners.add(listener);
            listener(getState());
            return () => listeners.delete(listener);
        },
        select,
        previous() { select(index - 1); },
        next() { select(index + 1); },
        setAutomatic(enabled) {
            if (!started) return;
            automatic = Boolean(enabled) && index < messageStops.length - 1;
            readingPaused = !enabled;
            // Resume unfinished typing at its current word. A paragraph chosen
            // from the map gets a full reading interval before moving on.
            remaining = stream.isStreaming ? readingHold() : 3 + messageStops[index].text.length * 0.07;
            notify();
        },
        setSuspended(value) { suspended = value; },
        update(delta) {
            if (!started || suspended || readingPaused) return;
            const unused = stream.update(delta);
            if (stream.isStreaming || !automatic) return;
            // Start the reading pause after the last word has appeared.
            remaining -= unused;
            if (remaining <= 0) show(index + 1);
        },
        dispose() {
            automatic = false;
            stream.dispose();
            listeners.clear();
        }
    };
}
