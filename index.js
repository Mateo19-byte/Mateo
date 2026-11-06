// =========================================================
//  ICE WEB  -  ai.js
//  This file is what makes the search box actually work.
//  Every part is explained in plain English so you can read
//  it and learn from it.
//
//  What it does:
//    - Searches when you press Enter or click the magnifier
//    - Sends searches to Google after a brief, branded search transition
//    - Quick-access tiles for YouTube, Gmail, Claude, GitHub, and TikTok
//    - Typing a site's name offers it as a Google search suggestion
//    - Remembers your recent searches
//    - Shows suggestions while you type
//    - Keyboard: "/" to start typing, arrow keys to pick, Esc to close
// =========================================================


// ---------------------------------------------------------
//  1. SETTINGS YOU CAN EDIT  (no coding knowledge needed)
// ---------------------------------------------------------

const SEARCH_URL       = "https://www.google.com/search?q=";
const MAX_HISTORY      = 8;          // how many recent searches to remember
const OPEN_IN_NEW_TAB  = false;      // true = quick links open in a new tab
const LIVE_SUGGESTIONS = true;       // false = no suggestions from the internet while typing
                                     // (your own recent searches still show)

// Where the live suggestions come from (DuckDuckGo's free suggestion service).
const SUGGESTION_URL = "https://duckduckgo.com/ac/?q=";

// The quick-access tiles under the search box.
//   name     = the label shown under the tile
//   url      = where the tile takes you
//   keywords = words that make this site show in the search suggestions
// To add a site: copy a line, change the parts, and keep the commas.
const SHORTCUTS = [
    { name: "YouTube",   url: "https://www.youtube.com/",      keywords: ["youtube", "yt"] },
    { name: "Gmail",     url: "https://mail.google.com/",      keywords: ["gmail"] },
    { name: "Claude",    url: "https://claude.ai/",            keywords: ["claude", "anthropic"] },
    { name: "GitHub",    url: "https://github.com/",           keywords: ["github"] },
    { name: "TikTok",    url: "https://www.tiktok.com/",       keywords: ["tiktok"] }
];

const SHOW_SITE_ICONS = true;    // true = show each site's real logo (fetched from Google's icon service)
                                 // false = show a plain letter instead
const ICON_SERVICE = "https://www.google.com/s2/favicons?sz=64&domain=";


// ---------------------------------------------------------
//  2. GRAB THE PIECES OF THE PAGE WE NEED
//  (the ids match the ones written in ai.html)
// ---------------------------------------------------------
const form       = document.getElementById("search-form");
const input      = document.getElementById("search-input");
const clearBtn   = document.getElementById("clear-btn");
const list       = document.getElementById("suggestions");
const shortcutsBox = document.getElementById("shortcuts");
const themeToggle = document.getElementById("theme-toggle");
const searchStatus = document.getElementById("search-status");


// ---------------------------------------------------------
//  3. THINGS THE PAGE REMEMBERS WHILE IT IS OPEN
// ---------------------------------------------------------
const KEY_HISTORY = "iceweb.history";
const KEY_THEME   = "iceweb.theme";

let history       = loadHistory();  // your recent searches (newest first)
let items         = [];             // the rows showing in the dropdown
let activeIndex   = -1;             // which row is highlighted (-1 = none)
let liveResults   = [];             // suggestions that came from the internet
let liveFor       = "";             // the words those suggestions were for
let liveCounter   = 0;              // lets us ignore slow, out-of-date replies
let typingTimer   = null;           // waits a moment after you stop typing
let redirectTimer = null;


// ---------------------------------------------------------
//  4. SAVING AND LOADING (so your choices survive a refresh)
//  "try / catch" just means: if the browser refuses, carry on anyway.
// ---------------------------------------------------------
function save(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        // saving isn't possible (private window, for example) - that's fine
    }
}

function load(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch (error) {
        return fallback;
    }
}

function loadHistory() {
    const saved = load(KEY_HISTORY, []);
    if (!Array.isArray(saved)) return [];
    return saved.filter(function (word) { return typeof word === "string"; })
                .slice(0, MAX_HISTORY);
}

function applyTheme(themeName) {
    const isDay = themeName === "day";
    document.body.dataset.theme = isDay ? "day" : "night";

    if (themeToggle) {
        const text = themeToggle.querySelector(".theme-toggle-text");
        themeToggle.setAttribute("aria-pressed", String(isDay));
        themeToggle.setAttribute("aria-label", isDay ? "Switch to night mode" : "Switch to day mode");
        if (text) text.textContent = isDay ? "Day" : "Night";
    }
}

function loadTheme() {
    const saved = load(KEY_THEME, "night");
    return saved === "day" ? "day" : "night";
}

function toggleTheme() {
    const nextTheme = document.body.dataset.theme === "day" ? "night" : "day";
    save(KEY_THEME, nextTheme);
    applyTheme(nextTheme);
}

// ---------------------------------------------------------
//  5b. PLATFORM SHORTCUTS (YouTube, Gmail, WhatsApp...)
// ---------------------------------------------------------

// "https://www.youtube.com/watch" -> "youtube.com"
function hostOf(address) {
    try {
        return new URL(address).hostname.replace(/^www\./, "");
    } catch (error) {
        return address;
    }
}

// Draws the row of tiles. Each tile is a normal link, so one click opens the site.
function renderShortcuts() {
    shortcutsBox.textContent = "";

    SHORTCUTS.forEach(function (site) {
        const link = document.createElement("a");
        link.className = "shortcut";
        link.href = site.url;
        if (OPEN_IN_NEW_TAB) {
            link.target = "_blank";
            link.rel = "noopener noreferrer";
        }

        const tile = document.createElement("span");
        tile.className = "tile";

        // The first letter shows if the logo can't be loaded (for example, when you're offline)
        const letter = document.createElement("span");
        letter.className = "tile-letter";
        letter.textContent = site.name.charAt(0);
        tile.appendChild(letter);

        if (SHOW_SITE_ICONS) {
            const logo = document.createElement("img");
            logo.alt = "";
            logo.width = 28;
            logo.height = 28;
            logo.addEventListener("load", function () { tile.classList.add("has-icon"); });
            logo.addEventListener("error", function () { logo.remove(); });
            logo.src = ICON_SERVICE + encodeURIComponent(site.iconDomain || hostOf(site.url));
            tile.appendChild(logo);
        }

        const name = document.createElement("span");
        name.className = "shortcut-name";
        name.textContent = site.name;

        link.appendChild(tile);
        link.appendChild(name);
        shortcutsBox.appendChild(link);
    });
}

// Typed the start of a site's name ("you")? Gives back up to 2 matching sites for the dropdown.
function matchSites(lower) {
    if (lower.length < 2) return [];

    return SHORTCUTS.filter(function (site) {
        const nameMatches    = site.name.toLowerCase().indexOf(lower) === 0;
        const keywordMatches = site.keywords.some(function (word) { return word.indexOf(lower) === 0; });
        return nameMatches || keywordMatches;
    }).slice(0, 2);
}


// ---------------------------------------------------------
//  7. DOING THE SEARCH
// ---------------------------------------------------------
function runSearch(rawText) {
    const text = rawText.trim();

    // Nothing typed? Just put the cursor in the box.
    if (text === "") {
        input.focus();
        return;
    }

    addToHistory(text);
    closeList();
    clearTimeout(redirectTimer);
    searchStatus.hidden = false;
    searchStatus.textContent = "Searching Google for “" + text + "”…";
    redirectTimer = setTimeout(function () {
        redirectTimer = null;
        window.location.href = SEARCH_URL + encodeURIComponent(text);
    }, 650);
}

// Searches the selected suggestion with Google.
function choose(item) {
    runSearch(item.text);
}


// ---------------------------------------------------------
//  8. RECENT SEARCHES
// ---------------------------------------------------------
function addToHistory(text) {
    // remove it if it's already there, then put it at the front
    history = history.filter(function (word) {
        return word.toLowerCase() !== text.toLowerCase();
    });
    history.unshift(text);
    history = history.slice(0, MAX_HISTORY);
    save(KEY_HISTORY, history);
}

function clearHistory() {
    history = [];
    save(KEY_HISTORY, history);
    renderList();
}


// ---------------------------------------------------------
//  9. SUGGESTIONS FROM THE INTERNET
//  We ask DuckDuckGo "what do people search that starts with this?"
//  If it can't be reached, nothing breaks - you just see your own history.
// ---------------------------------------------------------
let scriptCounter = 0;

function fetchSuggestions(text, whenDone) {
    scriptCounter++;
    const callbackName = "iceWebSuggest" + scriptCounter;
    const script = document.createElement("script");
    let finished = false;

    function finish(words) {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        window[callbackName] = function () {};   // ignore anything that arrives late
        script.remove();
        whenDone(words);
    }

    const timeout = setTimeout(function () { finish([]); }, 3000);   // give up after 3 seconds
    window[callbackName] = function (data) { finish(readSuggestions(data)); };
    script.onerror = function () { finish([]); };

    script.src = SUGGESTION_URL + encodeURIComponent(text) + "&callback=" + callbackName;
    document.head.appendChild(script);
}

// Turns the reply from the suggestion service into a plain list of words.
function readSuggestions(data) {
    const words = [];

    if (Array.isArray(data)) {
        const first = data[0];
        if (first && typeof first === "object" && typeof first.phrase === "string") {
            data.forEach(function (item) {
                if (item && typeof item.phrase === "string") words.push(item.phrase);
            });
        } else if (Array.isArray(data[1])) {
            data[1].forEach(function (word) {
                if (typeof word === "string") words.push(word);
            });
        }
    }
    return words.slice(0, 6);
}

// Called after you type: wait a moment, then ask for suggestions.
function askForSuggestions() {
    clearTimeout(typingTimer);
    const text = input.value.trim();

    if (!LIVE_SUGGESTIONS || text === "") {
        liveCounter++;          // makes any reply that's still on its way get ignored
        liveResults = [];
        liveFor = "";
        return;
    }

    typingTimer = setTimeout(function () {
        const ticket = ++liveCounter;
        fetchSuggestions(text, function (words) {
            if (ticket !== liveCounter) return;      // you typed more since - ignore this reply
            liveResults = words;
            liveFor = text;
            renderList();
        });
    }, 150);
}


// ---------------------------------------------------------
//  10. THE DROPDOWN LIST
// ---------------------------------------------------------
const ICON_CLOCK  = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
const ICON_SEARCH = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>';
const ICON_GO     = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>';

function isOpen() {
    return list.classList.contains("show");
}

function closeList() {
    list.classList.remove("show");
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    activeIndex = -1;
}

// Works out which rows to show right now.
function buildItems() {
    const text  = input.value.trim();
    const lower = text.toLowerCase();
    const rows  = [];
    const seen  = new Set();          // so the same words never show twice

    function add(word, kind, url) {
        const key = word.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        rows.push({ text: word, kind: kind, url: url });
    }

    // Sites that match what you typed (typing "you" offers YouTube)
    matchSites(lower).forEach(function (site) {
        add(site.name, "site", site.url);
    });

    // Your own recent searches: all of them if the box is empty,
    // otherwise only the ones that contain what you typed (max 3).
    let shown = 0;
    history.forEach(function (word) {
        const matches = lower === "" || word.toLowerCase().indexOf(lower) !== -1;
        if (matches && (lower === "" || shown < 3)) {
            add(word, "history");
            shown++;
        }
    });

    // Suggestions from the internet
    if (lower !== "") {
        const fresh = liveFor === text;     // are they for exactly what's typed now?
        liveResults.forEach(function (word) {
            if (fresh || word.toLowerCase().indexOf(lower) !== -1) add(word, "suggestion");
        });
    }

    return rows;
}

// Draws the dropdown.
function renderList() {
    // remember the highlighted row so it stays highlighted after a refresh
    const previous = items[activeIndex] ? items[activeIndex].text : null;

    items = buildItems();
    activeIndex = -1;
    for (let i = 0; i < items.length; i++) {
        if (items[i].text === previous) activeIndex = i;
    }

    // Only show the list while the cursor is in the box and there is something to show
    if (items.length === 0 || document.activeElement !== input) {
        closeList();
        return;
    }

    list.textContent = "";

    // "Recent searches   Clear" row at the top (only when the box is empty)
    if (input.value.trim() === "") {
        const heading = document.createElement("li");
        heading.className = "heading";
        heading.setAttribute("role", "presentation");
        heading.innerHTML = '<span>Recent searches</span><button type="button" class="clear-history">Clear</button>';
        list.appendChild(heading);
    }

    items.forEach(function (item, index) {
        const row = document.createElement("li");
        row.id = "suggestion-" + index;
        row.setAttribute("role", "option");
        row.dataset.index = index;
        const icon = item.kind === "history" ? ICON_CLOCK : item.kind === "site" ? ICON_GO : ICON_SEARCH;
        row.innerHTML = icon + '<span class="label"></span>';
        row.querySelector(".label").textContent = item.text;     // textContent is the safe way to show typed text

        // Site rows also show the web address on the right (youtube.com)
        if (item.kind === "site") {
            const domain = document.createElement("span");
            domain.className = "domain";
            domain.textContent = hostOf(item.url);
            row.appendChild(domain);
        }
        list.appendChild(row);
    });

    list.classList.add("show");
    input.setAttribute("aria-expanded", "true");
    highlight(false);
}

// Colours the highlighted row. "scroll" = also scroll it into view (for the arrow keys).
function highlight(scroll) {
    const rows = list.querySelectorAll("li[role='option']");

    rows.forEach(function (row, index) {
        row.classList.toggle("active", index === activeIndex);
        row.setAttribute("aria-selected", index === activeIndex ? "true" : "false");
    });

    if (activeIndex >= 0 && rows[activeIndex]) {
        input.setAttribute("aria-activedescendant", rows[activeIndex].id);
        if (scroll) rows[activeIndex].scrollIntoView({ block: "nearest" });
    } else {
        input.removeAttribute("aria-activedescendant");
    }
}

// Moves the highlight up (-1) or down (+1), wrapping around at the ends.
function moveHighlight(step) {
    if (items.length === 0) return;

    if (activeIndex === -1) {
        activeIndex = step === 1 ? 0 : items.length - 1;
    } else {
        activeIndex = (activeIndex + step + items.length) % items.length;
    }
    highlight(true);
}


// ---------------------------------------------------------
//  11. LISTENING FOR WHAT YOU DO
// ---------------------------------------------------------
// You press Enter or click the magnifier.
form.addEventListener("submit", function (event) {
    event.preventDefault();                        // stop the browser's plain default search
    const picked = items[activeIndex];             // a highlighted row wins over the typed words
    if (picked) {
        choose(picked);
    } else {
        runSearch(input.value);
    }
});

// You type.
input.addEventListener("input", function () {
    clearTimeout(redirectTimer);
    redirectTimer = null;
    searchStatus.hidden = true;
    activeIndex = -1;
    renderList();
    askForSuggestions();
});

// You click into the box.
input.addEventListener("focus", function () {
    renderList();
});

// You click somewhere else.
input.addEventListener("blur", function () {
    closeList();
});

// Arrow keys and Esc inside the box.
input.addEventListener("keydown", function (event) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (!isOpen()) {
            renderList();                          // reopen the list first
            return;
        }
        moveHighlight(event.key === "ArrowDown" ? 1 : -1);
    }

    if (event.key === "Escape") {
        event.preventDefault();                    // stops Chrome wiping the box by itself, so we control the steps
        if (redirectTimer !== null) {
            clearTimeout(redirectTimer);
            redirectTimer = null;
            searchStatus.hidden = true;
        }
        if (isOpen()) {
            closeList();                           // 1st Esc: close the list
        } else if (input.value !== "") {
            input.value = "";                      // 2nd Esc: clear the words
            liveResults = [];
            liveFor = "";
        } else {
            input.blur();                          // 3rd Esc: leave the box
        }
    }
});

// The little "x" button.
clearBtn.addEventListener("click", function () {
    input.value = "";
    liveResults = [];
    liveFor = "";
    liveCounter++;
    clearTimeout(redirectTimer);
    redirectTimer = null;
    searchStatus.hidden = true;
    input.focus();
    renderList();
});

// Clicking inside the dropdown.
// "mousedown" is stopped so the cursor stays in the box and the list doesn't vanish before the click lands.
list.addEventListener("mousedown", function (event) {
    event.preventDefault();
});

list.addEventListener("click", function (event) {
    if (event.target.closest(".clear-history")) {
        clearHistory();
        return;
    }
    const row = event.target.closest("li[role='option']");
    if (row) choose(items[Number(row.dataset.index)]);
});

list.addEventListener("mouseover", function (event) {
    const row = event.target.closest("li[role='option']");
    if (row) {
        activeIndex = Number(row.dataset.index);
        highlight(false);
    }
});

// Press "/" anywhere on the page to jump into the search box.
document.addEventListener("keydown", function (event) {
    const tag = document.activeElement ? document.activeElement.tagName : "";
    const alreadyTyping = tag === "INPUT" || tag === "TEXTAREA" || (document.activeElement && document.activeElement.isContentEditable);

    if (event.key === "/" && !alreadyTyping && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        input.focus();
        input.select();
    }
});


// ---------------------------------------------------------
//  12. START UP
// ---------------------------------------------------------
applyTheme(loadTheme());
if (themeToggle) {
    themeToggle.addEventListener("click", toggleTheme);
}
renderShortcuts();