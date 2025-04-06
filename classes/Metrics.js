"use strict";
/*jshint node:true */
/**
 * Metrics 
 * @module Metrics
 * @main Metrics
 */
var Q = require('Q');

/**
 * Static methods for the Metrics class
 * @class Metrics
 * @extends Base.Places
 * @static
 */
function Metrics() {
    return this;
}

var Streams = Q.require('Streams');
var Users = Q.require('Users');

Streams.Message.on('deliver', function (info) {
    var stream = info.stream;
    var message = info.message;
    if (!stream || !message) {
        return;
    }
    var mf = message.fields;
    // todo: retrieve vote and read previous success, total from extra
    // then either add 1 to success or not, add 1 to total, and save
    // ideally, we can do it in a transaction, and test it.
    Users.Vote.vote(
        'Metrics/message', 
        [[stream.fields.type, mf.type].join("\t")],
        [1],
        [1],
        mf.byUserId
    );
});

module.exports = Metrics;