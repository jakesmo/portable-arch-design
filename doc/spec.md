# Browser-Native Multi-Layer Architecture Graph — V1 Specification

## 1. Objective

Build a lightweight, modern, browser-native application for creating and maintaining a **multi-layer technical dependency knowledge graph**.

The application should model one canonical set of architecture objects and relationships while allowing those objects to appear in multiple graph-like views such as:

- Physical
- Logical
- People / Organization
- Data
- Operational
- Custom dependency views

The tool should be usable without installing any application, runtime, database, or browser extension.

Distribution should ideally consist of:

```text
portable-arch-design.html
Project.arch.json
```

Users should be able to open the application in a modern browser, import a project file, edit it, and export a deterministic project file suitable for Git version control.

Live multi-user collaboration is explicitly out of scope. Git will provide version history, branching, comparison, and merge workflows.

---

# 2. Core Design Principles

## 2.1 One graph, many views

There is one canonical graph containing:

- Nodes
- Relationships
- Metadata

Views are projections of that graph.

A node must never be duplicated merely because it appears in multiple diagrams.

Example:

```text
Canonical object:
TAK Server [id: system.tak-server]

Appears in:
- Logical Architecture
- Physical Deployment
- Data Flow
- Ownership
- Dependency Analysis
```

Each appearance refers to the same canonical object.

---

## 2.2 Separate semantic model from presentation

Store these separately:

### Semantic model

```text
Nodes
Edges
Properties
Types
```

### Presentation model

```text
Views
Node positions
Collapsed/expanded state
View-specific annotations
Visibility
```

Moving a node in one diagram must not affect its position in another diagram.

Changing the canonical object's name or properties should update it everywhere.

---

## 2.3 Deterministic serialization

Two users who load the same project, make the same semantic changes, and export it must produce byte-for-byte equivalent or effectively identical JSON except where their actual changes differ.

The output must be optimized for Git diffs.

Rules:

- Stable IDs.
- Never regenerate IDs during load/save.
- Pretty-print JSON with a fixed indentation.
- Use a fixed property order.
- Sort collections deterministically before serialization.
- Sort nodes by `id`.
- Sort edges by `id`.
- Sort views by `id`.
- Sort view-node records by node ID.
- Sort tags alphabetically.
- Avoid writing transient UI state.
- Do not generate timestamps during ordinary saves.
- Do not include browser/device/user-specific metadata.
- Do not serialize array ordering unless order has semantic meaning.
- Export identical content identically on every computer/browser.

Use canonical serialization code rather than relying on JavaScript object insertion order accidentally remaining consistent.

---

# 3. Runtime / Deployment

## Required

- Runs entirely in a modern browser.
- No backend server.
- No Docker.
- No Node runtime required by end users.
- No database installation.
- No browser extension.
- No administrator privileges.
- Must function when distributed as static files.

Preferred build output:

```text
portable-arch-design.html
```

A small adjacent JS/CSS bundle is acceptable if producing a single HTML file becomes unnecessarily difficult:

```text
portable-arch-design/
├── index.html
├── app.js
└── app.css
```

End users should not need to run a local web server.

---

# 4. Persistence

Use **IndexedDB** as the browser-local working database.

IndexedDB should store:

- current project
- nodes
- edges
- views
- view-node layout
- application preferences
- optional autosave/recovery state

Use IndexedDB transactions when an operation changes multiple records.

Example:

```text
BEGIN TRANSACTION

create node
create edge
add node to active view
update project metadata

COMMIT
```

If the transaction fails, none of those operations should persist.

IndexedDB is working storage, not the portable authoritative artifact.

---

# 5. Portable Project File

Use a human-readable JSON file:

```text
<ProjectName>.arch.json
```

Example high-level structure:

```json
{
  "schemaVersion": 1,
  "project": {},
  "nodeTypes": [],
  "edgeTypes": [],
  "nodes": [],
  "edges": [],
  "views": []
}
```

The project JSON is the artifact intended for:

- Git
- email
- shared drives
- archival
- code review
- backup
- transfer between computers

---

# 6. Suggested Core Schema

## Project

```json
{
  "id": "project.tactical-architecture",
  "name": "Tactical Architecture",
  "description": ""
}
```

Avoid volatile fields such as:

```text
lastOpened
lastSaved
computerName
username
browser
```

unless stored only in IndexedDB and excluded from project export.

---

## Node

```json
{
  "id": "service.tak-server",
  "type": "service",
  "name": "TAK Server",
  "description": "",
  "tags": [],
  "properties": {}
}
```

Node IDs must be stable.

Prefer readable IDs where practical.

Example:

```text
team.integration
service.identity
system.tak-server
device.radio-gateway
data.position
```

If duplicate names require generated IDs, generate the ID once and persist it forever.

---

## Edge

```json
{
  "id": "edge.tak-server.depends-on.identity",
  "source": "service.tak-server",
  "target": "service.identity",
  "type": "depends_on",
  "description": "",
  "properties": {}
}
```

Edges are first-class model elements.

Do not infer all relationships solely from node properties.

---

## View

Example:

```json
{
  "id": "view.logical",
  "name": "Logical Architecture",
  "description": "",
  "filter": {},
  "nodes": [
    {
      "nodeId": "service.tak-server",
      "x": 320,
      "y": 180
    }
  ],
  "edges": []
}
```

Prefer referencing canonical objects rather than copying them into the view.

If all canonical edges between visible nodes are displayed automatically, only store view-specific edge overrides where needed.

---

# 7. Initial Node Types

Provide opinionated defaults, but allow creation of custom types.

## People

```text
Person
Role
Team
Organization
```

## Logical

```text
Capability
Function
Service
Application
Logical Component
```

## Physical

```text
System
Device
Server
Network
Gateway
Interface
Facility
```

## Data

```text
Data Type
Data Store
Message
Stream
```

Keep the type system simple in V1.

Do not attempt to implement UAF, SysML, ArchiMate, or another full metamodel.

---

# 8. Initial Relationship Types

Provide defaults such as:

```text
depends_on
part_of
contains

provides
consumes
implements

connected_to
hosted_on
runs_on

sends
receives

owns
manages
operates
supports

requires
interfaces_with
```

Relationship types should have configurable:

- Display name
- Direction
- Optional default visual treatment
- Allowed source/target types if desired later

Strict metamodel validation is not required for V1.

---

# 9. Main UI

Use a modern three-pane interface:

```text
┌────────────────────────────────────────────────────────────────┐
│ Project Name       Search                    Add Object   Save │
├──────────────┬────────────────────────────────┬────────────────┤
│              │                                │                │
│ VIEWS        │                                │ PROPERTIES     │
│              │                                │                │
│ Overview     │                                │ Name           │
│ Physical     │         GRAPH CANVAS           │ Type           │
│ Logical      │                                │ Description    │
│ People       │                                │ Tags           │
│ Data         │                                │ Properties     │
│              │                                │ Relationships  │
│ + New View   │                                │                │
│              │                                │                │
└──────────────┴────────────────────────────────┴────────────────┘
```

Target experience should feel closer to:

- Figma
- Miro
- modern graph editors

than:

- traditional UML tools
- Visio
- Eclipse
- enterprise MBSE software

---

# 10. Graph Canvas

Use React Flow or an equivalent mature graph UI library.

Required interactions:

- Pan
- Zoom
- Fit to screen
- Multi-select
- Drag nodes
- Create relationships by connecting nodes
- Delete nodes from a view
- Delete nodes from the model
- Delete relationships
- Context menu
- Double-click editing
- Keyboard shortcuts
- Selection highlighting

Node appearance should visibly distinguish categories/types.

Avoid excessive visual decoration.

---

# 11. Important Delete Semantics

The UI must clearly distinguish:

```text
Remove from View
```

from:

```text
Delete from Model
```

Removing a node from one view must not delete the canonical object.

Deleting the canonical object should warn the user that it will:

- remove the node from every view
- delete or invalidate associated relationships

---

# 12. Views

Users must be able to:

- Create a view
- Rename a view
- Duplicate a view
- Delete a view
- Add existing nodes to a view
- Create new nodes from within a view
- Hide nodes
- Reposition nodes independently per view
- Choose which edge types are visible
- Filter by node type
- Filter by tags
- Filter by relationship type

Initial default views:

```text
Overview
Physical
Logical
People
Data
```

These are convenience views, not separate models.

---

# 13. Dependency Exploration

This is a key feature.

When a user selects a node, provide:

```text
Show Dependencies
```

Options:

```text
Direction:
- Upstream
- Downstream
- Both

Depth:
- 1 hop
- 2 hops
- 3 hops
- All

Relationship types:
- All
- Selected
```

Generate a temporary or savable dependency graph.

Example:

```text
Integration Team
      │ manages
      ▼
TAK Server
      │ depends_on
      ▼
Identity
      │ hosted_on
      ▼
Edge Compute
      │ connected_to
      ▼
Tactical WAN
```

Users should be able to save the resulting graph as a normal view.

---

# 14. Search

Provide global search across:

- Name
- ID
- Description
- Tags
- Type
- Custom properties

Selecting a result should:

- open its property pane
- show which views contain it
- offer "add to current view"
- offer "show dependencies"

---

# 15. Properties Panel

Selecting a node should show:

```text
Name
Type
ID
Description
Tags
Custom properties

Incoming relationships
Outgoing relationships

Views containing this object
```

Relationships should be clickable.

Selecting an edge should show:

```text
Relationship type
Source
Target
Description
Properties
```

---

# 16. Custom Properties

Allow arbitrary key/value metadata.

Example:

```text
Owner: Integration Team
Vendor: Example Corp
Protocol: HTTPS
Classification: Internal
Version: 4.2
Location: Edge
```

Do not create dedicated schema columns for arbitrary metadata.

Use a generic properties object.

---

# 17. Import / Export

## Open Project

User clicks:

```text
Open Project
```

and selects an `.arch.json` file through the browser file picker.

Validate:

- valid JSON
- supported `schemaVersion`
- required IDs
- no duplicate IDs
- all edge references resolve
- all view node references resolve

Provide understandable validation errors.

---

## Export Project

Provide:

```text
Save / Export
```

Serialize the current model deterministically.

Filename:

```text
<ProjectName>.arch.json
```

Also provide:

```text
Export Copy
```

if useful.

---

# 18. Deterministic Git Output

This is a hard requirement.

Implement a canonical serializer.

For every save:

1. Normalize objects.
2. Remove non-persistent/transient fields.
3. Sort object keys using a defined schema order.
4. Alphabetically sort arbitrary property keys.
5. Sort node arrays by ID.
6. Sort edge arrays by ID.
7. Sort views by ID.
8. Sort tags alphabetically.
9. Sort view membership by node ID.
10. Normalize numeric coordinates consistently.
11. Use UTF-8.
12. Use LF line endings.
13. Use fixed indentation, e.g. 2 spaces.
14. End file with exactly one newline.

Do not export timestamps unless the user explicitly changes a semantically meaningful timestamp field.

Do not generate new IDs during serialization.

Same graph + same layout = same output.

---

# 19. Stable IDs

IDs are critical for usable Git diffs.

Never use array position as identity.

Never create new IDs merely because:

- a node was renamed
- a node moved
- a node changed views
- a project was imported
- a project was exported

A rename should produce a Git diff similar to:

```diff
{
  "id": "service.tak-server",
- "name": "TAK Server"
+ "name": "TAK Server Core"
}
```

not deletion and recreation of the object.

---

# 20. Autosave

Persist edits automatically into IndexedDB.

Show status:

```text
Saved locally
```

or:

```text
Unsaved local changes
```

Do not automatically modify/export the external `.arch.json` file.

The explicit Export operation creates the Git/shareable artifact.

---

# 21. Dirty State

Track whether the in-browser model differs from the last imported/exported canonical representation.

Display:

```text
Project X
● Modified
```

After export:

```text
Project X
✓ Exported
```

Compare canonical serialized content rather than individual event history where practical.

---

# 22. Undo / Redo

Implement an in-memory command/history system.

Minimum:

```text
Ctrl+Z
Ctrl+Shift+Z
```

Support undo/redo for:

- node creation
- node deletion
- edge creation
- edge deletion
- property edits
- movement
- view changes

Do not serialize undo history into the project artifact.

---

# 23. Automatic Layout

Support:

```text
Auto Arrange
```

Use ELK, Dagre, or another mature layout library.

Initial layouts:

- Left-to-right dependency flow
- Top-to-bottom hierarchy

Auto-layout should change only the active view's presentation coordinates.

It must never modify semantic relationships.

---

# 24. Layers / Filtering

Allow a view to display multiple conceptual layers simultaneously.

Example:

```text
☑ People
☑ Logical
☑ Physical
☐ Data
```

This should be implemented as filtering over canonical node types/categories.

Do not maintain separate physical/logical/person databases.

---

# 25. Suggested Category Model

Each node type should belong to a broad category:

```text
people
operational
logical
physical
data
```

Example:

```json
{
  "id": "service",
  "name": "Service",
  "category": "logical"
}
```

This enables quick cross-layer filtering.

---

# 26. Cross-Layer Relationships

Cross-layer links are a primary purpose of the application.

Examples:

```text
Team
  └─ operates → System

System
  └─ hosts → Application

Application
  └─ provides → Service

Service
  └─ consumes → Data Type

Device
  └─ connected_to → Network
```

Do not enforce artificial separation between layers.

---

# 27. Object Reuse Workflow

From any view, provide:

```text
Add Existing Object
```

Search existing canonical nodes.

Do not encourage users to accidentally create duplicates.

When creating a new object with a similar name, warn:

```text
Similar objects exist:

TAK Server
TAK Server - Dev

Create anyway?
```

Exact duplicate IDs must be prohibited.

---

# 28. Git Merge Friendliness

Avoid structures that cause giant diffs.

Prefer:

```json
"nodes": [
  {...},
  {...}
]
```

with deterministic ordering.

Avoid:

- random ordering
- embedded binary data
- volatile IDs
- timestamps on every object
- serialization of zoom/pan state unless intentionally meaningful
- machine-local data
- giant minified JSON
- unnecessary generated metadata

Consider storing view coordinates as integers when possible to reduce meaningless floating-point diffs.

Example:

```json
"x": 320,
"y": 180
```

rather than:

```json
"x": 319.9999847261,
"y": 180.0000133828
```

Round coordinates to integers on persistence unless there is a compelling visual reason not to.

---

# 29. Git Conflict Handling

Do not build Git functionality into V1.

However, import validation should detect common merge problems, such as:

```text
duplicate node IDs
duplicate edge IDs
edge points to missing node
view references missing node
invalid JSON from unresolved Git conflict markers
```

If Git conflict markers are detected, give a clear message such as:

```text
This file contains unresolved Git merge conflicts.
Resolve the conflict before importing the project.
```

---

# 30. Schema Versioning

Every project must contain:

```json
"schemaVersion": 1
```

Create migration infrastructure from the beginning.

Loading should conceptually be:

```text
parse
→ validate
→ migrate old schema if required
→ normalize
→ load
```

Do not assume today's schema will remain permanent.

---

# 31. Data Integrity

Before committing changes, enforce:

- unique node IDs
- unique edge IDs
- valid source/target references
- valid node types
- valid edge types
- valid view references
- no dangling view nodes

Use IndexedDB transactions to maintain these invariants.

---

# 32. Project Validation

Provide:

```text
Project → Validate
```

Report:

```text
Errors
Warnings
Information
```

Potential checks:

- dangling relationships
- orphan nodes
- duplicate names
- nodes appearing in no views
- dependency cycles
- missing descriptions
- unknown custom types

Only structural errors should block export.

---

# 33. Cycle Detection

Dependency relationships may form loops.

Detect and visually indicate dependency cycles.

Example:

```text
A → B → C → A
```

Do not prohibit cycles globally because some relationship types are legitimately cyclic.

Cycle analysis should primarily apply to relationships such as:

```text
depends_on
requires
```

---

# 34. Optional Convenience Feature: Project Summary

Provide a small project dashboard:

```text
147 objects
223 relationships
6 views

People        18
Logical       54
Physical      49
Data          26
```

Also show:

```text
12 orphan objects
3 dependency cycles
```

No heavy analytics required.

---

# 35. Non-Goals for V1

Explicitly do NOT implement:

- Live collaborative editing
- User accounts
- Backend services
- Cloud synchronization
- Built-in Git client
- Git hosting
- RBAC
- Enterprise SSO
- SysML
- UAF
- ArchiMate compliance
- BPMN
- Simulation
- Requirement management
- Branch/merge inside the application
- Formal configuration management
- Real-time presence
- Chat
- Complex workflow engines
- Plugin systems
- AI features
- Neo4j
- Server-side PostgreSQL
- Desktop binaries
- Electron

Keep the application small and comprehensible.

---

# 36. Technology Preference

Recommended:

```text
TypeScript
React
React Flow
IndexedDB
ELK or Dagre
Vite or equivalent build tooling
```

Use a thin IndexedDB wrapper if helpful, but do not introduce unnecessary architectural layers.

Potential stack:

```text
React
  ↓
Application state
  ↓
Repository/service layer
  ↓
IndexedDB
```

Keep persistence logic separate from React components.

---

# 37. Internal Architecture

Organize code around clear concepts:

```text
/model
  nodes
  edges
  views
  validation
  schema
  migration

/storage
  indexeddb
  import
  export
  canonicalSerializer

/graph
  traversal
  dependencyAnalysis
  layout

/ui
  canvas
  sidebar
  properties
  search
  dialogs
```

The canonical serializer and schema validation should be independently testable.

---

# 38. Testing Priorities

Write strong automated tests around deterministic behavior.

Critical tests:

## Deterministic export

Given identical models:

```text
serialize(modelA) === serialize(modelB)
```

regardless of:

- insertion order
- import order
- browser session
- object property creation order

## Round trip

```text
import(export(project)) == project
```

semantically.

## Stable IDs

Rename/move/edit must preserve IDs.

## View independence

Moving an object in View A must not change its coordinates in View B.

## Referential integrity

Deleting canonical nodes must properly handle relationships and view references.

## Transaction rollback

Partially failed multi-record operations must leave the previous IndexedDB state intact.

---

# 39. Initial V1 User Workflow

A new user should be able to:

1. Open the HTML application.
2. Click **New Project**.
3. Create several systems/services/teams.
4. Draw relationships between them.
5. Create a Physical view.
6. Create a Logical view.
7. Reuse the same objects across both.
8. Select an object and generate a two-hop dependency view.
9. Rearrange that view.
10. Export `Project.arch.json`.
11. Close the browser.
12. Reopen the application.
13. Import the exported file.
14. See the exact same semantic model and diagrams.
15. Export it again without changes.
16. Verify that Git reports no differences.

Step 16 is a hard acceptance criterion.

---

# 40. V1 Acceptance Criteria

V1 is complete when:

- Application runs entirely in-browser.
- No end-user installation is required.
- IndexedDB provides local transactional persistence.
- A project contains one canonical graph.
- Objects can appear in multiple independent views.
- People, logical, physical, and data objects can coexist.
- Cross-layer relationships work.
- Nodes and edges can be created visually.
- Views can be created and rearranged.
- Dependency traversal works to configurable depth.
- Search works.
- Import/export works.
- Export format is readable JSON.
- Export is deterministic across machines.
- Re-exporting an unchanged project produces no Git diff.
- Stable IDs survive rename/move/import/export.
- Autosave to IndexedDB works.
- Undo/redo works.
- Basic project validation works.
- The app can be distributed as static browser files.

---

# 41. Guiding Product Principle

When deciding whether to add complexity, optimize for:

> A modern, portable architecture dependency graph that is significantly more structured than Miro but dramatically simpler than Cameo, Sparx EA, or Capella.

The product's distinguishing abstraction is:

> **Canonical architecture objects + typed relationships + multiple reusable graph views + deterministic file-based version control.**

Do not expand V1 into a general-purpose enterprise architecture or MBSE platform.