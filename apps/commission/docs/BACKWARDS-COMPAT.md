# Backwards Compatibility & Schema Versioning

Patterns for evolving Firestore schemas without breaking existing data.

## Core Principle

**Never break existing documents.** All schema changes must be backwards compatible through migrate-on-read.

## Schema Version Field

Every document includes a `schemaVersion` field:

```typescript
interface BaseEntity {
  id: string;
  schemaVersion: number;  // Always present
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

## Migrate-on-Read Pattern

When reading documents, check version and migrate if needed:

```typescript
// lib/entities/user.ts
const CURRENT_SCHEMA_VERSION = 3;

export const userConverter: FirestoreDataConverter<User> = {
  fromFirestore(snapshot: QueryDocumentSnapshot): User {
    const data = snapshot.data();
    const version = data.schemaVersion ?? 1;

    // Apply migrations in order
    const migrated = migrateUser(data, version);

    return {
      id: snapshot.id,
      ...migrated,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    };
  },

  toFirestore(user: User): DocumentData {
    return {
      ...user,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      updatedAt: Timestamp.now(),
    };
  },
};

function migrateUser(data: DocumentData, fromVersion: number): DocumentData {
  let result = { ...data };

  // v1 -> v2: Added avatarUrl field
  if (fromVersion < 2) {
    result.avatarUrl = result.avatarUrl ?? null;
  }

  // v2 -> v3: Renamed 'name' to 'displayName'
  if (fromVersion < 3) {
    result.displayName = result.displayName ?? result.name ?? "Unknown";
    delete result.name;
  }

  return result;
}
```

## Migration Types

### Adding a Field

Safest change - add with default value:

```typescript
// v1 -> v2: Add 'role' field
if (fromVersion < 2) {
  result.role = result.role ?? "user";
}
```

### Renaming a Field

Map old name to new name:

```typescript
// v2 -> v3: Rename 'userName' to 'displayName'
if (fromVersion < 3) {
  result.displayName = result.displayName ?? result.userName;
  delete result.userName;
}
```

### Changing Field Type

Convert during migration:

```typescript
// v3 -> v4: Convert 'tags' from comma-string to array
if (fromVersion < 4) {
  if (typeof result.tags === "string") {
    result.tags = result.tags.split(",").map(t => t.trim()).filter(Boolean);
  }
  result.tags = result.tags ?? [];
}
```

### Removing a Field

Just don't include it in the return type:

```typescript
// v4 -> v5: Remove deprecated 'legacyId' field
// Simply don't map it to the return object
```

### Restructuring Nested Data

```typescript
// v5 -> v6: Flatten 'address.city' and 'address.country' to 'city' and 'country'
if (fromVersion < 6) {
  if (result.address) {
    result.city = result.city ?? result.address.city;
    result.country = result.country ?? result.address.country;
    delete result.address;
  }
}
```

## Version Changelog Pattern

Document all schema changes:

```typescript
// lib/entities/user.ts

/**
 * User Schema Changelog
 *
 * v1 (initial):
 *   - email: string
 *   - name: string
 *   - createdAt: Timestamp
 *   - updatedAt: Timestamp
 *
 * v2 (2024-01-15):
 *   - Added: avatarUrl (string | null, default: null)
 *   - Added: role ("user" | "admin", default: "user")
 *
 * v3 (2024-02-01):
 *   - Renamed: name -> displayName
 *   - Migration: displayName = name ?? "Unknown"
 *
 * v4 (2024-03-10):
 *   - Added: preferences (object)
 *   - preferences.theme: "light" | "dark" (default: "light")
 *   - preferences.notifications: boolean (default: true)
 */
const CURRENT_SCHEMA_VERSION = 4;
```

## Lazy vs Eager Migration

### Lazy Migration (Recommended)

Migrate when document is read. Document stays at old version until written.

**Pros**:
- No downtime
- No batch jobs needed
- Immediate compatibility

**Cons**:
- Old documents remain until accessed
- Queries on new fields may miss old documents

### Eager Migration

Run a batch job to update all documents.

```typescript
// scripts/migrate-users-to-v4.ts
import { adminDb } from "@/lib/firebase/admin";

async function migrateUsersToV4() {
  const batch = adminDb.batch();
  const users = await adminDb
    .collection("users")
    .where("schemaVersion", "<", 4)
    .limit(500)
    .get();

  for (const doc of users.docs) {
    const data = doc.data();
    batch.update(doc.ref, {
      preferences: data.preferences ?? {
        theme: "light",
        notifications: true,
      },
      schemaVersion: 4,
      updatedAt: Timestamp.now(),
    });
  }

  await batch.commit();
  console.log(`Migrated ${users.docs.length} users`);

  // Continue if more documents exist
  if (users.docs.length === 500) {
    await migrateUsersToV4();
  }
}
```

**When to use eager migration**:
- Need to query on new fields
- Removing a field that has security implications
- Major restructuring

## Firestore Rules Compatibility

Ensure rules work with all schema versions:

```javascript
// firestore.rules
match /users/{userId} {
  function hasValidSchema() {
    // Accept v3 and v4 documents
    return request.resource.data.schemaVersion >= 3
        && request.resource.data.schemaVersion <= 4;
  }

  allow write: if isAuthenticated()
                && isOwner(userId)
                && hasValidSchema();
}
```

## Testing Migrations

```typescript
// __tests__/entities/user.test.ts
import { migrateUser } from "@/lib/entities/user";

describe("User Migrations", () => {
  it("migrates v1 to current version", () => {
    const v1Data = {
      email: "test@example.com",
      name: "Test User",
      schemaVersion: 1,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const migrated = migrateUser(v1Data, 1);

    expect(migrated.displayName).toBe("Test User");
    expect(migrated.avatarUrl).toBeNull();
    expect(migrated.role).toBe("user");
    expect(migrated.name).toBeUndefined();
  });

  it("handles missing optional fields", () => {
    const v2Data = {
      email: "test@example.com",
      displayName: "Test",
      schemaVersion: 2,
      // avatarUrl missing
    };

    const migrated = migrateUser(v2Data, 2);

    expect(migrated.avatarUrl).toBeNull();
  });
});
```

## Best Practices

1. **Always increment version** when schema changes
2. **Document every change** in the changelog
3. **Test migrations** with real data samples
4. **Keep migrations idempotent** - running twice shouldn't break
5. **Consider security rules** - they may need updates
6. **Plan for rollback** - migrations should be reversible if possible
