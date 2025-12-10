<?php

include_once(dirname(dirname(__FILE__)).DS.'Base'.DS.'Metrics'.DS.'Visit.php');

/**
 * @module Metrics
 */
/**
 * Class representing 'Visit' rows in the 'Metrics' database
 * You can create an object of this class either to
 * access its non-static methods, or to actually
 * represent a visit row in the Metrics database.
 *
 * @class Metrics_Visit
 * @extends Base_Metrics_Visit
 */
class Metrics_Visit extends Base_Metrics_Visit
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
	 * @method current
	 * @static
	 * @param {string} $trackerId Pass the ID of a tracker that would be
	 *   stored if the visit started
	 * @param {boolean} [&$newVisitStarted] Pass reference here if you want
	 *   to know whether a new visit was started during this function call
	 */
	static function current($trackerId = null, &$newVisitStarted = null)
	{
		if (self::$currentVisit) {
			return self::$currentVisit;
		}
		// try to get the visit from the session
		$id = self::currentId();
		if (!empty($id)) {
			$visit = new Metrics_Visit(compact('id'));
			if ($visit->retrieve()) {
				self::$currentVisit = $visit;
			}
		}
		if (!self::$currentVisit) {
			// start a new visit, otherwise:
			$startTime = $lastTime = Db::now();
			$lastActionId = null;
			$platform = Q_Request::platform();
			$formFactor = Q_Request::formFactor();
			list($IP, $protocol, $isPublic) = Q_Request::ip();
			// TODO: check for existence of Places_IP2Location table
			// and then you can fill in these things:
			$country = $region = $city = null;
			$visit = new Metrics_Visit(compact(
				'trackerId', 'startTime', 'lastTime', 'lastActionId',
				'platform', 'formFactor', 'IP',
				'country', 'region', 'city'
			));
			$visit->save(); // generates a unique visit ID
		}
		// save the generated ID in the session for next time
		$_SESSION['Metrics']['visit']['id'] = $visit->id;
		return $visit;
	}

	/**
	 * Retrieves the current visit ID, if any, from the session.
	 * Calls Q_Session::start() and then checks session.
	 * @return {string} the current visit ID, if any was started
	 */
	static function currentId()
	{
		Q_Session::start();
		return Q::ifset($_SESSION, 'Metrics', 'visit', 'id', null);
	}

	/**
	 * Does necessary preparations for saving a visit in the database.
	 * @method beforeSave
	 * @param {array} $modifiedFields
	 *	The array of fields
	 * @param {array} $options
	 *  Not used at the moment
	 * @param {array} $internal
	 *  Can be used to pass pre-fetched objects
	 * @return {array}
	 * @throws {Exception}
	 *	If mandatory field is not set
	 */
	function beforeSave(
		$modifiedFields,
		$options = array(),
		$internal = array()
	) {
		if (!isset($modifiedFields['id']) and !isset($this->id)) {
			$id = Metrics::db()->uniqueId(
				Metrics_Visit::table(), 'id',
				array(),
				array('prefix' => 'v-')
			);
			// give other plugins a chance to transform the id,
			// for example the Users plugin might prepend the loggedInUser's id
			$id = Q::event('Metrics/Visit/id', array(), 'before', false, $id);
			$this->id = $modifiedFields['id'] = $id;
		}
		return parent::beforeSave($modifiedFields);
	}

	/*
	 * Add any Metrics_Visit methods here, whether public or not
	 */
	 
	/**
	 * Implements the __set_state method, so it can work with
	 * with var_export and be re-imported successfully.
	 * @method __set_state
	 * @static
	 * @param {array} $array
	 * @return {Metrics_Visit} Class instance
	 */
	static function __set_state(array $array) {
		$result = new Metrics_Visit();
		foreach($array as $k => $v)
			$result->$k = $v;
		return $result;
	}

	static protected $currentVisit = null;
};