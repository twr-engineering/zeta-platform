# AI-Native Agency Starter Template

A template for building Next.js + Firebase web applications with AI coding agents. No application code included - the AI generates everything fresh based on your PRD.

## What This Is

This is a **configuration-only template** designed for AI agents like Claude Code. It contains:

- Agent instructions and guidelines (`CLAUDE.md`)
- MCP server configurations for browser automation and docs lookup
- Firestore security rules and patterns
- Documentation for architecture, security, and development workflows
- Specialized subagents for QA, code review, security audits, and more

The AI reads these instructions and generates a complete application from scratch based on your Product Requirements Document (PRD).

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 15 (App Router) |
| Styling | Tailwind CSS v4 + Shadcn UI |
| Database | Firebase Firestore |
| Auth | Firebase Auth (Email/Password) |
| AI Tools | Claude Code + MCP Servers |

## Quick Start

### 1. Clone the Template

```bash
git clone https://github.com/anthropics/agency-starter.git my-project
cd my-project
```

### 2. Set Up Environment

```bash
# Copy environment template
cp .env.example .env.local

# Add your Firebase config to .env.local
```

### 3. Configure MCP Servers

```bash
# Login to Firebase CLI
firebase login

# Add Context7 API key to your shell profile
echo 'export CONTEXT7_API_KEY=your_key_here' >> ~/.bashrc
source ~/.bashrc
```

Get your Context7 API key at: https://context7.com

### 4. Write Your PRD

Create `prd/requirements.md` with your product requirements:

```markdown
# My App

## Overview
A brief description of what you're building.

## Features
1. User authentication
2. Dashboard with data visualization
3. CRUD operations for [entity]

## Pages
- Landing page
- Login/Register
- Dashboard
- Settings
```

### 5. Start Building with Claude

```bash
claude

# Then tell Claude:
# "Build the application based on the PRD in prd/requirements.md"
```

## Project Structure

```
├── CLAUDE.md                 # Main AI agent instructions
├── .mcp.json                 # MCP server configurations
├── .env.example              # Environment variable template
├── firestore.rules           # Security rules template
├── firestore.indexes.json    # Index definitions
│
├── .claude/
│   ├── settings.json         # Claude Code permissions
│   └── agents/               # Specialized subagents
│       ├── qa.md             # Browser testing
│       ├── code-review.md    # Code quality
│       ├── architect.md      # System design
│       ├── security.md       # OWASP compliance
│       ├── copywriter.md     # UI text
│       └── image-gen.md      # Gemini images
│
├── docs/
│   ├── ARCHITECTURE.md       # System patterns
│   ├── SECURITY.md           # Security guidelines
│   ├── FIRESTORE-PATTERNS.md # Database patterns
│   ├── BACKWARDS-COMPAT.md   # Schema versioning
│   ├── RALPH-WIGGUM.md       # Autonomous loops
│   └── DEBUGGING.md          # Log access
│
└── prd/
    └── progress.txt          # Development progress tracking
```

## MCP Servers

| Server | Purpose |
|--------|---------|
| chrome-devtools | Browser automation for self-QA |
| context7 | Documentation lookup for libraries |
| firebase | Firebase project management |

## Subagents

Invoke specialized agents for specific tasks:

```
Task: QA agent - test the login flow
Task: Security agent - audit the authentication
Task: Code review agent - review src/app/api/
```

## Documentation

- [Architecture Patterns](docs/ARCHITECTURE.md) - System design and component structure
- [Security Guidelines](docs/SECURITY.md) - OWASP compliance and Firestore rules
- [Firestore Patterns](docs/FIRESTORE-PATTERNS.md) - Entity definitions and queries
- [Backwards Compatibility](docs/BACKWARDS-COMPAT.md) - Schema versioning
- [Ralph Wiggum Method](docs/RALPH-WIGGUM.md) - Autonomous development loops
- [Debugging Guide](docs/DEBUGGING.md) - Frontend and backend log access

## Key Principles

1. **Security First** - Read SECURITY.md before implementing auth
2. **Schema Versions** - All Firestore documents include `schemaVersion`
3. **Deny by Default** - Firestore rules deny all, then explicitly allow
4. **Validate Everything** - Use Zod for all input validation
5. **No Dev Server** - AI never runs `npm run dev` autonomously

## Requirements

- Node.js 18+
- Firebase CLI (`npm install -g firebase-tools`)
- Claude Code CLI
- Context7 API key (optional, for docs lookup)

## License

MIT
