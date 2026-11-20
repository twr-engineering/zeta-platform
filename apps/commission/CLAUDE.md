# AI-Native Agency Starter Template

> **Model Requirement:** Always use **Claude Opus 4.8** (`claude-opus-4-8`) for builds. This is configured in `.claude/settings.json`.

Build Next.js + Supabase web applications with AI coding agents. This template provides configuration and instructions only - no application code. The AI generates all code fresh based on your PRD.

## Tech Stack

- **Framework**: Next.js 15 (App Router) - full-stack in one
- **Styling**: Tailwind CSS v4 + Shadcn UI
- **Database**: Supabase (PostgreSQL) - Primary
- **Auth**: Supabase Auth
- **Secondary Database** (optional): Firebase Firestore
- **AI Tools**: Chrome DevTools MCP, Gemini API
- **Deployment**: Vercel

## Package Manager: pnpm

This template uses **pnpm** for faster installs and shared package caching.

```bash
# Check which package manager to use
# pnpm-lock.yaml exists → use pnpm
# package-lock.json exists → use npm (legacy projects)
```

## Quick Start

```bash
# Install dependencies (after AI generates package.json)
pnpm install

# Run Supabase locally (requires Docker)
npx supabase start

# Build to check for errors
pnpm run build

# Deploy to Vercel
vercel deploy
```

> **Note**: Never run `pnpm run dev` or `pnpm run start` autonomously. Let the user handle the dev server.

## Architecture Overview

```
src/
├── app/                    # Next.js App Router pages
│   ├── (auth)/            # Auth-required routes (grouped)
│   ├── (public)/          # Public routes
│   ├── api/               # API routes
│   └── layout.tsx         # Root layout
├── components/
│   ├── ui/                # Shadcn components
│   └── [feature]/         # Feature-specific components
├── lib/
│   ├── supabase/          # Supabase client & server setup
│   ├── firebase/          # Firebase client & admin (if needed)
│   ├── entities/          # Database entity definitions
│   └── hooks/             # React Query hooks
└── types/                 # TypeScript definitions
```

## Documentation (Progressive Disclosure)

| Doc | Purpose |
|-----|---------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture patterns |
| [SECURITY.md](docs/SECURITY.md) | OWASP security guidelines - **READ BEFORE AUTH** |
| [SUPABASE-PATTERNS.md](docs/SUPABASE-PATTERNS.md) | Database/RLS patterns |
| [BACKWARDS-COMPAT.md](docs/BACKWARDS-COMPAT.md) | Schema versioning patterns |

## Subagents

Specialized agents in `.claude/agents/` for specific tasks:

### Default Agents (Used Automatically)

| Agent | Purpose | Invoke With |
|-------|---------|-------------|
| **qa** | Browser automation self-QA | `Task: QA agent` |
| **code-review** | Code quality review | `Task: Code review agent` |
| **architect** | System design decisions | `Task: Architect agent` |
| **security** | OWASP compliance checks | `Task: Security agent` |
| **copywriter** | UI text and documentation | `Task: Copywriter agent` |
| **image-gen** | Gemini image generation | `Task: Image generation agent` |

### Build Parallelization Agents (Manual Only)

These agents enable parallel build execution. **Not used by default** — invoke manually for faster builds:

| Agent | Purpose | Invoke With |
|-------|---------|-------------|
| **foundation** | Project setup, Supabase config, auth flow, layout | `Task: Foundation agent` |
| **feature** | Implement individual features from user stories | `Task: Feature agent - implement US-XXX` |

**Parallel Build Pattern:**
```
1. Foundation Agent sets up base (15-20 min)
2. Once complete, spawn multiple Feature Agents
3. Each Feature Agent implements 1-2 user stories
4. QA Agent tests all features
```

This can reduce build time from 90 min (sequential) to 40-50 min (parallel).

## MCP Servers

Configured in `.mcp.json`:

- **supabase**: Database management, migrations, and queries (requires `SUPABASE_ACCESS_TOKEN`)
- **vercel**: Deployment management and project config (requires `VERCEL_TOKEN`)
- **chrome-devtools**: Browser automation for self-QA and debugging
- **context7**: Documentation lookup for libraries and frameworks (requires `CONTEXT7_API_KEY`)
- **firebase**: Firebase project management (secondary, requires `firebase login`)

## Development Workflow

### 1. Security-First Development

Before implementing any auth or data features:
1. Read [SECURITY.md](docs/SECURITY.md)
2. Review Supabase RLS policies
3. Plan security rules BEFORE writing code

### 2. Supabase Entity Pattern

All database tables follow the BaseEntity pattern:

```typescript
type BaseEntity = {
  id: string;
  created_at: string;
  updated_at: string;
}
```

### 3. Backwards Compatibility

Always version your schema:
- Use Supabase migrations for schema changes
- Never break existing data

### 4. Input Validation

Use Zod for all input validation:
- API route inputs
- Form submissions
- Database record validation

### 5. Testing Flow

1. Build: `pnpm run build` - check for TypeScript errors
2. **Run existing tests**: `npx playwright test` - catch regressions BEFORE moving on
3. QA: Invoke QA agent for browser testing
4. Security: Invoke Security agent for compliance check
5. QA agent writes Playwright tests to `tests/e2e/` and commits them

### 6. Regression Testing (CRITICAL)

**Before making any code changes**, check if Playwright tests exist:
```bash
ls tests/e2e/*.spec.ts 2>/dev/null
```

If tests exist, run them AFTER your changes:
```bash
npx playwright test
```

**When existing tests fail after your changes:**
- If the test conflicts with the current task requirements → **update the test**, add a comment: `// Updated: [reason], [date]`
- If the test is unrelated to your changes → **you broke something, fix your code**
- **NEVER silently delete a test**

**Add `data-testid` attributes** to interactive elements (buttons, inputs, links) so Playwright tests use stable selectors:
```tsx
<button data-testid="create-lesson-button">Create Lesson</button>
<input data-testid="email-input" type="email" />
```

## Key Patterns

### Server Components (Default)

```typescript
// app/dashboard/page.tsx - Server Component
export default async function DashboardPage() {
  const data = await getServerData();
  return <Dashboard data={data} />;
}
```

### Client Components (When Needed)

```typescript
"use client";
// Only for interactivity, hooks, browser APIs
```

### API Routes

```typescript
// app/api/resource/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  // Validate input with Zod
  // Use Supabase client
  // Return NextResponse
}
```

### Supabase RLS Policies

```sql
-- Enable RLS on table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "Users can view own data"
ON users FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Users can update own data"
ON users FOR UPDATE
USING (auth.uid() = id);
```

## Supabase Storage (File Uploads)

For any feature requiring file uploads (images, documents, submissions), use Supabase Storage:

```typescript
// lib/supabase/storage.ts
import { createClient } from "./client";

export async function uploadFile(
  file: File,
  bucket: string,
  path: string
): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file);
  
  if (error) throw error;
  
  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(data.path);
  
  return publicUrl;
}
```

**Storage Policies** (configure in Supabase Dashboard):
```sql
-- Authenticated users can upload to their own folder
CREATE POLICY "Users can upload own files"
ON storage.objects FOR INSERT
WITH CHECK (auth.uid()::text = (storage.foldername(name))[1]);

-- Public read access
CREATE POLICY "Public read access"
ON storage.objects FOR SELECT
USING (bucket_id = 'public');
```

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```bash
# Supabase (Primary)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Firebase (Secondary - optional)
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...

# AI
GEMINI_API_KEY=...
OPENAI_API_KEY=sk-...
```

### DEV vs PROD Environment Isolation (CRITICAL)

**DEV and PROD environments MUST be fully separated.** Never share env vars between them.

| Concern | DEV (`.env.local`) | PROD (Vercel Dashboard) |
|---------|-------------------|--------------------------|
| Supabase project | Dev project URL | Prod project URL |
| Payment gateways | **Sandbox/test mode** | **Live/production mode** |

**Payment Gateway Sandbox (DEV only):**
- DEV apps always use sandbox/test mode for payments
- Stripe test cards: https://docs.stripe.com/testing

**Production Deployment Target: Vercel**
- All apps deploy to Vercel
- CI/CD: GitHub integration with automatic deployments
- Environment variables: Set in Vercel Dashboard
- Custom domains: Configure in Vercel project settings

## 🤖 AI Model Selection (For AI-Powered Apps)

**If the app you're building has AI features (chat, generation, analysis, image creation), use the right model for each task.** Don't default everything to one model — pick based on the job.

### Model Reference

| Model | API | Best For | Cost | Speed |
|-------|-----|----------|------|-------|
| **GPT-5.2** | OpenAI | General AI tasks: chat, analysis, summarization, content generation, reasoning | $$$ | Medium |
| **GPT-5-mini** | OpenAI | Fast, well-defined tasks: classification, extraction, formatting, short completions | $ | Fast |
| **Gemini 3 Pro** | Google `@google/genai` | **Image generation**, multimodal input, vision | $$ | Medium |
| **Claude Sonnet 4** | Anthropic | Long-form writing, code generation within the app, nuanced analysis | $$ | Medium |

### When to Use What

```
User chat / conversational AI  →  GPT-5.2 (smart, natural)
Quick classification / tagging  →  GPT-5-mini (fast, cheap)
Image generation                →  Gemini 3 Pro (best quality/cost)
Image analysis / vision         →  Gemini 3 Pro (native multimodal)
Content writing / copywriting   →  GPT-5.2 or Claude Sonnet 4
Data extraction / parsing       →  GPT-5-mini (structured output)
Complex reasoning / planning    →  GPT-5.2
Summarization                   →  GPT-5-mini (short) or GPT-5.2 (nuanced)
```

### Implementation Pattern

```typescript
// lib/ai/models.ts — Centralized model config
export const AI_MODELS = {
  general: {
    provider: "openai",
    model: "gpt-5.2",
  },
  fast: {
    provider: "openai",
    model: "gpt-5-mini",
  },
  imageGen: {
    provider: "google",
    model: "gemini-2.5-flash-image",
  },
  writing: {
    provider: "openai",
    model: "gpt-5.2",
  },
} as const;
```

### Key Rules

- **Never hardcode model names** in components — always use `AI_MODELS` config
- **Use streaming** for chat/generation UIs (better UX)
- **Rate limit AI endpoints** — add middleware or per-user throttling
- **Cache results** when possible (e.g., same prompt = same classification)
- **Use `GPT-5-mini` by default** unless the task needs deeper reasoning — it's 10x cheaper

---

## ⚠️ Product Context (READ FIRST!)

**Before writing ANY code, read these artifacts from the product directory:**

### Discovery Artifacts (in `prd/` or `discovery/`)
| File | What to extract |
|------|-----------------|
| `brief.md` | Problem statement, target users, core value prop |
| `prd.md` | Features, user stories, acceptance criteria |
| `user-stories.md` | Detailed acceptance criteria per feature |

### Design Artifacts (in `design/` if available)
| File | What to extract |
|------|-----------------|
| `brand-guidelines.md` | **Colors** (apply to Tailwind config), typography, logo |
| `design-brief.md` | UX patterns, interaction guidelines |
| `screens.md` | Screen inventory, navigation flow, UI components |

### How to Apply

1. **Tailwind Config**: Extract brand colors from `brand-guidelines.md` and add to `tailwind.config.ts`:
   ```typescript
   colors: {
     primary: '#HEXCODE',
     secondary: '#HEXCODE',
     accent: '#HEXCODE',
   }
   ```

2. **Component Styling**: Follow the visual style described in `design-brief.md`

3. **Page Structure**: Match the screen inventory in `screens.md` — create pages for each screen listed

4. **Features**: Implement ALL user stories from `prd.md` with their acceptance criteria

5. **Copy/Text**: Use the product name, tagline, and descriptions from `brief.md`

## Commands Reference

```bash
# Development
pnpm run build          # Build and type-check
pnpm run lint           # Run ESLint

# Supabase
npx supabase start      # Start local Supabase
npx supabase db push    # Push migrations to remote
npx supabase gen types  # Generate TypeScript types

# Vercel Deployment
vercel deploy           # Deploy preview
vercel deploy --prod    # Deploy to production

# Shadcn UI
npx shadcn@latest add [component]     # Add UI components
```

## Critical Reminders

1. **Security First**: Always check SECURITY.md before auth implementation
2. **No Dev Server**: Never run `pnpm run dev` autonomously
3. **Validate Inputs**: Use Zod for all external inputs
4. **RLS by Default**: Supabase tables must have RLS policies
5. **NO MOCK DATA**: See below - this is critical

## ⚠️ NO MOCK DATA - REAL DATABASE ONLY

**This is the #1 cause of "half-baked" builds.** Every feature must use real database data.

### What NOT to Do

```typescript
// ❌ WRONG - Hardcoded mock data
const submissions = [
  { id: "1", student: "Alex", grade: 85 },
  { id: "2", student: "Maria", grade: 92 },
];
return submissions.map(s => <Card>{s.student}</Card>);
```

### What TO Do

```typescript
// ✅ CORRECT - Real Supabase data
const supabase = createClient();
const { data: submissions } = await supabase
  .from('submissions')
  .select('*')
  .eq('teacher_id', user.id);

// Show empty state if no data
if (!submissions?.length) {
  return <EmptyState message="No submissions yet" action={<UploadButton />} />;
}
return submissions.map(s => <Card>{s.student}</Card>);
```

### The Rule

| Scenario | Correct Approach |
|----------|------------------|
| List page with no data | Show empty state with CTA |
| Dashboard stats | Query real counts from database |
| User profile | Fetch from users table |
| Feature demo | Create real test data, not hardcoded |

### Empty State Pattern

Every list/dashboard MUST have an empty state:

```typescript
// components/EmptyState.tsx
export function EmptyState({ 
  icon, 
  title, 
  description, 
  action 
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon}
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
```

### Verification Checklist

Before marking any feature complete:
- [ ] Data comes from database, not hardcoded arrays
- [ ] Empty state shows when table is empty
- [ ] Create operation saves to database
- [ ] Created item appears in list without refresh
- [ ] Item persists after page refresh
- [ ] Item persists after logout/login

---

## Payment Gateway Integration (Placeholder)

When the product requires payments, integrate a payment gateway. Options include:

- **Stripe** - Recommended for most use cases
- **PayMongo** - For Philippines-based payments
- **Paddle** - For SaaS with tax handling
- **LemonSqueezy** - Simple merchant of record

### Environment Variables (Example for Stripe)

```env
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Implementation Notes

1. Always use test/sandbox mode for DEV
2. Never log or expose secret keys
3. Verify webhook signatures
4. Handle payment failures gracefully
5. Store transaction records in your database

Refer to the specific payment gateway's documentation for implementation details.

---

## Firebase/Firestore (Secondary - Optional)

If you need Firebase/Firestore as a secondary database (e.g., for real-time features):

### Setup

```bash
firebase login
firebase init firestore --project <project-id>
```

### Environment Variables

```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
```

### Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId;
    }
  }
}
```

Use Firestore for:
- Real-time subscriptions
- Offline-first mobile apps
- Document-based data that doesn't fit relational model

Use Supabase (primary) for:
- Relational data
- Complex queries with JOINs
- Auth and RLS
- Main application data
