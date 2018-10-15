# Sending CloudWatch Logs to Scalyr

Amazon CloudWatch is a monitoring and logging service for the AWS ecosystem that
provides complete visibility into your cloud resources and applications.

But why dig into another logging system?

If you’re currently sending logs to CloudWatch all you need to do is to create
an AWS Lambda function with CloudWatch as a trigger and you can send CloudWatch
logs to Scalyr.

## What You’ll Do

In this guide you'll create an AWS Lambda function using the open source
`cloudwatch2scalyr` project to sendCloudWatch logs to Scalyr.

## What You Need

1. An application, service, or resource that is currently sending logs to
   CloudWatch.
2. A CloudWatch log group to serve as the event source for the trigger.
3. An AWS KMS key for encrypting of the Scalyr API key.
4. The `cloudwatch2scalyr` distribution zip file from the Scalyr GitHub
   repository. Download the latest zip file from [here](https://github.com/scalyr/cloudwatch2scalyr/blob/master/dist/cloudwatch2scalyr.zip).
   You’ll upload this to the Lambda function later on.
5. A Scalyr Write Logs API key.

## Steps

1. From the [AWS Lambda Console](https://console.aws.amazon.com/lambda/home)
   click the *Create Function* button.

    <img src="../markdown_images/image1.png"/>

2. Make sure the *Author from scratch* option is selected.

    <img src="../markdown_images/image2.png"/>

    Name the function whatever you want, here we're calling ours
    `sendCloudWatchLogsToScalyr`. For the runtime select `Node.js 4.3`.   

    For the Role, select *Create a new role from one or more templates*.
    Give the role a name, for this example, we’re using
    `myScalyrCloudWatchRole`. From the *Policy templates* dropdown select
    *AWS KMS decryption permissions*.

    When done, your info should resemble the following:

    <img src="../markdown_images/image3.png"/>

    Click the Create Function button Which will bring you to the
    function configuration screen.

    <img src="../markdown_images/image4.png"/>

3. On the left in the Designer column, scroll down and select *CloudWatch Logs*
   from the list of triggers.

   <img src="../markdown_images/image5.png"/>

   Scroll down to configure the trigger.

   You'll need to have an existing log group that will serve as your event
   source. If you don’t have one created already, refer to
   [Working with Log Groups and Log Streams](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/Working-with-log-groups-and-streams.html).

   For the filter name we're using `scalyrCloudWatchDemo`, but you can name it
   anything you want.

   Ensure the *Enable Trigger* checkbox is selected and then click the Add
   button to add the trigger to this Lambda function.

   <img src="../markdown_images/image6.png"/>

   Save the function by clicking the Save button.

   <img src="../markdown_images/image7.png"/>

4. The next step is to upload the `cloudwatch2scalyr` zip file.

   Click the function name (`sendCloudWatchLogsToScalyr` in our case) to view
   the configuration details.

   Scroll down to see the code editor and select *Upload a Zip file* from the
   code entry drop down.

   <img src="../markdown_images/image8.png"/>

   Click the Upload button and select the `cloudwatch2scalyr.zip` file that you
   downloaded earlier. Make sure the Runtime is set to `Node.js 4.3` and the
   Handler is set to `index.handler`.

5. Scroll further down to add your Scalyr API key as an environment variable.
   This API key will need to have the Write Logs access permission. You'll need
   to use `SCALYR_WRITE_LOGS_KEY` for the environment variable key.

   You'll also want to encrypt the API key, so expand the *Encryption
   configuration* section and check the box labeled
   *Enable helpers for encryption in transit*. In the following field select
   your existing AWS KMS key.

   Encrypt the `SCALYR_WRITE_LOGS_KEY` environment variable by clicking the
   Encrypt button.

   <img src="../markdown_images/image9.png"/>

   The following optional environment variables can also be configured to define
   which parser Scalyr should use as well as the Scalyr region to upload logs
   to.

   The parser can be configured through the `PARSER_NAME` environment variable
   and should match the parser defined in the Scalyr UI. If not specified,
   Scalyr will use the default parser.

   The Scalyr region to upload the logs to can be configured by setting the
   `SCALYR_BASE_URL`. If this is not set it defaults to https://www.scalyr.com.

   Make sure this parameter is set correctly. If it isn't, you won't see any
   error messages from Scalyr during the log upload and the AWS logs of the
   Lambda function will look as if everything is working, but the logs won't
   show up in Scalyr.

6. The last thing we need to do is define our *Execution role*. We’ve previously
   created a service role named `myScalyrCloudWatchRole` that has privileges to
   access CloudWatch.

   <img src="../markdown_images/image10.png"/>

   After saving the function your trigger will be live. As new logs are written
   to the CloudWatch log group that you've setup, you’ll see the logs in the
   Scalyr Logs View.

   <img src="../markdown_images/image11.png"/>

   <img src="../markdown_images/image12.png"/>

## Troubleshooting

* If you are not seeing the CloudWatch logs appear in Scalyr, check to make sure
  you can see the logs in CloudWatch. It may take a few minutes for the logs to
  appear in the Scalyr Logs View.
