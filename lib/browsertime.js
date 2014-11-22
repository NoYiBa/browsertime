/**
 * Browsertime (http://www.browsertime.com)
 * Copyright (c) 2014, Peter Hedenskog, Tobias Lidskog
 * and other contributors
 * Released under the Apache 2.0 License
 */
var stats = require('./statistics'),
    fs = require('fs'),
    async = require('async'),
    path = require('path'),
    log = require('winston'),
    url = require('url'),
    util = require('util'),
    EventEmitter = require('async-node-events');

function Browsertime(b) {
  EventEmitter.call(this);

  this.result = [];
  this.scripts = [];
  this.browserVersion = '';
  this.os = '';
  this.browserName = '';
  this.userAgent = '';
  this.browsers = b;
}

util.inherits(Browsertime, EventEmitter);

Browsertime.prototype.fetch = function(options, callback) {

  callback = callback || function() {};

  this._setupDefaults(options);
  this._populateScripts(options);
  this._setupLogging(options);

  var self = this;

  async.series([
    function(cb) {
      self.emit('beforeRun', cb);
    },
    function(cb) {
      self._do(options, cb);
    },
    function(cb) {
      self.emit('afterRun', cb);
    }
  ], function(err, result) {
    callback(err)
  });
};

Browsertime.prototype._do = function (options, cb) {
  var browserRuns = [];
  var self = this;
  for (var i = 1; i <= options.runs; i++) {
    browserRuns.push(self._collectFromTheBrowser(options, i, options.runs));
  }

  async.series(browserRuns,
    function(err, results) {
      var data = self._getFormattedResult(options);
      self._saveToFile(data, options, cb);
    });
};

Browsertime.prototype._collectFromTheBrowser = function(options, iteration, totalIterations) {
  var self = this;

  return function(callback) {
    async.series([
        function(cb) {
          self.emit('callingBrowser', cb)
        }
      ],
      function(err, results) {
        var driver = self.browsers.getBrowser(options.browser).getDriver(options);

        driver.getCapabilities().then(function(cap) {
          self.browserVersion = cap.get('version');
          self.os = cap.get('platform');
          self.browserName = cap.get('browserName');
        });

        // fetch the URL and wait until the load event ends or we get the time out
        log.info('Fetching ' + options.url + ' (' + iteration + ' of ' + totalIterations + ')');
        driver.get(options.url);
        driver.wait(function() {
          return driver.executeScript('return window.performance.timing.loadEventEnd>0').then(function(
            fetched) {
            return fetched;
          });
        }, 60000);

        // lets run all scripts
        var promises = [];
        self.scripts.forEach(function(script) {
          promises.push(driver.executeScript(script));
        });

        var callbacks = [];
        promises.forEach(function(promise) {
          callbacks.push(function(cb) {
            promise.then(function(value) {
              cb(null, value);
            });
          });
        });

        // when we are finished, push the result and stop the browser
        async.parallel(callbacks,
          function(err, results) {
            var eachRun = {};
            results.forEach(function(metric) {
              Object.keys(metric).forEach(function(key) {
                eachRun[key] = metric[key];
              });
            });
            self.result.push(eachRun);
            driver.quit();
            callback();
          });
      });
  };
};

Browsertime.prototype._getFormattedResult = function(options) {
  // fetch timings for each run and make some statistics
  var timings = {};
  this.result.forEach(function(run) {
    stats.setupTimingsStatistics(timings, run);
    stats.setupStatistics(timings, run, 'speedIndex');
    stats.setupStatistics(timings, run, 'firstPaint');
    stats.setupUserTimingsStatistics(timings, run);
  });
  return {
    url: options.url,
    runs: options.runs,
    browserName: this.browserName,
    browserVersion: this.browserVersion,
    platform: this.os,
    userAgent: this.userAgent,
    windowSize: 'unknown',
    browserTimeVersion: require('../package.json').version,
    statistics: stats.formatStatistics(timings),
    data: this.result
  };
};

Browsertime.prototype._saveToFile = function(data, options, cb) {
  var self = this;

  // lets store the files
  async.parallel([
      function(callback) {
        fs.writeFile(options.filename, JSON.stringify(data), function(err) {
          log.info('Stored ' + options.filename);
          callback(err);
        });
      },
      function(callback) {
        self.emit('savingResults', { "data": data }, callback);
      }
    ], cb);
};

Browsertime.prototype._setupDefaults = function(options) {

  options.runs = options.runs || 3;
  options.filename = options.filename || path.join(process.cwd(), url.parse(options.url).hostname + '.json');
  options.seleniumServer = options.seleniumServer || 'http://localhost:4444/wd/hub';
};

Browsertime.prototype._setupLogging = function(options) {
  log.clear();
  log.add(log.transports.File, {
    filename: 'browsertime.log',
    level: 'info',
    json: false
  });

  // we only write to the console if we don't use silent
  if (!options.silent) {
    log.add(log.transports.Console, {
      level: 'info'
    });
  }
};

Browsertime.prototype._populateScripts = function(options) {
  var scriptRoots = [path.join(__dirname, 'scripts')];
  if (options.scriptPath) {
    scriptRoots.push(path.resolve(options.scriptPath));
  }

  var self = this;

  scriptRoots.forEach(function(rootPath) {
    fs.readdirSync(rootPath).forEach(function(file) {
      self.scripts.push(require(path.join(rootPath, file)));
    });
  });
};

module.exports = Browsertime;
