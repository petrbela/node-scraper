var request = require('request');
var jsdom  = require('jsdom');
var requestDefaults = {
	'uri': null
	,	'encoding': 'utf-8'
	, 'headers': {
		'User-Agent': 'Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 6.0)'
	}
};
var fetchDefaults = {
	'reqPerSec': 0
};
module.exports = function scrape(requestOptions, callback, fetchOptions) {
	if (!fetchOptions) {
		fetchOptions = {};
	}
	if (!callback) {
		callback = function(){};
	}
	Object.keys(fetchDefaults).forEach(function(key) {
		if (fetchOptions[key] === undefined) {
			fetchOptions[key] = fetchDefaults[key]
		}
	});

	var fetches = [];
	var queue = [];

	if (!Array.isArray(requestOptions)) {
		fetches.push(requestOptions);
	} else {
		fetches = requestOptions;
	}

	fetches.forEach(function(requestOptions, index) {
		queue.push(function() {
			Object.keys(requestDefaults).forEach(function(key) {
				requestOptions[key] = requestOptions[key] || requestDefaults[key];
			});
			if (typeof requestOptions === 'string') {
				requestOptions = {
					'uri': requestOptions
				}
			}

			if (!requestOptions['uri']) {
				callback(new Error('You must supply an uri.'), null, null);
			}

			var convertEncoding = null;
			var allowedEncodings = ['utf8', 'utf16le', 'ucs2', 'ascii', 'hex'];
			if (!allowedEncodings.contains(requestOptions['encoding'])) {
				// requested encoding not allowed by http://nodejs.org/api/http.html#http_request_setencoding_encoding
				// -> we will use binary encoding and then convert the response to utf-8
				convertEncoding = requestOptions['encoding'];
				requestOptions['encoding'] = 'binary';
			}

			request(requestOptions, function (err, response, body) {
				if (convertEncoding) {
					var iconv = require('iconv');
	        body = new Buffer(body, 'binary');
	        conv = new iconv.Iconv(convertEncoding, 'utf-8');
	        body = conv.convert(body).toString();
				}
				body = body.replace(/<(\/?)script/g, '<$1nobreakage');
				setTimeout(runNextFetch, timeSpacing);
				if (err) {
					callback(err, null, null);
				}
				if (response && response.statusCode == 200) {
					var window = jsdom.jsdom().createWindow();
					jsdom.jQueryify(window, __dirname+'/../deps/jquery-1.6.1.min.js', function(win, $) {
						$('head').append($(body).find('head').html());
						$('body').append($(body).find('body').html());
						callback(null, $);
					});
				} else {
					callback(new Error('Request to '+requestOptions['uri']+' ended with status code: '+(typeof response !== 'undefined' ? response.statusCode : 'unknown')), null, null);
				}
			});
		})
	});

	var concurrentConnections = !fetchOptions['reqPerSec'] ? queue.length : (Math.floor(fetchOptions['reqPerSec']) || 1);
	var timeSpacing = !fetchOptions['reqPerSec'] ? 0 : 1000/fetchOptions['reqPerSec'];

	for (var i=0; i < concurrentConnections; i++) {
		runNextFetch(i);
	};

	function runNextFetch(i) {
		if (!i) {
			i = 0;
		}
		if (queue[i]) {
			queue[i]();
			queue.shift();
		}
	}
};
