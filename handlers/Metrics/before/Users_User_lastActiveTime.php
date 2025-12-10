<?php

// NOTE: Although Metrics is independent of Users plugin,
// if the Users plugin is loaded, this hook would run
function Metrics_before_Users_User_lastActiveTime($params, &$result)
{
	$userId = $params['userId'];

	// Try to find last visit
	$visits = Metrics_Visit::select()->where(array(
		'id' => new Db_Range($userId . ';', true, false, true)
	))->orderBy('lastTime', false)->limit(1)->fetchDbRows();
	if ($visits) {

		$visit = $visits[0];
		if ($visit->lastTime) {
			$result = strtotime($visit->lastTime);
		}
	}
}