# Production Deployment Guide

This guide covers deploying apps to production using GCP Cloud Run and setting up custom domains.

## Deployment Platform

**All production apps deploy to GCP Cloud Run** (not Firebase Hosting).

- **Why Cloud Run?** Full server-side rendering support, automatic scaling, easy rollbacks
- **Region:** `us-central1` (default)
- **URL Pattern:** `https://{service}-{project-number}.{region}.run.app`

## Prerequisites

1. **Firebase project** with Firestore and Auth configured
2. **GitHub repo** pushed to `symphco/{app-name}`
3. **Service account** with Cloud Run Admin role
4. **Dockerfile** in the app root (see template below)

## Dockerfile Template

```dockerfile
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build with standalone output
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

## Next.js Config for Standalone

Add to `next.config.ts`:

```typescript
const nextConfig: NextConfig = {
  output: 'standalone',
  // ... other config
};
```

## GitHub Actions Workflow

Create `.github/workflows/deploy-cloudrun.yml`:

```yaml
name: Deploy to Cloud Run

on:
  release:
    types: [published]

env:
  PROJECT_ID: ${{ secrets.GCP_PROJECT_ID }}
  SERVICE: ${{ github.event.repository.name }}
  REGION: us-central1

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    permissions:
      contents: read
      id-token: write

    steps:
      - uses: actions/checkout@v4

      - id: auth
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2

      - name: Configure Docker
        run: gcloud auth configure-docker

      - name: Build and Push
        run: |
          docker build -t gcr.io/$PROJECT_ID/$SERVICE:${{ github.event.release.tag_name }} .
          docker push gcr.io/$PROJECT_ID/$SERVICE:${{ github.event.release.tag_name }}

      - name: Deploy to Cloud Run
        run: |
          gcloud run deploy $SERVICE \
            --image gcr.io/$PROJECT_ID/$SERVICE:${{ github.event.release.tag_name }} \
            --platform managed \
            --region $REGION \
            --allow-unauthenticated \
            --set-env-vars "NEXT_PUBLIC_FIRESTORE_NAMESPACE=prod"
```

## Deployment Steps

### 1. Initial Prod Deployment

```bash
# Create release tag
git tag -a v1.0.0 -m "Production release v1.0.0"
git push origin v1.0.0
```

The GitHub Action will automatically build and deploy to Cloud Run.

### 2. Verify Deployment

```bash
# Check Cloud Run service
gcloud run services describe {service-name} \
  --region=us-central1 \
  --project={project-id}
```

## Custom Domain Setup

### Symph Subdomain (*.symph.co)

1. **Request domain** via Symph Agency UI (Build phase → Assign Domain)

2. **Domain mapping is created automatically:**
   ```bash
   gcloud beta run domain-mappings create \
     --service={service-name} \
     --domain={subdomain}.symph.co \
     --region=us-central1 \
     --project={project-id}
   ```

3. **DNS is configured automatically** (CNAME → `ghs.googlehosted.com`)

4. **Wait for SSL** (10-15 minutes for new domains)

### Custom Domain (client's own)

1. **User adds DNS record:**
   ```
   Type: CNAME
   Name: @ or subdomain
   Value: ghs.googlehosted.com
   ```

2. **Create domain mapping:**
   ```bash
   gcloud beta run domain-mappings create \
     --service={service-name} \
     --domain={custom-domain} \
     --region=us-central1 \
     --project={project-id}
   ```

3. **Wait for SSL provisioning**

### Post-Domain Configuration

After domain is live, update these:

1. **Environment variables:**
   ```bash
   gcloud run services update {service-name} \
     --set-env-vars "NEXT_PUBLIC_APP_URL=https://{domain}" \
     --region=us-central1
   ```

2. **Firebase Auth authorized domains:**
   - Firebase Console → Authentication → Settings → Authorized domains
   - Add the new domain

3. **Update build-details.yaml:**
   ```yaml
   prod_domain: {subdomain}.symph.co
   prod_domain_type: symph  # or "custom"
   prod_url: https://{subdomain}.symph.co
   ```

## Release Tagging Convention

- **Format:** `v{major}.{minor}.{patch}` (e.g., `v1.0.0`, `v1.2.3`)
- **Always create a tag** for production releases
- Tags trigger the deployment workflow

```bash
# Create annotated tag with release notes
git tag -a v1.0.0 -m "Production release v1.0.0

Features:
- Feature 1
- Feature 2

Fixes:
- Bug fix 1"

# Push tag
git push origin v1.0.0
```

## Rollback

To rollback to a previous version:

```bash
# List revisions
gcloud run revisions list --service={service-name} --region=us-central1

# Route traffic to previous revision
gcloud run services update-traffic {service-name} \
  --to-revisions={revision-name}=100 \
  --region=us-central1
```

## Environment Variables

| Variable | DEV | PROD |
|----------|-----|------|
| `NEXT_PUBLIC_FIRESTORE_NAMESPACE` | `dev` | `prod` |
| `NEXT_PUBLIC_APP_URL` | `https://{slug}.dev.apps.symph.co` | `https://{domain}` |
| `SYMPH_PAY_BASE_URL` | Staging URL | Production URL |

## Troubleshooting

### SSL Certificate Pending
- Ensure DNS CNAME is correct (`ghs.googlehosted.com`)
- Wait 10-15 minutes for new domains
- Check: `gcloud beta run domain-mappings describe --domain={domain}`

### Domain Verification Required
- Add service account as Owner in Google Search Console
- Verify the parent domain (e.g., `symph.co` for `*.symph.co` subdomains)

### 502 Bad Gateway
- Check Cloud Run logs: `gcloud run services logs read {service-name}`
- Verify Dockerfile builds correctly
- Check `output: 'standalone'` in next.config.ts
