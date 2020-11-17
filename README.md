# API Gateway

1.0.0

## Simple Microservices API Gateway

This Gateway allows for multiple Microservices to be connected together using a simple config file.

Each URL is mapped to a Microservice end point.

Each End point mapping can contain one or more service end points, if there are more then one then they will be used in a round robbin fasion.

Health Checks are performed on the HealthURL that is defined in the config file.

Default time for health checks are every 30 seconds, a Health Check will be performed when the API Gateway is started.

You can add multiple service end points that are not active yet by adding them to the config file, once they become active they will be used in the system.

If an end point goes down then the health check will remove the service from the round robbin call.

The system passes all incoming HTTP headers to the services and all response headers back to the caller.

You can defined HTTP GET content that can be cached with a TTL value.

CORS Note: CORS is enable for the Gateway so you do not have to support CORS on the microservices themselves, the Gateway manages that for you. It is open to the world.

## Utility functions

There are a couple of basic functions built into the system.

1 - status. Calling HTTP GET /status gives you output on the API calls, this consist of the URL endpoints and the number of calls to each end point broken up by GET, POST, PUT, PATCH and DELELTE.

2 - clearredis. Calling HTTP POST /clearredis clears the redis values for the API Gateway. This peforms a FlushAll on the redis server.

## Using the API Gateway

I used Node.js 10.x to develop this code.

Clone the repo, move into the repo directory and install the packages needed.

```bash
npm install
```

Copy the envDev file to your .env file. SERVER_PORT will be where the API Gateway is running.

```bash
cp envDev .env
```

Edit the .env file as needed.

You will need a local Redis instance to run this API Gateway.

Once the files are edited, simple run the Node project as follows:

```bash
node app
```

## Config File

Configuration for the API Gateway is through a simple JSON file.

This file contains the Gateway routes for each service.

This is a map that consist of the beginning route called and then the mappings to the service end point.

If the beginning route is http://localhost:8085/my-service and you have a config entry for "/my-service" mapping to another service of http://localhost:8080/services it will be expended to http://localhost:8080/services/ PLUS ANY Additional URL elements and parameters, query params and such are all added into the end of the mappings.

They key is that the route map name of "/my-service" is the key to the API Gateway service end point so when it receives http:localhost:8085/my-service/\* this then gets mapped to http://localhost:8080/services so calling http://localhost:8085/my-service/v1/users maps this to http://localhost:8080/services/v1/users

This works for HTTP GET, POST, PUT, PATCH and DELETE

In this mappings is a few other parameters to include the nextEndPoint, this should always be 0, cacheable can be true or false used with cacheTTL which is in seconds, when set to true, GET content will be cached for the number of seconds based ont eh cacheTTL so multiple calls to the API will return the same information. This is a simple JSON cache so the return code will always be a 200 status.

You also have rateLimit and rateLimitDuration, rateLimit is the number of calls that can be made to this end point (GET, POST, PUT, PATCH and DELETE) over the period of rateLimitDuration so if you set the rate limit to 25 and the duration to 10 you can make up to 25 calls to this API in 10 seconds, after that you will get a 429 status code - Too Many Requests. After the rateLimitDuration has expired (The remaining time needed) then the api is avaialble again. This is a sliding window rate limiter.

The final components in the config file are the "endPoints", this is an array consisting of elements of url, healthURL and lastHealthStatus. The url is the url of the service such as http://localhost:8080/service and the healthURL is the health check URL for the service like http://localhost:8080/health. The health service needs to return a 200 for a successful heatlh check, anothing else or a timeout will mark the service as down.

The health check is ran based on the settings in the HEALTH_CHECK_INTERVAL env parameter.

Here is an example of the file

```json
{
  "/device-services": {
    "nextEndPoint": 0,
    "cacheable": false,
    "cacheTTL": 3600,
    "rateLimit": 25,
    "rateLimitDuration": 10,
    "endPoints": [
      {
        "url": "http://localhost:8080/services",
        "healthURL": "http://localhost:8080/health",
        "lastHealthStatus": true
      },
      {
        "url": "http://localhost:8081/services",
        "healthURL": "http://localhost:8081/health",
        "lastHealthStatus": true
      }
    ]
  }
}
```

## Written By Thomas Jay

Copyright 2020, All Rights Reserved

Permission is granted to anyone to use this code for any purpose.

No gaurantee is made for its usefullness or correctness.
