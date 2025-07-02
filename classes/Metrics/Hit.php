<?php

include_once(dirname(dirname(__FILE__)).DS.'Base'.DS.'Metrics'.DS.'Hit.php');

/**
 * @module Metrics
 */
/**
 * Class representing 'Hit' rows in the 'Metrics' database
 * You can create an object of this class either to
 * access its non-static methods, or to actually
 * represent a hit row in the Metrics database.
 *
 * @class Metrics_Hit
 * @extends Base_Metrics_Hit
 */
class Metrics_Hit extends Base_Metrics_Hit
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

	/**
	 * Registers a hit on a URL. Inserts a Metrics_Action if it didn't exist yet.
	 * @method register
	 * @static
	 * @param {string} $actionId The ID of the action that was 
	 * @param {string} [$trackerId=null] Pass the ID of the tracker, if any, that led the user to the site
	 */
	static function registerUrl($url, $trackerId = null)
	{
		$action = Metrics_Action::fromUrl($url);
		return self::register($action->id, $trackerId);
	}

	/**
	 * Registers a hit on an action
	 * @method register
	 * @static
	 * @param {string} $actionId The ID of the action that was 
	 * @param {string} [$trackerId=null] Pass the ID of the source, if any, that led the user to the site
	 */
	static function register($actionId, $trackerId = null)
	{
		$startTime = Db::now();
		$visit = Metrics_Visit::current($trackerId);
		// NOTE: we won't be retrieving the action, to reduce database queries.
		// Thus, we will save the hit with actionId, not canonicalActionId, if any.
		// This means that the analytics will have to SELECT by canonicalActionId later.
		$visitId = $visit->id;
		$trackerId = $visit->trackerId;
		$fromActionId = $visit->lastActionId;
		$hit = new Metrics_Hit(compact(
			'visitId', 'actionId', 'fromActionId', 'trackerId'
		));
		$hit->save(); // automatically sets insertedTime
		$visit->lastActionId = $actionId;
		$visit->lastTime = $startTime;
		$visit->save(true);
		return $hit;
	}

	/*
	 * Add any Metrics_Hit methods here, whether public or not
	 */
	 
	/**
	 * Implements the __set_state method, so it can work with
	 * with var_export and be re-imported successfully.
	 * @method __set_state
	 * @static
	 * @param {array} $array
	 * @return {Metrics_Hit} Class instance
	 */
	static function __set_state(array $array) {
		$result = new Metrics_Hit();
		foreach($array as $k => $v)
			$result->$k = $v;
		return $result;
	}
};