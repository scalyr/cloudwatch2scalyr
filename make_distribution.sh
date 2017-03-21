#! /bin/bash

cd src
npm install
rm ../dist/cloudwatch2scalyr.zip
zip -q -r ../dist/cloudwatch2scalyr.zip *