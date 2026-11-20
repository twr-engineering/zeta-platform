# Debugging Guide

Access logs and debug applications across frontend and backend.

## Frontend Debugging (Browser)

### Chrome DevTools MCP

Use the chrome-devtools MCP server to inspect the browser:

```
// Available MCP commands
mcp:chrome-devtools console.getLogs     // Get console output
mcp:chrome-devtools network.getRequests // Get network requests
mcp:chrome-devtools page.screenshot     // Capture current state
mcp:chrome-devtools page.navigate       // Navigate to URL
```

### Console Log Patterns

```typescript
// Structured logging for easy filtering
console.log("[Auth]", "User signed in:", userId);
console.log("[API]", "Request:", method, url);
console.log("[Error]", "Failed:", error.message);

// Object inspection
console.log("[Debug]", { user, session, timestamp: Date.now() });

// Timing
console.time("[Perf] fetchData");
await fetchData();
console.timeEnd("[Perf] fetchData");
```

### React DevTools

Install React DevTools browser extension for:
- Component tree inspection
- Props and state viewing
- Performance profiling
- Hooks debugging

### React Query DevTools

Add to your app for cache inspection:

```typescript
// app/providers.tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

export function Providers({ children }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

## Backend Debugging (Server)

### Next.js API Routes

```typescript
// app/api/example/route.ts
export async function GET(request: Request) {
  console.log("[API GET /example]", {
    url: request.url,
    headers: Object.fromEntries(request.headers),
  });

  try {
    const data = await fetchData();
    console.log("[API GET /example] Success:", data.length, "items");
    return NextResponse.json(data);
  } catch (error) {
    console.error("[API GET /example] Error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
```

### Server Component Debugging

```typescript
// app/dashboard/page.tsx
export default async function DashboardPage() {
  console.log("[Server] Rendering DashboardPage");

  const data = await getData();
  console.log("[Server] Fetched data:", data?.length ?? 0, "items");

  return <Dashboard data={data} />;
}
```

View logs in the terminal running `npm run dev` or in build output.

## Firebase Debugging

### Emulator Logs

```bash
# Start emulators with verbose logging
firebase emulators:start --debug

# Logs appear in terminal and at:
# http://localhost:4000 (Emulator UI)
```

### Firestore Debug

```typescript
// Enable Firestore debug logging
import { setLogLevel } from "firebase/firestore";
setLogLevel("debug"); // In development only
```

### Security Rules Testing

```bash
# Test rules without deployment
firebase emulators:start

# Run rules tests
npm run test:rules
```

Test rule in Emulator UI:
1. Go to http://localhost:4000
2. Select Firestore
3. Use "Rules Playground" tab
4. Simulate read/write operations

## Common Issues & Solutions

### CORS Errors

**Symptom**: Network requests fail with CORS error

**Solution**:
```typescript
// next.config.js
async headers() {
  return [
    {
      source: "/api/:path*",
      headers: [
        { key: "Access-Control-Allow-Origin", value: "*" },
        { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,DELETE" },
      ],
    },
  ];
}
```

### Firebase Auth State

**Symptom**: Auth state not persisting

**Debug**:
```typescript
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase/client";

onAuthStateChanged(auth, (user) => {
  console.log("[Auth State Changed]", {
    isAuthenticated: !!user,
    userId: user?.uid,
    email: user?.email,
  });
});
```

### Firestore Permission Denied

**Symptom**: Firestore operations fail with permission error

**Debug**:
1. Check Emulator UI Rules Playground
2. Verify auth state: `console.log(auth.currentUser)`
3. Check document path matches rules
4. Verify `request.auth.uid` in rules

### Hydration Errors

**Symptom**: React hydration mismatch warnings

**Causes**:
- Date/time rendering differs server/client
- Browser extensions modifying DOM
- Conditional rendering based on client state

**Solution**:
```typescript
"use client";

import { useEffect, useState } from "react";

function ClientOnlyComponent({ children }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return children;
}
```

### Build Errors

**Symptom**: `npm run build` fails

**Debug steps**:
1. Read the full error message
2. Check the file and line number
3. Look for TypeScript errors first
4. Check for missing environment variables
5. Verify all imports exist

```bash
# Get more verbose output
npm run build 2>&1 | tee build.log
```

## Structured Logging Pattern

```typescript
// lib/utils/logger.ts
type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  [key: string]: unknown;
}

function log(level: LogLevel, category: string, message: string, context?: LogContext) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}] [${category}]`;

  if (context) {
    console[level](prefix, message, context);
  } else {
    console[level](prefix, message);
  }
}

export const logger = {
  debug: (cat: string, msg: string, ctx?: LogContext) => log("debug", cat, msg, ctx),
  info: (cat: string, msg: string, ctx?: LogContext) => log("info", cat, msg, ctx),
  warn: (cat: string, msg: string, ctx?: LogContext) => log("warn", cat, msg, ctx),
  error: (cat: string, msg: string, ctx?: LogContext) => log("error", cat, msg, ctx),
};

// Usage
logger.info("Auth", "User signed in", { userId, method: "email" });
logger.error("API", "Request failed", { endpoint, status, error: error.message });
```

## Performance Debugging

### React Profiler

```typescript
import { Profiler } from "react";

function onRenderCallback(
  id: string,
  phase: "mount" | "update",
  actualDuration: number
) {
  console.log(`[Profiler] ${id} ${phase}: ${actualDuration.toFixed(2)}ms`);
}

<Profiler id="Dashboard" onRender={onRenderCallback}>
  <Dashboard />
</Profiler>
```

### Network Timing

```typescript
const start = performance.now();
const response = await fetch("/api/data");
const data = await response.json();
const duration = performance.now() - start;

console.log(`[Perf] API call: ${duration.toFixed(2)}ms`);
```

## Debug Checklist

When something isn't working:

1. [ ] Check browser console for errors
2. [ ] Check network tab for failed requests
3. [ ] Check server terminal for logs
4. [ ] Verify environment variables are set
5. [ ] Check Firebase Emulator UI
6. [ ] Test with a fresh browser (incognito)
7. [ ] Run `npm run build` to catch type errors
8. [ ] Check git status for uncommitted changes
