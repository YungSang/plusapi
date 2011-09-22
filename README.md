# Unofficial Google+ API compatible with Google+ API

It is an Unofficial Google+ API which aims for compatibility with [The Official Google+ API](http://developers.google.com/+/api/).

## Supported API Calls

*	GET /v1/people/*{userId}*  
	<http://developers.google.com/+/api/latest/people/get>

*	GET /v1/people/*{userId}*/activities/public  
	<http://developers.google.com/+/api/latest/activities/list>

*	GET /v1/activities/*{activityId}*  
	<http://developers.google.com/+/api/latest/activities/get>

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

* Express (tested with v2.4.6) <http://search.npmjs.org/#/express>
* Request (tested with v2.1.1) <http://search.npmjs.org/#/request>