# Firestore Entity Patterns

ORM-like patterns for Firestore without actual ORM code. These patterns ensure consistency, type safety, and schema evolution.

## BaseEntity Interface

All Firestore documents extend this interface:

```typescript
// lib/entities/base.ts
import { Timestamp } from "firebase/firestore";

export interface BaseEntity {
  id: string;
  schemaVersion: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export const CURRENT_SCHEMA_VERSION = 1;
```

## Entity Definition Pattern

Each entity gets its own file with:
1. Interface definition
2. Firestore converter
3. Collection reference
4. Validation schema

```typescript
// lib/entities/user.ts
import {
  collection,
  doc,
  DocumentData,
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
  Timestamp,
} from "firebase/firestore";
import { z } from "zod";
import { db } from "@/lib/firebase/client";
import { BaseEntity, CURRENT_SCHEMA_VERSION } from "./base";

// ===================
// Interface
// ===================
export interface User extends BaseEntity {
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: "user" | "admin";
}

// ===================
// Validation Schema
// ===================
export const userSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(50),
  avatarUrl: z.string().url().nullable(),
  role: z.enum(["user", "admin"]),
});

export const createUserInput = userSchema.omit({
  role: true, // Set server-side
});

export const updateUserInput = userSchema.partial().omit({
  email: true, // Cannot change email
  role: true,  // Cannot self-promote
});

// ===================
// Firestore Converter
// ===================
export const userConverter: FirestoreDataConverter<User> = {
  toFirestore(user: User): DocumentData {
    return {
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      createdAt: user.createdAt,
      updatedAt: Timestamp.now(),
    };
  },

  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options: SnapshotOptions
  ): User {
    const data = snapshot.data(options);

    // Migrate old schema versions if needed
    const migrated = migrateUser(data, data.schemaVersion);

    return {
      id: snapshot.id,
      email: migrated.email,
      displayName: migrated.displayName,
      avatarUrl: migrated.avatarUrl ?? null,
      role: migrated.role ?? "user",
      schemaVersion: CURRENT_SCHEMA_VERSION,
      createdAt: migrated.createdAt,
      updatedAt: migrated.updatedAt,
    };
  },
};

// ===================
// Migration Function
// ===================
function migrateUser(data: DocumentData, version: number): DocumentData {
  let migrated = { ...data };

  // Migration from v1 to v2 (example)
  if (version < 2) {
    // v2 added avatarUrl field
    migrated.avatarUrl = migrated.avatarUrl ?? null;
  }

  // Migration from v2 to v3 (example)
  if (version < 3) {
    // v3 renamed 'name' to 'displayName'
    migrated.displayName = migrated.displayName ?? migrated.name;
  }

  return migrated;
}

// ===================
// Collection Reference
// ===================
export const usersCollection = collection(db, "users").withConverter(userConverter);

export const userDoc = (userId: string) =>
  doc(db, "users", userId).withConverter(userConverter);
```

## Collection Naming Conventions

| Collection | Document ID | Description |
|------------|-------------|-------------|
| `users` | Firebase Auth UID | User profiles |
| `posts` | Auto-generated | Blog posts, content |
| `comments` | Auto-generated | Comments on posts |
| `settings` | `{userId}` | User settings |
| `notifications` | Auto-generated | User notifications |

## Subcollection Pattern

For data that belongs to a parent document:

```typescript
// lib/entities/notification.ts
import { collection, doc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export interface Notification extends BaseEntity {
  type: "info" | "warning" | "success";
  message: string;
  read: boolean;
}

// Subcollection under users
export const userNotificationsCollection = (userId: string) =>
  collection(db, "users", userId, "notifications")
    .withConverter(notificationConverter);

export const notificationDoc = (userId: string, notificationId: string) =>
  doc(db, "users", userId, "notifications", notificationId)
    .withConverter(notificationConverter);
```

## React Query Hooks Pattern

```typescript
// lib/hooks/use-user.ts
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getDoc, setDoc, updateDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { userDoc, User, updateUserInput, CURRENT_SCHEMA_VERSION } from "@/lib/entities/user";

// ===================
// Query Keys
// ===================
export const userKeys = {
  all: ["users"] as const,
  detail: (id: string) => [...userKeys.all, id] as const,
};

// ===================
// Queries
// ===================
export function useUser(userId: string | undefined) {
  return useQuery({
    queryKey: userKeys.detail(userId!),
    queryFn: async () => {
      const snapshot = await getDoc(userDoc(userId!));
      if (!snapshot.exists()) {
        throw new Error("User not found");
      }
      return snapshot.data();
    },
    enabled: !!userId,
  });
}

// ===================
// Mutations
// ===================
export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      data,
    }: {
      userId: string;
      data: { email: string; displayName: string };
    }) => {
      const user: Omit<User, "id"> = {
        email: data.email,
        displayName: data.displayName,
        avatarUrl: null,
        role: "user",
        schemaVersion: CURRENT_SCHEMA_VERSION,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      await setDoc(userDoc(userId), user as User);
      return { id: userId, ...user };
    },
    onSuccess: (data) => {
      queryClient.setQueryData(userKeys.detail(data.id), data);
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      data,
    }: {
      userId: string;
      data: z.infer<typeof updateUserInput>;
    }) => {
      // Validate input
      const validated = updateUserInput.parse(data);

      await updateDoc(userDoc(userId), {
        ...validated,
        updatedAt: serverTimestamp(),
      });
    },
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: userKeys.detail(userId) });
    },
  });
}
```

## Query Patterns

### Simple Query

```typescript
import { query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { postsCollection } from "@/lib/entities/post";

async function getRecentPosts(authorId: string) {
  const q = query(
    postsCollection,
    where("authorId", "==", authorId),
    where("published", "==", true),
    orderBy("createdAt", "desc"),
    limit(10)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.data());
}
```

### Pagination with Cursors

```typescript
import { query, orderBy, limit, startAfter, getDocs } from "firebase/firestore";

async function getPaginatedPosts(lastDoc?: QueryDocumentSnapshot) {
  let q = query(
    postsCollection,
    orderBy("createdAt", "desc"),
    limit(20)
  );

  if (lastDoc) {
    q = query(q, startAfter(lastDoc));
  }

  const snapshot = await getDocs(q);
  return {
    posts: snapshot.docs.map(doc => doc.data()),
    lastDoc: snapshot.docs[snapshot.docs.length - 1],
    hasMore: snapshot.docs.length === 20,
  };
}
```

### Real-time Subscription

```typescript
"use client";

import { useEffect, useState } from "react";
import { onSnapshot, query, where } from "firebase/firestore";
import { userNotificationsCollection } from "@/lib/entities/notification";

export function useRealtimeNotifications(userId: string) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const q = query(
      userNotificationsCollection(userId),
      where("read", "==", false)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setNotifications(snapshot.docs.map(doc => doc.data()));
    });

    return () => unsubscribe();
  }, [userId]);

  return notifications;
}
```

## Index Requirements

Document common queries that need composite indexes:

```json
// firestore.indexes.json
{
  "indexes": [
    {
      "collectionGroup": "posts",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "authorId", "order": "ASCENDING" },
        { "fieldPath": "published", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ]
}
```

## Denormalization Patterns

When to denormalize:
- Frequently accessed together
- Reduces query complexity
- Read-heavy workloads

```typescript
// Post with author info denormalized
interface Post extends BaseEntity {
  title: string;
  content: string;
  authorId: string;
  // Denormalized from users collection
  authorName: string;
  authorAvatarUrl: string | null;
}
```

**Trade-off**: Must update denormalized data when source changes (use Cloud Functions or batch writes).
