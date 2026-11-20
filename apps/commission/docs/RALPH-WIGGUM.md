# Ralph Wiggum Development Methodology

Loop-based autonomous development for AI coding agents.

## Overview

The Ralph Wiggum technique (named after the Simpsons character) is an iterative development methodology that uses continuous AI loops with clear completion criteria. It embodies persistent iteration despite setbacks - "I'm in danger!" becomes "I'm making progress!"

## Core Concept

Instead of asking an AI to complete a task in one shot, you:
1. Define clear completion criteria
2. Run the AI in a loop until criteria are met
3. Track progress between iterations
4. Handle failures gracefully

## Basic Loop Structure

```
┌─────────────────────────────────────────┐
│           Start Loop                     │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│     Read PRD & Progress File            │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│     Execute Next Task                    │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│     Update Progress File                 │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│     Check Completion Criteria            │
│                                          │
│  ┌──────────┐         ┌──────────┐      │
│  │   Done   │         │ Continue │      │
│  └────┬─────┘         └────┬─────┘      │
└───────┼────────────────────┼────────────┘
        │                    │
        ▼                    │
┌──────────────┐             │
│    Exit      │             │
└──────────────┘             │
                             │
        ┌────────────────────┘
        │
        ▼
   (Loop back to Start)
```

## Progress File Format

Track progress in `prd/progress.txt`:

```
# Project: [Project Name]
# Started: [Date]
# Last Updated: [Timestamp]

## Completion Criteria
- [ ] User authentication working
- [ ] Dashboard displays user data
- [ ] CRUD operations functional
- [x] Project scaffolded
- [x] Firebase connected

## Current Status
Working on: User authentication

## Completed Tasks
1. [2024-01-15 10:00] Initialized Next.js project
2. [2024-01-15 10:15] Set up Firebase configuration
3. [2024-01-15 10:30] Created basic layout

## Blockers
- None currently

## Notes
- Using Firebase Auth email/password
- Need to implement password reset flow
```

## Prompt Templates

### Initial Setup Prompt

```
You are building [PROJECT_NAME] based on the PRD in prd/requirements.md.

Your completion criteria are:
1. [Specific criterion 1]
2. [Specific criterion 2]
3. [Specific criterion 3]

Current progress is tracked in prd/progress.txt.

Instructions:
1. Read the PRD and progress file
2. Identify the next incomplete task
3. Implement it
4. Update progress.txt with what you completed
5. Run build to verify no errors
6. Report your status

If you encounter a blocker, document it in progress.txt and move to the next task.
```

### Continuation Prompt

```
Continue building [PROJECT_NAME].

Read prd/progress.txt to see current status.

Pick up where the last iteration left off:
1. Check completion criteria
2. If not done, implement next task
3. Update progress.txt
4. Run build
5. Report status

If all criteria are met, respond with "COMPLETE: [summary]"
```

### Recovery Prompt

```
The previous iteration encountered an error:
[ERROR_DETAILS]

Read prd/progress.txt for context.

Instructions:
1. Analyze the error
2. Fix the issue
3. Update progress.txt with the fix
4. Continue normal development
```

## Integration with Subagents

Use specialized agents at key points:

```
Loop iteration:
1. Read PRD and progress
2. Implement feature
3. Task: Code review agent - review the changes
4. Fix any issues found
5. Task: Security agent - check for vulnerabilities
6. Fix any issues found
7. npm run build
8. Task: QA agent - test the feature
9. Update progress
```

## Max Iterations Safety

Always set a maximum iteration count:

```
MAX_ITERATIONS = 20
current_iteration = 0

while not complete and current_iteration < MAX_ITERATIONS:
    run_iteration()
    current_iteration += 1

if current_iteration >= MAX_ITERATIONS:
    alert("Max iterations reached - manual intervention needed")
```

## Completion Detection

Clear, verifiable criteria:

**Good Criteria**:
- `npm run build` succeeds
- All tests pass
- Specific feature works (testable)
- No TypeScript errors

**Bad Criteria**:
- "Code is clean"
- "App works well"
- "Implementation is complete"

## Error Recovery Strategies

### Build Failures

```
1. Read error message
2. Identify file and line
3. Fix the specific issue
4. Re-run build
5. If same error, try different approach
6. If stuck after 3 attempts, document and move on
```

### Test Failures

```
1. Run failing test in isolation
2. Check test expectations
3. Fix code or update test
4. Verify fix doesn't break other tests
```

### Runtime Errors

```
1. Check browser console (via DevTools MCP)
2. Add console.log for debugging
3. Trace error to source
4. Fix and remove debug logs
```

## Progress Tracking Best Practices

1. **Atomic updates** - Update progress after each small task
2. **Timestamps** - Include when each task was completed
3. **Context** - Include enough detail to resume later
4. **Blockers** - Document what's preventing progress
5. **Decisions** - Record why certain approaches were chosen

## Example Session

```
# Iteration 1
> Reading PRD... Project: Task Manager App
> Reading progress.txt... Starting fresh
> First task: Initialize Next.js project
> Running: npx create-next-app@latest
> Updated progress.txt
> Status: Project initialized

# Iteration 2
> Reading progress.txt... Next.js initialized
> Next task: Set up Firebase
> Creating lib/firebase/client.ts
> Creating lib/firebase/admin.ts
> Updated progress.txt
> Status: Firebase configured

# Iteration 3
> Reading progress.txt... Firebase ready
> Next task: Implement authentication
> Invoking Security agent...
> Creating auth components
> Running build... Success
> Invoking QA agent...
> Updated progress.txt
> Status: Auth working

... continues until completion criteria met ...

# Iteration 12
> Reading progress.txt... All features complete
> Checking completion criteria... ALL MET
> Status: COMPLETE - Task Manager app fully functional
```

## When to Use Ralph Wiggum

**Good use cases**:
- Building complete features from PRD
- Fixing multiple related bugs
- Large refactoring tasks
- Implementing a test suite

**Not ideal for**:
- Quick one-off fixes
- Exploratory coding
- Research tasks
- Simple CRUD operations
