var express = require('express');
var plusapi = require('./plusapi');

var username = 'yourname';
var password = 'password';

var app = express.createServer();

app.get('/', function(req, res){
	res.send('Unofficial Google+ API compatible with Google+ API');
});

app.get('/v1/people/me', function(req, res) {
	if (plusapi.isLogin()) {
		plusapi.getProfile(null, function(json) {
			responseJSON(req, res, json);
		});
	}
	else {
		plusapi.login(username, password, function(json) {
			if (json.error) {
				responseJSON(req, res, json);
			}
			else {
				plusapi.getProfile(null, function(json) {
					responseJSON(req, res, json);
				});
			}
		});
	}
});

app.get('/v1/people/:id([0-9]+)', function(req, res) {
	plusapi.getPublicProfile(req.params.id, function(json) {
		responseJSON(req, res, json);
	});
});

function responseJSON(req, res, json) {
	res.statusCode = (json.error ? json.error.code : 200);
	res.charset = 'UTF-8';
	res.header('cache-control',
		'private, max-age=0, must-revalidate, no-transform');

	if (req.query.callback) {
		res.header('Content-Type', 'text/javascript');
		res.send('// API callback\n'
			+ 'if (typeof ' + req.query.callback + ' == "function") '
			+ req.query.callback + '(' + JSON.stringify(json) + ');');
	}
	else {
		res.send(json);
	}
}

app.listen(process.env.PORT || 80);