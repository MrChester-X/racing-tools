import {
  deploySite,
  deployFunction,
  getOrCreateBucket,
} from "@remotion/lambda";
import path from "path";

async function deploy() {
  const region = "us-east-1";

  console.log("Ensuring Lambda function is deployed...");
  const { functionName } = await deployFunction({
    region,
    timeoutInSeconds: 240,
    memorySizeInMb: 2048,
    createCloudWatchLogGroup: true,
    architecture: "arm64",
  });
  console.log(`Function deployed: ${functionName}`);

  console.log("Getting/creating S3 bucket...");
  const { bucketName } = await getOrCreateBucket({ region });
  console.log(`Bucket: ${bucketName}`);

  console.log("Deploying site (Remotion bundle)...");
  const { serveUrl } = await deploySite({
    bucketName,
    region,
    siteName: "race-overlay",
    entryPoint: path.resolve(__dirname, "../src/index.ts"),
  });
  console.log(`Site deployed: ${serveUrl}`);

  console.log("\n--- Save these values ---");
  console.log(`REMOTION_FUNCTION_NAME=${functionName}`);
  console.log(`REMOTION_SERVE_URL=${serveUrl}`);
  console.log(`REMOTION_REGION=${region}`);
  console.log(`REMOTION_BUCKET=${bucketName}`);
}

deploy().catch(console.error);
