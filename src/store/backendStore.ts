import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import {
    BackendBlock,
    BackendBlockType,
    ServiceContainer,
    ConnectionEdge,
    BlockConfig,
    DEFAULT_BLOCK_CONFIGS,
    SERVICE_COLORS,
    EndpointConfig,
    DbModelConfig,
    MiddlewareConfig,
    AuthConfig,
    DEFAULT_ENDPOINT_CONFIG,
    DEFAULT_DB_MODEL_CONFIG,
    DEFAULT_MIDDLEWARE_CONFIG,
    DEFAULT_AUTH_CONFIG,
    DEFAULT_VALIDATION_CONFIG,
    DEFAULT_ENV_VAR_CONFIG,
} from "@/types/backend";

// ─── Store Interface ───

interface BackendStore {
    // State
    services: ServiceContainer[];
    connections: ConnectionEdge[];
    selectedServiceId: string | null;
    selectedBlockId: string | null;
    backendSidebarPanel: string | null;
    generatedCode: Record<string, string> | null;
    codePreviewOpen: boolean;

    // Service CRUD
    addService: (name?: string) => void;
    removeService: (id: string) => void;
    updateService: (id: string, updates: Partial<ServiceContainer>) => void;

    // Block CRUD
    addBlock: (serviceId: string, blockType: BackendBlockType, label?: string, configOverrides?: Partial<BlockConfig>) => void;
    removeBlock: (serviceId: string, blockId: string) => void;
    updateBlock: (serviceId: string, blockId: string, updates: Partial<BackendBlock>) => void;
    updateBlockConfig: (serviceId: string, blockId: string, configUpdates: Partial<BlockConfig>) => void;
    moveBlock: (serviceId: string, blockId: string, x: number, y: number) => void;

    // Connection CRUD
    addConnection: (fromServiceId: string, toServiceId: string, label?: string) => void;
    removeConnection: (id: string) => void;

    // Selection
    selectService: (id: string | null) => void;
    selectBlock: (blockId: string | null) => void;
    setBackendSidebarPanel: (panel: string | null) => void;

    // Getters
    getService: (id: string) => ServiceContainer | undefined;
    getBlock: (serviceId: string, blockId: string) => BackendBlock | undefined;
    getSelectedService: () => ServiceContainer | undefined;
    getSelectedBlock: () => { block: BackendBlock; serviceId: string } | undefined;

    // Collapse
    toggleServiceCollapse: (id: string) => void;

    // Code generation
    setGeneratedCode: (code: Record<string, string> | null) => void;
    setCodePreviewOpen: (open: boolean) => void;

    // Templates
    loadAuthTemplate: () => void;
    loadCrudTemplate: () => void;
    loadChatTemplate: () => void;
}

// ─── Store Implementation ───

function serviceIdentity(services: ServiceContainer[], base: string) {
    const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    let name = base;
    for (let suffix = 2; services.some(s => slug(s.name) === slug(name)); suffix++) name = `${base} ${suffix}`;
    let port = 3001;
    while (services.some(s => s.port === port)) port++;
    return { name, port };
}

export const useBackendStore = create<BackendStore>((set, get) => ({
    services: [],
    connections: [],
    selectedServiceId: null,
    selectedBlockId: null,
    backendSidebarPanel: null,
    generatedCode: null,
    codePreviewOpen: false,

    // ─── Service CRUD ───

    addService: (name) => {
        const state = get();
        const colorIndex = state.services.length % SERVICE_COLORS.length;
        const service: ServiceContainer = {
            id: uuidv4(),
            ...serviceIdentity(state.services, name || `Service ${state.services.length + 1}`),
            description: "",
            color: SERVICE_COLORS[colorIndex],
            blocks: [],
            collapsed: false,
        };
        set({ services: [...state.services, service] });
    },

    removeService: (id) => {
        const state = get();
        set({
            services: state.services.filter((s) => s.id !== id),
            connections: state.connections.filter(
                (c) => c.fromServiceId !== id && c.toServiceId !== id
            ),
            selectedServiceId: state.selectedServiceId === id ? null : state.selectedServiceId,
            selectedBlockId: null,
        });
    },

    updateService: (id, updates) => {
        set({
            services: get().services.map((s) =>
                s.id === id ? { ...s, ...updates } : s
            ),
        });
    },

    // ─── Block CRUD ───

    addBlock: (serviceId, blockType, label, configOverrides) => {
        const defaultConfig = structuredClone(DEFAULT_BLOCK_CONFIGS[blockType]);
        const service = get().services.find(s => s.id === serviceId);
        if (!service) return;
        if (blockType === "rest_endpoint") {
            const endpoint = defaultConfig as EndpointConfig;
            if (label && ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(label)) endpoint.method = label as EndpointConfig["method"];
            const base = endpoint.route;
            for (let suffix = 2; service.blocks.some(b => b.type === "rest_endpoint" && (b.config as EndpointConfig).method === endpoint.method && (b.config as EndpointConfig).route === endpoint.route); suffix++) endpoint.route = base + suffix;
        }
        if (blockType === "db_model") {
            const model = defaultConfig as DbModelConfig;
            for (let suffix = 2; service.blocks.some(b => b.type === "db_model" && (b.config as DbModelConfig).tableName === model.tableName); suffix++) model.tableName = "Model" + suffix;
        }
        if (blockType === "auth_block" && label) {
            const strategies: Record<string, AuthConfig["strategy"]> = {"JWT Auth":"jwt",OAuth:"oauth",Session:"session","API Key":"apiKey"};
            (defaultConfig as AuthConfig).strategy = strategies[label] || "jwt";
        }
        if (blockType === "middleware" && label) {
            const kinds: Record<string, MiddlewareConfig["middlewareType"]> = {CORS:"cors","Rate Limit":"rateLimit",Logger:"logger",Custom:"custom"};
            (defaultConfig as MiddlewareConfig).middlewareType = kinds[label] || "cors";
        }
        const config = configOverrides
            ? { ...defaultConfig, ...configOverrides }
            : defaultConfig;

        const block: BackendBlock = {
            id: uuidv4(),
            type: blockType,
            label: label || blockType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
            config: config as BlockConfig,
            position: { x: 0, y: 0 },
            connections: [],
        };

        set({
            selectedServiceId: serviceId,
            selectedBlockId: block.id,
            services: get().services.map((s) =>
                s.id === serviceId
                    ? { ...s, blocks: [...s.blocks, block] }
                    : s
            ),
        });
    },

    removeBlock: (serviceId, blockId) => {
        set({
            services: get().services.map((s) =>
                s.id === serviceId
                    ? { ...s, blocks: s.blocks.filter((b) => b.id !== blockId).map(b => ({ ...b, connections: b.connections.filter(id => id !== blockId) })) }
                    : s
            ),
            selectedBlockId: get().selectedBlockId === blockId ? null : get().selectedBlockId,
        });
    },

    updateBlock: (serviceId, blockId, updates) => {
        set({
            services: get().services.map((s) =>
                s.id === serviceId
                    ? {
                        ...s,
                        blocks: s.blocks.map((b) =>
                            b.id === blockId ? { ...b, ...updates } : b
                        ),
                    }
                    : s
            ),
        });
    },

    updateBlockConfig: (serviceId, blockId, configUpdates) => {
        set({
            services: get().services.map((s) =>
                s.id === serviceId
                    ? {
                        ...s,
                        blocks: s.blocks.map((b) =>
                            b.id === blockId
                                ? { ...b, config: { ...b.config, ...configUpdates } as BlockConfig }
                                : b
                        ),
                    }
                    : s
            ),
        });
    },

    moveBlock: (serviceId, blockId, x, y) => {
        set({
            services: get().services.map((s) =>
                s.id === serviceId
                    ? {
                        ...s,
                        blocks: s.blocks.map((b) =>
                            b.id === blockId
                                ? { ...b, position: { x, y } }
                                : b
                        ),
                    }
                    : s
            ),
        });
    },

    // ─── Connection CRUD ───

    addConnection: (fromServiceId, toServiceId, label) => {
        const conn: ConnectionEdge = {
            id: uuidv4(),
            fromServiceId,
            toServiceId,
            label: label || "connects to",
        };
        set({ connections: [...get().connections, conn] });
    },

    removeConnection: (id) => {
        set({ connections: get().connections.filter((c) => c.id !== id) });
    },

    // ─── Selection ───

    selectService: (id) => {
        set({ selectedServiceId: id, selectedBlockId: null });
    },

    selectBlock: (blockId) => {
        // Also find which service owns this block
        if (blockId) {
            const service = get().services.find((s) =>
                s.blocks.some((b) => b.id === blockId)
            );
            set({
                selectedBlockId: blockId,
                selectedServiceId: service?.id || get().selectedServiceId,
            });
        } else {
            set({ selectedBlockId: null });
        }
    },

    setBackendSidebarPanel: (panel) => {
        set({ backendSidebarPanel: panel });
    },

    // ─── Getters ───

    getService: (id) => {
        return get().services.find((s) => s.id === id);
    },

    getBlock: (serviceId, blockId) => {
        const service = get().services.find((s) => s.id === serviceId);
        return service?.blocks.find((b) => b.id === blockId);
    },

    getSelectedService: () => {
        const { selectedServiceId, services } = get();
        if (!selectedServiceId) return undefined;
        return services.find((s) => s.id === selectedServiceId);
    },

    getSelectedBlock: () => {
        const { selectedBlockId, services } = get();
        if (!selectedBlockId) return undefined;
        for (const service of services) {
            const block = service.blocks.find((b) => b.id === selectedBlockId);
            if (block) return { block, serviceId: service.id };
        }
        return undefined;
    },

    // ─── Collapse ───

    toggleServiceCollapse: (id) => {
        set({
            services: get().services.map((s) =>
                s.id === id ? { ...s, collapsed: !s.collapsed } : s
            ),
        });
    },

    // ─── Code Generation State ───

    setGeneratedCode: (code) => set({ generatedCode: code }),
    setCodePreviewOpen: (open) => set({ codePreviewOpen: open }),

    // ─── Prebuilt Templates ───

    loadAuthTemplate: () => {
        const serviceId = uuidv4();
        const service: ServiceContainer = {
            id: serviceId,
            ...serviceIdentity(get().services, "Auth Service"),
            description: "JWT-based authentication with user registration and login",
            color: SERVICE_COLORS[0],
            blocks: [
                {
                    id: uuidv4(),
                    type: "db_model",
                    label: "User Model",
                    config: {
                        ...DEFAULT_DB_MODEL_CONFIG,
                        tableName: "User",
                        fields: [
                            { name: "email", type: "string", required: true },
                            { name: "password", type: "string", required: true },
                            { name: "name", type: "string", required: true },
                            { name: "role", type: "string", required: false, defaultValue: "user" },
                        ],
                    } as DbModelConfig,
                    position: { x: 0, y: 0 },
                    connections: [],
                },
                {
                    id: uuidv4(),
                    type: "auth_block",
                    label: "JWT Authentication",
                    config: { ...DEFAULT_AUTH_CONFIG },
                    position: { x: 0, y: 0 },
                    connections: [],
                },
                {
                    id: uuidv4(),
                    type: "rest_endpoint",
                    label: "Register",
                    config: {
                        ...DEFAULT_ENDPOINT_CONFIG,
                        route: "/api/auth/register",
                        method: "POST",
                        description: "Register a new user",
                        requestBody: [
                            { name: "email", type: "string", required: true },
                            { name: "password", type: "string", required: true },
                            { name: "name", type: "string", required: true },
                        ],
                    } as EndpointConfig,
                    position: { x: 0, y: 0 },
                    connections: [],
                },
                {
                    id: uuidv4(),
                    type: "rest_endpoint",
                    label: "Login",
                    config: {
                        ...DEFAULT_ENDPOINT_CONFIG,
                        route: "/api/auth/login",
                        method: "POST",
                        description: "Login and receive JWT token",
                        requestBody: [
                            { name: "email", type: "string", required: true },
                            { name: "password", type: "string", required: true },
                        ],
                    } as EndpointConfig,
                    position: { x: 0, y: 0 },
                    connections: [],
                },
                {
                    id: uuidv4(),
                    type: "rest_endpoint",
                    label: "Get Profile",
                    config: {
                        ...DEFAULT_ENDPOINT_CONFIG,
                        route: "/api/auth/profile",
                        method: "GET",
                        description: "Get current user profile",
                        authRequired: true,
                    } as EndpointConfig,
                    position: { x: 0, y: 0 },
                    connections: [],
                },
                {
                    id: uuidv4(),
                    type: "middleware",
                    label: "CORS",
                    config: { ...DEFAULT_MIDDLEWARE_CONFIG },
                    position: { x: 0, y: 0 },
                    connections: [],
                },
                {
                    id: uuidv4(),
                    type: "validation",
                    label: "Email Validation",
                    config: { ...DEFAULT_VALIDATION_CONFIG },
                    position: { x: 0, y: 0 },
                    connections: [],
                },
            ],
            collapsed: false,
        };
        set({ services: [...get().services, service] });
    },

    loadCrudTemplate: () => {
        const serviceId = uuidv4();
        const service: ServiceContainer = {
            id: serviceId,
            ...serviceIdentity(get().services, "CRUD API"),
            description: "RESTful CRUD API with database model",
            color: SERVICE_COLORS[1],
            blocks: [
                {
                    id: uuidv4(),
                    type: "db_model",
                    label: "Item Model",
                    config: {
                        ...DEFAULT_DB_MODEL_CONFIG,
                        tableName: "Item",
                        fields: [
                            { name: "title", type: "string", required: true },
                            { name: "description", type: "string", required: false },
                            { name: "status", type: "string", required: false, defaultValue: "active" },
                            { name: "price", type: "number", required: false },
                        ],
                    } as DbModelConfig,
                    position: { x: 0, y: 0 },
                    connections: [],
                },
                {
                    id: uuidv4(),
                    type: "rest_endpoint",
                    label: "List Items",
                    config: {
                        ...DEFAULT_ENDPOINT_CONFIG,
                        route: "/api/items",
                        method: "GET",
                        description: "Get all items",
                    } as EndpointConfig,
                    position: { x: 0, y: 0 },
                    connections: [],
                },
                {
                    id: uuidv4(),
                    type: "rest_endpoint",
                    label: "Get Item",
                    config: {
                        ...DEFAULT_ENDPOINT_CONFIG,
                        route: "/api/items/:id",
                        method: "GET",
                        description: "Get item by ID",
                    } as EndpointConfig,
                    position: { x: 0, y: 0 },
                    connections: [],
                },
                {
                    id: uuidv4(),
                    type: "rest_endpoint",
                    label: "Create Item",
                    config: {
                        ...DEFAULT_ENDPOINT_CONFIG,
                        route: "/api/items",
                        method: "POST",
                        description: "Create a new item",
                        requestBody: [
                            { name: "title", type: "string", required: true },
                            { name: "description", type: "string", required: false },
                            { name: "price", type: "number", required: false },
                        ],
                    } as EndpointConfig,
                    position: { x: 0, y: 0 },
                    connections: [],
                },
                {
                    id: uuidv4(),
                    type: "rest_endpoint",
                    label: "Update Item",
                    config: {
                        ...DEFAULT_ENDPOINT_CONFIG,
                        route: "/api/items/:id",
                        method: "PUT",
                        description: "Update an item",
                    } as EndpointConfig,
                    position: { x: 0, y: 0 },
                    connections: [],
                },
                {
                    id: uuidv4(),
                    type: "rest_endpoint",
                    label: "Delete Item",
                    config: {
                        ...DEFAULT_ENDPOINT_CONFIG,
                        route: "/api/items/:id",
                        method: "DELETE",
                        description: "Delete an item",
                    } as EndpointConfig,
                    position: { x: 0, y: 0 },
                    connections: [],
                },
                {
                    id: uuidv4(),
                    type: "middleware",
                    label: "CORS",
                    config: { ...DEFAULT_MIDDLEWARE_CONFIG },
                    position: { x: 0, y: 0 },
                    connections: [],
                },
            ],
            collapsed: false,
        };
        set({ services: [...get().services, service] });
    },

    loadChatTemplate: () => {
        const serviceId = uuidv4();
        const service: ServiceContainer = {
            id: serviceId,
            ...serviceIdentity(get().services, "Chat Service"),
            description: "Real-time chat with message history and rooms",
            color: SERVICE_COLORS[2],
            blocks: [
                {
                    id: uuidv4(),
                    type: "db_model",
                    label: "Message Model",
                    config: {
                        ...DEFAULT_DB_MODEL_CONFIG,
                        tableName: "Message",
                        fields: [
                            { name: "content", type: "string", required: true },
                            { name: "sender", type: "objectId", required: true, ref: "User" },
                            { name: "room", type: "objectId", required: true, ref: "Room" },
                        ],
                    } as DbModelConfig,
                    position: { x: 0, y: 0 },
                    connections: [],
                },
                {
                    id: uuidv4(),
                    type: "db_model",
                    label: "Room Model",
                    config: {
                        ...DEFAULT_DB_MODEL_CONFIG,
                        tableName: "Room",
                        fields: [
                            { name: "name", type: "string", required: true },
                            { name: "members", type: "array", required: false },
                        ],
                    } as DbModelConfig,
                    position: { x: 0, y: 0 },
                    connections: [],
                },
                {
                    id: uuidv4(),
                    type: "rest_endpoint",
                    label: "Get Messages",
                    config: {
                        ...DEFAULT_ENDPOINT_CONFIG,
                        route: "/api/messages/:roomId",
                        method: "GET",
                        description: "Get messages for a room",
                        authRequired: true,
                    } as EndpointConfig,
                    position: { x: 0, y: 0 },
                    connections: [],
                },
                {
                    id: uuidv4(),
                    type: "rest_endpoint",
                    label: "Send Message",
                    config: {
                        ...DEFAULT_ENDPOINT_CONFIG,
                        route: "/api/messages",
                        method: "POST",
                        description: "Send a new message",
                        authRequired: true,
                        requestBody: [
                            { name: "content", type: "string", required: true },
                            { name: "roomId", type: "string", required: true },
                        ],
                    } as EndpointConfig,
                    position: { x: 0, y: 0 },
                    connections: [],
                },
                {
                    id: uuidv4(),
                    type: "rest_endpoint",
                    label: "Create Room",
                    config: {
                        ...DEFAULT_ENDPOINT_CONFIG,
                        route: "/api/rooms",
                        method: "POST",
                        description: "Create a new chat room",
                        authRequired: true,
                    } as EndpointConfig,
                    position: { x: 0, y: 0 },
                    connections: [],
                },
            ],
            collapsed: false,
        };
        set({ services: [...get().services, service] });
    },
}));
