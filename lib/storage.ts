import "server-only";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket)
    throw new Error("R2_NOT_CONFIGURED");
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

export async function copyPrivateObject(sourceKey: string, destinationKey: string) {
  const { client, bucket } = storageClient();
  await client.send(new CopyObjectCommand({
    Bucket: bucket,
    Key: destinationKey,
    CopySource: encodeURIComponent(`${bucket}/${sourceKey}`),
  }));
}

function storageClient() {
  const value = config();
  return {
    bucket: value.bucket,
    client: new S3Client({
      region: "auto",
      endpoint: `https://${value.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: value.accessKeyId, secretAccessKey: value.secretAccessKey },
    }),
  };
}

export async function uploadPrivateObject(key: string, bytes: Uint8Array, contentType: string) {
  const { client, bucket } = storageClient();
  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: contentType }),
  );
}

export async function deletePrivateObject(key: string) {
  const { client, bucket } = storageClient();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function privateObjectExists(key: string) {
  const { client, bucket } = storageClient();
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) return false;
    throw error;
  }
}

export async function createReadUrl(
  key: string,
  expiresIn = 300,
  responseContentDisposition?: string,
) {
  const { client, bucket } = storageClient();
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: responseContentDisposition,
    }),
    { expiresIn },
  );
}
