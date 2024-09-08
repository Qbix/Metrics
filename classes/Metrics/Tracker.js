/**
 * Class representing tracker rows.
 *
 * This description should be revised and expanded.
 *
 * @module Metrics
 */
var Q = require('Q');
var Db = Q.require('Db');
var Tracker = Q.require('Base/Metrics/Tracker');

/**
 * Class representing 'Tracker' rows in the 'Metrics' database
 * @namespace Metrics
 * @class Tracker
 * @extends Base.Metrics.Tracker
 * @constructor
 * @param {Object} fields The fields values to initialize table row as
 * an associative array of {column: value} pairs
 */
function Metrics_Tracker (fields) {

	// Run mixed-in constructors
	Metrics_Tracker.constructors.apply(this, arguments);
	
	/*
 	 * Add any privileged methods to the model class here.
	 * Public methods should probably be added further below.
	 */
}

Q.mixin(Metrics_Tracker, Tracker);

/*
 * Add any public methods here by assigning them to Metrics_Tracker.prototype
 */

/**
 * The setUp() method is called the first time
 * an object of this class is constructed.
 * @method setUp
 */
Metrics_Tracker.prototype.setUp = function () {
	// put any code here
	// overrides the Base class
};

module.exports = Metrics_Tracker;