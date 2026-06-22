import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';

export class PhotoArchiverInfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. Define Lambda function names consistent across environments
    const migrationFunctionName = 'memories-photo-migration';
    const resizeFunctionName = 'photoResize';
    const validatorFunctionName = 'memories-photo-validator';

    // 2. CloudFormation parameter for the S3 Bucket Name to dynamically fetch storage metrics
    const s3BucketNameParam = new cdk.CfnParameter(this, 'S3BucketName', {
      type: 'String',
      description: 'Name of the S3 bucket storing the photos',
      default: 'memories-photo-archive'
    });

    // 3. Create the CloudWatch Dashboard
    const dashboard = new cloudwatch.Dashboard(this, 'PhotoArchiverDashboard', {
      dashboardName: 'PhotoArchiverObservability',
    });

    // Main Dashboard Title
    dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: '# Photo Archiver Observability Dashboard\nAggregated metrics for the Lambda services and the S3 storage bucket.',
        width: 24,
        height: 2,
      })
    );

    // Service Title Headers
    dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: '## 1. Photo Migration\nService that migrates photos from Google Drive to S3.',
        width: 8,
        height: 2,
      }),
      new cloudwatch.TextWidget({
        markdown: '## 2. Photo Resize\nLambda triggered on S3 uploads to resize photos.',
        width: 8,
        height: 2,
      }),
      new cloudwatch.TextWidget({
        markdown: '## 3. Bucket Validator\nScheduled Lambda checking for file consistency.',
        width: 8,
        height: 2,
      })
    );

    // Helper to generate metrics for a single Lambda function by name
    const createLambdaMetrics = (functionName: string) => {
      const metric = (metricName: string, label: string, statistic: string) => {
        return new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName,
          dimensionsMap: {
            FunctionName: functionName,
          },
          label,
          period: cdk.Duration.minutes(5),
          statistic,
          region: 'us-east-2',
        });
      };

      return {
        invocations: metric('Invocations', 'Invocations', 'Sum'),
        errors: metric('Errors', 'Errors', 'Sum'),
        throttles: metric('Throttles', 'Throttles', 'Sum'),
        durationAvg: metric('Duration', 'Avg Duration', 'Average'),
        durationP90: metric('Duration', 'p90 Duration', 'p90'),
        durationMax: metric('Duration', 'Max Duration', 'Maximum'),
      };
    };

    const migrationMetrics = createLambdaMetrics(migrationFunctionName);
    const resizeMetrics = createLambdaMetrics(resizeFunctionName);
    const validatorMetrics = createLambdaMetrics(validatorFunctionName);

    // Row 1: Invocations vs Errors
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Migration - Invocations vs Errors',
        left: [migrationMetrics.invocations],
        right: [migrationMetrics.errors],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Resize - Invocations vs Errors',
        left: [resizeMetrics.invocations],
        right: [resizeMetrics.errors],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Validator - Invocations vs Errors',
        left: [validatorMetrics.invocations],
        right: [validatorMetrics.errors],
        width: 8,
        height: 6,
      })
    );

    // Row 2: Duration Metrics
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Migration - Duration (Avg, p90, Max)',
        left: [migrationMetrics.durationAvg, migrationMetrics.durationP90, migrationMetrics.durationMax],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Resize - Duration (Avg, p90, Max)',
        left: [resizeMetrics.durationAvg, resizeMetrics.durationP90, resizeMetrics.durationMax],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Validator - Duration (Avg, p90, Max)',
        left: [validatorMetrics.durationAvg, validatorMetrics.durationP90, validatorMetrics.durationMax],
        width: 8,
        height: 6,
      })
    );

    // Row 3: Throttles Metrics
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Migration - Throttles',
        left: [migrationMetrics.throttles],
        width: 8,
        height: 4,
      }),
      new cloudwatch.GraphWidget({
        title: 'Resize - Throttles',
        left: [resizeMetrics.throttles],
        width: 8,
        height: 4,
      }),
      new cloudwatch.GraphWidget({
        title: 'Validator - Throttles',
        left: [validatorMetrics.throttles],
        width: 8,
        height: 4,
      })
    );

    // Row 4: S3 Section Header
    dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: '## S3 Photo Archive Storage Metrics\nMetrics relating to the S3 bucket size and object count.',
        width: 24,
        height: 2,
      })
    );

    // Define S3 Metrics using the parameter
    const bucketSizeBytes = new cloudwatch.Metric({
      namespace: 'AWS/S3',
      metricName: 'BucketSizeBytes',
      dimensionsMap: {
        BucketName: s3BucketNameParam.valueAsString,
        StorageType: 'StandardStorage',
      },
      statistic: 'Average',
      period: cdk.Duration.days(1),
      region: 'us-east-2',
    });

    const numberOfObjects = new cloudwatch.Metric({
      namespace: 'AWS/S3',
      metricName: 'NumberOfObjects',
      dimensionsMap: {
        BucketName: s3BucketNameParam.valueAsString,
        StorageType: 'AllStorageTypes',
      },
      statistic: 'Average',
      period: cdk.Duration.days(1),
      region: 'us-east-2',
    });

    // Row 5: S3 Widgets
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'S3 - Total Bucket Size (Bytes)',
        left: [bucketSizeBytes],
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'S3 - Total Objects Count',
        left: [numberOfObjects],
        width: 12,
        height: 6,
      })
    );
  }
}
