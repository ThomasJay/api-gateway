// API Gateway
//
// Written By Thomas Jay
//
// Copyright 2020, All Rights Reserved
//
// Permission is granted to anyone to use this code for any purpose.
//
// No gaurantee is made for its usefullness or correctness.

const express = require("express");
const compression = require("compression");
const cors = require("cors");
const bodyParser = require("body-parser");
const axios = require("axios");
const CronJob = require("cron").CronJob;
const { v4: uuidv4 } = require("uuid");
const redis = require("ioredis");
const fs = require("fs");

const app = express();
app.use(compression());
app.use(cors());
app.use(bodyParser.json());

const dotEnvLoadStatus = require("dotenv").config();

// Check load of .env parameters, fail if not loaded
if (dotEnvLoadStatus.error) {
  //  logger.errorRed("Failed to load env params");
  throw dotEnvLoadStatus.error;
}

// Loaded from Config File
var serviceMappings;

// Default Server port
const SERVER_PORT = process.env.SERVER_PORT || 8100;
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const HEALTH_CHECK_INTERVAL = process.env.HEALTH_CHECK_INTERVAL || 60;
const GATEWAY_ROUTES_CONFIG =
  process.env.GATEWAY_ROUTES_CONFIG || defaultgatewayroutes.json;

//configure redis client
const redis_client = redis.createClient({
  port: REDIS_PORT,
  host: REDIS_HOST,
});

redis_client.on("connect", function () {
  console.log("Redis Connected");
});

app.get("/status", async (req, res) => {
  let now = new Date().toLocaleString();

  var apiCallReport = [];

  try {
    redis_client.keys("API*", async function (err, keys) {
      if (err) {
        res.status(400);
        res.send("Report Failed");
      }

      for (var i = 0, len = keys.length; i < len; i++) {
        const key = keys[i];

        const value = await redis_client.get(key);

        apiCallReport.push({ api: key, calls: value });
      }

      // Sort results highest to lowest calls
      apiCallReport.sort(function (a, b) {
        return b.calls > a.calls;
      });

      res.status(200);
      res.json({
        title: "API Gateway Analytics",
        totalApiCalls: apiCallReport,
      });
    });
  } catch {
    res.status(400);
    res.send("Report Failed to collect data");
  }
});

app.post("/clearredis", async (req, res) => {
  redis_client.flushall();

  res.status(200);
  res.send("Redis Cache Cleared");
});

//Middleware Function to Check Redis Cache
const checkRedisCache = async (req, res, next) => {
  const fullURL = req.url;

  const shortMatches = fullURL.split("/");

  let match = "";
  let remainingURL = "";

  if (shortMatches.length > 0) {
    match = "/" + shortMatches[1];
  }

  console.log("match=" + match);

  // If we have a match, check for cachable data
  if (serviceMappings[match]) {
    const serviceMap = serviceMappings[match];
    if (serviceMap.cacheable) {
      redis_client.get(fullURL, (err, data) => {
        if (err) {
          console.log(err);
          res.status(500).send(err);
        }
        if (data != null) {
          res.status(200).send(data);
        } else {
          next();
        }
      });
      next();
    } else {
      next();
    }
  } else {
    next();
  }
};

const checkRateLimit = async (req, res, next) => {
  const fullURL = req.url;
  const ip = req.ip;

  const rateLimitKey = fullURL + ":" + ip;

  const shortMatches = fullURL.split("/");

  let match = "";
  let remainingURL = "";

  if (shortMatches.length > 0) {
    match = "/" + shortMatches[1];
  }

  console.log("match=" + match);

  // If we have a match, check for ratelimit data
  if (serviceMappings[match]) {
    const serviceMap = serviceMappings[match];

    var currentRateLimitValue = 0;

    if (serviceMap.rateLimit > 0) {
      try {
        currentRateLimitValue = await redis_client.incr(rateLimitKey);
      } catch (err) {
        console.error("checkRateLimit: could not increment key");
        throw err;
      }
    }

    console.log(
      `Inc Done. ${rateLimitKey} has value: ${currentRateLimitValue}`
    );

    if (currentRateLimitValue > serviceMap.rateLimit) {
      console.log(
        "checkRateLimit: over the limit: " +
          currentRateLimitValue +
          " of " +
          serviceMap.rateLimit
      );
      return res.status(429).send("Too many requests - try again later");
    }

    console.log(
      "Extending rateLimit time 10 seconds key: " +
        rateLimitKey +
        " value " +
        currentRateLimitValue
    );
    redis_client.expire(rateLimitKey, serviceMap.rateLimitDuration);
  }

  next();
};

app.get("*", checkRateLimit, checkRedisCache, async function (req, res, next) {
  processHTTPRequest(req, res, next);
});

app.post("*", checkRateLimit, checkRedisCache, async function (req, res, next) {
  processHTTPRequest(req, res, next);
});

const processHTTPRequest = async function (req, res, next) {
  const fullURL = req.url;

  console.log("URL Called: " + fullURL + " " + req.method);

  // console.log(req.headers);

  // Add / Increment Analytics for # of Calls of API End Point
  redis_client.incr("API-" + fullURL.split("?")[0] + ":" + req.method);

  const shortMatches = fullURL.split("/");

  let match = "";
  let remainingURL = "";

  if (shortMatches.length > 0) {
    match = "/" + shortMatches[1];

    remainingURL = fullURL.substr(match.length);
  }

  console.log("match=" + match);
  if (serviceMappings[match]) {
    const serviceMap = serviceMappings[match];
    //   console.log("Request Type:", req.method);

    // Get end point
    var endPointURL = serviceMap.endPoints[serviceMap.nextEndPoint].url;

    // Move to next end point if there are multiple ones
    if (serviceMap.endPoints.length > 1) {
      if (serviceMap.nextEndPoint + 1 > serviceMap.endPoints.length - 1) {
        serviceMap.nextEndPoint = serviceMap.nextEndPoint + 1;
      } else {
        serviceMap.nextEndPoint = 0;
      }
    } else {
      console.log("Only one end point, no inc to end point index");
      if (serviceMap.endPoints[0].lastHealthStatus === false) {
        console.log("Service not available 1");
        res.status(500);
        res.send("Service not available");
        return;
      }
    }

    if (req.method === "GET") {
      console.log("Process GET");
      // Pass all headers from caller to the new end point
      axios
        .get(endPointURL + remainingURL, { headers: req.headers })
        .then(function (response) {
          res.status(response.status);
          //console.log(response.headers);
          // Pass response headers to caller
          res.headers = response.headers;
          res.send(response.data);

          //add data to Redis
          //         redis_client.setex(id, 3600, JSON.stringify(starShipInfoData));
        })
        .catch(function (error) {
          if (error.response && error.response.status) {
            // handle error
            res.status(error.response.status);
            res.send(error.response.data);
          } else {
            console.log("Service not available 2");
            res.status(500);
            res.send("Service Unavailable");
          }
        });
    }

    if (req.method === "POST") {
      // Pass all headers from caller to the new end point
      const bodyData = req.body;
      console.log("Process POST : " + bodyData);
      axios
        .post(endPointURL + remainingURL, bodyData, { headers: req.headers })
        .then(function (response) {
          res.status(response.status);
          //console.log(response.headers);
          // Pass response headers to caller
          res.headers = response.headers;
          res.send(response.data);

          //add data to Redis
          //         redis_client.setex(id, 3600, JSON.stringify(starShipInfoData));
        })
        .catch(function (error) {
          if (error.response && error.response.status) {
            // handle error
            res.status(error.response.status);
            res.send(error.response.data);
          } else {
            console.log("Service not available 2");
            res.status(500);
            res.send("Service Unavailable");
          }
        });
    }
  } else {
    res.status(400);
    res.send("Failed to resolve mapping");
  }
};

// Health Check processing
const processHealthCheck = async function () {
  console.log(
    "Health Check Processing every " + HEALTH_CHECK_INTERVAL + " seconds"
  );

  for (const serviceMappingKey in serviceMappings) {
    console.log(" Key: " + serviceMappingKey);
    //   console.log(`${serviceMappingKey}: ${object[property]}`);

    const serviceMapping = serviceMappings[serviceMappingKey];

    for (const endPoint of serviceMapping.endPoints) {
      //console.log("healthURL: " + endPoint.healthURL);

      try {
        const healthResponse = await axios.get(endPoint.healthURL);

        console.log("Health status=" + healthResponse.status);
        // Check for healthy status
        if (healthResponse.status === 200) {
          console.log("Health true");
          endPoint.lastHealthStatus = true;
        } else {
          endPoint.lastHealthStatus = false;
          console.log("Health false");
        }
      } catch (error) {
        console.log("Health Failure: " + endPoint.healthURL);
        endPoint.lastHealthStatus = false;
        console.log("Health false");
      }
    }
  }
};

// Fire health check in 1 second
setTimeout(processHealthCheck, 1000);

// Run health Check for each end point that has a health check url
var healthCheckCronJob = new CronJob(
  "*/" + HEALTH_CHECK_INTERVAL + " * * * * *",
  processHealthCheck,
  null,
  true,
  "America/Los_Angeles"
);
healthCheckCronJob.start();

// Read Config json file
fs.readFile(GATEWAY_ROUTES_CONFIG, function (err, data) {
  // Check for errors
  if (err) {
    console.log("Config file error");
    throw err;
  }
  // Converting to JSON
  const configJSON = JSON.parse(data);

  serviceMappings = configJSON;

  console.log(JSON.stringify(serviceMappings)); // Print Config
});

// Start server
var server = app.listen(SERVER_PORT, function () {
  var port = server.address().port;

  console.log("API Gateway Server started... port:" + port);
});
