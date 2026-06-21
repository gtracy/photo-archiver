#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PhotoArchiverInfraStack } from '../lib/infra-stack';

const app = new cdk.App();
new PhotoArchiverInfraStack(app, 'PhotoArchiverInfraStack', {
  env: {
    region: 'us-east-2',
  },
});
