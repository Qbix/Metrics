/**
 * Metrics.ScrollTracker — Section-aware scroll telemetry
 * 
 * Standalone module that tracks which sections a user reads,
 * how far they scroll, and what they click. Works with or without
 * the Q framework.
 * 
 * Usage (standalone):
 *   var tracker = Metrics.ScrollTracker.init({
 *     endpoint: 'https://example.com/telemetry.php',
 *     page: document.title,
 *     sections: 'h2[id], h3[id]',
 *     debounce: 1000
 *   });
 * 
 * Usage (with Q framework):
 *   // Auto-initializes from Metrics config if Q is present
 *   // Override via Q.Metrics.scrollTracker config
 * 
 * @module Metrics
 * @class Metrics.ScrollTracker
 */
"use strict";
(function (root) {

var Metrics = root.Metrics || (root.Q && root.Q.Metrics) || {};
if (!root.Metrics) root.Metrics = Metrics;

var defaults = {
	// Telemetry endpoint — receives POST with JSON body
	endpoint: null,

	// Page identifier sent with every event
	page: null,

	// CSS selector for sections to track
	// Sections must have an id attribute (or one will be generated)
	sections: 'h2[id], h3[id], section[id], [data-section]',

	// Minimum pixel height for auto-detected containers to count as sections
	minSectionHeight: 100,

	// Milliseconds to wait after scroll stops before firing telemetry
	debounce: 1000,

	// Milliseconds to wait on page load before starting (ignores scroll restoration)
	initDelay: 800,

	// Milliseconds to wait after anchor click before resuming tracking
	// (prevents intermediate sections firing during smooth scroll)
	anchorCooldown: 1500,

	// Scroll depth milestones to report (percentage)
	depthMilestones: [25, 50, 75, 100],

	// Maximum distance (px) a section heading can be above viewport top
	// and still be considered the "current" section
	sectionLookback: 300,

	// Tolerance in pixels — scroll considered "settled" if moved less than this
	settleTolerance: 2,

	// Recheck interval when scroll hasn't settled yet
	recheckInterval: 500,

	// Whether to track link clicks (anchor and external)
	trackClicks: true,

	// Whether to send a beacon on page unload
	trackUnload: true,

	// Whether to handle bfcache (pageshow) to avoid double-submitting
	handleBfcache: true,

	// Session ID storage key (sessionStorage)
	sessionKey: 'metrics_sid',

	// Custom session ID (overrides sessionStorage generation)
	sessionId: null,

	// Extra data to include with every event
	extra: null,

	// Callback before sending — return false to suppress
	// function(eventType, label, data) { return true; }
	onBeforeSend: null,

	// Visual TOC highlighting — if provided, keeps this selector's
	// active class updated in real-time (not debounced)
	tocSelector: null,
	tocActiveClass: 'active',
	tocSectionSelector: 'h2[id]' // which sections drive TOC highlighting
};

// ── State ──
var state = {
	initialized: false,
	sid: null,
	options: null,
	sections: [],
	tocSections: [],
	seen: {},
	depthHit: {},
	scrollTimer: null,
	anchorCooling: false,
	unloaded: false,
	startTime: 0,
	lastEventTime: 0
};

// ── Utilities ──

function extend(target, source) {
	for (var key in source) {
		if (source.hasOwnProperty(key) && source[key] !== undefined) {
			target[key] = source[key];
		}
	}
	return target;
}

function generateId() {
	return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

function getSessionId(opts) {
	if (opts.sessionId) return opts.sessionId;
	try {
		var sid = sessionStorage.getItem(opts.sessionKey);
		if (!sid) {
			sid = generateId();
			sessionStorage.setItem(opts.sessionKey, sid);
		}
		return sid;
	} catch (e) {
		return generateId();
	}
}

function send(label, eventData) {
	var opts = state.options;
	if (!opts || !opts.endpoint || state.unloaded) return;

	if (opts.onBeforeSend) {
		var type = label.split(':')[0];
		if (opts.onBeforeSend(type, label, eventData) === false) return;
	}

	var payload = {
		session: state.sid,
		page: opts.page || document.title,
		label: label,
		t: Date.now()
	};
	if (opts.extra) payload.extra = opts.extra;
	if (eventData) payload.data = eventData;

	var body = JSON.stringify(payload);
	try {
		if (navigator.sendBeacon) {
			navigator.sendBeacon(opts.endpoint, new Blob([body], { type: 'text/plain' }));
		} else {
			fetch(opts.endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'text/plain' },
				keepalive: true,
				body: body
			});
		}
	} catch (e) { /* silent */ }

	state.lastEventTime = Date.now();
}

// ── Section Discovery ──

function discoverSections(selector) {
	var elements = document.querySelectorAll(selector);
	var result = [];
	var ordinal = 0;

	elements.forEach(function (el) {
		// Skip tiny elements
		if (el.offsetHeight < (state.options.minSectionHeight || 0)) return;

		// Ensure an id
		if (!el.id) {
			var text = (el.textContent || '').trim().slice(0, 60);
			var slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
			el.id = slug || ('section-' + ordinal);
		}

		// Extract a snippet for identification
		var snippet = (el.textContent || '').trim().slice(0, 80);

		result.push({
			el: el,
			id: el.id,
			tag: el.tagName.toLowerCase(),
			ordinal: ordinal++,
			snippet: snippet
		});
	});

	return result;
}

// ── Find Current Section (nearest heading to viewport top) ──

function findCurrentSection() {
	var scrollY = window.scrollY || window.pageYOffset;
	var opts = state.options;
	var best = null;
	var bestDist = Infinity;

	state.sections.forEach(function (sec) {
		var top = sec.el.offsetTop;
		// Section heading must be above viewport top + lookback tolerance
		if (top <= scrollY + opts.sectionLookback) {
			var dist = Math.abs(top - scrollY - 180);
			if (dist < bestDist) {
				bestDist = dist;
				best = sec;
			}
		}
	});

	return best;
}

// ── Scroll Settle Detection ──

function onScrollSettle() {
	var opts = state.options;
	var curY = window.scrollY || window.pageYOffset;

	if (Math.abs(curY - state._prevY) > opts.settleTolerance) {
		// Still moving — recheck
		state._prevY = curY;
		state.scrollTimer = setTimeout(onScrollSettle, opts.recheckInterval);
		return;
	}

	// Settled — report current section
	var current = findCurrentSection();
	if (current && !state.seen[current.id]) {
		state.seen[current.id] = true;
		send('section:' + current.id, {
			tag: current.tag,
			ordinal: current.ordinal,
			snippet: current.snippet
		});
	}

	// Report depth milestones
	var docH = document.documentElement.scrollHeight - window.innerHeight;
	if (docH > 0) {
		var pct = Math.round((curY / docH) * 100);
		opts.depthMilestones.forEach(function (m) {
			if (pct >= m && !state.depthHit[m]) {
				state.depthHit[m] = true;
				send('depth:' + m + '%');
			}
		});
	}
}

function onScroll() {
	if (state.anchorCooling) return;
	clearTimeout(state.scrollTimer);
	state._prevY = window.scrollY || window.pageYOffset;
	state.scrollTimer = setTimeout(onScrollSettle, state.options.debounce);
}

// ── TOC Highlighting (real-time, not debounced) ──

function updateTocHighlight() {
	var opts = state.options;
	if (!opts.tocSelector) return;

	var scrollY = window.scrollY || window.pageYOffset;
	var currentId = '';

	state.tocSections.forEach(function (sec) {
		if (scrollY >= sec.el.offsetTop - 160) {
			currentId = sec.id;
		}
	});

	var links = document.querySelectorAll(opts.tocSelector);
	links.forEach(function (link) {
		link.classList.remove(opts.tocActiveClass);
		if (link.getAttribute('href') === '#' + currentId) {
			link.classList.add(opts.tocActiveClass);
		}
	});
}

// ── Click Tracking ──

function onDocumentClick(e) {
	var a = e.target.closest('a[href]');
	if (!a) return;

	var href = a.getAttribute('href') || '';

	// Anchor click — set cooling period to suppress scroll tracking
	if (href.charAt(0) === '#') {
		state.anchorCooling = true;
		setTimeout(function () {
			state.anchorCooling = false;
		}, state.options.anchorCooldown);

		send('anchor:' + href.slice(1));
		return;
	}

	// External/page link
	var label = a.dataset.track || 'link:' + href;
	send(label);
}

// ── Unload / bfcache ──

function onBeforeUnload() {
	if (state.unloaded) return;
	state.unloaded = true;

	var elapsed = Math.round((Date.now() - state.startTime) / 1000);
	send('unload', { timeOnPage: elapsed });
}

function onPageShow(e) {
	if (e.persisted) {
		// Restored from bfcache — reset unloaded flag but don't re-fire loaded
		state.unloaded = false;
		// Re-attach scroll listener in case it was cleaned up
		window.addEventListener('scroll', onScroll, { passive: true });
		if (state.options.tocSelector) {
			window.addEventListener('scroll', updateTocHighlight, { passive: true });
		}
	}
}

function onPageHide(e) {
	// More reliable than beforeunload in modern browsers
	if (!state.unloaded) {
		onBeforeUnload();
	}
}

// ── Pre-mark Initial State ──

function premarkInitialState() {
	var opts = state.options;
	var scrollY = window.scrollY || window.pageYOffset;

	// Mark sections already visible
	state.sections.forEach(function (sec) {
		var rect = sec.el.getBoundingClientRect();
		if (rect.top >= -100 && rect.top < window.innerHeight) {
			state.seen[sec.id] = true;
		}
	});

	// Mark depth milestones already reached
	var docH = document.documentElement.scrollHeight - window.innerHeight;
	if (docH > 0) {
		var pct = Math.round((scrollY / docH) * 100);
		opts.depthMilestones.forEach(function (m) {
			if (pct >= m) state.depthHit[m] = true;
		});
	}
}

// ── Public API ──

Metrics.ScrollTracker = {

	/**
	 * Initialize scroll tracking
	 * @param {Object} options — see defaults above
	 * @returns {Object} the ScrollTracker instance
	 */
	init: function (options) {
		if (state.initialized) {
			console.warn('Metrics.ScrollTracker already initialized');
			return this;
		}

		var opts = extend(extend({}, defaults), options || {});
		state.options = opts;
		state.sid = getSessionId(opts);
		state.startTime = Date.now();
		state.initialized = true;

		// Page identifier
		if (!opts.page) opts.page = document.title || location.pathname;

		// Send loaded event immediately
		send('loaded');

		// Delayed init — let browser scroll restoration settle
		setTimeout(function () {
			// Discover sections
			state.sections = discoverSections(opts.sections);

			// Discover TOC sections (may be different selector)
			if (opts.tocSelector && opts.tocSectionSelector) {
				state.tocSections = discoverSections(opts.tocSectionSelector);
			}

			// Pre-mark initial state
			premarkInitialState();

			// Attach scroll listener for telemetry (debounced)
			window.addEventListener('scroll', onScroll, { passive: true });

			// Attach scroll listener for TOC highlighting (real-time)
			if (opts.tocSelector) {
				window.addEventListener('scroll', updateTocHighlight, { passive: true });
				updateTocHighlight(); // initial highlight
			}
		}, opts.initDelay);

		// Click tracking (immediate, no delay needed)
		if (opts.trackClicks) {
			document.addEventListener('click', onDocumentClick);
		}

		// Unload tracking
		if (opts.trackUnload) {
			window.addEventListener('pagehide', onPageHide);
			window.addEventListener('beforeunload', onBeforeUnload);
		}

		// bfcache handling
		if (opts.handleBfcache) {
			window.addEventListener('pageshow', onPageShow);
		}

		return this;
	},

	/**
	 * Send a custom event
	 * @param {String} label — event label
	 * @param {Object} [data] — optional extra data
	 */
	send: function (label, data) {
		send(label, data);
	},

	/**
	 * Mark a section as seen (won't fire again)
	 * @param {String} sectionId
	 */
	markSeen: function (sectionId) {
		state.seen[sectionId] = true;
	},

	/**
	 * Get current session ID
	 * @returns {String}
	 */
	getSessionId: function () {
		return state.sid;
	},

	/**
	 * Get list of discovered sections
	 * @returns {Array}
	 */
	getSections: function () {
		return state.sections.map(function (s) {
			return { id: s.id, tag: s.tag, ordinal: s.ordinal, snippet: s.snippet };
		});
	},

	/**
	 * Get which sections have been seen
	 * @returns {Object} map of sectionId → true
	 */
	getSeen: function () {
		return extend({}, state.seen);
	},

	/**
	 * Reset tracking state (useful for SPA page transitions)
	 */
	reset: function () {
		state.seen = {};
		state.depthHit = {};
		state.anchorCooling = false;
		clearTimeout(state.scrollTimer);
		state.sections = discoverSections(state.options.sections);
		premarkInitialState();
	},

	/**
	 * Destroy — remove all listeners
	 */
	destroy: function () {
		window.removeEventListener('scroll', onScroll);
		window.removeEventListener('scroll', updateTocHighlight);
		document.removeEventListener('click', onDocumentClick);
		window.removeEventListener('pagehide', onPageHide);
		window.removeEventListener('beforeunload', onBeforeUnload);
		window.removeEventListener('pageshow', onPageShow);
		clearTimeout(state.scrollTimer);
		state.initialized = false;
	},

	/**
	 * Current defaults (read-only reference)
	 */
	defaults: defaults,

	/**
	 * Current state (for debugging)
	 */
	state: state
};

})(typeof window !== 'undefined' ? window : this);
