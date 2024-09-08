/**
 * Class representing visit rows.
 *
 * This description should be revised and expanded.
 *
 * @module Metrics
 */
var Q = require('Q');
var Db = Q.require('Db');
var Visit = Q.require('Base/Metrics/Visit');

/**
 * Class representing 'Visit' rows in the 'Metrics' database
 * @namespace Metrics
 * @class Visit
 * @extends Base.Metrics.Visit
 * @constructor
 * @param {Object} fields The fields values to initialize table row as
 * an associative array of {column: value} pairs
 */
function Metrics_Visit (fields) {

	// Run mixed-in constructors
	Metrics_Visit.constructors.apply(this, arguments);
	
	/*
 	 * Add any privileged methods to the model class here.
	 * Public methods should probably be added further below.
	 */
}

Q.mixin(Metrics_Visit, Visit);

/*
 * Add any public methods here by assigning them to Metrics_Visit.prototype
 */

/**
 * The setUp() method is called the first time
 * an object of this class is constructed.
 * @method setUp
 */
Metrics_Visit.prototype.setUp = function () {
	// put any code here
	// overrides the Base class
};

module.exports = Metrics_Visit;