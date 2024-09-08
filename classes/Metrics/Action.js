/**
 * Class representing action rows.
 *
 * This description should be revised and expanded.
 *
 * @module Metrics
 */
var Q = require('Q');
var Db = Q.require('Db');
var Action = Q.require('Base/Metrics/Action');

/**
 * Class representing 'Action' rows in the 'Metrics' database
 * @namespace Metrics
 * @class Action
 * @extends Base.Metrics.Action
 * @constructor
 * @param {Object} fields The fields values to initialize table row as
 * an associative array of {column: value} pairs
 */
function Metrics_Action (fields) {

	// Run mixed-in constructors
	Metrics_Action.constructors.apply(this, arguments);
	
	/*
 	 * Add any privileged methods to the model class here.
	 * Public methods should probably be added further below.
	 */
}

Q.mixin(Metrics_Action, Action);

/*
 * Add any public methods here by assigning them to Metrics_Action.prototype
 */

/**
 * The setUp() method is called the first time
 * an object of this class is constructed.
 * @method setUp
 */
Metrics_Action.prototype.setUp = function () {
	// put any code here
	// overrides the Base class
};

module.exports = Metrics_Action;