var express = require('express');
var plusapi = require('./plusapi');

var fs = require('fs');
var md = require("node-markdown").Markdown;

var username = 'yourname';
var password = 'password';

var app = express.createServer();

app.get('/', function(req, res) {
	fs.readFile('./README.md', function (err, data) {
		res.write('<!DOCTYPE html><html><head>');
		res.write('<title>Unofficial Google+ API compatible with Google+ API</title>');
		res.write('</head><body>');
		res.write(md(data.toString()));
		res.end('</body></html>');
	});
});

app.get('/v1/login', function(req, res) {
	plusapi.login(username, password, function(json) {
		responseJSON(req, res, json);
	});
});

app.get('/v1/logout', function(req, res) {
	plusapi.logout(function(json) {
		responseJSON(req, res, json);
	});
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

app.get('/v1/people/:id([0-9]+)/activities/public', function(req, res) {
	plusapi.getPublicActivities(req.params.id, req.query, function(json) {
		responseJSON(req, res, json);
	});
});

app.get('/v1/people/:id([0-9]+)/activities', function(req, res) {
	plusapi.getActivities(req.params.id, req.query, function(json) {
		responseJSON(req, res, json);
	});
});

app.get('/v1/circles', function(req, res) {
	plusapi.getCircles(function(json) {
		responseJSON(req, res, json);
	});
});

app.get('/v1/circle/:id/activities', function(req, res) {
	plusapi.getCircleActivities(req.params.id, req.query, function(json) {
		responseJSON(req, res, json);
	});
});

app.get('/v1/stream/activities', function(req, res) {
	plusapi.getStreamActivities(req.query, function(json) {
		responseJSON(req, res, json);
	});
});

app.get('/v1/activities/:id', function(req, res) {
	plusapi.getActivity(req.params.id, function(json) {
		responseJSON(req, res, json);
	});
});

app.get('/v1/plusoners/:id', function(req, res) {
	plusapi.getPlusoners(req.params.id, req.query, function(json) {
		responseJSON(req, res, json);
	});
});

app.get('/v1/sharers/:id', function(req, res) {
	plusapi.getSharers(req.params.id, function(json) {
		responseJSON(req, res, json);
	});
});

function responseJSON(req, res, json) {
	res.statusCode = (json.error ? json.error.code : 200);
	res.charset = 'UTF-8';
	res.header('cache-control',
		'private, max-age=0, must-revalidate, no-transform');

	var body = '';
	if (typeof req.query.prettyPrint == 'undefined') {
		req.query.prettyPrint = true;
	}
	if (typeof req.query.pp == 'undefined') {
		req.query.pp = true;
	}
	if ((req.query.prettyPrint == true) && (req.query.pp == true)) {
		body = JSON.stringify(json, null, ' ');
	}
	else {
		body = JSON.stringify(json);
	}

	if (req.query.callback) {
		res.header('Content-Type', 'text/javascript');
		res.send('// API callback\n'
			+ 'if (typeof ' + req.query.callback + ' == "function") '
			+ req.query.callback + '(' + body + ');');
	}
	else {
		res.header('Content-Type', 'application/json');
		res.send(body);
	}
}

app.listen(process.env.PORT || 80);