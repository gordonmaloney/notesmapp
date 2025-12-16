# Notesmap

An infinite-canvas spatial note-taking application. Organize your thoughts, tasks, and drawings on a zoomable 2D plane.

## Key Features

- **Infinite Canvas**: Pan and zoom freely using touch gestures or mouse wheel.
- **Rich Text Nodes**: Create notes that support basic formatting (Bold, Italic, Lists) and HTML.
- **Spatial Organization**: Drag nodes, group them, or link them.
- **Tasks & Views**: Turn nodes into tasks and save specific camera "Views" for quick navigation.
- **Safe Persistence**:
  - **Loading Guard**: Prevents invalid saves by waiting for server data before enabling auto-save.
  - **Empty Map Protection**: Warns before overwriting a populated map with an empty state.
- **Performance**: Optimized with viewport culling to handle large maps.

## Getting Started

### Prerequisites
- Node.js (v16+)
- npm

### Installation

```bash
git clone <repository>
cd notesmap
npm install
```

### Running Locally

```bash
npm run dev
```
The app will open at `http://localhost:5173`.

## Architecture Overview

- **`src/components/Canvas.jsx`**: The main controller. Handles global state (nodes, camera), data persistence, and input orchestration.
- **`src/components/NodesLayer.jsx`**: The virtualization layer. Responsible for rendering only the visible nodes to maintain 60fps performance.
- **`src/hooks/usePanZoom.js`**: Core math engine for handling user inputs (wheel, touch pinch) and converting them to camera transform updates.

## Safety Mechanisms

To prevent data loss:
1. **Startup Check**: The app enters a "Loading" state on mount where the map is invisible and non-interactive.
2. **Auto-save Gate**: The `savePersisted` function is gated behind the `isLoaded` flag.
3. **Ghost Node Tracking**: A `hasHadNodesRef` tracks if the map *ever* had content during the session. If you try to save 0 nodes after having content, a confirmation dialog intercepts the save.
