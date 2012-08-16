var request     = require('request');
var vm          = require('vm');
var jsdom       = require("jsdom");
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
	BASE_URL     : 'https://plus.google.com',
	API_BASE_URL : 'https://www.googleapis.com/plus/v1',

	DEFAULT_HTTP_HEADERS : {
		'User-Agent' : 'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_3; en-us) AppleWebKit/534.1+ (KHTML, like Gecko) Version/5.0 Safari/533.16'
	},

	IS_LOGIN     : false,
	OZ_DATA      : {},

	isLogin : function() {
		return !!this.IS_LOGIN;
	},

	login : function(username, password, callback) {
		var self = this;
		var form = {};
		request(
			{
				uri     : 'https://accounts.google.com/Login',
				headers : this.DEFAULT_HTTP_HEADERS
			},
			function (e, response, body) {
				if (!e && response.statusCode == 200) {
					jsdom.env({
						html    : body,
						scripts : [
							'http://code.jquery.com/jquery-1.5.min.js'
						],
						done    : function(err, window) {
							var $ = window.$;
							$('#gaia_loginform input[type="hidden"]').each(function() {
								var $this = $(this);
								form[$this.attr('name')] = $this.val();
							});
							self.doLogin(form, username, password, callback);
						}
					});
				}
			}
		);
	},

	doLogin : function(form, username, password, callback) {
		var self = this;
		form['Email']    = username;
		form['Passwd']   = password;
		form['continue'] = form['followup'] = 'https://plus.google.com/';
		request(
			{
				uri     : 'https://accounts.google.com/ServiceLoginAuth',
				method  : 'POST',
				body    : querystring.stringify(form),
				headers : extend(this.DEFAULT_HTTP_HEADERS, {
					'Content-Type' : 'application/x-www-form-urlencoded',
				})
			},
			function (e, response, body) {
				if (!e && response.statusCode == 302) {
					self.IS_LOGIN = true;
					self.getInitialData(1, function(data) {
						if (data && !data.error) {
							self.OZ_DATA[1] = data;
						}
						return callback(data);
					});
					self.getInitialData(2, function(data) {
						if (data && !data.error) {
							self.OZ_DATA[2] = data;
						}
					});
					self.getInitialData(12, function(data) {
						if (data && !data.error) {
							self.OZ_DATA[12] = data;
						}
					});
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
					self.IS_LOGIN = false;
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

	getProfile : function(id, callback) {
		var self = this;
		if (!this.isLogin()) {
			return callback(this.makeErrorResponse({
				code    : 401,
				name    : 'authError',
				message : 'login required'
			}));
		}
		if (id) {
			this.getPublicProfile(id, function(data) {
				return callback(data);
			});
		}
		else {
			var data = this.OZ_DATA;
			return callback(this.getProfileData(data[2][0], data[2][1]));
		}
	},

	getPages : function(callback) {
		var self = this;
		if (!this.isLogin()) {
			return callback(this.makeErrorResponse({
				code    : 401,
				name    : 'authError',
				message : 'login required'
			}));
		}
		request(
			{
				uri     : this.BASE_URL + '/u/0/_/pages/getidentities/?'
					+ querystring.stringify({
						hl     : 'en',
						_reqid : this.getReqid(),
						rt     : 'j'
					}),
				method  : 'GET',
				headers : this.DEFAULT_HTTP_HEADERS
			},
			function (e, response, body) {
				if (!e && response.statusCode == 200) {
					data = vm.runInThisContext('data = (' + body.substr(5) + ')');
					data = self.getDataByKey(data[0], 'ope.gmir');
					if (!data) {
						return callback(self.makeErrorResponse({
							name    : 'parseError',
							message : 'invalid data format'
						}));
					}
					var pages = [];
					data.forEach(function(page) {
						if (page[1]) {
							pages.push({
								kind     : 'plus#page',
								category : page[1][0],
								id       : page[30],
								name     : page[4][3],
								icon     : page[3]
							});
						}
					});
					return callback(pages);
				}
				else {
					return callback(self.makeErrorResponse(e, extend(response, {
						name    : 'notFound',
						message : 'unable to find any pages'
					})));
				}
			}
		);
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
		var data = this.OZ_DATA;
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
	},

	getPublicProfile : function(id, callback) {
		var self = this;
		request(
			{
				uri     : this.BASE_URL + '/_/profiles/get/' + id + '?'
					+ querystring.stringify({
						hl     : 'en',
						_reqid : this.getReqid(),
						rt     : 'j'
					}),
				method  : 'GET',
				headers : this.DEFAULT_HTTP_HEADERS
			},
			function (e, response, body) {
				if (!e && response.statusCode == 200) {
					data = vm.runInThisContext('data = (' + body.substr(5) + ')');
					data = self.getDataByKey(data[0], 'op.gp');
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
		var body = {
			hl      : 'en',
			'f.req' : '[[1,2,"' + id + '",null,null,'
				+ (query.maxResults ? query.maxResults : 'null')
				+ ',null,"social.google.com",[],null,null,null,null,null,null,[],null,0,0],'
				+ (query.pageToken ? '"' + query.pageToken + '"' : 'null') + ']'
		};
		request(
			{
				uri     : this.BASE_URL + '/_/stream/getactivities/?'
					+ querystring.stringify({
						_reqid : this.getReqid(),
						rt     : 'j'
					}),
				method  : 'POST',
				body    : querystring.stringify(body),
				headers : extend(this.DEFAULT_HTTP_HEADERS, {
					'Content-Type' : 'application/x-www-form-urlencoded',
				})
			},
			function (e, response, body) {
				if (!e && response.statusCode == 200) {
					data = vm.runInThisContext('data = (' + body.substr(5) + ')');
					data = self.getDataByKey(data[0], 'os.nu');
					if (!data) {
						return callback(self.makeErrorResponse({
							name    : 'parseError',
							message : 'invalid data format'
						}));
					}
					var json = {
						kind     : 'plus#activityFeed',
						nextPageToken : data[1],
						selfLink : self.API_BASE_URL + '/people/'
							+ id + '/activities/public?' + querystring.stringify({
								maxResults : data[2][5]
							}),
						nextLink : self.API_BASE_URL + '/people/'
							+ id + '/activities/public?' + querystring.stringify({
								maxResults : data[2][5],
								pageToken  : data[1]
							}),
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
		var body = {
			hl      : 'en',
			'f.req' : '[[1,2,"' + id + '",null,null,'
				+ (query.maxResults ? query.maxResults : 'null')
				+ ',null,"social.google.com",[],null,null,null,null,null,null,[],null,0,0],'
				+ (query.pageToken ? '"' + query.pageToken + '"' : 'null') + ']'
		};
		request(
			{
				uri     : this.BASE_URL + '/_/stream/getactivities/?'
					+ querystring.stringify({
						_reqid : this.getReqid(),
						rt     : 'j'
					}),
				method  : 'POST',
				body    : querystring.stringify(body),
				headers : extend(this.DEFAULT_HTTP_HEADERS, {
					'Content-Type' : 'application/x-www-form-urlencoded',
				})
			},
			function (e, response, body) {
				if (!e && response.statusCode == 200) {
					data = vm.runInThisContext('data = (' + body.substr(5) + ')');
					data = self.getDataByKey(data[0], 'os.nu');
					if (!data) {
						return callback(self.makeErrorResponse({
							name    : 'parseError',
							message : 'invalid data format'
						}));
					}
					var json = {
						kind     : 'plus#activityFeed',
						nextPageToken : data[1],
						selfLink : self.API_BASE_URL + '/people/'
							+ id + '/activities?' + querystring.stringify({
								maxResults : data[2][5]
							}),
						nextLink : self.API_BASE_URL + '/people/'
							+ id + '/activities?' + querystring.stringify({
								maxResults : data[2][5],
								pageToken  : data[1]
							}),
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
		var body = {
			hl      : 'en',
			'f.req' : '[[1,2,"' + id + '",null,null,'
				+ (query.maxResults ? query.maxResults : 'null')
				+ ',null,"social.google.com",[],null,null,null,null,null,null,[],null,0,0],'
				+ (query.pageToken ? '"' + query.pageToken + '"' : 'null') + ']'
		};
		request(
			{
				uri     : this.BASE_URL + '/_/stream/getactivities/?'
					+ querystring.stringify({
						_reqid : this.getReqid(),
						rt     : 'j'
					}),
				method  : 'POST',
				body    : querystring.stringify(body),
				headers : extend(this.DEFAULT_HTTP_HEADERS, {
					'Content-Type' : 'application/x-www-form-urlencoded',
				})
			},
			function (e, response, body) {
				if (!e && response.statusCode == 200) {
					data = vm.runInThisContext('data = (' + body.substr(5) + ')');
					data = self.getDataByKey(data[0], 'os.nu');
					if (!data) {
						return callback(self.makeErrorResponse({
							name    : 'parseError',
							message : 'invalid data format'
						}));
					}
					var json = {
						kind     : 'plus#activityFeed',
						nextPageToken : data[1],
						selfLink : self.API_BASE_URL + '/stream/activities?'
							+ querystring.stringify({
								maxResults : data[2][5]
							}),
						nextLink : self.API_BASE_URL + '/stream/activities?'
							+ querystring.stringify({
								maxResults : data[2][5],
								pageToken  : data[1]
							}),
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
		var body = {
			hl      : 'en',
			'f.req' : '[[1,2,"' + id + '",null,null,'
				+ (query.maxResults ? query.maxResults : 'null')
				+ ',null,"social.google.com",[],null,null,null,null,null,null,[],null,0,0],'
				+ (query.pageToken ? '"' + query.pageToken + '"' : 'null') + ']'
		};
		request(
			{
				uri     : this.BASE_URL + '/_/stream/getactivities/?'
					+ querystring.stringify({
						_reqid : this.getReqid(),
						rt     : 'j'
				}),
				method  : 'POST',
				body    : querystring.stringify(body),
				headers : extend(this.DEFAULT_HTTP_HEADERS, {
					'Content-Type' : 'application/x-www-form-urlencoded',
				})
			},
			function (e, response, body) {
				if (!e && response.statusCode == 200) {
					data = vm.runInThisContext('data = (' + body.substr(5) + ')');
					data = self.getDataByKey(data[0], 'os.nu');
					if (!data) {
						return callback(self.makeErrorResponse({
							name    : 'parseError',
							message : 'invalid data format'
						}));
					}
					var json = {
						kind     : 'plus#activityFeed',
						nextPageToken : data[1],
						selfLink : self.API_BASE_URL + '/circle/'
							+ id + '/activities?' + querystring.stringify({
								maxResults : data[2][5]
							}),
						nextLink : self.API_BASE_URL + '/circle/'
							+ id + '/activities?' + querystring.stringify({
								maxResults : data[2][5],
								pageToken  : data[1]
							}),
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
			_reqid   : this.getReqid(),
			rt       : 'j'
		};
		request(
			{
				uri     : this.BASE_URL + '/_/stream/getactivity/?'
					+ querystring.stringify(qs),
				method  : 'GET',
				headers : this.DEFAULT_HTTP_HEADERS
			},
			function (e, response, body) {
				if (!e && response.statusCode == 200) {
					data = vm.runInThisContext('data = (' + body.substr(5) + ')');
					data = self.getDataByKey(data[0], 'os.u');
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
						message : 'Unable to find activity with ID: ' + id
					})));
				}
			}
		);
	},

	getPlusoners : function (id, query, callback) {
		var self = this;
		var body = {
			plusoneId : id
		};
		if (query.maxResults) {
			body.num = query.maxResults;
		}
		request(
			{
				uri     : this.BASE_URL + '/_/stream/getpeople/?'
					+ querystring.stringify({
						_reqid : this.getReqid(),
						rt     : 'j'
					}),
				method  : 'POST',
				body    : querystring.stringify(body),
				headers : extend(this.DEFAULT_HTTP_HEADERS, {
					'Content-Type' : 'application/x-www-form-urlencoded',
				})
			},
			function (e, response, body) {
				if (!e && response.statusCode == 200) {
					data = vm.runInThisContext('data = (' + body.substr(5) + ')');
					data = self.getDataByKey(data[0], 'os.gpp');
					if (!data) {
						return callback(self.makeErrorResponse({
							name    : 'parseError',
							message : 'invalid data format'
						}));
					}
					var json = {
						kind          : 'plus#peopleFeed',
						selfLink      : undefined,
						title         : 'Plus People Feed',
						nextPageToken : undefined,
						items         : []
					};
					for (var i in data) {
						json.items.push({
							kind        : 'plus#person',
							id          : data[i][1],
							displayName : data[i][0],
							url         : data[i][2],
							image : {
								url       : data[i][3]
							}
						});
					}
					if (!json.items.length) {
						delete json.items;
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
						_reqid : this.getReqid(),
						rt     : 'j'
					}),
				method  : 'GET',
				headers : this.DEFAULT_HTTP_HEADERS
			},
			function (e, response, body) {
				if (!e && response.statusCode == 200) {
					data = vm.runInThisContext('data = (' + body.substr(5) + ')');
					data = self.getDataByKey(data[0], 'os.sha');
					if (!data) {
						return callback(self.makeErrorResponse({
							name    : 'parseError',
							message : 'invalid data format'
						}));
					}
					var json = {
						kind          : 'plus#peopleFeed',
						selfLink      : undefined,
						title         : 'Plus Resharing People Feed',
						nextPageToken : undefined,
						items         : []
					};
					for (var i in data) {
						json.items.push({
							kind        : 'plus#person',
							id          : data[i][1],
							displayName : data[i][0],
							url         : self.getAbsoluteURL(data[i][5]),
							image : {
								url       : data[i][4]
							}
						});
					}
					if (!json.items.length) {
						delete json.items;
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
						_reqid : this.getReqid(),
						rt     : 'j'
					}),
				method  : 'GET',
				headers : this.DEFAULT_HTTP_HEADERS
			},
			function (e, response, body) {
				if (!e && response.statusCode == 200) {
					data = vm.runInThisContext('data = (' + body.substr(5) + ')');
					data = self.getDataByKey(data[0], 'os.aud', 2);
					if (!data) {
						return callback(self.makeErrorResponse({
							name    : 'parseError',
							message : 'invalid data format'
						}));
					}
					var json = {
						kind          : 'plus#peopleFeed',
						selfLink      : undefined,
						title         : 'Plus Audience People Feed',
						nextPageToken : undefined,
						items         : []
					};
					for (var i in data) {
						json.items.push({
							kind        : 'plus#person',
							id          : data[i][1],
							displayName : data[i][0],
							url         : self.getAbsoluteURL(data[i][5]),
							image : {
								url       : data[i][4]
							}
						});
					}
					if (!json.items.length) {
						delete json.items;
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

	searchPeople : function(q, query, callback) {
		var self = this;
		var body = {
			srchrp : '[["' + q + '",2,null],'
				+ (query.pageToken ? '["' + query.pageToken + '"]' : 'null') + ']'
		};
		request(
			{
				uri     : this.BASE_URL + '/_/s/query?'
					+ querystring.stringify({
						hl     : 'en',
						_reqid : this.getReqid(),
						rt     : 'j'
					}),
				method  : 'POST',
				body    : querystring.stringify(body),
				headers : extend(this.DEFAULT_HTTP_HEADERS, {
					'Content-Type' : 'application/x-www-form-urlencoded',
				})
			},
			function (e, response, body) {
				if (!e && response.statusCode == 200) {
					data = vm.runInThisContext('data = (' + body.substr(5) + ')');
					data = self.getDataByKey(data[0], 'sp.sqr');
					if (!data || !data[0]) {
						return callback(self.makeErrorResponse({
							name    : 'parseError',
							message : 'invalid data format'
						}));
					}
					var json = {
						kind          : 'plus#peopleFeed',
						selfLink      : self.API_BASE_URL + '/people?'
							+ querystring.stringify({
								query : q
							}),
						title         : 'Plus People Search Feed',
						nextPageToken : data[0][2],
						items         : []
					};
					for (var i in data[0][0]) {
						var person = data[0][0][i];
						json.items.push({
							kind        : 'plus#person',
							id          : person[0][2],
							displayName : person[1][0],
							url         : person[0][4],
							image : {
								url       : person[1][8]
							}
						});
					}
					if (!json.items.length) {
						delete json.items;
					}
					return callback(json);
				}
				else {
					return callback(self.makeErrorResponse(e, extend(response, {
						name    : 'notFound',
						message : 'unable to find query: ' + q
					})));
				}
			}
		);
	},

	searchActivities : function(q, query, callback) {
		var self = this;
		if (!query.maxResults) query.maxResults = 10;
		var body = {
			srchrp : '[["' + q + '",3,'
				+ ((query.orderBy === 'best') ? '1' : '2') + '],null,'
				+ (query.pageToken ? '["' + query.pageToken + '"]' : 'null') + ']'
		};
		request(
			{
				uri     : this.BASE_URL + '/_/s/query?'
					+ querystring.stringify({
						hl     : 'en',
						_reqid : this.getReqid(),
						rt     : 'j'
					}),
				method  : 'POST',
				body    : querystring.stringify(body),
				headers : extend(this.DEFAULT_HTTP_HEADERS, {
					'Content-Type' : 'application/x-www-form-urlencoded',
				})
			},
			function (e, response, body) {
				if (!e && response.statusCode == 200) {
					data = vm.runInThisContext('data = (' + body.substr(5) + ')');
					data = self.getDataByKey(data[0], 'sp.sqr');
					if (!data || !data[1]) {
						return callback(self.makeErrorResponse({
							name    : 'parseError',
							message : 'invalid data format'
						}));
					}
					var qs = {
						query      : q,
						maxResults : data[1][0][2][5],
					};
					if (data[1][0][2][11][2] == 1) {
						qs.orderBy = 'best';
					}
					var json = {
						kind     : 'plus#activityFeed',
						nextPageToken : data[1][2],
						selfLink : self.API_BASE_URL + '/activities?'
							+ querystring.stringify(qs),
						nextLink : self.API_BASE_URL + '/activities?'
							+ querystring.stringify(extend(qs, {
								pageToken : data[1][2]
							})),
						title    : 'Plus Search for ' + q,
						updated  : self.getUpdated(data[1][0][0]),
						id       : 'tag:google.com,2010:buzz-search-feed:???',
						items    : self.getActivitiesData(data[1][0][0])
					};
					return callback(json);
				}
				else {
					return callback(self.makeErrorResponse(e, extend(response, {
						name    : 'notFound',
						message : 'unable to find query: ' + q
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
			value : this.API_BASE_URL + '/people/' + id,
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
			updated           : new Date(item[30]/1000), // new Date(item[38]),
			edited            : (item[70] ? new Date(item[70]/1000) : undefined),
//			latest            : new Date(item[30]/1000),
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
				selfLink      : this.API_BASE_URL + '/activities/' + item[8] + '/comments'
			},
			plusoners : {
				totalItems    : item[73][16],
				id            : (item[73][16] ? item[73][0] : undefined),
				selfLink      : this.API_BASE_URL + '/activities/' + item[8] + '/people/plusoners'
			},
			resharers : {
				totalItems    : item[96],
				selfLink      : this.API_BASE_URL + '/activities/' + item[8] + '/people/resharers'
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
							url       : attachment[5][1] || attachment[41][0][1],
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
							url       : (attachment[5] && attachment[5][1]) || (attachment[41][1]
								? attachment[41][1][1] : attachment[41][0][1]),
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
			kind           : 'plus#comment',
			id             : comment[4],
			published      : new Date(comment[3]),
			updated        : new Date(comment[14] ? comment[14] : comment[3]),
			edited         : (comment[14] ? new Date(comment[14]) : undefined),
			actor : {
				id           : comment[6],
				displayName  : comment[1],
				url          : this.getAbsoluteURL(comment[10]),
				image : {
					url        : comment[16],
				}
			},
			verb           : 'post',
			object : {
				objectType   : 'comment',
				content      : comment[2],
				plusoners : {
					totalItems : comment[15][16] || 0,
					id         : (comment[15][16] ? comment[15][0] : undefined)
				}
			}
//			selfLink       : this.API_BASE_URL + 'comments/' + comment[4]
		};
	},

	sequence : 0,

	getReqid : function() {
		var sequence = this.sequence++;
		var now = new Date;
		var seconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
		return seconds + sequence * 1E5;
	},

	getInitialData : function(key, callback) {
		var self = this;
		var body = {
			key : key
		};
		request(
			{
				uri     : this.BASE_URL + '/u/0/_/initialdata?' +
					querystring.stringify({
						hl     : 'en',
						_reqid : this.getReqid(),
						rt     : 'j'
					}),
				method  : 'POST',
				body    : querystring.stringify(body),
				headers : extend(this.DEFAULT_HTTP_HEADERS, {
					'Content-Type' : 'application/x-www-form-urlencoded',
				})
			},
			function (e, response, body) {
				if (!e && response.statusCode == 200) {
					data = vm.runInThisContext('data = (' + body.substr(5) + ')');
					data = self.getDataByKey(data[0], 'idr');
					if (data) {
						data = vm.runInThisContext('data = (' + data + ')');
						return callback(data[key]);
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
						message : 'unable to map key: ' + key
					})));
				}
			}
		);
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
