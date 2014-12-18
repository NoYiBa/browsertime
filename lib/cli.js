var validBrowsers = ['chrome', 'firefox', 'ie', 'safari', 'phantomjs'];
var validConnectionSpeed = ['mobile3g', 'mobile3gfast', 'cable', 'native'];

function help() {
  console.log(' -u the URL to test');
  console.log(
    ' -f Output the result as a file, give the name of the file. If no filename is given, the name will be the domain of the url'
  );
  console.log(' --harFile the HAR file name. If no filename, the name will be $domain.har');
  console.log(' -b The browser to use. Supported values are:' + validBrowsers +
    ', default being Chrome. To use PhantomJS, you need the coming 2.0 release. And to use IE and Safari you need to run your own Selenium server.'
  );
  console.log(' -n the number of times to run the test, default being 3');
  console.log(' --maxTries maximum times to run browser, including retries for browser failures. ' +
  'Defaults to the same value as -n, i.e. no retries.');
  console.log(
    ' --userAgent Set the user agent. Default is the one by the browser you use. Only works with Chrome and Firefox');
  console.log(' -w The size of the browser window: <width>x<height>, e.g. 400x600. Only works with Chrome and Firefox');
  console.log(' --scriptPath the path to an extra script folder. ');
  console.log(' --headers set request headers by setting a JSON of the format {name:value,name2:value2}');
  console.log(' --basicAuth username:password');
  console.log(' --useProxy use MobProxy or not. Use it to get a HAR file.');
  console.log(
    ' --connection the speed by simulating connection types, one of [' + validConnectionSpeed + '], default is native');
  console.log(
    ' --connectionRaw the speed by simulating connection types by setting a JSON like {downstreamKbps: $X, upstreamKbps: $Y, latency: $Z}'
  );
  console.log(' --seleniumServer configure the path to the Selenium server. [http://localhost:4444/wd/hub]');
  console.log(' --silent only output info in the logs, not stdout');
  console.log(' --verbose enable verbose logging');
  console.log(' --noColor don\'t use colors in console output');
  console.log(' --logDir absolute path to the directory where the logs will be. default is current dir.');
  console.log(' --version show version number of browsertime');
}

exports.verifyInput = function verifyInput(options) {
  if (options.help) {
    help();
    process.exit(0);
  }

  if (options.version) {
    console.log(require('../package.json').version);
    process.exit(0);
  }

  if (!options.url) {
    console.error('Missing url');
    help();
    process.exit(255);
  }

  if (!options.maxTries) {
    options.maxTries = options.n;
  }

  if (!options.browser) {
    options.browser = 'chrome';
  } else if (validBrowsers.indexOf(options.browser) < 0) {
    console.error('\'' + options.browser + '\' isn\'t a supported browser.');
    help();
    process.exit(255);
  }
};
