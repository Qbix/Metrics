<?php

function Metrics_update_post()
{
    $visit = Metrics_Visit::current();
    if (!$visit) {
        Q_Response::setSlot('error', 'No active visit');
        return;
    }
    $visitId = $visit->id;

    $url          = Q::ifset($_POST, 'url', null);
    $navigatorUrl = Q::ifset($_POST, 'navigatorUrl', null);
    $state        = Q::ifset($_POST, 'state', null);
    $extra        = Q::ifset($_POST, 'extra', null);

    // Normalize URLs by stripping baseUrl
    $base = Q_Request::baseUrl();
    if ($url && strpos($url, $base) === 0) {
        $url = substr($url, strlen($base));
    }
    if ($navigatorUrl && strpos($navigatorUrl, $base) === 0) {
        $navigatorUrl = substr($navigatorUrl, strlen($base));
    }

    // Fetch last 5 hits for this visit
    $hits = Metrics_Hit::select()
        ->where(['visitId' => $visitId])
        ->orderBy('insertedTime', false) // DESC
        ->limit(5)
        ->fetchDbRows();

    $hit = null;

    if ($hits) {
        foreach ($hits as $h) {
            if ($url && $h->actionId === $url) {
                $hit = $h;
                break;
            }
            if ($navigatorUrl && $h->actionId === $navigatorUrl) {
                $hit = $h;
                break;
            }
        }
    }

    if ($hit) {
        if ($state !== null) {
            $hit->finalState = $state;
        }
        if ($extra !== null) {
            if (is_array($extra) || is_object($extra)) {
                $extra = json_encode($extra);
            }
            $hit->extra = $extra;
        }
        $hit->save(true);

        Q_Response::setSlot('updated', true);
        Q_Response::setSlot('hitId', $hit->id);
    } else {
        Q_Response::setSlot('updated', false);
        Q_Response::setSlot('error', 'No matching hit found in last 5');
    }
}
