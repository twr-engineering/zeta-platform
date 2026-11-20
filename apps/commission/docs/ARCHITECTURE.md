# Architecture Patterns

System architecture patterns for Next.js + Firebase applications.

## Application Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Next.js App                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │ Server          │  │ Client          │                  │
│  │ Components      │  │ Components      │                  │
│  │ (RSC)           │  │ ("use client")  │                  │
│  └────────┬────────┘  └────────┬────────┘                  │
│           │                    │                            │
│           ▼                    ▼                            │
│  ┌─────────────────────────────────────────┐               │
│  │           React Query Cache              │               │
│  └─────────────────────────────────────────┘               │
│           │                    │                            │
│           ▼                    ▼                            │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │ API Routes      │  │ Firebase Client │                  │
│  │ (Server)        │  │ SDK (Client)    │                  │
│  └────────┬────────┘  └────────┬────────┘                  │
└───────────┼────────────────────┼────────────────────────────┘
            │                    │
            ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                     Firebase Services                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  Firestore  │  │    Auth     │  │   Storage   │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
src/
├── app/                        # Next.js App Router
│   ├── (auth)/                # Routes requiring authentication
│   │   ├── dashboard/
│   │   ├── settings/
│   │   └── layout.tsx         # Auth check wrapper
│   ├── (public)/              # Public routes
│   │   ├── page.tsx           # Landing page
│   │   └── about/
│   ├── api/                   # API routes
│   │   └── [resource]/
│   │       └── route.ts
│   ├── layout.tsx             # Root layout
│   └── providers.tsx          # Client providers wrapper
│
├── components/
│   ├── ui/                    # Shadcn UI components
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   └── ...
│   └── [feature]/             # Feature-specific components
│       ├── feature-list.tsx
│       └── feature-card.tsx
│
├── lib/
│   ├── firebase/
│   │   ├── client.ts          # Client SDK initialization
│   │   ├── admin.ts           # Admin SDK initialization
│   │   └── auth.ts            # Auth utilities
│   ├── entities/              # Firestore entity definitions
│   │   ├── base.ts            # BaseEntity interface
│   │   ├── user.ts
│   │   └── [entity].ts
│   ├── hooks/                 # React Query hooks
│   │   ├── use-user.ts
│   │   └── use-[entity].ts
│   └── utils/                 # Utility functions
│       └── validation.ts      # Zod schemas
│
└── types/                     # TypeScript definitions
    └── index.ts
```

## Component Patterns

### Server Components (Default)

Use for:
- Initial data fetching
- SEO-critical content
- Static content
- Database queries

```typescript
// app/dashboard/page.tsx
import { adminDb } from "@/lib/firebase/admin";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  // Server-side data fetching
  const data = await adminDb.collection("items").get();
  const items = data.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  return <DashboardClient initialData={items} />;
}
```

### Client Components

Use for:
- Interactivity (onClick, onChange)
- Browser APIs
- React hooks (useState, useEffect)
- Real-time subscriptions

```typescript
"use client";

import { useState } from "react";

export function DashboardClient({ initialData }) {
  const [items, setItems] = useState(initialData);
  // Interactive logic here
}
```

### Route Groups

Use parentheses for logical grouping without affecting URL:

```
app/
├── (auth)/           # /dashboard, /settings (not /auth/dashboard)
│   ├── dashboard/
│   └── settings/
├── (marketing)/      # /, /about (not /marketing/)
│   ├── page.tsx
│   └── about/
```

## Data Fetching Patterns

### Server-Side (API Routes + Admin SDK)

```typescript
// app/api/users/[id]/route.ts
import { NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase/admin";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  // Verify auth token
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.split("Bearer ")[1];

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);

    // Fetch data with Admin SDK
    const doc = await adminDb.collection("users").doc(params.id).get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ id: doc.id, ...doc.data() });
  } catch (error) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}
```

### Client-Side (React Query + Client SDK)

```typescript
// lib/hooks/use-user.ts
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { userConverter } from "@/lib/entities/user";

export function useUser(userId: string) {
  return useQuery({
    queryKey: ["user", userId],
    queryFn: async () => {
      const docRef = doc(db, "users", userId).withConverter(userConverter);
      const snapshot = await getDoc(docRef);
      return snapshot.data();
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, data }) => {
      const docRef = doc(db, "users", userId);
      await updateDoc(docRef, { ...data, updatedAt: serverTimestamp() });
    },
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: ["user", userId] });
    },
  });
}
```

## State Management

### React Query for Server State

- Cache management
- Background refetching
- Optimistic updates
- Infinite scroll

### React Context for UI State

- Theme
- Modal state
- Toast notifications
- Sidebar open/closed

### URL State for Navigation

- Filters
- Pagination
- Search params
- Tabs

## Authentication Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Landing    │────▶│    Login     │────▶│  Dashboard   │
│    Page      │     │    Page      │     │   (Auth)     │
└──────────────┘     └──────────────┘     └──────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │   Firebase   │
                     │     Auth     │
                     └──────────────┘
                            │
                     ┌──────┴──────┐
                     ▼             ▼
              ┌──────────┐  ┌──────────┐
              │  Client  │  │  Server  │
              │  State   │  │  Verify  │
              └──────────┘  └──────────┘
```

### Auth Layout Pattern

```typescript
// app/(auth)/layout.tsx
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase/admin";

export default async function AuthLayout({ children }) {
  const cookieStore = cookies();
  const token = cookieStore.get("auth-token")?.value;

  if (!token) {
    redirect("/login");
  }

  try {
    await adminAuth.verifyIdToken(token);
  } catch {
    redirect("/login");
  }

  return <>{children}</>;
}
```

## Error Handling

### API Routes

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = schema.parse(body);
    // ... handle request
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      );
    }
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

### Client Components

```typescript
"use client";

import { ErrorBoundary } from "react-error-boundary";

function ErrorFallback({ error, resetErrorBoundary }) {
  return (
    <div role="alert">
      <p>Something went wrong:</p>
      <pre>{error.message}</pre>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  );
}

export function FeatureWrapper({ children }) {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      {children}
    </ErrorBoundary>
  );
}
```

## Performance Considerations

1. **Server Components by default** - Less JavaScript shipped to client
2. **React Query caching** - Avoid redundant fetches
3. **Firestore indexes** - Fast queries on indexed fields
4. **Image optimization** - Use next/image
5. **Code splitting** - Dynamic imports for large components
6. **Edge runtime** - Consider for API routes
