# API Gateway

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

2 - clearredis. Calling HTTP POSY /clearredis clears the redis values for the API Gateway. This peforms a FlushAll on the redis server.

## Written By Thomas Jay

Copyright 2020, All Rights Reserved

Permission is granted to anyone to use this code for any purpose.

No gaurantee is made for its usefullness or correctness.
