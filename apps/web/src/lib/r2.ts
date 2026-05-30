import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// Variables de entorno requeridas en Railway:
//   R2_ACCOUNT_ID        — ID de cuenta Cloudflare (ej: abc123def456...)
//   R2_ACCESS_KEY_ID     — Access Key ID del token R2
//   R2_SECRET_ACCESS_KEY — Secret Access Key del token R2
//   R2_BUCKET_NAME       — Nombre del bucket (ej: helpdesk-attachments)
//   R2_PUBLIC_URL        — URL pública del bucket (ej: https://pub-xxx.r2.dev)

function getR2Client() {
  const accountId      = process.env.R2_ACCOUNT_ID;
  const accessKeyId    = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 no configurado — define R2_ACCOUNT_ID, R2_ACCESS_KEY_ID y R2_SECRET_ACCESS_KEY en Railway");
  }

  return new S3Client({
    region:   "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export async function uploadToR2(
  key:         string,
  body:        Buffer,
  contentType: string,
): Promise<string> {
  const bucketName = process.env.R2_BUCKET_NAME;
  const publicUrl  = process.env.R2_PUBLIC_URL;

  if (!bucketName || !publicUrl) {
    throw new Error("R2 no configurado — define R2_BUCKET_NAME y R2_PUBLIC_URL en Railway");
  }

  const client = getR2Client();

  await client.send(
    new PutObjectCommand({
      Bucket:      bucketName,
      Key:         key,
      Body:        body,
      ContentType: contentType,
    }),
  );

  return `${publicUrl.replace(/\/$/, "")}/${key}`;
}
