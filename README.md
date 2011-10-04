# Unofficial Google+ API compatible with Google+ API

It is an Unofficial Google+ API which aims for compatibility with [The Official Google+ API](http://developers.google.com/+/api/).

## Supported API Calls

*	GET /v1/people/*{userId}*  
	<http://developers.google.com/+/api/latest/people/get>

*	GET /v1/people/*{userId}*/activities/public  
	<http://developers.google.com/+/api/latest/activities/list>

*	GET /v1/people/*{userId}*/activities  
	**Original** (**May include the limited activities if logged in**, same as the user's posts page)

*	GET /v1/activities/*{activityId}*  
	<http://developers.google.com/+/api/latest/activities/get>  
	(**Original: including replies and plusoneId**)

*	GET /v1/activities/*{activityId}*/sharers  
	**Original**

*	GET /v1/activities/*{activityId}*/audience  
	**Original**

*	GET /v1/plusoners/*{plusoneId}*  
	**Original**

* GET /v1/login  
	**Original** (The credentials are hard-coded and you must modify them on your site.)

* GET /v1/logout  
	**Original**

* GET /v1/people/me  
	<http://developers.google.com/+/api/latest/people/get>  
	(**Login required**)

* GET /v1/stream/activities  
	**Original** (**Login required**)

* GET /v1/circles  
	**Original** (**Login required**)

* GET /v1/circle/*{circleId}*/activities  
	**Original** (**Login required**)

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
