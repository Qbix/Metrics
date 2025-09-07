<?php

function Metrics_landed_post()
{
    Q_Request::requireFields(array('trackerId'), true);
    $trackerId = $_POST['trackerId'];

    // get the current visit, tied to this trackerId
    $visit = Metrics_Visit::current($trackerId);
    if (empty($visit->trackerId)) {
        $visit->trackerId = $trackerId;
        $visit->save();
    }

    Q_Response::setSlot('visitId', $visit->id);
}