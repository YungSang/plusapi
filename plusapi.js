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
				uri     : this.BASE_URL + '/accounts/ClientLogin',
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

	getPublicProfile : function(id, callback) {
		var self = this;
		request(
			{
				uri     : this.BASE_URL + '/_/profiles/get/' + id + '?hl=en',
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
			sp : '[1,2,"' + id + '",null,null,'
				+ (query.maxResults ? query.maxResults : 'null')
				+ ',null,"social.google.com",[]]',
			hl : 'en'
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
		var imageResizeProxy = 'http://images0-focus-opensocial.googleusercontent.com/gadgets/proxy?container=focus&gadget=a&resize_h=100&url=';
		for (var i = 0, len = items.length ; i < len ; i++) {
			var item = items[i];
			var activity = {
				kind              : 'plus#activity',
//				placeholder       :
				title             : item[20],
				published         : new Date(item[5]),
				updated           : new Date(item[38]),
				edited            : (item[70] ? new Date(item[70]/1000) : undefined),
				latest            : new Date(item[30]/1000),
					// new Date(item[30]/1000), updated (including +1 and comment)
					// new Date(item[38]),      posted
					// new Date(item[70]/1000), edited
				id                : item[8],
				url               : this.BASE_URL + '/' + item[21],
				actor : {
					id              : item[16],
					displayName     : item[3],
					url             : this.BASE_URL + item[24],
					image : {
						url           : item[18],
					}
				},
				verb              : (item[77] ? 'share' : (item[27] ? 'checkin' : 'post')),
				object : {
					objectType      : (item[77] ? 'activity' : 'note')
				},
				annotation        : item[47],
//				crosspostSource   :
				provider : {
					title           : (item[2] === 'Buzz') ? 'Google+' : item[2],
				},
				access : {
					kind            : "plus#acl",
//					description     :
					items           : [{
						type          : 'public',
//						id            :
					}]
				}
			};
			if (item[77]) {
				activity.object = extend(activity.object, {
					id              : item[39],
					actor : {
						id            : item[44][1],
						displayName   : item[44][0],
						url           : this.BASE_URL + item[44][5],
						image : {
							url         : item[44][4]
						}
						// item[43] via
						// item[44] origin
					}
				});
			}
			activity.object = extend(activity.object, {
				content         : item[4],
//				originalContent :
				url             : this.BASE_URL + '/'
					+ (item[77] ? item[77] : item[21]),
				replies : {
					totalItems    : item[93],
				},
				plusoners : {
					totalItems    : item[73][16],
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
							displayName : attachment[3],
							content     : attachment[21] || undefined,
							url         : attachment[5][1],
							image : {
								url       : imageResizeProxy
									+ encodeURIComponent(attachment[41][1][1]),
								type      : 'image/jpeg'
							}
						});
					}
					else if (attachment[24][4] === 'image') {
						activity.object.attachments.push({
							objectType : 'photo',
							content    : attachment[21] || undefined,
							url        : (attachment[47][0][1] === 'picasa')
								? attachment[24][1] : undefined,
							image : {
								url      : imageResizeProxy + encodeURIComponent(attachment[41][0][1]),
								type     : attachment[24][3]
							},
							fullImage : {
								url      : attachment[5][1],
								type     : attachment[24][3],
								height   : attachment[5][2],
								width    : attachment[5][3]
							}
						});
					}
					else if (attachment[24][4] === 'document') {
						activity.object.attachments.push({
							objectType   :
								(attachment[47][0][1] === 'picasa') ? 'photo-album' : 'article',
							displayName  : attachment[3],
							content      : attachment[21],
							url          : attachment[24][1]
						})
					}
					else if (attachment[24][4] === 'photo') {
						activity.object.attachments.push({
							objectType : 'photo',
							content    : attachment[21] || undefined,
							image : {
								url      : imageResizeProxy
									+ encodeURIComponent(attachment[41][1][1]),
								type     : attachment[24][3]
							},
							fullImage : {
								url      : attachment[5][1],
								type     : attachment[24][3]
							}
						});
					}
				}
			}
			if (item[27]) {
				activity.geocode   = item[27][0] + ' ' + item[27][1];
				activity.address   = item[27][3];
//				activity.radius    =
				activity.placeId   = item[27][4];
				activity.placeName = item[27][2];
			}
			json.push(activity);
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
