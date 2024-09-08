/**
 * Class representing hit rows.
 *
 * This description should be revised and expanded.
 *
 * @module Metrics
 */
var Q = require('Q');
var Db = Q.require('Db');
var Hit = Q.require('Base/Metrics/Hit');

/**
 * Class representing 'Hit' rows in the 'Metrics' database
 * @namespace Metrics
 * @class Hit
 * @extends Base.Metrics.Hit
 * @constructor
 * @param {Object} fields The fields values to initialize table row as
 * an associative array of {column: value} pairs
 */
function Metrics_Hit (fields) {

	// Run mixed-in constructors
	Metrics_Hit.constructors.apply(this, arguments);
	
	/*
 	 * Add any privileged methods to the model class here.
	 * Public methods should probably be added further below.
	 */
}

Q.mixin(Metrics_Hit, Hit);

/*
 * Add any public methods here by assigning them to Metrics_Hit.prototype
 */

/**
 * The setUp() method is called the first time
 * an object of this class is constructed.
 * @method setUp
 */
Metrics_Hit.prototype.setUp = function () {
	// put any code here
	// overrides the Base class
};

module.exports = Metrics_Hit;