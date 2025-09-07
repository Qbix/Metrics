(function (Q) {
	"use strict";

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

})(Q);