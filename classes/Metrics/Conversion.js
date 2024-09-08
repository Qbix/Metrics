/**
 * Class representing conversion rows.
 *
 * This description should be revised and expanded.
 *
 * @module Metrics
 */
var Q = require('Q');
var Db = Q.require('Db');
var Conversion = Q.require('Base/Metrics/Conversion');

/**
 * Class representing 'Conversion' rows in the 'Metrics' database
 * @namespace Metrics
 * @class Conversion
 * @extends Base.Metrics.Conversion
 * @constructor
 * @param {Object} fields The fields values to initialize table row as
 * an associative array of {column: value} pairs
 */
function Metrics_Conversion (fields) {

	// Run mixed-in constructors
	Metrics_Conversion.constructors.apply(this, arguments);
	
	/*
 	 * Add any privileged methods to the model class here.
	 * Public methods should probably be added further below.
	 */
}

Q.mixin(Metrics_Conversion, Conversion);

/*
 * Add any public methods here by assigning them to Metrics_Conversion.prototype
 */

/**
 * The setUp() method is called the first time
 * an object of this class is constructed.
 * @method setUp
 */
Metrics_Conversion.prototype.setUp = function () {
	// put any code here
	// overrides the Base class
};

module.exports = Metrics_Conversion;