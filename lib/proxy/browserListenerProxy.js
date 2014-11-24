var async = require('async'),
    path = require('path'),
    log = require('winston'),
    url = require('url');

function BrowserListenerProxy(browsertime, proxy, options) {
    this.browsertime = browsertime;
    this.proxy = proxy;

    this.harFile = options.harFile || path.join(process.cwd(), url.parse(options.url).hostname + '.har');
}

BrowserListenerProxy.prototype.setupListeners = function () {
    var p = this.proxy;
    var harFile = this.harFile;

    this.browsertime
        .on('beforeRun', function (cb) {
            p.start(cb);
        })
        .on('afterRun', function (cb) {
            p.stop(cb);
        })
        .on('callingBrowser', function (callback) {
            async.series([
                    function (cb) {
                        p.newPage('myname', cb);
                    },
                    function (cb) {
                        p.clearDNS(cb);
                    }
                ],
                callback);
        })
        .on('savingResults', function (data, cb) {
            log.info('Storing ' + harFile);
            p.saveHar(harFile, data.data, cb);
        });
};

module.exports.setup = function(browsertime, proxy, options) {
    var blp = new BrowserListenerProxy(browsertime, proxy, options);
    blp.setupListeners();
};
