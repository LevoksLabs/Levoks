## Levoks

## The Idea

Levoks is a sophisticated, multi-layered web development platform designed to streamline full-stack website production and deployment without requiring a single line of code. Operating much like modern photo editing software, it empowers creators to visually construct everything from frontend UI designs, utilizing an intuitive drag-and-drop canvas, to complex backend configurations. By replacing traditional programming with a visual node- graph interface, Levoks lets users easily map out logic and routing—making it as simple as connecting two points on a screen with a wire, similar to tools like n8n. Under the hood, drawing out this workflow instantly generates a full production-ready codebase, complete with a Next.js frontend, a Node.js and Express backend with integrated APIs, and Docker deployment capabilities. Ultimately, Levoks eliminates hours of tedious manual setup, serving as the go-to editor for both developers and designers who want to efficiently build and ship applications entirely visually.

## Technical Details & Architecture

Architectural Overview Levoks is engineered as a comprehensive full-stack website builder engine, moving far beyond the capabilities of a standard static page editor. The core technical mechanism involves parsing visual workspace inputs and compiling them into a fully deployable codebase. To achieve this, Levoks leverages a hybrid approach, combining the intuitive nature of manual human design with the raw power of fine-tuned AI coding agents to deliver the best of both worlds.

The Tri-Canvas System The platform manages full-stack complexity by dividing the workspace into three distinct, interconnected canvases:

- UI Canvas: A highly customizable frontend design environment featuring drag-and- drop pre-built elements and extensive styling options.

- Backend Canvas: A containerized workspace dedicated to configuring and managing scalable microservices and backend architecture.

- Routing Canvas: An intuitive, node-based interface where users can visually map out the application's flow, connecting pages and backend services simply by dragging wires between endpoints.

Code Generation & Deployment Pipeline Code is generated dynamically on the fly as users make visual changes on the canvas. The engine captures these interactions via DOM manipulation and cross-references them with pre-built scenarios to determine the underlying logic. This data is then converted into an Intermediate Representation (IR) state.

The IR state is passed directly to specialized AI coding agents that have been specifically fine- tuned to translate this intermediate logic into clean, production-ready code. Once a project is finished, users have the flexibility to either export the complete codebase to their local machine as a ZIP file or deploy it directly to the web with all visual configurations applied.


## Implementation Plan

## 1. FrontendEngine & The UICanvas

The user-facing visual builder has been constructed as a highly interactive, Figma-like environment prioritizing smooth navigation and real-time feedback.

- Core Framework: The frontend architecture is built on Next.js, providing a robust foundation for handling complex state and UI rendering.

- Canvas Mechanics: The workspace relies on advanced DOM manipulation to accurately track drag-and-drop interactions and structural configurations.

- Spatial Navigation: A custom "zoom-to-cursor" experience was engineered using 2D transformation matrices, allowing fluid, precise panning and scaling across the canvas.

## 2. BackendArchitecture & Data Canvas

The underlying infrastructure supports dynamic routing and data management, moving beyond static generation to true full-stack configuration.

- Backend Services: The core logic and routing canvas output are handled using Express and Node.js, establishing the microservices environment.

- Database Integration: MongoDB Atlas was implemented to manage the Data Canvas state, relationships, and user data storage.

- Security & Cloud Management: The infrastructure integrates Google Cloud Secret Manager to securely handle API keys and credentials, ensuring production-grade security rather than relying on hardcoded environment variables.

## 3. AICompilation & Code Generation Pipeline

The translation from visual design to deployable code relies on an integrated agentic workflow rather than standard templating.

- Intermediate Representation (IR): The engine successfully parses visual canvas changes and DOM interactions into a structured IR state.

- Agentic Code Translation: Fine-tuned AI coding agents ingest the IR state to write clean, production-ready Next.js and Express code on the fly.

- Real-Time Synchronization: As the visual routing and UI changes occur, the underlying codebase updates simultaneously, maintaining parity between the visual graph and the generated source code.

## 4. Export& Infrastructure Output

The final step ensures the user's visual work results in a tangible, scalable asset.

- Code Export: The system packages the complete, configured Next.js frontend and Express backend into a downloadable ZIP file or a directly deployable, observable containerized format.


## UI/UX Design and Functionality Breakdown

*Figure 1*

The UI has four main components: the header, the tray, sub-tray, propertyinspector, dock

Header: It is the top horizontal section in the editor space and as you can see has a logo, hyperlink to home.

- Files option has several options inside namely save, projects(previously saved) well decide many more options as we progress.

- Connections option is to connect with other necessary services like github, supabase or any backend server providers and all something like that.

- The AI icon on the far right side of the header is for an AI chat window that will help the users to design everything with a prompt or just some changes and all. The chat window will pop as a second small window as is in Antigravity IDE.

- The play button the play button is used to preview the website so far designed on the full screen.

- The deploy button is also expandable one by clicking a small arrow on it corner but the default one is deploy button which will then takes you to deployment page to setup all the details like a hosting services. Apart from deployment user can also export the code zip files or commit the new changes to github.

- The profile option is for personal account details settings.


- The center HDE icon is to hide ll the elements that are not on the screen(you-ll see more about screen in context of levoks below and HDE off is to make the items visible. This is a toggle button.

Tray: The tray section has all essential tools that needs to design a website as you can see there are mainly 6 tools and 2 at the bottom:

- The elements tool will have all the basic elements needed for the website. These actual elements are inturn displayed in the Sub-Tray. The elements has lots of categorized sections in it like Shapes, Buttons, Containers, Images...and many

- The assets tool is for the user to upload his own assets like images, icons, fonts..etc

- The pages tool is to display all the different made by the user if a page is selected then all its elements inside that page. As shown in the figure 2.

- The backend tool is to design and develop the backend. There is a full section explanation ahead of the documentation dedicated for this backend and Routing tool.

- The code tool is used view the code and edit it as a full pledge IDE UI and export the code from here as well.

- The Key icon at the botton of the tray is to save Environment variables or secret keys that will be used in the project.

- The settings icon is a classic one as in all softwares to tweak permissible settings related to Levoks.

Figure 2

Sub-Tray: It is as mention above a place to show more details/data of the tools selected from the tray and is only present for the necessary tool.

PropertyInspector: This is the section to tweak all the properties of the element. You can edit the element’s properties at the granular levels like font color, animation, border positioning, color etc.

Dock : This is the bottom center floating bar with bunch of options.

- The first grid option is called screen This is basically to add the screen to the playground(the white center area) When you click on this option you’ll get to select dimensions of the screen that you want to add form various devices options like mobiles -> particular mobile brands, different desktop dimensions but the default screen auto selected is 1920x1080

- The second options is the pointer that will allow you to switch the pointer to move tool(hand icon) or select tool(+ icon) and back to pointer tool again in a loop.

- The third option is pen to draw free vectors and vectors after drawing pops up their specific properties like curve...etc on the screen by drawing closed vector you can also save it as a shape into the sub-tray for that project to reuse it.


- The fourth option is motion tool that will take you to the motion/ animation rendering part of the website design its interface is similar to the one we have in blender when we want to move any object and render it. This is ostly used to give complex animation to multiple multiple objects on the site at a time. Rest apart we have a seperate tab in the PropertyInspector for small element wise all basic go to animations of a single objects.

- The fifth option is lock which will lock the movement of the screen at whatever zoom level it is right now for better editing. This lock is both for zooming of the screen and movement of the screen

## Backend Canvas

The Backend Canvas is the visual development environment of Levoks used to design, configure, and connect the complete backend architecture of a website or web application. Instead of writing backend code manually, users construct backend functionality by placing configurable blocks inside Service containers and connecting them logically.

The Backend Canvas is designed to represent actual executable backend architecture rather than being only a visual diagram. Every service, block, property, relationship, and connection made on the canvas is represented internally in the Levoks Intermediate Representation (IR), which is subsequently used to generate the corresponding production-ready backend code. Levoks' architecture specifically uses Node.js and Express for backend services and APIs, with database integration and containerized deployment as part of the overall generation pipeline.

The Backend Canvas therefore acts as a visual programming environment for backend development.

- 1. Backend Canvas Structure: The backend canvas structure consists of three major areas:

## Backend Sub-Tray

It contains all available backend blocks categorized according to their purpose. These

blocks can generally be Dragged onto a Service, Double-clicked to add to a Service, Searched using the search bar and Configured through the Property Inspector after selection.

The Sub-Tray is dynamically organized into categories such as:

- Endpoints

- Database

- Authentication

- Authorization


- Logic

- Async

- Real-Time

- Integrations

- Files & Storage

- Caching

- Middleware

- Configuration

- Observability

- Templates

The Sub-Tray follows the general Levoks UI principle in which the Sub-Tray exposes the available functionality for the currently selected tool, while the Property Inspector exposes the granular configuration of the selected object. This is consistent with the existing Levoks documentation, which defines the Sub-Tray as the place where detailed options for a selected tool are displayed and the Property Inspector as the area for granular property editing.

## 2. Services

A service is the primary container used to organize backend functionality. It represents logical backend module. It may contain endpoints, database models, authentication mechanism, logic, middleware, integrations and other backend blocks.

A service does not necessarily mean a separately deployed microservice. It should initially be treated as a logical grouping that Levoks can compile into the generated backend architecture.

## Example

*Figure 4: Auth service container*

*Figure 3: CRUD API service container*

Services

allow large applications to be divided into manageable functional modules.


## Backend Blocks

Backend blocks are the fundamental visual units used to construct application behaviour. Each block represents a recognizable backend operation or configuration rather than merely being a visual component. Backend blocks are the fundamental visual units used to construct application behaviour. Each block represents a recognizable backend operation or configuration rather than merely being a visual component.

When a block is selected, its Property Inspector dynamically exposes the configuration relevant to that block. The inspector should therefore act as the main place where the user defines how the block behaves, what data it accepts, what it produces, and how it interacts with other blocks.

Blocks can be connected visually to represent:

- execution flow,

- data flow,

- conditional flow,

- event-driven flow, or

- communication between backend components.

The resulting structure is interpreted by Levoks' Intermediate Representation system and

subsequently translated into the generated backend implementation. This follows the existing Levoks architecture in which visual configurations are converted into an IR before being passed to the code-generation layer.

Endpoints are the entry points through which the application's backend communicates with the frontend or external clients. Levoks provides the standard HTTP operations GET, POST, PUT, DELETE, and PATCH.

An endpoint is not simply defined by its HTTP method. Through the Property Inspector, the user can configure its complete API contract, including its route, parameters, request body, expected response, authentication requirements, authorization rules, validation, and possible error responses.

For example, a POST endpoint may visually represent:

- 1. Endpoints

POST /api/products

↓

Validation


↓

Create Product ↓ Response

The Property Inspector therefore allows the user to define both what the endpoint receives and what it does with that data.

Endpoints can also expose path parameters, query parameters, headers, request schemas, response schemas, status codes, and other API-level behaviour without requiring each of these to become a separate canvas block.

- 2. Database

The Database section represents the application's persistent data layer. It allows users to visually define the structure of their data and perform operations against it.

- 2.1 Model

A Model represents a persistent data entity such as a User, Product, Order, or Review.

The Property Inspector allows the user to define the model's identity and schema, including its fields, data types, required or optional values, uniqueness, defaults, indexing, timestamps, and deletion behaviour.

For example:

User ├── id ├── name ├── email └── passwordHash The Model therefore acts as the foundation from which database structure and backend data operations can be generated.

- 2.2 Relation

A Relation visually defines how two models are connected.

The user can configure the participating models, relationship type, foreign-key mapping, and behaviour when related records are modified or deleted.

This allows structures such as:


User 1

\* Orders

Order *

1 Product

to be represented directly in the backend architecture.

- 2.3 Query

The Query block represents an actual operation performed against a database model.

Instead of requiring separate blocks for every possible CRUD database action, the Query block can be configured through the Property Inspector to perform operations such as retrieving, creating, updating, deleting, counting, filtering, sorting, or aggregating data.

The inspector also defines how query results are exposed to subsequent blocks, allowing database output to become an input to later business logic.

Example:

GET /products

↓

Query Products

↓

Filter → Sort → Transform

↓

Response

- 2.4 Transaction

A Transaction groups multiple database operations into a single atomic operation.

The Property Inspector allows the user to define the operations belonging to the transaction and its failure behaviour. If a critical operation fails, the configured transaction can roll back the related changes instead of leaving the database in an inconsistent state.

This is particularly useful for workflows such as:

Create Order

↓

Update Inventory

↓

Create Payment Record


where all operations should succeed together.

- 3. Authentication

Authentication provides mechanisms for identifying users or clients accessing the backend.

Levoks supports common authentication approaches including JWT Authentication, OAuth, Sessions, and API Keys.

Each authentication block is configured through the Property Inspector according to its authentication strategy. Configuration can include the identity source, credentials or secure- secret references, token or session behaviour, expiration, provider information, callback configuration, and the model used to associate authenticated identities with application users.

Authentication can subsequently be attached to endpoints or middleware so that protected resources automatically require a valid identity.

For example:

Request ↓ JWT Authentication ↓ Authenticated User ↓ Protected Endpoint

Sensitive credentials should always reference the project's secure configuration rather than

being exposed directly in the visual workspace.

- 4. Authorization

Authentication establishes who the requester is, while Authorization determines what that requester is allowed to do.

Levoks provides three complementary authorization concepts:

- 4.1 Role

Roles represent broad categories of users such as Admin, Editor, Customer, or Moderator. The Property Inspector allows roles to be defined and associated with their permitted capabilities.

## 4.2 Permission

Permissions represent specific actions that can be performed within the application, such as:


product.read product.create product.update product.delete

This allows access control to be more granular than simply assigning a role.

## 4.3 Access Policy

An Access Policy allows authorization to depend on conditions rather than only fixed roles or

permissions.

For example:

User can update Order IF Order.userId = CurrentUser.id

The Property Inspector provides the resources, actions, roles, permissions, ownership rules,

and conditional logic required to construct such policies.

## 5. Logic

The Logic section provides the fundamental programming constructs required to create backend business behaviour without manually writing code.

It includes If / Else, Loop, Try / Catch, Validation, Transform, and Function blocks.

If / Else Provides conditional branching within a backend workflow. The Property Inspector defines the condition and the behaviour of each branch.

IF payment.status = "success"

↓

Complete Order

ELSE

Reject Order

↓

## 5.1 Loop

Allows an operation to be repeatedly executed over a collection or according to a condition. The inspector defines the iteration source, execution condition, and limits where applicable.


## 5.2 Try / Catch

Provides controlled error handling around a workflow. Users can configure what happens when an operation fails, such as returning an error, logging it, retrying the operation, or passing execution to another handler.

## 5.3 Validation

Ensures that incoming or generated data satisfies defined rules before it continues through the workflow. Validation can be configured around data types, required values, ranges, formats, patterns, and custom conditions.

## 5.4 Transform

Converts data from one structure into another. It is particularly useful between database results, external API responses, and frontend response objects.

For example:

Database User

↓

Transform

↓

Public User

This also allows sensitive or unnecessary fields to be excluded before data is returned.

## 5.5 Function

Represents reusable business logic. Functions can accept defined inputs, perform their own internal workflow, and return structured outputs. They may be scoped to a service or made reusable across the application.

## 6. Async

The Async section provides mechanisms for performing work outside the immediate request-

response cycle.

This is important for operations that may be slow, resource-intensive, or better executed in the background, such as sending emails, processing files, generating reports, or performing scheduled maintenance.

It consists of Event, Queue, Job, Worker, and Scheduler.

## 6.1 Event

Represents something that has happened within the application, such as:

user.created


order.created payment.completed

The Property Inspector defines the event identity, payload, source, and consumers.

## 6.2 Queue

Provides a mechanism for storing work that should be processed asynchronously. The inspector configures the queue's identity, processing behaviour, retry policy, and failure handling.

## 6.3 Job

Represents an individual background operation placed into a queue. Its configuration defines the task, input data, execution limits, retry behaviour, and failure handling.

## 6.4 Worker

Processes jobs from a queue. Users can configure which queue it consumes, how many jobs may be processed concurrently, execution limits, and failure behaviour.

## 6.5 Scheduler

Triggers backend operations according to a defined schedule. The Property Inspector can configure intervals, cron-style schedules, execution timezone, target jobs, and scheduling behaviour.

A complete asynchronous workflow may therefore look like:

Order Created

↓ Event ↓ Queue ↓ Worker ↓

Send Confirmation Email

## 7. Real-Time

The Real-Time section enables continuous communication between the backend and

connected clients.

It provides WebSocket, SSE, Subscribe, Publish, and Broadcast functionality.


## WebSocket

Provides bidirectional real-time communication between clients and the backend. The Property Inspector configures the connection endpoint, authentication, message structure, connection behaviour, and supported events.

## SSE

Provides server-to-client streaming for situations where the server needs to continuously push updates to connected clients.

## Subscribe

Defines which event or channel a client or service listens to.

## Publish

Creates and sends an event or message to a specified channel.

## Broadcast

Distributes an event to multiple connected clients, optionally based on channels, users, roles, or other targeting rules.

These blocks allow applications such as chats, live notifications, dashboards, collaboration

tools, and live status systems to be represented visually.

## 8. Integrations

Integrations allow a backend created in Levoks to communicate with external services and APIs.

The section contains HTTP Request, Webhook, Email, SMS, and Payment blocks.

## HTTP Request

Allows the backend to call an external API. Through the Property Inspector, users can configure the request method, URL, parameters, headers, authentication, request body, timeout, retry behaviour, and mapping of the external response into the current workflow.

## Webhook

Allows external services to trigger backend workflows.

For example:

Payment Provider

↓

Webhook

↓


Verify Event

↓

Update Order

The inspector controls the receiving endpoint, expected payload, authentication or signature verification, and response behaviour.

## Email

Provides application-generated email functionality. Users can configure the sender, recipients, subject, content/template, attachments, provider, and delivery behaviour.

## SMS

Provides application-generated SMS functionality, including recipient, message/template, provider, and delivery configuration.

## Payment

Represents payment-processing functionality. The Property Inspector allows configuration of the payment provider, amount, currency, customer information, payment flow, metadata, success/failure handling, and associated webhook behaviour.

## 9. Files & Storage

The Files & Storage section handles files uploaded, generated, retrieved, or deleted by the application.

It provides Upload, Download, Storage, and Delete blocks.

## Upload

Receives files from clients and optionally sends them to configured storage. Users can define permitted file types, size restrictions, authentication requirements, naming behaviour, and destination.

## Download

Provides controlled access to stored files. Configuration can include the file source, access policy, download behaviour, expiration, and generated file information.

## Storage

Represents the application's persistent file-storage provider. The Property Inspector defines the storage provider, location, access model, credentials, and storage configuration.

## Delete

Removes a file from storage according to the configured access and deletion rules.

A common workflow can therefore be represented as:


Frontend Upload

↓

Upload

↓

Storage

↓

Save File Reference

↓

Database

- 10. Caching

Caching allows frequently accessed data to be temporarily stored so that expensive database or external API operations do not need to be repeated unnecessarily.

The section provides Cache and Invalidate blocks.

## Cache

The Cache block can be placed around a database query or external operation. Its Property Inspector defines the cache provider, key, lifetime, stored value, and caching strategy.

Request

↓

Cache

↓

Database

## Invalidate

Invalidation removes or refreshes cached information when its underlying data changes.

For example:

Product Updated

↓

Invalidate Product Cache


The inspector allows the user to specify the cache location, key or pattern, and the event that should trigger invalidation.

## 11. Middleware

Middleware represents operations that run around or before backend endpoint execution.

Levoks provides CORS, Rate Limit, Logger, Authentication, Authorization, and Custom Middleware.

Middleware can be applied at different scopes depending on the requirement, such as globally across the backend, to a particular service, or to selected endpoints.

## CORS

Controls which external origins can communicate with the backend and which methods, headers, and credentials are permitted.

## Rate Limit

Controls how frequently a client can access an endpoint. The inspector defines the request limit, time window, client-identification strategy, and handling of exceeded limits.

## Logger

Controls what backend activity is recorded for debugging and monitoring. Configuration may include request, response, error, and metadata logging along with protection against recording sensitive values.

## Authentication & Authorization

Authentication middleware verifies the identity of a request, while authorization middleware verifies whether that identity has permission to access the requested resource.

## Custom

Provides an extension point for advanced backend behaviour that does not fit the predefined middleware blocks.

## 12. Configuration

Configuration contains values required by the generated backend without embedding those values directly into application logic.

It provides Environment Variable and Secret blocks.

## Environment Variable

Used for configurable non-sensitive values such as environment modes, URLs, ports, feature configuration, and service settings.

The Property Inspector allows different values or configurations to be associated with development and production environments.


## Secret

Used for sensitive credentials such as database passwords, JWT secrets, API keys, and third- party service credentials.

Secrets should be referenced by the generated application rather than exposed in the canvas or hardcoded into generated source code. Levoks' broader architecture already identifies secure secret management as part of its production infrastructure.

## 13. Observability

The Observability section provides mechanisms for understanding the behaviour and health of the generated backend.

It includes Error Handler, Health Check, and Audit Log.

## Error Handler

Provides centralized handling of application errors. Users can configure how errors are classified, logged, converted into HTTP responses, and exposed to clients.

## Health Check

Provides a mechanism for determining whether the backend and its dependencies are functioning correctly. A health check may verify the database, storage, or other required services.

## Audit Log

Records important actions performed by users or backend processes. The inspector allows the user to define which events are recorded, what contextual information is retained, and how the resulting audit information is stored.

## 14. Templates

Backend Templates provide complete, preconfigured starting points for commonly required backend architectures.

Instead of manually constructing every service and connecting every block, users can select a template and receive a functional starting architecture that remains fully editable.

Current templates include:

## Auth System

Provides a complete authentication-oriented service containing user data, authentication, registration, login, profile functionality, and associated validation/middleware.

## CRUD API

Provides a model-driven REST API structure containing the required data model, endpoints, database operations, and validation required for a typical CRUD application.


## Chat System

Provides the backend structure required for messaging applications, including user/message functionality and real-time communication.

Future templates can represent more complete application architectures such as:

E-Commerce

Blog

SaaS Application

Booking System

File Manager

Social Platform

Templates should generate ordinary Levoks backend blocks rather than special uneditable structures, allowing users to inspect, modify, remove, or extend every generated component.

- 15. Backend Execution Flow

The Backend Canvas is ultimately intended to represent executable application behaviour.

A typical workflow may therefore be constructed visually as:

POST /api/orders

↓

Authentication

↓

Authorization

↓

Validation

↓

Query Product

↓

If / Else

↙ ↘


Error Transaction

↓

Create Order

↓

Update Stock

↓

Event

↓

Queue

↓

Worker

↓

Send Email

Every block in this workflow contributes information to the application's backend representation.

The user is therefore not merely drawing an architecture diagram; they are constructing the backend's execution model visually.

- 16. Backend and Routing Integration

The Backend Canvas works together with the Routing Canvas to connect the frontend application with backend functionality.

The Routing Canvas determines which frontend pages and interactions communicate with which backend endpoints, while the Backend Canvas determines what happens after those endpoints are invoked.

The overall flow becomes:

Frontend Page

↓

Routing

↓


Backend Endpoint

↓

Authentication / Authorization

↓

Business Logic

↓

Database / Integration

↓

Response

↓

Frontend

This separation keeps the responsibilities of each canvas clear:

UI Canvas defines how the application looks and behaves visually.

Routing Canvas defines how frontend interactions connect to application functionality.

Backend Canvas defines how the server processes those interactions and manages data.

This three-canvas architecture is consistent with the existing Levoks design, where the UI, Backend, and Routing canvases collectively represent the full-stack application.

- 17. Backend to Code Generation

The Backend Canvas is ultimately compiled into the Levoks Intermediate Representation.

The process can be summarized as:

Backend Canvas

↓

Services + Blocks + Properties

↓

Connections + Data Flow

↓

Intermediate Representation


↓

Code Generation

↓

Node.js / Express Backend

The generated implementation should contain the corresponding routes, database structures, business logic, middleware, authentication, integrations, background processes, and other configured functionality.

This follows the existing Levoks architecture, where the visual state is transformed into a structured IR and then passed to specialized AI coding agents to generate the application code.

## 18. Separation from Deployment

The Backend Canvas defines the behaviour and architecture of the application, while deployment defines the infrastructure on which that application runs.

Therefore, deployment-specific concerns such as:

- hosting provider,

- server resources,

- domain,

- SSL,

- deployment region,

- scaling,

- container configuration,

- production infrastructure,

- database hosting,

- storage provider configuration,

should be handled through the separate Deployment interface rather than becoming ordinary backend canvas blocks.

This separation allows the same visual backend architecture to be exported, locally developed, or deployed to different infrastructure without changing the application's logical design.

The existing Levoks documentation similarly treats deployment and infrastructure output as a separate final stage after the visual application has been configured.

## The key principle for the entire Backend section

The Backend Canvas should expose application concepts visually, while the Property Inspector provides the depth and configurability required to turn those concepts into an actual implementation.


This means the canvas stays clean and understandable:

[POST]

↓

[Validation]

↓

[Query]

↓

[If / Else]

↓

[Transaction]

↓

[Response]

while selecting any block reveals its complete configuration in the Property Inspector.

That gives Levoks the right balance between visual simplicity and backend-level control — users aren't forced to understand or manually configure dozens of tiny backend primitives, but advanced users can still reach the level of detail necessary to generate a genuinely

implementable application.

## Router

The router is another option in the tray. Here you will add links/routes between the pages and services. This will decide how the final flow of the website will be from pages to pages, pages to services and services to services. All the routes are implemented just by connecting the endpoints with wires like n8n.

The left subtray here will have all the pages that we created which we can drag ad drop onto the routing canvas and the right tray will contain the backend services that we created in the backend which is also drag and dropable and all these components are freely arrangable on the canvas like a node structure with wires linked in between them. The wire link will have its settings option in the right sidebar when clicked. These settings depends on the context of the link like from page to page we have some different options of routing and for page to database we have different options of settings etc... All the setting should be there but the non relevent one depending on the context should gray out.

Linking between pages should automatically create the routing code logic in the code. Figure

5 is the UI of the routing canvas that already exist in our site


*Figure5*

## AI Code generation

The code generation is done in realtime as the user updates on the canvas with a reasonable latency. The present state of the user developing website is first converted into an Intermediate state whose rules already exist in the levoks codebase. There rules needs rigorous optimization, upgradation and generalization. So that we can transform all into intermediate form understandable by the AI models for cod e geeration.

The main purpose of this Intermediate Representation(IR state) is that it will be more detailed and specific for AI model for code generation Than a plain textual prompt. The state of the art models should be able to generate any complex website’s code by this. The user can also give us thir own api key for the state of the art models or give the API key of Huggingface to use any models on the inference providers given that those inference providers are free for the model user selects or get a paid apikey by themselves. Levoks will not bear any cost of Inference or GPU computation for this.

But later on we will add the subscription plans for the user which are cheap and users will benefit by using best available models so we should also have supscription plans in the user profile settings as well.

So we still needs to add a whole ai code generation part which is missing currently in the Levoks.
