'use strict';

const AWS = require('aws-sdk');
const http = require('http');
const zlib = require('zlib');
const request = require('request');

const baseUrl = process.env['SCALYR_BASE_URL'] || 'https://www.scalyr.com';
const addEventsUrl = baseUrl + '/addEvents';
const uploadLogsUrl = baseUrl + '/api/uploadLogs';

let logGroupOptions = {};
let userLogFile = null;
let userParserName = null;
let userServerHost = null;
if (process.env['LOG_GROUP_OPTIONS']) {
    logGroupOptions = JSON.parse(process.env['LOG_GROUP_OPTIONS']);
    let functionLogGroupName = process.env['AWS_LAMBDA_LOG_GROUP_NAME'].substr(1);
    const logGroupName = logGroupOptions[functionLogGroupName];
    if (logGroupName) {
        userLogFile = logGroupName['logfile'];
        userServerHost = logGroupName['serverHost'];
        userParserName = logGroupName['parser'];
    }
}

let defaultParserName = (process.env['PARSER_NAME'] || userParserName);
if (!defaultParserName || !defaultParserName.length) defaultParserName = 'cloudWatchLogs';

let defaultServerHost = (process.env['SERVER_HOST'] || userServerHost);

const useAddEventsApi = (process.env['USE_ADD_EVENTS_API'] == 'true');
const encryptedScalyrApiKey = process.env['SCALYR_WRITE_LOGS_KEY'];
let decryptedScalyrApiKey;


/**
 * Translates a CloudWatch message into a format appropriate for submitting to the Scalyr addEvents API endpoint.
 *
 * @param cloudWatchMessage   Incoming CloudWatch message.
 * @returns {Object}          Outgoing Scalyr message.
 */
function transformToAddEventsMessage(cloudWatchMessage) {
  let sessionOpts = logGroupOptions[cloudWatchMessage.logGroup] || {};
  let defaultSession = {
    'serverHost': defaultServerHost || `cloudwatch-${cloudWatchMessage.owner}`,
    'logfile': cloudWatchMessage.logGroup,
    'parser': defaultParserName
  };
  return {
    'token': decryptedScalyrApiKey,
    'session': cloudWatchMessage.logStream,
    'sessionInfo': Object.assign(defaultSession, sessionOpts),
    'events': cloudWatchMessage.logEvents.map((cloudWatchEvent) => {
      return {
        'ts': `${cloudWatchEvent.timestamp}000000`,
        'type': 0,
        'sev': 3,
        'attrs': {
          // TODO make changes here if you want to parse in AWS Lambda before sending to Scalyr
          'cwStream': cloudWatchMessage.logStream,
          'cwId': cloudWatchEvent.id,
          'message': cloudWatchEvent.message
        }
      };
    })
  };
}


/**
 * Translates a CloudWatch message into a format appropriate for submitting to the Scalyr uploadLogs API endpoint.
 * Note that the calling function will unpack some of these values into URL params.
 *
 * @param {Object} cloudWatchMessage   Incoming CloudWatch message.
 * @returns {Object}          Outgoing Scalyr message.
 */
function transformToUploadLogsMessage(cloudWatchMessage) {
  const serverHost = (defaultServerHost || `cloudwatch-${cloudWatchMessage.owner}`);
  const logfile = (userLogFile || cloudWatchMessage.logGroup);
  return {
    'token': encodeURIComponent(decryptedScalyrApiKey),
    'host': encodeURIComponent(serverHost),
    'logfile': encodeURIComponent(logfile),
    'logStream': encodeURIComponent(cloudWatchMessage.logStream),
    'body': cloudWatchMessage.logEvents.map((cloudWatchEvent) => {
      if (cloudWatchEvent.message.endsWith('\n')) {
        return cloudWatchEvent.message.substr(0, cloudWatchEvent.message.length - 1);
      }
      return cloudWatchEvent.message;
    }).join('\n')
  };
}

/**
 * Transforms a CloudWatch message into a format appropriate for submitting to a Scalyr API endpoint (either uploadLogs
 * or addEvents). The endpoint used depends on the value of the USE_ADD_EVENTS_API environment variable, which should
 * be true or false. If this environment variable isn't specified, then the uploadLogs API will be used.
 *
 * @param {Object} cloudWatchMessage   Incoming CloudWatch message.
 * @returns {Object}          Outgoing Scalyr message.
 */
function transformToPost(cloudWatchMessage) {
  if (useAddEventsApi) {
    return {
      headers: {'content-type': 'application/json'},
      url: addEventsUrl,
      body: JSON.stringify(transformToAddEventsMessage(cloudWatchMessage))
    };
  } else {
    const message = transformToUploadLogsMessage(cloudWatchMessage);
    return {
      headers: {'content-type': 'text/plain'},
      url: `${uploadLogsUrl}?token=${message.token}&host=${message.host}&logfile=${message.logfile}&server-logStream=${message.logStream}&parser=${defaultParserName}`,
      body: message.body
    };
  }
}

/**
 * Actual logic for processing a CloudWatch event. Unzips the event payload, translates it to a format appropriate
 * for Scalyr, then POSTs that to the Scalyr addEvents API.
 *
 * @param event
 * @param context
 * @param callback
 */
function processEvent(event, context, callback) {
  const payload = new Buffer(event.awslogs.data, 'base64');
  zlib.gunzip(payload, (err, res) => {
    if (err) return callback(err);

    const cloudWatchMessage = JSON.parse(res.toString('utf8'));
    if (cloudWatchMessage.logEvents && cloudWatchMessage.logEvents.length) {
      request.post(transformToPost(cloudWatchMessage), (error, response, body) => {
        console.log('Response from Scalyr:', body);
        if (response && response.statusCode) {
          if (response.statusCode === 200) {
            const msg = `Successfully submitted ${cloudWatchMessage.logEvents.length} log events to Scalyr.`;
            console.log(msg);
            callback(null, msg);
          } else {
            let msg = `Received status code ${response.statusCode}`;
            if (error) msg += ` and error '${error}'`;
            msg += ' from Scalyr';
            console.log(msg);
            callback(null, msg);
          }
        }
      });
    }
  });
}

/**
 * Entry point for AWS Lambda. Handles decryption of the Scalyr "Write Logs" API key (if necessary), then
 * delegates to processEvent.
 *
 * @param event
 * @param context
 * @param callback
 */
exports.handler = (event, context, callback) => {
  if (decryptedScalyrApiKey) {
    processEvent(event, context, callback);
  } else {
    // decryption code runs once and variables are stored outside of the function handler so that these
    // are decrypted once per container
    const kms = new AWS.KMS();
    kms.decrypt({CiphertextBlob: new Buffer(encryptedScalyrApiKey, 'base64')}, (err, data) => {
      if (err) {
        console.log('Decryption error:', err);
        return callback(err);
      }
      decryptedScalyrApiKey = data.Plaintext.toString('ascii');
      processEvent(event, context, callback);
    });
  }
};
