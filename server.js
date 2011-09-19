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
			res.send(JSON.stringify(json));
		});
	}
	else {
		plusapi.login(username, password, function(json) {
			if (json.error) {
				res.send(JSON.stringify(json));
			}
			else {
				plusapi.getProfile(null, function(json) {
					res.send(JSON.stringify(json));
				});
			}
		});
	}
});

app.get('/v1/people/:id', function(req, res) {
	plusapi.getPublicProfile(req.params.id, function(json) {
		res.send(JSON.stringify(json));
	});
});

app.listen(process.env.PORT || 80);