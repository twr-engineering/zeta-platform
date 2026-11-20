# Security Guidelines

OWASP-aligned security practices for Next.js + Firebase applications.

> **Read this document before implementing any authentication or data access features.**

## OWASP Top 10 Checklist

### 1. Injection (A03:2021)

**Risk**: NoSQL injection in Firestore queries.

**Prevention**:
- Always validate and sanitize user input
- Use Zod for type-safe validation
- Never construct queries from raw user input

```typescript
// BAD - vulnerable to injection
const query = db.collection(userInput.collection);

// GOOD - validate first
const schema = z.object({
  collection: z.enum(["users", "posts", "comments"]),
});
const { collection } = schema.parse(userInput);
const query = db.collection(collection);
```

### 2. Broken Authentication (A07:2021)

**Risk**: Weak authentication, session hijacking.

**Prevention**:
- Use Firebase Auth (handles secure token management)
- Verify tokens server-side for sensitive operations
- Implement proper session management

```typescript
// Server-side token verification
import { adminAuth } from "@/lib/firebase/admin";

async function verifyAuth(request: Request) {
  const token = request.headers.get("authorization")?.split("Bearer ")[1];

  if (!token) {
    throw new Error("No token provided");
  }

  try {
    return await adminAuth.verifyIdToken(token);
  } catch {
    throw new Error("Invalid token");
  }
}
```

### 3. Sensitive Data Exposure (A02:2021)

**Risk**: Exposing sensitive data in responses, logs, or client bundles.

**Prevention**:
- Never include secrets in `NEXT_PUBLIC_*` variables
- Don't log sensitive data
- Filter API responses to only include necessary fields

```typescript
// BAD - exposes all user data
return NextResponse.json(userData);

// GOOD - return only needed fields
return NextResponse.json({
  id: userData.id,
  displayName: userData.displayName,
  avatarUrl: userData.avatarUrl,
});
```

### 4. XML External Entities (A05:2021)

**Not applicable** - We don't process XML.

### 5. Broken Access Control (A01:2021)

**Risk**: Users accessing other users' data.

**Prevention**:
- Firestore rules enforce access control
- Server-side authorization checks
- Never trust client-side auth state alone

```javascript
// firestore.rules
match /users/{userId} {
  // Users can only read/write their own document
  allow read, write: if request.auth.uid == userId;
}

match /posts/{postId} {
  // Anyone can read, only owner can write
  allow read: if true;
  allow write: if request.auth.uid == resource.data.authorId;
}
```

### 6. Security Misconfiguration (A05:2021)

**Risk**: Default configs, verbose errors, exposed endpoints.

**Prevention**:
- Review Firebase console settings
- Disable unused Firebase services
- Don't expose stack traces in production

```typescript
// Don't expose error details in production
catch (error) {
  console.error("Internal error:", error); // Log internally
  return NextResponse.json(
    { error: "An error occurred" }, // Generic message to client
    { status: 500 }
  );
}
```

### 7. Cross-Site Scripting (A03:2021)

**Risk**: XSS attacks through user-generated content.

**Prevention**:
- React escapes by default - don't bypass it
- Sanitize if using dangerouslySetInnerHTML
- Set Content-Security-Policy headers

```typescript
// BAD - XSS vulnerability
<div dangerouslySetInnerHTML={{ __html: userContent }} />

// GOOD - use a sanitizer if HTML is needed
import DOMPurify from "dompurify";
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userContent) }} />

// BEST - avoid HTML altogether
<div>{userContent}</div>
```

### 8. Insecure Deserialization (A08:2021)

**Risk**: Malicious data in serialized objects.

**Prevention**:
- Validate all incoming data with Zod
- Don't use eval() or Function() with user data

### 9. Using Components with Known Vulnerabilities (A06:2021)

**Risk**: Outdated dependencies with security issues.

**Prevention**:
- Regular `npm audit`
- Keep dependencies updated
- Review before adding new packages

```bash
# Check for vulnerabilities
npm audit

# Fix automatically where possible
npm audit fix
```

### 10. Insufficient Logging & Monitoring (A09:2021)

**Risk**: Unable to detect or respond to breaches.

**Prevention**:
- Log authentication events
- Log access to sensitive data
- Set up alerts for anomalies

## Firestore Security Rules Template

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ===================
    // Helper Functions
    // ===================

    // Check if user is authenticated
    function isAuthenticated() {
      return request.auth != null;
    }

    // Check if user owns the document
    function isOwner(userId) {
      return request.auth.uid == userId;
    }

    // Check if document has required schema version
    function hasSchemaVersion() {
      return request.resource.data.schemaVersion is number;
    }

    // Validate timestamp fields
    function hasValidTimestamps() {
      return request.resource.data.createdAt is timestamp
          && request.resource.data.updatedAt is timestamp;
    }

    // ===================
    // Default: Deny All
    // ===================
    match /{document=**} {
      allow read, write: if false;
    }

    // ===================
    // Users Collection
    // ===================
    match /users/{userId} {
      // Users can read their own data
      allow read: if isAuthenticated() && isOwner(userId);

      // Users can create their own document with valid schema
      allow create: if isAuthenticated()
                    && isOwner(userId)
                    && hasSchemaVersion()
                    && hasValidTimestamps();

      // Users can update their own document
      allow update: if isAuthenticated()
                    && isOwner(userId)
                    && hasSchemaVersion();

      // Users cannot delete their document (soft delete instead)
      allow delete: if false;
    }

    // ===================
    // Add more collections here
    // ===================

  }
}
```

## Input Validation with Zod

```typescript
// lib/utils/validation.ts
import { z } from "zod";

// Reusable schemas
export const emailSchema = z.string().email().toLowerCase();
export const passwordSchema = z.string().min(8).max(100);
export const uuidSchema = z.string().uuid();

// Entity schemas
export const createUserSchema = z.object({
  email: emailSchema,
  displayName: z.string().min(1).max(50),
  password: passwordSchema,
});

export const updateUserSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  avatarUrl: z.string().url().optional(),
});

// API route usage
export async function POST(request: Request) {
  const body = await request.json();

  const result = createUserSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", details: result.error.flatten() },
      { status: 400 }
    );
  }

  const { email, displayName, password } = result.data;
  // Safe to use validated data
}
```

## Authentication Best Practices

### Password Requirements

```typescript
const passwordSchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .max(100, "Password too long")
  .regex(/[A-Z]/, "Password must contain uppercase letter")
  .regex(/[a-z]/, "Password must contain lowercase letter")
  .regex(/[0-9]/, "Password must contain number");
```

### Session Management

```typescript
// Set auth cookie after login
import { cookies } from "next/headers";

async function setAuthCookie(token: string) {
  cookies().set("auth-token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 1 week
  });
}
```

### Protected API Routes

```typescript
// lib/auth/protect-route.ts
import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";

export function withAuth(handler: Function) {
  return async (request: Request, context: any) => {
    const token = request.headers.get("authorization")?.split("Bearer ")[1];

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      const decoded = await adminAuth.verifyIdToken(token);
      return handler(request, context, decoded);
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
  };
}

// Usage
export const GET = withAuth(async (request, context, user) => {
  // user is the decoded token
  return NextResponse.json({ userId: user.uid });
});
```

## Security Checklist Before Deploy

- [ ] Firestore rules reviewed and tested
- [ ] All inputs validated with Zod
- [ ] No secrets in client-side code
- [ ] Authentication required on sensitive routes
- [ ] Error messages don't expose internals
- [ ] `npm audit` shows no high/critical issues
- [ ] HTTPS enforced in production
- [ ] Environment variables properly set
