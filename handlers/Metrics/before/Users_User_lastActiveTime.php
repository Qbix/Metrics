<?php

function Metrics_before_Users_User_lastActiveTime($params, &$result)
{
	$userId = $params['userId'];

	// Try to find last visit
	$visit = Metrics_Visit::fetch(['userId' => $userId]);
	if ($visit && $visit->lastTime) {
		$result = strtotime($visit->lastTime);
	}
}