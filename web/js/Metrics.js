/**
 * Metrics plugin's front end code
 *
 * @module Metrics
 * @class Metrics
 */
"use strict";
(function (Q) {

	var Metrics = Q.Metrics = Q.plugins.Metrics = {
		setState: function (state, extra) {
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
		}
	};
	Metrics.setState.pending = {};
    
	var dc = Q.extend.dontCopy;
	dc["Q.Users.User"] = true;

	/**
	 * Text for Metrics plugin, will be overridden by loaded language file
	 * @property Q.text.Metrics
	 * @type {Object}
	 */
	Q.text.Metrics = {
	};

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
		// look for a parent visitId in the hash
		var parentVisitId = location.hash.queryField('v');
		if (!parentVisitId) {
			return;
		}

		// only add it to the hash if it wasn’t already there
		ensureVisitInHash(parentVisitId);

		// post attribution request
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
			// optionally propagate our own visitId forward
			if (res && res.slots && res.slots.visitId) {
				ensureVisitInHash(res.slots.visitId);
			}
		});
	}, 'Metrics');

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
				// Optionally: Groups.Internal.DB.recover();
			}
		}

		// Promise rejections
		window.addEventListener('unhandledrejection', function (event) {
			handleError(event.reason, true);
		});

		// Synchronous errors
		window.addEventListener('error', function (event) {
			handleError(event.error || event.message, false);
		});
	})();


})(Q);