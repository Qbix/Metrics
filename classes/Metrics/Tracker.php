<?php
/**
 * @module Metrics
 */
/**
 * Class representing 'Tracker' rows in the 'Metrics' database
 * You can create an object of this class either to
 * access its non-static methods, or to actually
 * represent a tracker row in the Metrics database.
 *
 * @class Metrics_Tracker
 * @extends Base_Metrics_Tracker
 */
class Metrics_Tracker extends Base_Metrics_Tracker
{
	/**
	 * The setUp() method is called the first time
	 * an object of this class is constructed.
	 * @method setUp
	 */
	function setUp()
	{
		parent::setUp();
		// INSERT YOUR CODE HERE
		// e.g. $this->hasMany(...) and stuff like that.
	}

	/*
	 * Add any Metrics_Tracker methods here, whether public or not
	 */
	 
	/**
	 * Implements the __set_state method, so it can work with
	 * with var_export and be re-imported successfully.
	 * @method __set_state
	 * @static
	 * @param {array} $array
	 * @return {Metrics_Tracker} Class instance
	 */
	static function __set_state(array $array) {
		$result = new Metrics_Tracker();
		foreach($array as $k => $v)
			$result->$k = $v;
		return $result;
	}
};