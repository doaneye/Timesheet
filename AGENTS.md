# AGENTS.md

## Purpose

This repository is evolving into a cloud-based time tracking product that works across web, macOS, and iOS.

The current codebase is a Vite + React + TypeScript + Firebase application. The near-term goal is to keep that stack intact while refactoring the codebase into a structure that can scale in reliability, maintainability, and platform reach.

This document is the working guide for humans and coding agents contributing to the repository.

## Product Direction

The product should become:

- A web-first cloud application for time tracking, modules/projects, and claims
- Backed by Firebase Auth and Firestore as the default cloud backend
- Designed so web defines the canonical product behavior and backend contract
- Structured so macOS and iOS clients can be added later with minimal duplication
- Optimized for sync speed, reliability, and maintainability

## Core Decisions

Unless there is a strong, explicit reason to change them, keep these as the foundation:

- Frontend core: Vite + React + TypeScript
- Cloud backend: Firebase Auth + Firestore
- Real-time model: Firestore listeners and cloud-synced documents
- Web as source of truth for product behavior and backend contract

Do not introduce a backend migration, native wrapper strategy, or major framework replacement without clear product and operational justification.

## Architecture Target

The repository should move toward a layered architecture:

1. `app`
   - App shell
   - Providers
   - Navigation/routing
   - Auth bootstrap

2. `features`
   - Feature-owned UI, hooks, and feature services
   - Initial target features:
     - `auth`
     - `timesheets`
     - `modules`
     - `claims`
     - `tracker`
     - `calendar`
     - `settings`

3. `entities`
   - Domain types and entity-specific helpers
   - Initial entities:
     - `user`
     - `timesheet`
     - `claim`
     - `module`

4. `lib`
   - Firebase client setup
   - Repositories / data-access layer
   - Shared utilities such as dates, exports, logging, and sync helpers

5. `shared`
   - Reusable UI primitives
   - Shared hooks
   - Generic utility functions
   - Styling foundations

## Platform Strategy

### Web

- Web remains the primary implementation surface
- New workflows should be designed and validated on web first
- Backend contract, data model, permissions, and sync behavior should be defined here first

### macOS and iOS

- Add native clients later, after the web architecture and backend contract are stable
- Do not plan around sharing React UI code with native apps
- Native apps should reuse the same backend model, document structure, permission model, and business rules
- Early native scope should focus on:
  - Authentication
  - Dashboard/overview
  - Time tracking
  - Timesheet entry
  - Module lookup

### Shared Contract Across Platforms

All platforms should align on:

- Firestore collection/document structure
- Auth and identity model
- Status enums and field semantics
- Sync behavior and conflict expectations
- Server-controlled fields where needed

## Engineering Principles

1. Keep business logic out of page-level React components
2. Avoid direct Firestore reads/writes spread throughout UI files
3. Introduce typed repository boundaries for each domain area
4. Prefer feature-owned modules over one large application file
5. Preserve behavior while refactoring
6. Favor incremental migration over large rewrites
7. Treat reliability and sync correctness as product features

## Firebase Guidance

Firebase Auth and Firestore remain the default backend unless there is a strong reason to change.

Prefer to improve the current Firebase design by:

- Centralizing Firestore access
- Tightening rules and validation
- Standardizing document shapes
- Adding created/updated metadata when helpful
- Using Cloud Functions only when client-only logic becomes risky, duplicated, or privilege-sensitive

Do not replace Firebase with a different backend as part of normal refactoring work.

## Refactoring Rules

When making structural changes:

- Keep changes incremental and reviewable
- Extract by feature or responsibility, not by arbitrary file count
- Preserve working behavior before improving design
- Avoid mixing architecture refactors with broad visual redesigns
- Do not move to a multi-platform monorepo unless there is a concrete delivery need

## Near-Term Repository Goals

The current codebase is heavily concentrated in `src/App.tsx`. The immediate goal is not feature expansion, but creating clean seams so the product can grow.

Priority outcomes:

1. A stable app shell with explicit feature boundaries
2. A repository/data-access layer for Firestore
3. Shared domain models and use-case helpers that native clients can mirror later

## First Three Implementation Tasks

### Task 1: Establish the target folder structure and app shell boundaries

Create the initial directory layout under `src/` without rewriting the whole app:

- `src/app`
- `src/features`
- `src/entities`
- `src/lib`
- `src/shared`

Extract only the minimum bootstrapping concerns first:

- app shell
- authenticated app wrapper
- top-level navigation/tab ownership
- shared providers

Goal:
Create a clear place for future code to live without a large product rewrite.

### Task 2: Introduce a Firestore repository layer

Create typed repository modules for:

- users
- timesheets
- claims
- modules

The first pass should wrap the most common Firestore operations currently embedded in UI code:

- subscribe/list
- create
- update
- delete

Goal:
Make UI components depend on repository functions instead of raw Firestore calls. This is the most important step for long-term maintainability and future native parity.

### Task 3: Split `App.tsx` into feature entry modules

Begin with extraction of the highest-level sections into feature-owned modules:

- timesheets
- modules
- claims
- tracker
- settings

At first, this can be shallow extraction:

- move feature rendering logic
- move local view helpers
- keep behavior unchanged

Goal:
Reduce `App.tsx` from a monolith into an app coordinator, while preserving current product behavior.

## Technical Risks To Watch

1. Firestore listener sprawl causing unnecessary rerenders
2. Business rules duplicated between UI code and Firestore rules
3. Refactors that silently change behavior while “cleaning up” structure
4. Premature multi-platform abstractions before the web domain model is stable
5. Over-sharing code across platforms instead of sharing contracts and backend behavior

## What Not To Do Yet

- Do not replace Firebase
- Do not introduce a new backend API layer unless there is a concrete need
- Do not attempt full web/macOS/iOS parity in one pass
- Do not perform a single massive rewrite of `App.tsx`
- Do not optimize for theoretical portability at the expense of present-day clarity

## Definition Of Good Progress

A good change in this repository should make at least one of these better:

- clearer feature boundaries
- less UI-to-database coupling
- easier sync reasoning
- safer future native client integration
- smaller blast radius for future changes

If a proposed change makes the code more abstract but not easier to maintain, debug, or extend, prefer the simpler option.
