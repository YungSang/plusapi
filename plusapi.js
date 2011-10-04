var request     = require('request');
var vm          = require('vm');
var querystring = require('querystring');

function extend() {
	var x = {};
	for (var i = 0, len = arguments.length ; i < len ; i++) {
		var o = arguments[i];
		if (typeof o !== 'object') continue;
		for (var key in o) {
			if ((x[key] === o[key]) || (typeof o[key] === 'undefined')) {
				continue;
			}
			x[key] = o[key];
		}
	}
	return x;
}

GooglePlusAPI = {
	BASE_URL : 'https://plus.google.com',

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
					return callback({success : true});
				}
				else {
					return callback(self.makeErrorResponse(e, extend(response, {
						name    : 'authError',
						message : 'unable to login as username: ' + username
					})));
				}
			}
		);
	},

	logout : function(callback) {
		var self = this;
		request(
			{
				uri     : 'https://www.google.com/accounts/Logout',
				method  : 'GET',
				headers : this.DEFAULT_HTTP_HEADERS
			},
			function (e, response, body) {
				if (!e && response.statusCode == 200) {
					self.AUTH_HTTP_HEADERS = {};
					return callback({success : true});
				}
				else {
					return callback(self.makeErrorResponse(e, extend(response, {
						name    : 'authError',
						message : 'unable to logout'
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
				message : 'login required'
			}));
		}
		request(
			{
				uri     : this.BASE_URL + '/' + (id ? id : '') + '?hl=en',
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

	getCircles : function(callback) {
		var self = this;
		if (!this.isLogin()) {
			return callback(self.makeErrorResponse({
				code    : 401,
				name    : 'authError',
				message : 'login required'
			}));
		}
		this.getOZData(null, function(data) {
			if (data.error) {
				return callback(data);
			}
			var circles = [];
			for (var i = 0, len = data[12][0].length ; i < len ; i++) {
				var circle = data[12][0][i];
				circles.push({
					kind        : 'plus#circle',
					id          : circle[0][0],
					displayName : circle[1][0],
					description : circle[1][2]
				});
			}
			return callback(circles);
		});
	},

	getPublicProfile : function(id, callback) {
		var self = this;
		request(
			{
				uri     : this.BASE_URL + '/_/profiles/get/' + id + '?'
					+ querystring.stringify({
						hl     : 'en',
						_reqid : this.getReqid()
					}),
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

	getPublicActivities : function(id, query, callback) {
		var self = this;
		var qs = {
			sp     : '[1,2,"' + id + '",null,null,'
				+ (query.maxResults ? query.maxResults : 'null')
				+ ',null,"social.google.com",[]]',
			hl     : 'en',
			_reqid : this.getReqid()
		};
		if (query.pageToken) {
			qs.ct = query.pageToken;
		}
		request(
			{
				uri     : this.BASE_URL + '/_/stream/getactivities/?'
					+ querystring.stringify(qs),
				method  : 'GET',
				headers : this.DEFAULT_HTTP_HEADERS
			},
			function (e, response, body) {
				if (!e && response.statusCode == 200) {
					data = vm.runInThisContext('data = (' + body.substr(5) + ')');
					data = self.getDataByKey([data], 'os.nu');
					if (!data) {
						return callback(self.makeErrorResponse({
							name    : 'parseError',
							message : 'invalid data format'
						}));
					}
					var json = {
						kind     : 'plus#activityFeed',
						nextPageToken : data[1],
						selfLink : 'https://www.googleapis.com/plus/v1/people/'
							+ id + '/activities/public?',
						nextLink : 'https://www.googleapis.com/plus/v1/people/'
							+ id + '/activities/public?maxResults=' + data[2][5]
							+ '&pageToken=' + data[1],
						title    : 'Plus Public Activity Feed for ' + data[0][0][3],
						updated  : self.getUpdated(data[0]),
						id       : 'tag:google.com,2010:/plus/people/' + id
							+ '/activities/public',
						items    : self.getActivitiesData(data[0])
					};
					return callback(json);
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

	getActivities : function(id, query, callback) {
		var self = this;
		var qs = {
			sp     : '[1,2,"' + id + '",null,null,'
				+ (query.maxResults ? query.maxResults : 'null')
				+ ',null,"social.google.com",[]]',
			hl     : 'en',
			_reqid : this.getReqid()
		};
		if (query.pageToken) {
			qs.ct = query.pageToken;
		}
		request(
			{
				uri     : this.BASE_URL + '/_/stream/getactivities/?'
					+ querystring.stringify(qs),
				method  : 'GET',
				headers : extend(this.DEFAULT_HTTP_HEADERS, this.AUTH_HTTP_HEADERS)
			},
			function (e, response, body) {
				if (!e && response.statusCode == 200) {
					data = vm.runInThisContext('data = (' + body.substr(5) + ')');
					data = self.getDataByKey([data], 'os.nu');
					if (!data) {
						return callback(self.makeErrorResponse({
							name    : 'parseError',
							message : 'invalid data format'
						}));
					}
					var json = {
						kind     : 'plus#activityFeed',
						nextPageToken : data[1],
						selfLink : 'https://www.googleapis.com/plus/v1/people/'
							+ id + '/activities?',
						nextLink : 'https://www.googleapis.com/plus/v1/people/'
							+ id + '/activities?maxResults=' + data[2][5]
							+ '&pageToken=' + data[1],
						title    : 'Plus User Activity Feed for ' + data[0][0][3],
						updated  : self.getUpdated(data[0]),
						id       : 'tag:google.com,2010:/plus/people/' + id
							+ '/activities',
						items    : self.getActivitiesData(data[0])
					};
					return callback(json);
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

	getStreamActivities : function(query, callback) {
		var self = this;
		if (!this.isLogin()) {
			return callback(self.makeErrorResponse({
				code    : 401,
				name    : 'authError',
				message : 'login required'
			}));
		}
		var qs = {
			sp     : '[1,2,null,null,null,'
				+ (query.maxResults ? query.maxResults : 'null')
				+ ',null,"social.google.com",[]]',
			hl     : 'en',
			_reqid : this.getReqid()
		};
		if (query.pageToken) {
			qs.ct = query.pageToken;
		}
		request(
			{
				uri     : this.BASE_URL + '/_/stream/getactivities/?'
					+ querystring.stringify(qs),
				method  : 'GET',
				headers : extend(this.DEFAULT_HTTP_HEADERS, this.AUTH_HTTP_HEADERS)
			},
			function (e, response, body) {
				if (!e && response.statusCode == 200) {
					data = vm.runInThisContext('data = (' + body.substr(5) + ')');
					data = self.getDataByKey([data], 'os.nu');
					if (!data) {
						return callback(self.makeErrorResponse({
							name    : 'parseError',
							message : 'invalid data format'
						}));
					}
					var json = {
						kind     : 'plus#activityFeed',
						nextPageToken : data[1],
						selfLink : 'https://www.googleapis.com/plus/v1/stream/activities?',
						nextLink : 'https://www.googleapis.com/plus/v1/stream/activities?'
							+ 'maxResults=' + data[2][5] + '&pageToken=' + data[1],
						title    : 'Plus Stream Activity Feed',
						updated  : self.getUpdated(data[0]),
						id       : 'tag:google.com,2010:/plus/stream/activities',
						items    : self.getActivitiesData(data[0])
					};
					return callback(json);
				}
				else {
					return callback(self.makeErrorResponse(e, extend(response, {
						name    : 'notFound',
						message : 'unable to get activites'
					})));
				}
			}
		);
	},

	getCircleActivities : function(id, query, callback) {
		var self = this;
		if (!this.isLogin()) {
			return callback(self.makeErrorResponse({
				code    : 401,
				name    : 'authError',
				message : 'login required'
			}));
		}
		var qs = {
			sp     : '[1,2,null,"' + id + '",null,'
				+ (query.maxResults ? query.maxResults : 'null')
				+ ',null,"social.google.com",[]]',
			hl     : 'en',
			_reqid : this.getReqid()
		};
		if (query.pageToken) {
			qs.ct = query.pageToken;
		}
		request(
			{
				uri     : this.BASE_URL + '/_/stream/getactivities/?'
					+ querystring.stringify(qs),
				method  : 'GET',
				headers : extend(this.DEFAULT_HTTP_HEADERS, this.AUTH_HTTP_HEADERS)
			},
			function (e, response, body) {
				if (!e && response.statusCode == 200) {
					data = vm.runInThisContext('data = (' + body.substr(5) + ')');
					data = self.getDataByKey([data], 'os.nu');
					if (!data) {
						return callback(self.makeErrorResponse({
							name    : 'parseError',
							message : 'invalid data format'
						}));
					}
					var json = {
						kind     : 'plus#activityFeed',
						nextPageToken : data[1],
						selfLink : 'https://www.googleapis.com/plus/v1/circle/'
							+ id + '/activities?',
						nextLink : 'https://www.googleapis.com/plus/v1/circle/'
							+ id + '/activities?maxResults=' + data[2][5]
							+ '&pageToken=' + data[1],
						title    : 'Plus Circle Activity Feed',
						updated  : self.getUpdated(data[0]),
						id       : 'tag:google.com,2010:/plus/circle/' + id
							+ '/activities',
						items    : self.getActivitiesData(data[0])
					};
					return callback(json);
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

	getActivity : function(id, callback) {
		var self = this;
		var qs = {
			updateId : id,
			hl       : 'en',
			_reqid   : this.getReqid()
		};
		request(
			{
				uri     : this.BASE_URL + '/_/stream/getactivity/?'
					+ querystring.stringify(qs),
				method  : 'GET',
				headers : extend(this.DEFAULT_HTTP_HEADERS, this.AUTH_HTTP_HEADERS)
			},
			function (e, response, body) {
				if (!e && response.statusCode == 200) {
					data = vm.runInThisContext('data = (' + body.substr(5) + ')');
					data = self.getDataByKey([data], 'os.u');
					if (!data) {
						return callback(self.makeErrorResponse({
							name    : 'parseError',
							message : 'invalid data format'
						}));
					}
					return callback(self.getActivityData(data, true));
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

	getPlusoners : function (id, query, callback) {
		var self = this;
		var ps = {
			plusoneId : id
		};
		if (query.maxResults) {
			ps.num = query.maxResults;
		}
		request(
			{
				uri     : this.BASE_URL + '/_/stream/getpeople/?'
					+ querystring.stringify({
						_reqid : this.getReqid()
					}),
				method  : 'POST',
				body    : querystring.stringify(ps),
				headers : extend(this.DEFAULT_HTTP_HEADERS, this.AUTH_HTTP_HEADERS, {
					'Content-Type' : 'application/x-www-form-urlencoded',
				})
			},
			function (e, response, body) {
				if (!e && response.statusCode == 200) {
					data = vm.runInThisContext('data = (' + body.substr(5) + ')');
					data = self.getDataByKey([data], 'os.gpp');
					if (!data) {
						return callback(self.makeErrorResponse({
							name    : 'parseError',
							message : 'invalid data format'
						}));
					}
					var json = [];
					for (var i in data) {
						json.push({
							kind        : 'plus#person',
							id          : data[i][1],
							displayName : data[i][0],
							url         : data[i][2],
							image : {
								url       : data[i][3]
							}
						});
					}
					return callback(json);
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

	getSharers : function(id, callback) {
		var self = this;
		request(
			{
				uri     : this.BASE_URL + '/_/stream/getsharers/?'
					+ querystring.stringify({
						id     : id,
						_reqid : this.getReqid()
					}),
				method  : 'GET',
				headers : extend(this.DEFAULT_HTTP_HEADERS, this.AUTH_HTTP_HEADERS)
			},
			function (e, response, body) {
				if (!e && response.statusCode == 200) {
					data = vm.runInThisContext('data = (' + body.substr(5) + ')');
					data = self.getDataByKey([data], 'os.sha');
					if (!data) {
						return callback(self.makeErrorResponse({
							name    : 'parseError',
							message : 'invalid data format'
						}));
					}
					var json = [];
					for (var i in data) {
						json.push({
							kind        : 'plus#person',
							id          : data[i][1],
							displayName : data[i][0],
							url         : self.getAbsoluteURL(data[i][5]),
							image : {
								url       : data[i][4]
							}
						});
					}
					return callback(json);
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

	getAudience : function(id, callback) {
		var self = this;
		if (!this.isLogin()) {
			return callback(self.makeErrorResponse({
				code    : 401,
				name    : 'authError',
				message : 'login required'
			}));
		}
		request(
			{
				uri     : this.BASE_URL + '/_/stream/getaudience/?'
					+ querystring.stringify({
						id     : id,
						buzz   : 'true',
						_reqid : this.getReqid()
					}),
				method  : 'GET',
				headers : extend(this.DEFAULT_HTTP_HEADERS, this.AUTH_HTTP_HEADERS)
			},
			function (e, response, body) {
				if (!e && response.statusCode == 200) {
					data = vm.runInThisContext('data = (' + body.substr(5) + ')');
					data = self.getDataByKey([data], 'os.aud', 2);
					if (!data) {
						return callback(self.makeErrorResponse({
							name    : 'parseError',
							message : 'invalid data format'
						}));
					}
					var json = [];
					for (var i in data) {
						json.push({
							kind        : 'plus#person',
							id          : data[i][1],
							displayName : data[i][0],
							url         : self.getAbsoluteURL(data[i][5]),
							image : {
								url       : data[i][4]
							}
						});
					}
					return callback(json);
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
		function _formatBirthday(birthday) {
			if (!birthday) return '';
			var dt = new Date(birthday);
			mm = dt.getMonth() + 1;
			dd = dt.getDate();
			if (mm < 10) { mm = "0" + mm; }
			if (dd < 10) { dd = "0" + dd; }
			return '0000-' + mm + '-' + dd;
		}
		var json = {
			kind               : 'plus#person',
			id                 : id,
			displayName        : data[4][3],
			name               : {},
			nickname           : data[47][1],
			tagline            : data[33][1],
			birthday           : _formatBirthday(data[16][1]),
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

	getUpdated : function(items) {
		var updated = 0;
		for (var i = 0, len = items.length ; i < len ; i++) {
			var item = items[i];
			if (item[30] > updated) updated = item[30];
		}
		return new Date(updated / 1000);
	},

	getActivitiesData : function(items) {
		var json = [];
		for (var i = 0, len = items.length ; i < len ; i++) {
			json.push(this.getActivityData(items[i]));
		}
		return json;
	},

	getActivityData : function(item, full) {
		var imageResizeProxy = 'http://images0-focus-opensocial.googleusercontent.com/gadgets/proxy?container=focus&gadget=a&resize_h=100&url=';

		var title = item[20];
		if (title.length > 100) {
			title = title.replace(/\n+/g, ' ');
			if (title.length > 100) {
				title = title.substr(0, 97) + '...';
			}
		}

		var activity = {
			kind              : 'plus#activity',
//			placeholder       :
			title             : title,
			published         : new Date(item[5]),
			updated           : new Date(item[38]),
			edited            : (item[70] ? new Date(item[70]/1000) : undefined),
			latest            : new Date(item[30]/1000),
				// new Date(item[30]/1000), updated (including +1 and comment)
				// new Date(item[38]),      posted
				// new Date(item[70]/1000), edited
			id                : item[8],
			url               : this.getAbsoluteURL(item[21]),
			actor : {
				id              : item[16],
				displayName     : item[3],
				url             : this.getAbsoluteURL(item[24]),
				image : {
					url           : item[18],
				}
			},
			verb              : (item[77] ? 'share' : (item[27] ? 'checkin' : 'post')),
			object : {
				objectType      : (item[77] ? 'activity' : 'note')
			},
			annotation        : item[47],
//			crosspostSource   :
			provider : {
				title           : (item[2] === 'Buzz') ? 'Google+' : item[2],
			},
			access : {
				kind            : "plus#acl",
//				description     :
				items           : []
			}
		};
		if (item[77]) {
			activity.object.id = item[39];
			if (item[44][1]) {
				activity.object.actor = {
					id          : item[44][1],
					displayName : item[44][0],
					url         : this.getAbsoluteURL(item[44][5]),
					image : {
						url       : item[44][4]
					}
				};
				// item[43] via
				// item[44] origin
			}
		}
		activity.object = extend(activity.object, {
			content         : item[4],
//			originalContent :
			url             : this.getAbsoluteURL(item[77] ? item[77] : item[21]),
			replies : {
				totalItems    : item[93],
			},
			plusoners : {
				totalItems    : item[73][16],
				id            : (item[73][16] ? item[73][0] : undefined)
			},
			resharers : {
				totalItems    : item[96],
			},
			attachments     : []
		});
		if (item[11].length) {
			for (var j in item[11]) {
				var attachment = item[11][j];
				if (attachment[24][4] === 'video') {
					activity.object.attachments.push({
						objectType  : 'video',
						displayName : attachment[3] || undefined,
						content     : attachment[21] || undefined,
						url         : (attachment[5] ? attachment[5][1] : ''),
						image : {
							url       : imageResizeProxy
								+ encodeURIComponent((attachment[41][1]
									? attachment[41][1][1] : attachment[41][0][1])),
							type      : 'image/jpeg'
						}
					});
				}
				else if (attachment[24][4] === 'image') {
					activity.object.attachments.push({
						objectType  : 'photo',
						displayName : attachment[3] || undefined,
						content     : attachment[21] || undefined,
						url         :
							(attachment[47][0] && (attachment[47][0][1] === 'picasa'))
								? attachment[24][1] : undefined,
						image : {
							url       : imageResizeProxy
								+ encodeURIComponent(attachment[41][0][1]),
							type      : attachment[24][3]
						},
						fullImage : {
							url       : attachment[5][1],
							type      : attachment[24][3],
							height    : attachment[5][2],
							width     : attachment[5][3]
						}
					});
				}
				else if (attachment[24][4] === 'document') {
					activity.object.attachments.push({
						objectType  :
							(attachment[47] && attachment[47][0] && (attachment[47][0][1] === 'picasa'))
								? 'photo-album' : 'article',
						displayName : attachment[3] || undefined,
						content     : attachment[21] || undefined,
						url         : attachment[24][1]
					})
				}
				else if (attachment[24][4] === 'photo') {
					activity.object.attachments.push({
						objectType  : 'photo',
						displayName : attachment[3] || undefined,
						content     : attachment[21] || undefined,
						image : {
							url       : imageResizeProxy
								+ encodeURIComponent((attachment[41][1]
									? attachment[41][1][1] : attachment[41][0][1])),
							type      : attachment[24][3]
						},
						fullImage : {
							url       : (attachment[5]
								? attachment[5][1] : attachment[24][1]),
							type      : attachment[24][3]
						}
					});
				}
			}
		}
		if (!activity.object.attachments.length) {
			delete activity.object.attachments;
		}
		if (item[27]) {
			activity.geocode   = item[27][0] + ' ' + item[27][1];
			activity.address   = item[27][3];
//			activity.radius    =
			activity.placeId   = item[27][4];
			activity.placeName = item[27][2];
		}
		if (full && activity.object.replies.totalItems) {
			activity.object.replies.items = [];
			for (var i in item[7]) {
				activity.object.replies.items.push(this.getRepliyData(item[7][i]));
			}
		}
		if (full && activity.object.resharers.totalItems) {
			activity.object.resharers.items = [];
			for (var i in item[25]) {
				var sharer = item[25][i];
				activity.object.resharers.items.push({
					kind        : 'plus#person',
					id          : sharer[1],
					displayName : sharer[0],
					url         : this.getAbsoluteURL(sharer[5]),
					image : {
						url       : sharer[4]
					}
				});
			}
		}
		if (item[32]) {
			activity.access.items.push({
				type : 'public'
			});
		}
		if (item[53]) {
			activity.access.items.push({
				type : 'limited'
			});
		}
		if (item[83]) {
			activity.access.items.push({
				type : 'extended'
			});
		}
		return activity;
	},

	getRepliyData : function(comment) {
		return {
			kind          : 'plus#activity',
			title         : comment[2],
			id          	: comment[4],
			published     : new Date(comment[3]),
			edited        : (comment[14] ? new Date(comment[14]) : undefined),
			actor : {
				id          : comment[6],
				displayName : comment[1],
				url         : this.getAbsoluteURL(comment[10]),
				image : {
					url       : comment[16],
				}
			},
			plusoners : {
				totalItems  : comment[15][16],
				id          : comment[15][0]
			}
		};
	},

	sequence : 0,

	getReqid : function() {
		var sequence = this.sequence++;
		var now = new Date;
		var seconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
		return seconds + sequence * 1E5;
  },

	getDataByKey : function(arr, key, pos) {
		if (!pos) pos = 1;
		for (var i = 0, len = arr.length ; i < len ; i++) {
			var data = arr[i];
			if (data[0] === key) {
				return data[pos];
			}
		}
		return null;
	},

	getAbsoluteURL : function(url) {
		if (url.substr(0, 2) === './') {
			return this.BASE_URL + url.substr(1);
		}
		else if (url.substr(0, 1) !== '/') {
			return this.BASE_URL + '/' + url;
		}
		else {
			return this.BASE_URL + url;
		}
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
