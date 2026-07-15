/**
 * Metrics plugin's front end code
 *
 * @module Metrics
 * @class Metrics
 */
"use strict";

// ── Core Metrics object (works with or without Q) ──
(function (root) {

var Metrics = root.Metrics || {};
root.Metrics = Metrics;

// ── Session Management ──

Metrics._sessionKey = 'metrics_sid';
Metrics._sid = null;

Metrics.getSessionId = function () {
	if (Metrics._sid) return Metrics._sid;
	try {
		var sid = sessionStorage.getItem(Metrics._sessionKey);
		if (!sid) {
			sid = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
			sessionStorage.setItem(Metrics._sessionKey, sid);
		}
		Metrics._sid = sid;
	} catch (e) {
		Metrics._sid = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
	}
	return Metrics._sid;
};

// ── Transport (standalone — overridden by Q integration below) ──

Metrics._endpoint = null;
Metrics._page = null;
Metrics._extra = null;
Metrics._unloaded = false;
Metrics._startTime = Date.now();

/**
 * Send a telemetry event. When Q framework is loaded, this is
 * enhanced to also POST via Q.req(). Standalone mode uses
 * sendBeacon / fetch to the configured endpoint.
 * @param {String} label — event label
 * @param {Object} [data] — optional extra data
 */
Metrics.send = function (label, data) {
	if (!Metrics._endpoint || Metrics._unloaded) return;

	var payload = {
		session: Metrics.getSessionId(),
		page: Metrics._page || document.title,
		label: label,
		t: Date.now()
	};
	if (Metrics._extra) payload.extra = Metrics._extra;
	if (data) payload.data = data;

	var body = JSON.stringify(payload);
	try {
		if (navigator.sendBeacon) {
			navigator.sendBeacon(Metrics._endpoint, new Blob([body], { type: 'text/plain' }));
		} else {
			fetch(Metrics._endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'text/plain' },
				keepalive: true,
				body: body
			});
		}
	} catch (e) { /* silent */ }
};

// ── Visibility Detection ──
// Uses Q.onVisibilityChange when available, otherwise vendor-prefixed
// visibilitychange + mobile lifecycle events (Cordova/Capacitor)

Metrics._visible = true;
Metrics._visibilityCallbacks = [];
Metrics._visibilityBound = false;

/**
 * Whether the page is currently visible
 * @returns {Boolean}
 */
Metrics.isVisible = function () {
	return Metrics._visible;
};

/**
 * Register a callback for visibility changes
 * @param {Function} fn(isVisible) — called when visibility changes
 * @param {String} [key] — optional key for deduplication
 */
Metrics.onVisibilityChange = function (fn, key) {
	if (key) {
		// Replace existing callback with same key
		for (var i = 0; i < Metrics._visibilityCallbacks.length; i++) {
			if (Metrics._visibilityCallbacks[i].key === key) {
				Metrics._visibilityCallbacks[i].fn = fn;
				return;
			}
		}
	}
	Metrics._visibilityCallbacks.push({ fn: fn, key: key || null });
};

function _fireVisibility(isVisible) {
	if (isVisible === Metrics._visible) return; // deduplicate
	Metrics._visible = isVisible;
	for (var i = 0; i < Metrics._visibilityCallbacks.length; i++) {
		try { Metrics._visibilityCallbacks[i].fn(isVisible); } catch (e) {}
	}
}

function _bindVisibility() {
	if (Metrics._visibilityBound) return;
	Metrics._visibilityBound = true;

	// Detect vendor-prefixed visibility API
	var visibilityChange = null;
	var prefixes = ['', 'moz', 'ms', 'webkit', 'o'];
	for (var i = 0; i < prefixes.length; i++) {
		var k = prefixes[i];
		var hidden = k ? k + 'Hidden' : 'hidden';
		if (hidden in document) {
			visibilityChange = k ? k + 'visibilitychange' : 'visibilitychange';
			break;
		}
	}

	function handleVisEvent(event) {
		var isHidden;
		if (event.type === 'pause' || event.type === 'resign') {
			isHidden = true;
		} else if (event.type === 'resume' || event.type === 'active') {
			isHidden = false;
		} else {
			isHidden = document.visibilityState === 'hidden';
		}
		_fireVisibility(!isHidden);
	}

	if (visibilityChange) {
		document.addEventListener(visibilityChange, handleVisEvent, false);
	}
	// Mobile lifecycle (Cordova / Capacitor)
	document.addEventListener('pause', handleVisEvent, false);
	document.addEventListener('resume', handleVisEvent, false);
	document.addEventListener('resign', handleVisEvent, false);
	document.addEventListener('active', handleVisEvent, false);
}

// ── Unload / bfcache ──

Metrics._unloadBound = false;

function _bindUnload() {
	if (Metrics._unloadBound) return;
	Metrics._unloadBound = true;

	// Visibility-based exit (most reliable)
	Metrics.onVisibilityChange(function (isVisible) {
		if (!isVisible) {
			_sendUnload();
		} else {
			Metrics._unloaded = false; // returned to page
		}
	}, 'Metrics.unload');

	// pagehide fallback
	window.addEventListener('pagehide', function () {
		_sendUnload();
	});

	// bfcache restore
	window.addEventListener('pageshow', function (e) {
		if (e.persisted) {
			Metrics._unloaded = false;
		}
	});
}

function _sendUnload() {
	if (Metrics._unloaded) return;
	Metrics._unloaded = true;
	var elapsed = Math.round((Date.now() - Metrics._startTime) / 1000);
	Metrics.send('unload:' + elapsed + 's');
}

/**
 * Initialize standalone page tracking (no Q framework needed)
 * @param {Object} options
 * @param {String} options.endpoint — POST URL for beacons
 * @param {String} [options.page] — page identifier
 * @param {String} [options.sessionKey] — sessionStorage key
 * @param {String} [options.sessionId] — override session ID
 * @param {Object} [options.extra] — extra data with every event
 * @param {Boolean} [options.trackUnload=true] — send unload beacon
 */
Metrics.init = function (options) {
	options = options || {};
	if (options.endpoint) Metrics._endpoint = options.endpoint;
	if (options.page) Metrics._page = options.page;
	if (options.sessionKey) Metrics._sessionKey = options.sessionKey;
	if (options.sessionId) Metrics._sid = options.sessionId;
	if (options.extra) Metrics._extra = options.extra;

	_bindVisibility();
	if (options.trackUnload !== false) {
		_bindUnload();
	}

	Metrics.send('loaded');
	return Metrics;
};

})(typeof window !== 'undefined' ? window : this);


// ── Q Framework Integration (only runs if Q exists) ──
if (typeof Q !== 'undefined') {
(function (Q) {

	// Bridge: make Q.Metrics point to the global Metrics
	Q.Metrics = Q.plugins.Metrics = window.Metrics;
	var Metrics = window.Metrics;

	Metrics.setState = function (state, extra) {
		var url = Q.info.url;
		Metrics.setState.pending[url] = Q.setTimeout(function () {
			if (Metrics.setState.pending[url]) {
				clearTimeout(Metrics.setState.pending[url]);
				delete Metrics.setState.pending[url];
			}
			Q.req('Metrics/update', [], null, {
				method: 'POST',
				fields: {
					navigatorUrl: location.href,
					url: Q.info.url,
					state: state,
					extra: JSON.stringify(extra)
				},
				keepalive: true
			});
		}, 5000);
	};
	Metrics.setState.pending = {};
    
	var dc = Q.extend.dontCopy;
	dc["Q.Users.User"] = true;

	Q.text.Metrics = {};

	function ensureVisitInHash(visitId) {
		var current = location.hash || '#';
		var updated = current.queryField('v', visitId);
		if (updated !== current) {
			history.replaceState(
				history.state,
				document.title,
				updated
			);
		}
	}

	Q.onReady.add(function () {
		// If Q.onVisibilityChange exists, bridge it to Metrics visibility
		if (Q.onVisibilityChange && Q.onVisibilityChange.set) {
			Q.onVisibilityChange.set(function (shown) {
				// Sync Q's visibility detection into Metrics
				if (Metrics._visible !== shown) {
					Metrics._visible = shown;
					for (var i = 0; i < Metrics._visibilityCallbacks.length; i++) {
						try { Metrics._visibilityCallbacks[i].fn(shown); } catch (e) {}
					}
				}
			}, 'Metrics');
		}

		// Initialize ScrollTracker if configured
		var stConfig = Q.getObject('Metrics.scrollTracker', Q.plugins) 
			|| Q.getObject('Metrics.scrollTracker', Q);
		if (stConfig && Metrics.ScrollTracker) {
			stConfig.page = stConfig.page || Q.info.url || document.title;
			Metrics.ScrollTracker.init(stConfig);
		}

		// Visit chaining — look for a parent visitId in the hash
		var parentVisitId = location.hash.queryField('v');
		if (!parentVisitId) {
			return;
		}
		ensureVisitInHash(parentVisitId);

		Q.req('Metrics/landed', {
			method: 'POST',
			fields: { trackerId: 'visitId:' + parentVisitId }
		}, function (err, res) {
			if (err) {
				if (window.console) {
					console.error('Metrics landed request failed', err);
				}
				return;
			}
			if (res && res.slots && res.slots.visitId) {
				ensureVisitInHash(res.slots.visitId);
			}
		});
	}, 'Metrics');

	// Error telemetry
	(function () {
		function sendErrorTelemetry(errorInfo) {
			var payload = JSON.stringify({ error: errorInfo });
			Q.req('Metrics/update', [], null, {
				method: 'POST',
				fields: {
					navigatorUrl: location.href,
					url: Q.info && Q.info.url,
					state: 'error',
					extra: payload
				},
				keepalive: true
			});
		}

		function formatErrorPayload(message, stack, details) {
			var payload = {
				message: message || '',
				stack: stack || '',
				url: location.href,
				userAgent: navigator.userAgent,
				timestamp: Date.now(),
				performanceNow: performance.now()
			};
			if (details) {
				payload.details = details;
			}
			return payload;
		}

		function handleError(reason, isRejection) {
			var message = '';
			var stack = '';
			var details;

			if (reason instanceof Error) {
				message = reason.message;
				stack = reason.stack;
			} else if (typeof reason === 'string') {
				message = reason;
			} else if (reason && typeof reason === 'object') {
				try {
					details = JSON.stringify(reason);
				} catch (e) {
					details = '[unserializable reason]';
				}
			}

			var errorInfo = formatErrorPayload(message, stack, details);
			sendErrorTelemetry(errorInfo);
			console.warn(isRejection ? 'Unhandled rejection:' : 'Unhandled error:', reason);

			if (message && /indexedDB/i.test(message)) {
				console.warn('[Recovery] Error suggests IndexedDB corruption. Triggering recovery...');
			}
		}

		window.addEventListener('unhandledrejection', function (event) {
			handleError(event.reason, true);
		});

		window.addEventListener('error', function (event) {
			handleError(event.error || event.message, false);
		});
	})();

})(Q);
}
