<?php
/**
 * @module Metrics
 */
/**
 * Class representing 'TrackerTrait' rows in the 'Metrics' database
 * You can create an object of this class either to
 * access its non-static methods, or to actually
 * represent a tracker_trait row in the Metrics database.
 *
 * @class Metrics_TrackerTrait
 * @extends Base_Metrics_TrackerTrait
 */
class Metrics_TrackerTrait extends Base_Metrics_TrackerTrait
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
	 * Add any Metrics_TrackerTrait methods here, whether public or not
	 */
	 
	/**
	 * Implements the __set_state method, so it can work with
	 * with var_export and be re-imported successfully.
	 * @method __set_state
	 * @static
	 * @param {array} $array
	 * @return {Metrics_TrackerTrait} Class instance
	 */
	static function __set_state(array $array) {
		$result = new Metrics_TrackerTrait();
		foreach($array as $k => $v)
			$result->$k = $v;
		return $result;
	}
};