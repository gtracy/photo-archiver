const { S3Client, ListObjectsV2Command } = require("@aws-sdk/client-s3");
const s3Client = new S3Client({
    region: "us-east-2",
    //credentials: fromIni({ profile: 'memories' }),
 });

const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");
const sesClient = new SESClient({ 
    region: "us-east-2",
    //credentials: fromIni({ profile: 'memories' }),
});

async function sendEmail(fromAddress, toAddresses, subject, body) {
  const params = {
    Source: fromAddress, // The email address or domain you verified with Amazon SES
    Destination: { // The destination for this email, composed of To:, CC:, and BCC: fields
      ToAddresses: toAddresses, // An array of email addresses
    },
    Message: { // The message to send
      Subject: { // The subject line of the email
        Data: subject,
        Charset: 'UTF-8',
      },
      Body: { // The body of the email
        Text: { // The content of the message, in text format
          Data: body,
          Charset: 'UTF-8',
        },
      },
    },
  };

  try {
    const data = await sesClient.send(new SendEmailCommand(params));
    console.log("Email sent successfully", data);
    return data;
  } catch (error) {
    console.error("Error sending email", error);
    throw error;
  }
}


async function findMissingObjects(bucketName, folderName) {
    const rootObjects = new Set();
    const folderObjects = new Set();

    // Helper function to list objects
    const listObjects = async (Prefix) => {
    let continuationToken;
        do {
            const listParams = {
                Bucket: bucketName,
                Prefix,
                ContinuationToken: continuationToken,
            };
            const response = await s3Client.send(new ListObjectsV2Command(listParams));
            response.Contents.forEach((item) => {
                // Strip the prefix from the key to compare names
                const itemName = item.Key.replace(Prefix, '');
                if (Prefix) {
                    folderObjects.add(itemName);
                } else {
                    rootObjects.add(itemName);
                }
            });
            continuationToken = response.NextContinuationToken;
        } while (continuationToken);
    };

    // List all objects in the root
    await listObjects('');

    // List all objects in the folder
    await listObjects(`${folderName}/`);

    // Find all objects in the folder that do not have a matching name in the root
    const missingFiles = [...folderObjects].filter((name) => !rootObjects.has(name));

    return missingFiles;
}

exports.handler = async (event) => {
    const fromAddress = 'gtracy@gmail.com'; // Replace with your "From" address
    const toAddresses = ['gtracy@gmail.com']; // Replace with your recipient list
    const subject = 'Validation results for the memories photo archive';
    const bucketName = process.env.S3_BUCKET;
    const folderName = process.env.FOLDDER_NAME || 'originals';

    console.log('Validating bucket:', bucketName, 'folder:', folderName);
    console.dir(event);

    try {
        const missingObjects = await findMissingObjects(bucketName, folderName)
        console.log('Missing objects:', missingObjects);
        const body = 'Missing objects in the parent directory:\n\n' + missingObjects.join('\n') + '\n\n';
        
        await sendEmail(fromAddress, toAddresses, subject, body)
        console.log('Email sent');
        console.log('Validation complete!');
    } catch(error) {
        console.error('An error occurred:', error);
    };
}

