# Unofficial Google+ API compatible with Google+ API

It is an Unofficial Google+ API which aims for compatibility with [The Official Google+ API](http://developers.google.com/+/api/).

## Supported API Calls

* GET /v1/login  
	**Original** (The credentials are hard-coded and you must modify them on your site.)

* GET /v1/logout  
	**Original**

*	GET /v1/people/*{userId}*  
	<http://developers.google.com/+/api/latest/people/get>

*	GET /v1/people/*{userId}*/activities/public  
	<http://developers.google.com/+/api/latest/activities/list>

*	GET /v1/people/*{userId}*/activities  
	**Original** (**May include the limited activities if logged in**, same as the user's posts page)

*	GET /v1/people?query=*{string}*  
	<https://developers.google.com/+/api/latest/people/search>

* GET /v1/people/me  
	<http://developers.google.com/+/api/latest/people/get>  
	(**Login required**)

* GET /v1/people/me/activities/stream  
	**Original** (**Login required**)

* GET /v1/people/me/pages  
	**Original** (**Login required**)

* GET /v1/people/me/circles  
	**Original** (**Login required**)

* GET /v1/people/me/activities/circle/*{circleId}*  
	**Original** (**Login required**)

*	GET /v1/activities/*{activityId}*  
	<http://developers.google.com/+/api/latest/activities/get>  
	(**Original: including replies and plusoneId**)

*	GET /v1/activities/*{activityId}*/people/resharers  
	<https://developers.google.com/+/api/latest/people/listByActivity>

*	GET /v1/activities/*{activityId}*/people/plusoners  
	<https://developers.google.com/+/api/latest/people/listByActivity>

*	GET /v1/activities/*{activityId}*/people/audience  
	**Original** (**Login required**)

*	GET /v1/activities/*{activityId}*/comments  
	<https://developers.google.com/+/api/latest/comments/list>

*	GET /v1/activities?query=*{string}*  
	<https://developers.google.com/+/api/latest/activities/search>

*	GET /v1/plusoners/*{plusoneId}*  
	**Original**

## Supported Common Parameters

* callback
* prettyPrint
* pp (abbreviation of prettyPrint)  
	<http://developers.google.com/+/api/#common-parameters>

## Pagination Parameters Supported

* maxResults
* pageToken  
	<http://developers.google.com/+/api/#pagination>

## Partial Response Parameters *Not* Supported

* <http://developers.google.com/+/api/#partial-responses>

## Dependencies

* Node.js (tested with >= 0.4.11 < 0.5.0)  
	<http://nodejs.org/>

* Express (tested with 2.4.6)  
	<http://search.npmjs.org/#/express>

* Request (tested with 2.1.1)  
	<http://search.npmjs.org/#/request>

* Node-Markdown (tested with 0.1.0) for the static top page only  
	<https://github.com/andris9/node-markdown>

## Source

* <https://github.com/YungSang/plusapi>
