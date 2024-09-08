<?php

function Metrics_after_Q_metrics()
{
    if (Q::$controller !== 'Q_WebController') {
        return;
    }
    $fields = Q_Config::get('Metrics', 'querystring', 'fields', 'trackerId', array());
    $trackerId = null;
    if (is_array($fields)) {
        $found = false;
        $uri = Q_Dispatcher::uri();
        foreach ($fields as $f) {
            $trackerId = !empty($_GET[$f]) ? $_GET[$f] : (
                !empty($uri->$f) ? $uri->$f : null
            );
            if ($trackerId) {
                $found = true;
                break;
            }
        }
    }

    $url = Q_Request::url();
    Metrics_Hit::registerUrl($url, $trackerId);
}