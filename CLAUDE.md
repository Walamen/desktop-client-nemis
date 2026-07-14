# CLAUDE.md

# NEMIS Desktop (Electron)

## Project Overview

NEMIS (National Education Management Information System) is the national education platform for the Republic of Liberia.

The web platform is already in production and should be treated as the foundation of the ecosystem.

Current production stack:

- Next.js
- NestJS
- PostgreSQL
- REST APIs
- Authentication & Authorization
- Existing Business Logic
- Existing Database Schema

The purpose of this repository is **ONLY** to build the Electron Desktop Client that extends the production platform with Offline-First capabilities.

The desktop application is an additional client.

It is **NOT** a replacement for the production web application.

---

# Guiding Principle

The Electron application should integrate with the existing production architecture.

Never redesign or replace systems that already exist unless explicitly instructed.

The existing production backend remains the authoritative system.

---

# Architecture

## Existing Production

Next.js

↓

NestJS

↓

PostgreSQL

## Desktop

Electron Forge

↓

Next.js Renderer

↓

Electron Main Process

↓

SQLite

↓

Synchronization Layer

↓

Existing NestJS Backend

↓

PostgreSQL

---

# Technology Stack

## Desktop

- Electron Forge
- Electron
- React
- Next.js
- TypeScript
- Vite
- Tailwind CSS
- SQLite
- SQLCipher (preferred)
- Better SQLite3
- Electron IPC

## Backend

- NestJS
- Prisma
- PostgreSQL

## Synchronization

- REST APIs
- HTTPS
- Optional Secure WebSocket
- Background Worker

---

# Architectural Boundaries

## Electron owns

- Desktop shell
- Native OS integration
- Window management
- IPC
- SQLite
- File system access
- Background synchronization
- Printing
- Downloads
- Auto updates
- Native notifications

## Electron NEVER owns

- Authentication logic
- Authorization rules
- Student business logic
- Teacher business logic
- Attendance rules
- Reporting logic
- National data validation
- Core business workflows

Those responsibilities remain inside the existing NestJS backend.

---

# Database Philosophy

SQLite exists only for local work.

PostgreSQL is the national source of truth.

Never treat SQLite as authoritative.

Every successful synchronization eventually updates PostgreSQL.

---

# Offline-First Contract

Every user action must follow this sequence.

1. Write immediately to SQLite.

2. Create a Sync Queue record.

3. Return success to the UI immediately.

4. Synchronize in the background.

The user must never wait for internet before continuing work.

Poor internet must never block productivity.

---

# Synchronization Order

Always synchronize using this order.

1. Authenticate

2. Register Device

3. Push Local Changes

4. Resolve Conflicts

5. Pull Remote Changes

6. Update SQLite

7. Mark Queue Complete

8. Save Last Sync Timestamp

Do not change this order unless specifically required.

---

# Synchronization Principles

Synchronization should be:

- Incremental
- Resumable
- Fault tolerant
- Idempotent
- Secure
- Automatic

Synchronization should happen:

- Application startup
- User login
- Internet reconnect
- Scheduled interval
- Manual sync
- Before shutdown when possible

---

# Conflict Resolution

Every synchronized entity should contain metadata.

- id
- version
- updatedAt
- lastModifiedBy
- deviceId

Preferred strategies:

- Version comparison
- Last Write Wins where appropriate
- Manual resolution for critical entities
- Field-level merge where possible

Conflict strategy depends on entity type.

Never silently discard user data.

---

# Device Model

Every desktop installation is an independent device.

Each device owns:

- Local SQLite database
- Device ID
- Synchronization queue
- Sync metadata

Never assume two devices share local state.

---

# Security Rules

Always enable:

contextIsolation = true

sandbox = true

nodeIntegration = false

Always expose APIs through:

Preload

↓

contextBridge

↓

Renderer

Never expose:

- fs
- child_process
- process
- sqlite
- secrets

directly to React.

Never execute arbitrary shell commands.

Always validate IPC inputs.

Never trust renderer input.

---

# IPC Architecture

Renderer

↓

window.nemis.*

↓

Preload

↓

contextBridge

↓

ipcRenderer.invoke()

↓

ipcMain.handle()

↓

Application Service

↓

SQLite

The renderer must never access Node.js APIs directly.

---

# Code Organization

src/

main/

- ipc/
- database/
- services/
- sync/
- windows/
- security/

preload/

renderer/

- app/
- components/
- pages/
- hooks/
- features/
- services/
- store/
- styles/

shared/

- types/
- constants/
- utils/

---

# Coding Standards

Use:

- TypeScript
- Strict Mode
- Functional Components
- React Hooks
- Named Exports
- Async/Await
- SOLID Principles
- Dependency Injection where appropriate
- Reusable services

Avoid:

- any
- God classes
- Duplicate logic
- Deep nesting
- Circular dependencies
- Large files

Favor readability over cleverness.

---

# Error Handling

Never swallow errors.

Always:

- Log
- Classify
- Recover when possible

User-facing errors should be understandable.

Developer logs should be actionable.

---

# Logging

Development:

console

Production:

electron-log

Unexpected failures should always be logged.

Never fail silently.

---

# Performance

Prioritize:

Fast startup

Fast navigation

Small memory footprint

Efficient SQLite queries

Batch synchronization

Lazy loading

Avoid unnecessary rerenders.

---

# User Experience

The desktop application should always feel responsive.

The UI should never freeze during synchronization.

Synchronization must happen in the background.

The user should always know:

- Online
- Offline
- Syncing
- Sync Failed
- Last Sync Time

---

# UI Guidelines

Design language:

Enterprise Government Software

Keywords:

- Professional
- Secure
- Reliable
- Minimal
- Accessible
- Stable

Avoid playful interfaces.

Primary Color

#000e21

Secondary Color
#0367A0

Accent
#6494b1

Success
#097a0b

Active
#146316

Pending
#a6731

error/red
#c10021

Icons
Lucide

Border Radius

card: "16px",
button: "9999px",

Spacing

8-point grid

Avoid shadows.

Favor consistency over decoration.

---

# Accessibility

Support:

- Keyboard navigation
- Screen readers where possible
- High contrast
- Large datasets
- Responsive layouts

---

# Business Rules

School Admin

Own school only.

District Education Officer

Schools in assigned district.

County Education Officer

Schools in assigned county.

Teachers

Attendance

Grades

Classroom activities

Parents

Read-only

Students

Read-only

Academic hierarchy:

Academic Year

↓

Terms

↓

Timetable

↓

Attendance

↓

Assessments

↓

Report Cards

Respect this hierarchy.

---

# Code Generation Rules

Whenever generating code:

Prefer existing architecture over introducing new patterns.

Reuse existing services whenever possible.

Do not duplicate backend business logic.

Prefer composition over inheritance.

Keep functions small.

Keep files focused.

Always consider offline-first implications.

Always consider synchronization implications.

Always consider security implications.

---

# Decision Framework

When making architectural decisions, prioritize in this order:

1. Data integrity
2. Security
3. Offline reliability
4. Maintainability
5. Performance
6. User experience
7. Developer convenience

---

# Things Claude Should Never Suggest

Do not recommend:

Replacing PostgreSQL

Replacing NestJS

Replacing Next.js

Moving business logic into Electron

Duplicating backend validation

Bypassing authentication

Disabling Electron security

Storing authoritative data in SQLite

Removing synchronization metadata

Replacing REST APIs without request

---

# Expected Quality

Every contribution should be:

Production-ready

Strongly typed

Secure

Maintainable

Testable

Well documented

Enterprise quality

Suitable for nationwide deployment.

---

# Mission

The goal of this repository is to build a secure, scalable, enterprise-grade Electron desktop application that enables schools across Liberia to continue working seamlessly regardless of internet connectivity while remaining fully synchronized with the national NEMIS platform.
