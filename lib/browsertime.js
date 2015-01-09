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
    logger = require('./logger'),
    url = require('url'),
    util = require('util'),
    EventEmitter = require('async-node-events');

function Browsertime(b) {
  this.log = logger.getLog();
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
    callback(err);
  });
};

Browsertime.prototype._do = function(options, cb) {
  var self = this,
      log = this.log;

  var successes = 0, totalTries = 0, maxTries = options.maxTries;

  log.info('Fetching ' + options.url + ', will fetch data for ' + options.runs + ' iterations. [maxTries ' + options.maxTries + ']');

  async.whilst(
      function() {
        return (successes < options.runs) && (totalTries < maxTries);
      },
      function(cb) {
        totalTries++;

        log.info('Run: ' + totalTries);

        runBrowser(options, function(err) {
          if (err) {
            self.log.error(util.inspect(err));
          } else {
            successes++;
          }
          cb(null);
        });
      },
      function(err) {
        if (successes < options.runs) {
          return cb(new Error('Failed to fetch ' + options.runs + ' results, too many failures.'));
        }
        var data = self._getFormattedResult(options);
        self._saveToFile(data, options, cb);
      }
  );

  function runBrowser(options, cb) {
    var log = self.log;
    var pageUrl = options.url,
        pageLoadTimeout = 60000;

    async.series([
          function(cb) {
            self.emit('callingBrowser', cb);
          },
        function(callback) {
          var driver = self.browsers.getBrowser(options.browser).getDriver(options);

          driver.getCapabilities().then(function(cap) {
            self.browserVersion = cap.get('version');
            self.os = cap.get('platform');
            self.browserName = cap.get('browserName');
          });

          driver.manage().window().setPosition(0, 0);

          var windowSize = self._parseWindowSize(options.size);
          if (windowSize) {
            driver.manage().window().setSize(windowSize.x, windowSize.y);
          }

          // fetch the URL and wait until the load event ends or we get the time out
          driver.get(pageUrl);

          var afterFetchTime = Date.now();

          driver.wait(function() {
                return driver.executeScript('return window.performance.timing.loadEventEnd>0')
                    .then(function(b) {
                      return b;
                    });
              },
              pageLoadTimeout
          ).then(function() {
                var afterLoadTime = Date.now();

                log.verbose('loading url took %d milliseconds', (afterLoadTime - afterFetchTime));
                // This is needed since the Firefox driver executes the success callback even when driver.wait
                // took too long.
                if ((afterLoadTime - afterFetchTime) > pageLoadTimeout) {
                  return callback(new Error('The url ' + pageUrl + ' timed out'));
                }

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
              },
              function() {
                var afterLoadTime = Date.now();

                log.verbose('loading url took %d milliseconds', (afterLoadTime - afterFetchTime));

                driver.quit().thenFinally(function() {
                  return callback(new Error('The url ' + pageUrl + ' timed out'));
                });
              });
        }],
    function(err, result) {
      cb(err);
    });
  }
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
    userAgent: options.userAgent || this.userAgent,
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
          self.log.info('Storing ' + options.filename);
          callback(err);
        });
      },
      function(callback) {
        self.emit('savingResults', { data: data }, callback);
      }
    ], cb);
};

Browsertime.prototype._setupDefaults = function(options) {

  options.runs = options.runs || 3;
  options.filename = options.filename || path.join(process.cwd(), url.parse(options.url).hostname + '.json');
  options.seleniumServer = options.seleniumServer || 'http://localhost:4444/wd/hub';
  if (!options.maxTries) {
    options.maxTries = options.n || 3;
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

Browsertime.prototype._parseWindowSize = function(size) {
  if (!size) {
    return undefined;
  }

  var coordinates = size.split('x');
  var parsedSize;

  if (coordinates.length === 2) {
    parsedSize = {
      'x': parseInt(coordinates[0], 10),
      'y': parseInt(coordinates[1], 10)
    };
  }

  if (!parsedSize || isNaN(parsedSize.x) || isNaN(parsedSize.y)) {
    this.log.warn('%s is not a valid windows size. It needs to be formatted as WIDTHxHEIGHT, e.g. 640x480.', size);
  }

  return parsedSize;
};

module.exports = Browsertime;
