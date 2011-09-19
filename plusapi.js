var request     = require('request');
var vm          = require('vm');
var querystring = require('querystring');

function extend(a, b) {
	var x = a || {};
	for (var key in b) {
		x[key] = b[key];
	}
	return x;
}

GooglePlusAPI = {
	OZDATA_REGEX : /<script\b[^>]*>[\s\S]*?\btick\b[\s\S]*?\bvar\s+OZ_initData\s*=\s*([{]+(?:(?:(?![}]\s*;[\s\S]{0,24}\btick\b[\s\S]{0,12}<\/script>)[\s\S])*)*[}])\s*;[\s\S]{0,24}\btick\b[\s\S]{0,12}<\/script>/i,

	DEFAULT_HTTP_HEADERS : {
		'User-Agent' : 'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_3; en-us) AppleWebKit/534.1+ (KHTML, like Gecko) Version/5.0 Safari/533.16'
	},

	AUTH_HTTP_HEADERS : {},

	isLogin : function() {
		return !!this.AUTH_HTTP_HEADERS['Authorization'];
	},

	login : function(username, password, callback) {
		var self = this;
		request(
			{
				uri     : 'https://www.google.com/accounts/ClientLogin',
				method  : 'POST',
				body    : querystring.stringify({
					accountType : 'HOSTED_OR_GOOGLE',
					service     : 'oz',
					Email       : username,
					Passwd      : password
				}),
				headers : extend(this.DEFAULT_HTTP_HEADERS, {
					'Content-Type' : 'application/x-www-form-urlencoded',
				})
			},
			function (e, response, body) {
				if (!e && response.statusCode == 200) {
					var auth_cookies = {};
					var cookies = body.split("\n");
					for (var i in cookies) {
						if (cookies[i]) {
							var cookie = cookies[i].split('=');
							auth_cookies[cookie[0]] = cookie[1];
						}
					}
					self.AUTH_HTTP_HEADERS = {
						'Cookie'        : 'SID=' + auth_cookies['SID'],
						'Authorization' : 'GoogleLogin auth=' + auth_cookies['Auth']
					};
					return callback({});
				}
				else {
					return callback(self.makeErrorResponse(e, extend(response, {
						name    : 'authError',
						message : 'could not login as username: ' + username
					})));
				}
			}
		);
	},

	getOZData : function(id, callback) {
		var self = this;
		if (!id && !this.isLogin()) {
			return callback(self.makeErrorResponse({
				code    : 401,
				name    : 'authError',
				message : 'me'
			}));
		}
		request(
			{
				uri     : 'https://plus.google.com/' + (id ? id : ''),
				method  : 'GET',
				headers : extend(this.DEFAULT_HTTP_HEADERS, this.AUTH_HTTP_HEADERS)
			},
			function (e, response, body) {
				if (!e && response.statusCode == 200) {
					var data = body.match(self.OZDATA_REGEX);
					if (data) {
						data = vm.runInThisContext('data = (' + data[1] + ')');
						return callback(data);
					}
					else {
						return callback(self.makeErrorResponse({
							name    : 'parseError',
							message : 'invalid data format'
						}));
					}
				}
				else {
					return callback(self.makeErrorResponse(e, extend(response, {
						name    : 'notFound',
						message : 'unable to map id: ' + (id ? id : 'me')
					})));
				}
			}
		);
	},

	getProfile : function(id, callback) {
		var self = this;
		this.getOZData(id, function(data) {
			if (data.error) {
				return callback(data);
			}
			if (id) {
				return callback(self.getProfileData(data[5][0], data[5][2]));
			}
			else {
				return callback(self.getProfileData(data[2][0], data[2][1]));
			}
		});
	},

	getPublicProfile : function(id, callback) {
		var self = this;
		request(
			{
				uri     : 'https://plus.google.com/_/profiles/get/' + id,
				method  : 'GET',
				headers : this.DEFAULT_HTTP_HEADERS
			},
			function (e, response, body) {
				if (!e && response.statusCode == 200) {
					data = vm.runInThisContext('data = (' + body.substr(5) + ')');
					data = self.getDataByKey([data], 'op.gp');
					if (!data) {
						return callback(self.makeErrorResponse({
							name    : 'parseError',
							message : 'invalid data format'
						}));
					}
					return callback(self.getProfileData(data[0], data[2]));
				}
				else {
					return callback(self.makeErrorResponse(e, extend(response, {
						name    : 'notFound',
						message : 'unable to map id: ' + id
					})));
				}
			}
		);
	},

	getProfileData : function(id, data) {
		var genders = {
			0 : '',
			1 : 'male',
			2 : 'female',
			3 : 'other'
		};
		var relationships = {
			0  : '',
			1  : '',
			2  : 'single',
			3  : 'in_a_relationship',
			4  : 'engaged',
			5  : 'married',
			6  : 'its_complicated',
			7  : 'open_relationship',
			8  : 'widowed',
			9  : 'in_domestic_partnership',
			10 : 'in_civil_union'
		};
		var json = {
			kind               : 'plus#person',
			id                 : id,
			displayName        : data[4][3],
			name               : {},
			nickname           : data[47][1],
			tagline            : data[33][1],
			birthday           : data[16][1],
			gender             : genders[data[17][1]],
			aboutMe            : data[14][1],
//			currentLocation    : '',
			relationshipStatus : relationships[data[22][1]],
			url                : data[2],
			image : {
				url              : data[3] // ?sz=x to re-size and crop to a square
			},
			emails             : [],
			urls               : [],
			organizations      : [],
			placesLived        : [],
//			languagesSpoken    : [],
//			hasApp             : false
		};
		for (var i in data[11][0]) {
			json.urls.push({
				value : data[11][0][i][1]
			});
		}
		json.urls.push({
			value : data[2],
			type  : 'profile'
		});
		json.urls.push({
			value : 'https://www.googleapis.com/plus/v1/people/' + id,
			type  : 'json'
		});
		for (var i in data[8][1]) {
			json.organizations.push({
				name       : data[8][1][i][0],
				title      : data[8][1][i][1],
				department : data[8][1][i][1],
				type       : 'school'
			});
		}
		for (var i in data[7][1]) {
			json.organizations.push({
				name  : data[7][1][i][0],
				title : data[7][1][i][1],
				type  : 'work' // 'job'
			});
		}
		if (data[9][1]) {
			json.placesLived.push({
				value   : data[9][1],
				primary : true
			});
		}
		for (var i in data[9][2]) {
			json.placesLived.push({
				value : data[9][2][i]
			});
		}
		return json;
	},

	getDataByKey : function(arr, key) {
		for (var i = 0, len = arr.length ; i < len ; i++) {
			var data = arr[i];
			if (data[0] === key) {
				return data[1];
			}
		}
		return null;
	},

	makeErrorResponse : function(e, response) {
		var error = {};
		if (e) {
			error = {
				errors  : [{
					domain  : 'global',
					reason  : e.name,
					message : e.message
				}],
				code    : e.code || 500,
				message : e.message
			};
		}
		else {
			error = {
				errors  : [{
					domain  : 'global',
					reason  : response.name,
					message : response.message
				}],
				code    : response.statusCode,
				message : response.message
			};
		}
		return {error : error};
	}
};

module.exports = GooglePlusAPI;
