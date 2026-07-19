/**
 * Metrics.MediaTracker — Track video/audio engagement
 * 
 * Auto-discovers native <video>/<audio> elements and YouTube/Vimeo
 * iframes. Hooks into play/pause/seek/ended events and sends
 * periodic checkpoints during playback.
 * 
 * Events:
 *   media-play:id       — playback started
 *   media-pause:id      — playback paused
 *   media-checkpoint:id — periodic position update during playback
 *   media-ended:id      — reached the end
 *   media-seeked:id     — user jumped to a position
 * 
 * Usage:
 *   Metrics.init({ endpoint: '/telemetry.php' });
 *   Metrics.MediaTracker.init({
 *     checkpointInterval: 10,  // seconds
 *     reloadIframes: false     // don't reload to inject API params
 *   });
 * 
 * @module Metrics
 * @class Metrics.MediaTracker
 */
"use strict";
(function (root) {

var Metrics = root.Metrics;
if (!Metrics) {
	console.warn('Metrics.MediaTracker: Metrics core not loaded');
	return;
}

var defaults = {
	// Seconds between checkpoint events during playback
	checkpointInterval: 10,

	// Auto-discover media elements on init
	autoDiscover: true,

	// CSS selector for native media elements
	mediaSelector: 'video, audio',

	// Whether to reload YouTube/Vimeo iframes to inject API params
	// Default false: logs a warning instead of disrupting playback
	reloadIframes: false,

	// Observe DOM for dynamically added media
	observeDom: true,

	// Root element to watch for mutations
	observeRoot: null,

	// Debounce checkpoint sends (ms) — prevents burst on rapid seeks
	checkpointDebounce: 1000
};

// ── State ──
var state = {
	initialized: false,
	options: null,
	tracked: {},       // id → tracker object
	_counter: 0,       // for generating IDs
	_mutationObserver: null,
	_ytApiLoaded: false,
	_ytApiLoading: false,
	_ytPendingPlayers: [], // iframes waiting for API
	_vimeoApiLoaded: false,
	_vimeoApiLoading: false
};

// ── Utilities ──

function genId(el) {
	if (el.id) return el.id;
	var src = el.src || el.currentSrc || '';
	if (src) {
		// Extract meaningful part of URL
		var match = src.match(/(?:youtu\.be\/|youtube\.com\/embed\/|vimeo\.com\/video\/|vimeo\.com\/)([^?&#]+)/);
		if (match) return match[1];
		// Use filename
		var parts = src.split('/').pop().split('?')[0];
		if (parts && parts.length < 60) return parts;
	}
	return 'media-' + (state._counter++);
}

function now() { return Date.now(); }

// ── Watched Seconds Tracker ──
// Tracks unique seconds viewed (handles seeking/rewatching)

function WatchedTracker() {
	this.ranges = []; // [{start, end}] sorted, non-overlapping
}

WatchedTracker.prototype.add = function (from, to) {
	if (to <= from) return;
	var newRange = { start: Math.floor(from), end: Math.ceil(to) };
	var merged = [];
	var inserted = false;
	for (var i = 0; i < this.ranges.length; i++) {
		var r = this.ranges[i];
		if (r.end < newRange.start) {
			merged.push(r);
		} else if (r.start > newRange.end) {
			if (!inserted) { merged.push(newRange); inserted = true; }
			merged.push(r);
		} else {
			newRange.start = Math.min(newRange.start, r.start);
			newRange.end = Math.max(newRange.end, r.end);
		}
	}
	if (!inserted) merged.push(newRange);
	this.ranges = merged;
};

WatchedTracker.prototype.total = function () {
	var t = 0;
	for (var i = 0; i < this.ranges.length; i++) {
		t += this.ranges[i].end - this.ranges[i].start;
	}
	return t;
};

// ── Core Tracker Object (per media element) ──

function createTracker(id, type, el, duration) {
	return {
		id: id,
		type: type,           // 'native', 'youtube', 'vimeo'
		el: el,
		duration: duration || 0,
		playing: false,
		lastPosition: 0,
		lastCheckpointAt: 0,  // timestamp of last checkpoint send
		watched: new WatchedTracker(),
		checkpointTimer: null,
		_lastTimeUpdate: 0    // position at last timeupdate
	};
}

function sendEvent(tracker, event, extra) {
	var data = {
		type: tracker.type,
		position: Math.round(tracker.lastPosition),
		duration: Math.round(tracker.duration),
		watched: tracker.watched.total()
	};
	if (extra) {
		for (var k in extra) data[k] = extra[k];
	}
	Metrics.send(event + ':' + tracker.id, data);
}

// ── Checkpoint Timer ──

function startCheckpoints(tracker) {
	stopCheckpoints(tracker);
	var interval = state.options.checkpointInterval * 1000;
	tracker.checkpointTimer = setInterval(function () {
		if (tracker.playing) {
			sendEvent(tracker, 'media-checkpoint');
		}
	}, interval);
}

function stopCheckpoints(tracker) {
	if (tracker.checkpointTimer) {
		clearInterval(tracker.checkpointTimer);
		tracker.checkpointTimer = null;
	}
}

// ── Native <video> / <audio> ──

function trackNative(el) {
	var id = genId(el);
	if (state.tracked[id]) return; // already tracking

	var tracker = createTracker(id, 'native', el, el.duration || 0);
	state.tracked[id] = tracker;

	el.addEventListener('loadedmetadata', function () {
		tracker.duration = el.duration || 0;
	});

	el.addEventListener('play', function () {
		tracker.playing = true;
		tracker.lastPosition = el.currentTime;
		tracker._lastTimeUpdate = el.currentTime;
		sendEvent(tracker, 'media-play');
		startCheckpoints(tracker);
	});

	el.addEventListener('pause', function () {
		if (!tracker.playing) return;
		tracker.playing = false;
		tracker.watched.add(tracker._lastTimeUpdate, el.currentTime);
		tracker.lastPosition = el.currentTime;
		stopCheckpoints(tracker);
		sendEvent(tracker, 'media-pause');
	});

	el.addEventListener('ended', function () {
		tracker.playing = false;
		tracker.watched.add(tracker._lastTimeUpdate, el.currentTime);
		tracker.lastPosition = el.currentTime;
		stopCheckpoints(tracker);
		sendEvent(tracker, 'media-ended');
	});

	el.addEventListener('seeked', function () {
		var from = tracker.lastPosition;
		tracker.lastPosition = el.currentTime;
		tracker._lastTimeUpdate = el.currentTime;
		sendEvent(tracker, 'media-seeked', {
			from: Math.round(from),
			to: Math.round(el.currentTime)
		});
	});

	el.addEventListener('timeupdate', function () {
		// Track watched range
		if (tracker.playing && el.currentTime > tracker._lastTimeUpdate) {
			tracker.watched.add(tracker._lastTimeUpdate, el.currentTime);
		}
		tracker._lastTimeUpdate = el.currentTime;
		tracker.lastPosition = el.currentTime;
	});
}

// ── YouTube Iframe ──

function loadYouTubeAPI(callback) {
	if (state._ytApiLoaded) { callback(); return; }
	if (state._ytApiLoading) {
		state._ytPendingPlayers.push(callback);
		return;
	}
	state._ytApiLoading = true;

	var prev = root.onYouTubeIframeAPIReady;
	root.onYouTubeIframeAPIReady = function () {
		state._ytApiLoaded = true;
		state._ytApiLoading = false;
		if (prev) prev();
		callback();
		for (var i = 0; i < state._ytPendingPlayers.length; i++) {
			state._ytPendingPlayers[i]();
		}
		state._ytPendingPlayers = [];
	};

	var script = document.createElement('script');
	script.src = 'https://www.youtube.com/iframe_api';
	document.head.appendChild(script);
}

function trackYouTube(iframe) {
	var src = iframe.src || '';
	var id = genId(iframe);
	if (state.tracked[id]) return;

	// Check for enablejsapi=1
	if (src.indexOf('enablejsapi') === -1) {
		if (state.options.reloadIframes) {
			var separator = src.indexOf('?') === -1 ? '?' : '&';
			iframe.src = src + separator + 'enablejsapi=1&origin=' + encodeURIComponent(location.origin);
			// iframe will reload, we'll catch it again via mutation observer or re-scan
		} else {
			console.warn('Metrics.MediaTracker: YouTube iframe missing enablejsapi=1, '
				+ 'set reloadIframes:true to auto-fix. iframe:', iframe);
			return;
		}
	}

	// Ensure iframe has an id for the YT API
	if (!iframe.id) iframe.id = 'yt-' + id;

	loadYouTubeAPI(function () {
		if (state.tracked[id]) return;
		var tracker = createTracker(id, 'youtube', iframe, 0);
		state.tracked[id] = tracker;

		var player = new YT.Player(iframe.id, {
			events: {
				onReady: function (e) {
					tracker.duration = player.getDuration() || 0;
				},
				onStateChange: function (e) {
					var pos = player.getCurrentTime() || 0;
					tracker.lastPosition = pos;

					switch (e.data) {
						case YT.PlayerState.PLAYING:
							tracker.playing = true;
							tracker._lastTimeUpdate = pos;
							tracker.duration = player.getDuration() || tracker.duration;
							sendEvent(tracker, 'media-play');
							startCheckpoints(tracker);
							// Poll position since YT has no timeupdate
							tracker._pollTimer = setInterval(function () {
								var p = player.getCurrentTime() || 0;
								if (tracker.playing && p > tracker._lastTimeUpdate) {
									tracker.watched.add(tracker._lastTimeUpdate, p);
								}
								tracker._lastTimeUpdate = p;
								tracker.lastPosition = p;
							}, 1000);
							break;

						case YT.PlayerState.PAUSED:
							if (!tracker.playing) break;
							tracker.playing = false;
							tracker.watched.add(tracker._lastTimeUpdate, pos);
							stopCheckpoints(tracker);
							clearInterval(tracker._pollTimer);
							sendEvent(tracker, 'media-pause');
							break;

						case YT.PlayerState.ENDED:
							tracker.playing = false;
							tracker.watched.add(tracker._lastTimeUpdate, pos);
							stopCheckpoints(tracker);
							clearInterval(tracker._pollTimer);
							sendEvent(tracker, 'media-ended');
							break;
					}
				}
			}
		});
		tracker._player = player;
	});
}

// ── Vimeo Iframe ──

function loadVimeoAPI(callback) {
	if (state._vimeoApiLoaded) { callback(); return; }
	if (state._vimeoApiLoading) {
		setTimeout(function () { loadVimeoAPI(callback); }, 200);
		return;
	}
	state._vimeoApiLoading = true;

	var script = document.createElement('script');
	script.src = 'https://player.vimeo.com/api/player.js';
	script.onload = function () {
		state._vimeoApiLoaded = true;
		state._vimeoApiLoading = false;
		callback();
	};
	document.head.appendChild(script);
}

function trackVimeo(iframe) {
	var src = iframe.src || '';
	var id = genId(iframe);
	if (state.tracked[id]) return;

	loadVimeoAPI(function () {
		if (state.tracked[id]) return;
		var tracker = createTracker(id, 'vimeo', iframe, 0);
		state.tracked[id] = tracker;

		var player = new Vimeo.Player(iframe);
		tracker._player = player;

		player.getDuration().then(function (d) { tracker.duration = d || 0; });

		player.on('play', function (data) {
			tracker.playing = true;
			tracker.lastPosition = data.seconds || 0;
			tracker._lastTimeUpdate = tracker.lastPosition;
			tracker.duration = data.duration || tracker.duration;
			sendEvent(tracker, 'media-play');
			startCheckpoints(tracker);
		});

		player.on('pause', function (data) {
			if (!tracker.playing) return;
			tracker.playing = false;
			var pos = data.seconds || 0;
			tracker.watched.add(tracker._lastTimeUpdate, pos);
			tracker.lastPosition = pos;
			stopCheckpoints(tracker);
			sendEvent(tracker, 'media-pause');
		});

		player.on('ended', function (data) {
			tracker.playing = false;
			var pos = data.seconds || tracker.duration;
			tracker.watched.add(tracker._lastTimeUpdate, pos);
			tracker.lastPosition = pos;
			stopCheckpoints(tracker);
			sendEvent(tracker, 'media-ended');
		});

		player.on('seeked', function (data) {
			var from = tracker.lastPosition;
			tracker.lastPosition = data.seconds || 0;
			tracker._lastTimeUpdate = tracker.lastPosition;
			sendEvent(tracker, 'media-seeked', {
				from: Math.round(from),
				to: Math.round(tracker.lastPosition)
			});
		});

		player.on('timeupdate', function (data) {
			var pos = data.seconds || 0;
			if (tracker.playing && pos > tracker._lastTimeUpdate) {
				tracker.watched.add(tracker._lastTimeUpdate, pos);
			}
			tracker._lastTimeUpdate = pos;
			tracker.lastPosition = pos;
		});
	});
}

// ── Auto-Discovery ──

function discoverMedia() {
	// Native elements
	var natives = document.querySelectorAll(state.options.mediaSelector);
	for (var i = 0; i < natives.length; i++) {
		trackNative(natives[i]);
	}

	// YouTube iframes
	var iframes = document.querySelectorAll('iframe[src]');
	for (var j = 0; j < iframes.length; j++) {
		var src = iframes[j].src || '';
		if (/youtube\.com\/embed|youtube-nocookie\.com\/embed/.test(src)) {
			trackYouTube(iframes[j]);
		} else if (/player\.vimeo\.com/.test(src)) {
			trackVimeo(iframes[j]);
		}
	}
}

// ── DOM Mutation Observer ──

function _startMutationObserver() {
	if (!window.MutationObserver || !state.options.observeDom) return;
	var root = state.options.observeRoot || document.body;

	state._mutationObserver = new MutationObserver(function (mutations) {
		mutations.forEach(function (mutation) {
			mutation.addedNodes.forEach(function (node) {
				if (node.nodeType !== 1) return;
				// Check the node itself
				if (node.matches && node.matches('video, audio')) {
					trackNative(node);
				}
				if (node.tagName === 'IFRAME' && node.src) {
					if (/youtube\.com\/embed/.test(node.src)) trackYouTube(node);
					else if (/player\.vimeo\.com/.test(node.src)) trackVimeo(node);
				}
				// Check descendants
				if (node.querySelectorAll) {
					var natives = node.querySelectorAll('video, audio');
					for (var i = 0; i < natives.length; i++) trackNative(natives[i]);
					var iframes = node.querySelectorAll('iframe[src]');
					for (var j = 0; j < iframes.length; j++) {
						var s = iframes[j].src || '';
						if (/youtube\.com\/embed/.test(s)) trackYouTube(iframes[j]);
						else if (/player\.vimeo\.com/.test(s)) trackVimeo(iframes[j]);
					}
				}
			});
		});
	});

	state._mutationObserver.observe(root, { childList: true, subtree: true });
}

// ── Flush All Playing Media ──

function flushAll() {
	for (var id in state.tracked) {
		var tracker = state.tracked[id];
		if (tracker.playing) {
			// Update watched range one last time
			if (tracker.type === 'native' && tracker.el) {
				tracker.watched.add(tracker._lastTimeUpdate, tracker.el.currentTime || tracker.lastPosition);
				tracker.lastPosition = tracker.el.currentTime || tracker.lastPosition;
			}
			sendEvent(tracker, 'media-checkpoint');
		}
	}
}

// ── Pre-mark Initial State ──

function premarkInitialState() {
	// Nothing to pre-mark for media — we want to track all plays
}

// ── Public API ──

var MT = {

	/**
	 * Initialize media tracking
	 */
	init: function (options) {
		if (state.initialized) {
			console.warn('Metrics.MediaTracker already initialized');
			return this;
		}

		var opts = {};
		var k;
		for (k in defaults) { if (defaults.hasOwnProperty(k)) opts[k] = defaults[k]; }
		for (k in (options || {})) { if (options.hasOwnProperty(k) && options[k] !== undefined) opts[k] = options[k]; }
		state.options = opts;
		state.initialized = true;

		// Auto-init Metrics core if needed
		if (!Metrics._endpoint && options && options.endpoint) {
			Metrics.init({
				endpoint: options.endpoint, page: options.page,
				trackUnload: options.trackUnload
			});
		}

		// Discover existing media
		if (opts.autoDiscover) {
			// Slight delay to let page render
			setTimeout(function () {
				discoverMedia();
			}, 500);
		}

		// Watch for dynamically added media
		if (opts.observeDom) {
			_startMutationObserver();
		}

		// Flush on page exit
		Metrics.onVisibilityChange(function (visible) {
			if (!visible) flushAll();
		}, 'MediaTracker.flush');

		return this;
	},

	/**
	 * Manually track a native video/audio element
	 * @param {Element} el — the <video> or <audio> element
	 * @param {String} [id] — optional custom ID
	 */
	trackNative: function (el, id) {
		if (id) el.id = id;
		trackNative(el);
	},

	/**
	 * Manually track a YouTube iframe
	 * @param {Element} iframe
	 * @param {String} [id]
	 */
	trackYouTube: function (iframe, id) {
		if (id) iframe.id = id;
		trackYouTube(iframe);
	},

	/**
	 * Manually track a Vimeo iframe
	 * @param {Element} iframe
	 * @param {String} [id]
	 */
	trackVimeo: function (iframe, id) {
		if (id) iframe.id = id;
		trackVimeo(iframe);
	},

	/**
	 * Get all tracked media and their current state
	 */
	getTracked: function () {
		var result = {};
		for (var id in state.tracked) {
			var t = state.tracked[id];
			result[id] = {
				id: t.id, type: t.type,
				playing: t.playing,
				position: Math.round(t.lastPosition),
				duration: Math.round(t.duration),
				watched: t.watched.total()
			};
		}
		return result;
	},

	/**
	 * Flush checkpoint for all currently playing media
	 */
	flush: flushAll,

	/**
	 * Re-scan the page for new media elements
	 */
	rescan: discoverMedia,

	/**
	 * Destroy — stop all tracking and remove observers
	 */
	destroy: function () {
		for (var id in state.tracked) {
			var t = state.tracked[id];
			stopCheckpoints(t);
			if (t._pollTimer) clearInterval(t._pollTimer);
		}
		state.tracked = {};
		if (state._mutationObserver) {
			state._mutationObserver.disconnect();
			state._mutationObserver = null;
		}
		state.initialized = false;
	},

	defaults: defaults,
	state: state
};

Metrics.MediaTracker = MT;

})(typeof window !== 'undefined' ? window : this);
