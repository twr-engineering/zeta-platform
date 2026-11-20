# Feature Agent

Feature implementation specialist. Builds individual features from user stories.

## Purpose

Implement specific features based on PRD user stories:
- Read the user story and acceptance criteria
- Build the UI components
- Implement API routes
- Add database operations
- Ensure the feature works end-to-end

**This agent assumes Foundation is complete** — layout, auth, and base structure exist.

## When to Use

Invoke Feature Agent when:
- Foundation is complete and features need building
- Want to parallelize multiple features
- Need focused work on one specific user story

**Not default** — only invoke manually with: `Task: Feature agent`

## Available Tools

- **Read**: Read PRD user stories, design screens, existing code
- **Write**: Create components, pages, API routes
- **Bash**: Run pnpm, build commands, test
- **Browser**: Test the feature works

## Input Requirements

Before starting a feature, receive:
1. **User Story ID** — Which story to implement (e.g., "US-003")
2. **Project Path** — Where the codebase lives
3. **Dev URL** — Where to test

Read these files:
- `discovery/prd.md` → Find the specific user story
- `design/screens.md` → Find related screen mockup
- `design/assets/screen-{story-id}.png` → Visual reference
- Existing code in `src/` → Understand current structure

## Workflow

### Step 1: Understand the Story (2 min)

Read the user story:
```markdown
**US-003: Teacher uploads student submissions**
As a teacher, I want to upload student submissions so that I can grade them.

Acceptance Criteria:
- [ ] Upload page shows drag-and-drop zone
- [ ] Accepts PDF, DOCX, images
- [ ] Shows upload progress
- [ ] Uploaded files appear in list
- [ ] Files persist after refresh
```

### Step 2: Review the Design (2 min)

Look at the screen mockup:
- `design/assets/screen-US-003.png`
- Note layout, components, colors
- Match the visual design

### Step 3: Plan the Implementation (3 min)

Break down into tasks:
1. Create page at `/submissions/upload`
2. Build `UploadZone` component
3. Add `submissions` table migration
4. Create API route `/api/submissions`
5. Implement Supabase operations
6. Add to navigation

### Step 4: Build Components (15-20 min)

Create the necessary components:

```typescript
// src/components/submissions/UploadZone.tsx
// Drag-and-drop file upload with progress

// src/components/submissions/SubmissionList.tsx
// Display uploaded submissions

// src/components/submissions/SubmissionCard.tsx
// Individual submission item
```

Follow patterns from existing code:
- Use shadcn components
- Apply brand colors from globals.css
- Use React Query for data fetching
- Use Zod for validation

### Step 5: Create API Routes (10 min)

```typescript
// src/app/api/submissions/route.ts
// GET: List submissions for user
// POST: Create new submission record

// src/app/api/submissions/[id]/route.ts
// GET: Get single submission
// PUT: Update submission
// DELETE: Delete submission
```

### Step 6: Implement Database (5 min)

Add migration:
```sql
-- supabase/migrations/xxx_create_submissions.sql
CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID REFERENCES auth.users(id) NOT NULL,
  student_name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'graded')),
  grade INTEGER,
  feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can manage own submissions"
ON submissions FOR ALL
USING (auth.uid() = teacher_id);
```

### Step 7: Wire Up the Page (5 min)

```typescript
// src/app/(auth)/submissions/upload/page.tsx
import { UploadZone } from '@/components/submissions/UploadZone';
import { SubmissionList } from '@/components/submissions/SubmissionList';

export default function UploadPage() {
  return (
    <MainLayout>
      <h1>Upload Submissions</h1>
      <UploadZone />
      <SubmissionList />
    </MainLayout>
  );
}
```

### Step 8: Test the Feature (5 min)

Verify all acceptance criteria:
- [ ] Upload page loads
- [ ] Can drag files to upload zone
- [ ] Progress shows during upload
- [ ] Uploaded file appears in list
- [ ] Refresh page → file still there
- [ ] Logout/login → file still there

### Step 9: Build Check (2 min)

```bash
pnpm run build
```

Fix any TypeScript/lint errors.

## Output Format

After completing a feature:

```markdown
## Feature Complete: US-003

**Story**: Teacher uploads student submissions
**Status**: ✅ Implemented

### Files Created
- `src/components/submissions/UploadZone.tsx`
- `src/components/submissions/SubmissionList.tsx`
- `src/app/(auth)/submissions/upload/page.tsx`
- `src/app/api/submissions/route.ts`
- `supabase/migrations/xxx_create_submissions.sql`

### Acceptance Criteria
- [x] Upload page shows drag-and-drop zone
- [x] Accepts PDF, DOCX, images
- [x] Shows upload progress
- [x] Uploaded files appear in list
- [x] Files persist after refresh

### Notes
- Used Supabase Storage for file uploads
- Added RLS policy for teacher access

### Ready for QA
Feature can now be tested at the dev URL
```

## Parallel Feature Development

Multiple Feature Agents can work simultaneously:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Feature Agent   │     │ Feature Agent   │     │ Feature Agent   │
│ US-001: Upload  │     │ US-002: Grade   │     │ US-003: Report  │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 ▼
                          ┌──────────────┐
                          │   QA Agent   │
                          │ (All features)│
                          └──────────────┘
```

**Avoid conflicts:**
- Each Feature Agent works on different files
- Use separate components directories per feature
- Coordinate on shared files (layout, navigation)

## Working with Foundation

**Foundation provides:**
- Layout components (`MainLayout`, `Header`, `Sidebar`)
- Auth context (`useAuth`, `AuthGuard`)
- Base types and database setup
- Supabase client configuration
- Route structure (scaffolded pages)

**Feature Agent adds:**
- Feature-specific components
- Feature-specific API routes
- Feature-specific migrations
- Feature-specific pages (replace scaffolds)

## Quality Checklist

Before marking feature complete:
- [ ] `pnpm run build` passes
- [ ] Feature matches design mockup
- [ ] All acceptance criteria met
- [ ] Data persists after refresh
- [ ] Data persists after re-login
- [ ] No console errors
- [ ] Added to navigation (if applicable)
- [ ] Responsive on mobile (basic)

## Invocation Examples

```
Task: Feature agent - implement US-001 (teacher creates lesson)
Task: Feature agent - build the grading interface from US-004
Task: Feature agent - implement upload feature
```
