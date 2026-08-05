# Deploying the portal on Render

The repository includes `render.yaml` for a two-service production deployment in Render's
Singapore region:

- `bsbe-placement-portal`: the public web application and same-origin API proxy.
- `bsbe-placement-api`: the private NestJS API and its in-process maintenance worker.

Both services use paid Starter instances. This is intentional: Render's free web services sleep
when idle and do not permit outbound SMTP traffic on the common SMTP ports, so they are not a
suitable production target for timed exams or email sign-in.

## Before creating the Blueprint

1. Push this repository to a private GitHub, GitLab, or Bitbucket repository that Render can read.
2. Create a production MongoDB Atlas deployment and copy its `mongodb+srv://` connection string.
3. Create a private S3-compatible bucket. Keep the endpoint, region, bucket, access key, and secret
   ready.
4. Create an SMTP account that supports an alternate submission port such as 2525, or confirm that
   the selected Render plan can reach your provider's chosen port.
5. Generate a 32-byte rubric key and wrap it in a JSON key ring. PowerShell example:

   ```powershell
   $key = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
   @{ 'production-v1' = $key } | ConvertTo-Json -Compress
   ```

## Create the Blueprint

In Render, choose **New > Blueprint**, connect the private repository, and select `render.yaml`.
Render prompts for all entries marked `sync: false`. Enter:

| Variable                                   | Value                                      |
| ------------------------------------------ | ------------------------------------------ |
| `MONGODB_URI`                              | Production MongoDB Atlas connection string |
| `QUESTION_RUBRIC_KEYS_JSON`                | JSON generated above                       |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`    | Production SMTP server settings            |
| `SMTP_FROM`, `SMTP_USER`, `SMTP_PASSWORD`  | Sender identity and SMTP credentials       |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`    | Private object-storage location            |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Restricted object-storage credentials      |

Render generates the remaining cryptographic secrets. The API runs migrations before deployment
and bootstraps `walvekarchaitanya@gmail.com` as the initial administrator after its first successful
deployment. Candidate sign-in remains restricted to `@iitb.ac.in`.

## Verify the release

After both services show healthy:

1. Open `https://bsbe-placement-portal.onrender.com`.
2. Request an administrator sign-in code and confirm delivery through the production mailbox.
3. Sign in with a test `@iitb.ac.in` candidate account.
4. Upload a small question image, publish a test exam, complete an attempt, and download its result.

If Render reports that the public service name is already taken, rename it and update both
`PUBLIC_ORIGIN` and `CORS_ALLOWED_ORIGINS` in `render.yaml` to the resulting `onrender.com` origin.
