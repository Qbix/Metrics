<?php

include_once(dirname(dirname(__FILE__)).DS.'Base'.DS.'Metrics'.DS.'Action.php');

/**
 * @module Metrics
 */
/**
 * Class representing 'Action' rows in the 'Metrics' database
 * You can create an object of this class either to
 * access its non-static methods, or to actually
 * represent a action row in the Metrics database.
 *
 * @class Metrics_Action
 * @extends Base_Metrics_Action
 */
class Metrics_Action extends Base_Metrics_Action
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
	 * Fetches or creates Metrics_Action from a URL.
	 * When creating a new action, the canonicalActionId is null.
	 * @method fromUrl
	 * @static
	 * @param {string} $url
	 * @return {Metrics_Action}
	 */
	static function fromUrl($url)
	{
		$id = self::idFromUrl($url);
		$action = new Metrics_Action(compact('id'));
		if (!$action->retrieve()) {
			$action->url = $url;
			$parts = explode('?', $url);
			$uri = Q_Uri::from($parts[0]);
			$action->canonicalActionId = self::idFromUri($uri);
			$action->save(true);
		}
		return $action;
	}

	/**
	 * Calculates actionId from a URL, or fetches using database index.
	 * @method idFromUrl
	 * @static
	 * @param {string} $url
	 * @return {string}	
	 */
	static function idFromUrl($url)
	{
		$str = parse_url($url, PHP_URL_PATH);
		if (strlen($str) <= 63) {
			return $str;
		}
		$length = Q_Config::get('Metrics', 'action', 'id', 'length', 8);
		return substr(sha1($str), 0, $length);
	}

	/**
	 * Calculates actionId from an internal URI, or fetches using database index.
	 * @method idFromUri
	 * @static
	 * @param {Q_Uri|string} $uri
	 * @return {string}
	 */
	static function idFromUri($uri)
	{
		$parts = explode(' ', (string)$uri);
		$str = $parts[0];
		if (strlen($str) <= 63) {
			return $str;
		}
		$length = Q_Config::get('Metrics', 'action', 'id', 'length', 8);
		return substr(sha1($str), 0, $length);
	}


	/*
	 * Add any Metrics_Action methods here, whether public or not
	 */
	 
	/**
	 * Implements the __set_state method, so it can work with
	 * with var_export and be re-imported successfully.
	 * @method __set_state
	 * @static
	 * @param {array} $array
	 * @return {Metrics_Action} Class instance
	 */
	static function __set_state(array $array) {
		$result = new Metrics_Action();
		foreach($array as $k => $v)
			$result->$k = $v;
		return $result;
	}
};