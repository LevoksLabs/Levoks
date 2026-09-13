# Levoks 🚀

**Implementation status:** The editor now includes local autosave and recovery, project checkpoints, reviewed AI proposals, complete multi-page source export, GitHub commits, and Vercel frontend deployment. The larger product vision in `Documentation/levoks.md` is still in development. See [production readiness and setup](Documentation/production-readiness.md) for supported behavior, verification, and release blockers.

**The Database-Ready Visual Website Builder**

Levoks is a sophisticated, multi-layered visual development platform built with Next.js 16. It enables developers and designers to build full-stack applications with a live frontend canvas, a service-oriented backend builder, and a visual routing engine that wires everything together.

---

## 🏗️ Architectural Deep Dive

Levoks is built on a **Serializable State Tree** architecture. Every action across all three canvases is captured in a unified JSON structure managed by **Zustand**. This ensures that the entire project state—from the position of a button to the database schema of a microservice—can be saved, restored, and used for deterministic code generation.

### The Tri-Canvas Sync
The application maintains three specialized stores that interact through a shared ID namespace:
- **`editorStore`**: Houses the frontend component tree, pages, and global elements.
- **`backendStore`**: Manages the microservice containers, backend blocks, and database models.
- **`routingStore`**: The connective tissue that maps frontend "Output" ports to backend/page "Input" ports.

---

## 🎨 Frontend Subsystem

The frontend editor is a high-fidelity "What You See Is What You Get" (WYSIWYG) environment.

### Component Library
- **Layout**: Sections, Containers, Multi-column Grids, Flex Stacks, Spacers, and Dividers.
- **Typography**: Dynamic Titles, Paragraphs, and Text blocks with rich inline editing.
- **Media**: Optimized Image and Video components.
- **Interactive**: Buttons, Forms, Input fields, and specialized UI components like **Accordions**, **Tabs**, and **Repeaters**.
- **Social**: Integrated Social Bars and Navigation Menus.

### Global Elements System
Elements tagged as "Global" (like Headers and Footers) are rendered across all pages. The editor manages these in a separate registry within the `editorStore`, ensuring consistency across the entire site without duplication.

---

## ⚙️ Backend Subsystem

The Backend Builder allows for visual microservice orchestration.

### Backend Blocks
- **Endpoints**: RESTful blocks (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`) with configurable routes and response logic.
- **Data Models**: Mongoose-based schema builders for MongoDB.
- **Middleware**: Drag-and-drop security and utility blocks including **JWT Auth**, **CORS**, **Rate Limiting**, and **Request Logging**.
- **Control Flow**: Logic blocks for **If/Else** conditions, **Loops**, and **Try-Catch** error handling.

### Prebuilt Templates
Jumpstart development with templates that still require application-specific review:
- **Auth System**: JWT registration, login, profile, and logout generation with password hashing and HttpOnly cookies.
- **CRUD API**: Standard Create-Read-Update-Delete patterns for any resource.
- **Chat System**: Visual architecture starter; real-time execution and multiple-model binding are not implemented, so export reports errors.

---

## � Routing & Interconnectivity

The Routing Engine is where the application logic is "wired."

### Visual Wiring Logic
- **Output Ports**: Frontend elements expose events (e.g., `onClick`, `onSubmit`) as signal generators.
- **Input Ports**: Backend endpoints and Pages expose themselves as signal receivers.
- **Ports & Wires**: Connections are stored as edge definitions in the `routingStore`. When generating code, the `resolveConnections` engine traces these paths to inject the correct API calls or navigation logic.

---

## 📦 Code Generation Engine

The core value of Levoks lies in its ability to transform visual state into clean, human-readable code.

### Cross-Service Resolution
The generator doesn't just produce files; it understands dependencies. If a button is wired to a specific microservice, the generator:
1.  Creates an `api.js` helper in the frontend.
2.  Configures the correct `BASE_URL` and `PORT` based on the backend service definition.
3.  Injects asynchronous `fetch` logic into the React component's event handler.

### Export Format
Projects are bundled into a **Full-Stack ZIP** via `JSZip`, containing:
- **`/frontend`**: A complete Next.js/React project with Tailwind-ready CSS.
- **`/backend`**: Multiple Node.js/Express services, each with its own `Dockerfile` and shared `docker-compose.yml`.

---

## Screenshots

|  |  |  |  |
|---------|----------|----------|----------|
| <img src="Screenshots/Screenshot%20(1).jpeg" width="250"/> | <img src="Screenshots/Screenshot%20(2).jpeg" width="250"/> | <img src="Screenshots/Screenshot%20(3).jpeg" width="250"/> | <img src="Screenshots/Screenshot%20(4).jpeg" width="250"/> |
|  |  |  |  |


## 🚀 Getting Started & Development

### Prerequisites
- **Node.js**: v22 or higher
- **Package Manager**: npm, pnpm, or yarn

### Installation
```bash
npm install
```

### Key Commands
- `npm run dev`: Starts the Levoks in development mode.
- `npm run build`: Creates an optimized production build of the editor.
- `npm run lint`: Runs ESLint for code quality checks.

### Contributing
We use **Zustand selectors** for performance optimization and **Framer Motion** for all canvas animations. Please ensure all new components are fully typed and follow the existing directory structure in `src/components`.

---

*Generated with ❤️ by the Levoks Team.*
