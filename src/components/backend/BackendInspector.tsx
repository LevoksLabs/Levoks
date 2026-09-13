"use client";
import React, { useState } from "react";
import { useBackendStore } from "@/store/backendStore";
import {
    EndpointConfig, DbModelConfig, DbQueryConfig, DbTransactionConfig,
    MiddlewareConfig, AuthConfig, AuthzRoleConfig, AuthzPermissionConfig,
    AuthzPolicyConfig, LogicIfConfig, LogicLoopConfig, LogicTryCatchConfig,
    LogicTransformConfig, LogicFunctionConfig, ValidationConfig, EnvVarConfig,
    ConfigSecretConfig, AsyncEventConfig, AsyncQueueConfig, AsyncJobConfig,
    AsyncWorkerConfig, AsyncSchedulerConfig, RealtimeWebSocketConfig,
    RealtimeSseConfig, RealtimeSubscribeConfig, RealtimePublishConfig,
    RealtimeBroadcastConfig, IntegrationHttpConfig, IntegrationWebhookConfig,
    IntegrationEmailConfig, IntegrationSmsConfig, IntegrationPaymentConfig,
    StorageUploadConfig, StorageDownloadConfig, StorageFileConfig,
    StorageDeleteConfig, CacheCacheConfig, CacheInvalidateConfig,
    ObsErrorHandlerConfig, ObsHealthCheckConfig, ObsAuditLogConfig,
    RelationConfig, SchemaField, SERVICE_COLORS,
} from "@/types/backend";
import {
    Settings, Globe, Database, Shield, GitBranch, Repeat,
    AlertTriangle, CheckCircle, Link2, ChevronDown, ChevronRight,
    Plus, Trash2, X, UserCheck, Key, Lock, Shuffle, Braces,
    Zap, List, Briefcase, Cpu, Clock, Radio, Bell, Send, Wifi,
    Mail, MessageSquare, CreditCard, Upload, Download, FolderOpen,
    Archive, RefreshCw, AlertOctagon, Activity, FileText, Webhook, Layers,
} from "lucide-react";

const Section: React.FC<{ title: string; icon?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }> = ({
    title, icon, defaultOpen = true, children,
}) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="bi-section">
            <button className="bi-section-header" onClick={() => setOpen(!open)}>
                {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                {icon}<span>{title}</span>
            </button>
            {open && <div className="bi-section-body">{children}</div>}
        </div>
    );
};
const FieldRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="bi-field">
        <label className="bi-label">{label}</label>
        <div className="bi-input-wrap">{children}</div>
    </div>
);
const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void }> = ({ checked, onChange }) => (
    <label className="bi-toggle">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="bi-toggle-slider" />
    </label>
);
const TagsInput: React.FC<{ values: string[]; onChange: (v: string[]) => void; placeholder?: string }> = ({ values, onChange, placeholder }) => {
    const [input, setInput] = useState("");
    const add = () => { if (input.trim()) { onChange([...values, input.trim()]); setInput(""); } };
    return (
        <div className="bi-tags">
            {values.map((v, i) => (
                <span key={i} className="bi-tag">{v}<button onClick={() => onChange(values.filter((_,idx) => idx !== i))}><X size={8} /></button></span>
            ))}
            <input className="bi-input bi-input-sm" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={placeholder||"Add..."} />
            <button className="bi-add-field-btn" onClick={add}><Plus size={10} /></button>
        </div>
    );
};
const SchemaFieldsEditor: React.FC<{ fields: SchemaField[]; onChange: (f: SchemaField[]) => void; label?: string }> = ({ fields, onChange, label="Fields" }) => {
    const add = () => onChange([...fields, { name: "", type: "string", required: false }]);
    const upd = (i: number, u: Partial<SchemaField>) => onChange(fields.map((f,idx) => idx===i ? {...f,...u} : f));
    const rem = (i: number) => onChange(fields.filter((_,idx) => idx!==i));
    return (
        <div className="bi-schema-editor">
            <div className="bi-schema-header"><span>{label}</span><button className="bi-add-field-btn" onClick={add}><Plus size={12}/> Add</button></div>
            {fields.map((field,idx) => (
                <div key={idx} className="bi-schema-field">
                    <input className="bi-input bi-input-sm" value={field.name} onChange={(e) => upd(idx,{name:e.target.value})} placeholder="name" />
                    <select className="bi-select bi-select-sm" value={field.type} onChange={(e) => upd(idx,{type:e.target.value as SchemaField["type"]})}>
                        {["string","number","boolean","date","object","array","objectId"].map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                    <label className="bi-checkbox-label"><input type="checkbox" checked={field.required} onChange={(e)=>upd(idx,{required:e.target.checked})} />Req</label>
                    <button className="bi-remove-field-btn" onClick={()=>rem(idx)}><X size={10}/></button>
                </div>
            ))}
        </div>
    );
};

// ─── Main Inspector ───
const BackendInspector: React.FC = () => {
    const { selectedServiceId, selectedBlockId, updateService, updateBlockConfig, getSelectedService, getSelectedBlock } = useBackendStore();
    const selectedService = getSelectedService();
    const selectedBlockData = getSelectedBlock();

    if (selectedBlockData) {
        const { block, serviceId } = selectedBlockData;
        const upd = (u: object) => updateBlockConfig(serviceId, block.id, u as never);
        return (
            <div className="backend-inspector">
                <div className="bi-header">
                    <h3>Block Properties</h3>
                    <span className="bi-type-badge">{block.type.replace(/_/g," ")}</span>
                </div>
                <div className="bi-content">
                    <Section title="General" icon={<Settings size={12}/>}>
                        <FieldRow label="Label">
                            <input className="bi-input" value={block.label} onChange={(e) => useBackendStore.getState().updateBlock(serviceId, block.id, { label: e.target.value })} />
                        </FieldRow>
                    </Section>
                    {block.type === "rest_endpoint" && <EndpointEditor config={block.config as EndpointConfig} onChange={upd} />}
                    {block.type === "db_model" && <DbModelEditor config={block.config as DbModelConfig} onChange={upd} />}
                    {block.type === "db_query" && <DbQueryEditor config={block.config as DbQueryConfig} onChange={upd} />}
                    {block.type === "db_transaction" && <DbTransactionEditor config={block.config as DbTransactionConfig} onChange={upd} />}
                    {block.type === "middleware" && <MiddlewareEditor config={block.config as MiddlewareConfig} onChange={upd} />}
                    {block.type === "auth_block" && <AuthEditor config={block.config as AuthConfig} onChange={upd} />}
                    {block.type === "authz_role" && <AuthzRoleEditor config={block.config as AuthzRoleConfig} onChange={upd} />}
                    {block.type === "authz_permission" && <AuthzPermissionEditor config={block.config as AuthzPermissionConfig} onChange={upd} />}
                    {block.type === "authz_policy" && <AuthzPolicyEditor config={block.config as AuthzPolicyConfig} onChange={upd} />}
                    {block.type === "logic_if" && <LogicIfEditor config={block.config as LogicIfConfig} onChange={upd} />}
                    {block.type === "logic_loop" && <LogicLoopEditor config={block.config as LogicLoopConfig} onChange={upd} />}
                    {block.type === "logic_trycatch" && <TryCatchEditor config={block.config as LogicTryCatchConfig} onChange={upd} />}
                    {block.type === "logic_transform" && <TransformEditor config={block.config as LogicTransformConfig} onChange={upd} />}
                    {block.type === "logic_function" && <FunctionEditor config={block.config as LogicFunctionConfig} onChange={upd} />}
                    {block.type === "validation" && <ValidationEditor config={block.config as ValidationConfig} onChange={upd} />}
                    {block.type === "relation" && <RelationEditor config={block.config as RelationConfig} onChange={upd} />}
                    {block.type === "env_var" && <EnvVarEditor config={block.config as EnvVarConfig} onChange={upd} />}
                    {block.type === "config_secret" && <ConfigSecretEditor config={block.config as ConfigSecretConfig} onChange={upd} />}
                    {block.type === "async_event" && <AsyncEventEditor config={block.config as AsyncEventConfig} onChange={upd} />}
                    {block.type === "async_queue" && <AsyncQueueEditor config={block.config as AsyncQueueConfig} onChange={upd} />}
                    {block.type === "async_job" && <AsyncJobEditor config={block.config as AsyncJobConfig} onChange={upd} />}
                    {block.type === "async_worker" && <AsyncWorkerEditor config={block.config as AsyncWorkerConfig} onChange={upd} />}
                    {block.type === "async_scheduler" && <AsyncSchedulerEditor config={block.config as AsyncSchedulerConfig} onChange={upd} />}
                    {block.type === "realtime_websocket" && <RealtimeWebSocketEditor config={block.config as RealtimeWebSocketConfig} onChange={upd} />}
                    {block.type === "realtime_sse" && <RealtimeSseEditor config={block.config as RealtimeSseConfig} onChange={upd} />}
                    {block.type === "realtime_subscribe" && <RealtimeSubscribeEditor config={block.config as RealtimeSubscribeConfig} onChange={upd} />}
                    {block.type === "realtime_publish" && <RealtimePublishEditor config={block.config as RealtimePublishConfig} onChange={upd} />}
                    {block.type === "realtime_broadcast" && <RealtimeBroadcastEditor config={block.config as RealtimeBroadcastConfig} onChange={upd} />}
                    {block.type === "integration_http" && <IntegrationHttpEditor config={block.config as IntegrationHttpConfig} onChange={upd} />}
                    {block.type === "integration_webhook" && <IntegrationWebhookEditor config={block.config as IntegrationWebhookConfig} onChange={upd} />}
                    {block.type === "integration_email" && <IntegrationEmailEditor config={block.config as IntegrationEmailConfig} onChange={upd} />}
                    {block.type === "integration_sms" && <IntegrationSmsEditor config={block.config as IntegrationSmsConfig} onChange={upd} />}
                    {block.type === "integration_payment" && <IntegrationPaymentEditor config={block.config as IntegrationPaymentConfig} onChange={upd} />}
                    {block.type === "storage_upload" && <StorageUploadEditor config={block.config as StorageUploadConfig} onChange={upd} />}
                    {block.type === "storage_download" && <StorageDownloadEditor config={block.config as StorageDownloadConfig} onChange={upd} />}
                    {block.type === "storage_file" && <StorageFileEditor config={block.config as StorageFileConfig} onChange={upd} />}
                    {block.type === "storage_delete" && <StorageDeleteEditor config={block.config as StorageDeleteConfig} onChange={upd} />}
                    {block.type === "cache_cache" && <CacheCacheEditor config={block.config as CacheCacheConfig} onChange={upd} />}
                    {block.type === "cache_invalidate" && <CacheInvalidateEditor config={block.config as CacheInvalidateConfig} onChange={upd} />}
                    {block.type === "obs_error_handler" && <ObsErrorHandlerEditor config={block.config as ObsErrorHandlerConfig} onChange={upd} />}
                    {block.type === "obs_health_check" && <ObsHealthCheckEditor config={block.config as ObsHealthCheckConfig} onChange={upd} />}
                    {block.type === "obs_audit_log" && <ObsAuditLogEditor config={block.config as ObsAuditLogConfig} onChange={upd} />}
                </div>
            </div>
        );
    }
    if (selectedService) {
        return (
            <div className="backend-inspector">
                <div className="bi-header">
                    <h3>Service Settings</h3>
                    <div className="bi-color-dot" style={{ background: selectedService.color }} />
                </div>
                <div className="bi-content">
                    <Section title="General" icon={<Settings size={12}/>}>
                        <FieldRow label="Name"><input className="bi-input" value={selectedService.name} onChange={(e) => updateService(selectedService.id,{name:e.target.value})} /></FieldRow>
                        <FieldRow label="Description"><textarea className="bi-textarea" value={selectedService.description} onChange={(e) => updateService(selectedService.id,{description:e.target.value})} rows={2} /></FieldRow>
                        <FieldRow label="Port"><input className="bi-input" type="number" value={selectedService.port} onChange={(e) => updateService(selectedService.id,{port:parseInt(e.target.value)||3000})} /></FieldRow>
                        <FieldRow label="Color">
                            <div className="bi-color-picker">
                                {SERVICE_COLORS.map((c) => (<button key={c} className={`bi-color-swatch ${selectedService.color===c?"active":""}`} style={{background:c}} onClick={()=>updateService(selectedService.id,{color:c})} />))}
                            </div>
                        </FieldRow>
                    </Section>
                    <Section title="Stats" defaultOpen={false}>
                        <div className="bi-stats">
                            <div className="bi-stat"><span>{selectedService.blocks.length}</span> blocks</div>
                            <div className="bi-stat"><span>{selectedService.blocks.filter(b=>b.type==="rest_endpoint").length}</span> endpoints</div>
                            <div className="bi-stat"><span>{selectedService.blocks.filter(b=>b.type==="db_model").length}</span> models</div>
                        </div>
                    </Section>
                </div>
            </div>
        );
    }
    return (
        <div className="backend-inspector">
            <div className="bi-header"><h3>Properties</h3></div>
            <div className="bi-empty"><Settings size={32} strokeWidth={1}/><p>Select a service or block to edit its properties</p></div>
        </div>
    );
};

// ─── Endpoint Editor ───
const EndpointEditor: React.FC<{ config: EndpointConfig; onChange: (u: Partial<EndpointConfig>) => void }> = ({ config, onChange }) => (
    <>
        <Section title="Endpoint" icon={<Globe size={12}/>}>
            <FieldRow label="Route"><input className="bi-input" value={config.route} onChange={(e)=>onChange({route:e.target.value})} /></FieldRow>
            <FieldRow label="Method">
                <select className="bi-select" value={config.method} onChange={(e)=>onChange({method:e.target.value as EndpointConfig["method"]})}>
                    {["GET","POST","PUT","DELETE","PATCH"].map(m=><option key={m} value={m}>{m}</option>)}
                </select>
            </FieldRow>
            <FieldRow label="Description"><input className="bi-input" value={config.description} onChange={(e)=>onChange({description:e.target.value})} /></FieldRow>
            <FieldRow label="Auth Required"><Toggle checked={config.authRequired} onChange={(v)=>onChange({authRequired:v})} /></FieldRow>
            <FieldRow label="Pagination"><Toggle checked={config.pagination} onChange={(v)=>onChange({pagination:v})} /></FieldRow>
            <FieldRow label="Rate Limit (req/min)"><input className="bi-input" type="number" value={config.rateLimit??""} placeholder="none" onChange={(e)=>onChange({rateLimit:e.target.value?parseInt(e.target.value):null})} /></FieldRow>
        </Section>
        <Section title="Path Parameters" defaultOpen={false}><SchemaFieldsEditor fields={config.pathParams} onChange={(f)=>onChange({pathParams:f})} label="Path Params" /></Section>
        <Section title="Query Parameters" defaultOpen={false}><SchemaFieldsEditor fields={config.queryParams} onChange={(f)=>onChange({queryParams:f})} label="Query Params" /></Section>
        <Section title="Headers" defaultOpen={false}><SchemaFieldsEditor fields={config.headers} onChange={(f)=>onChange({headers:f})} label="Headers" /></Section>
        <Section title="Request Body" defaultOpen={false}><SchemaFieldsEditor fields={config.requestBody} onChange={(f)=>onChange({requestBody:f})} /></Section>
        <Section title="Response Body" defaultOpen={false}><SchemaFieldsEditor fields={config.responseBody} onChange={(f)=>onChange({responseBody:f})} /></Section>
        <Section title="Status Codes" defaultOpen={false}>
            <div className="bi-schema-editor">
                <div className="bi-schema-header"><span>Status Codes</span><button className="bi-add-field-btn" onClick={()=>onChange({statusCodes:[...config.statusCodes,{code:200,description:""}]})}><Plus size={12}/> Add</button></div>
                {config.statusCodes.map((sc,i)=>(
                    <div key={i} className="bi-schema-field">
                        <input className="bi-input bi-input-sm" type="number" value={sc.code} onChange={(e)=>{const s=[...config.statusCodes];s[i]={...s[i],code:parseInt(e.target.value)||200};onChange({statusCodes:s});}} />
                        <input className="bi-input bi-input-sm" value={sc.description} onChange={(e)=>{const s=[...config.statusCodes];s[i]={...s[i],description:e.target.value};onChange({statusCodes:s});}} placeholder="description" />
                        <button className="bi-remove-field-btn" onClick={()=>onChange({statusCodes:config.statusCodes.filter((_,idx)=>idx!==i)})}><X size={10}/></button>
                    </div>
                ))}
            </div>
        </Section>
        <Section title="Authorization" icon={<Lock size={12}/>} defaultOpen={false}>
            <FieldRow label="Roles"><TagsInput values={config.authorizationRoles} onChange={(v)=>onChange({authorizationRoles:v})} placeholder="admin, user..." /></FieldRow>
            <FieldRow label="Permissions"><TagsInput values={config.authorizationPermissions} onChange={(v)=>onChange({authorizationPermissions:v})} placeholder="resource.read..." /></FieldRow>
        </Section>
    </>
);

// ─── DB Model Editor ───
const DbModelEditor: React.FC<{ config: DbModelConfig; onChange: (u: Partial<DbModelConfig>) => void }> = ({ config, onChange }) => (
    <>
        <Section title="Model" icon={<Database size={12}/>}>
            <FieldRow label="Table Name"><input className="bi-input" value={config.tableName} onChange={(e)=>onChange({tableName:e.target.value})} /></FieldRow>
            <FieldRow label="Timestamps"><Toggle checked={config.timestamps} onChange={(v)=>onChange({timestamps:v})} /></FieldRow>
            <FieldRow label="Soft Delete"><Toggle checked={config.softDelete} onChange={(v)=>onChange({softDelete:v})} /></FieldRow>
        </Section>
        <Section title="Schema Fields"><SchemaFieldsEditor fields={config.fields} onChange={(f)=>onChange({fields:f})} /></Section>
    </>
);

// ─── DB Query Editor ───
const DbQueryEditor: React.FC<{ config: DbQueryConfig; onChange: (u: Partial<DbQueryConfig>) => void }> = ({ config, onChange }) => (
    <Section title="Query" icon={<Database size={12}/>}>
        <FieldRow label="Model"><input className="bi-input" value={config.model} onChange={(e)=>onChange({model:e.target.value})} placeholder="User, Product..." /></FieldRow>
        <FieldRow label="Operation">
            <select className="bi-select" value={config.operation} onChange={(e)=>onChange({operation:e.target.value as DbQueryConfig["operation"]})}>
                {["findOne","findMany","create","update","delete","count","aggregate"].map(o=><option key={o} value={o}>{o}</option>)}
            </select>
        </FieldRow>
        <FieldRow label="Filters"><input className="bi-input" value={config.filters} onChange={(e)=>onChange({filters:e.target.value})} placeholder='{ "status": "active" }' /></FieldRow>
        <FieldRow label="Sort"><input className="bi-input" value={config.sort} onChange={(e)=>onChange({sort:e.target.value})} placeholder="price DESC" /></FieldRow>
        <FieldRow label="Limit"><input className="bi-input" type="number" value={config.limit} onChange={(e)=>onChange({limit:parseInt(e.target.value)||20})} /></FieldRow>
        <FieldRow label="Projection"><input className="bi-input" value={config.projection} onChange={(e)=>onChange({projection:e.target.value})} placeholder="name email" /></FieldRow>
    </Section>
);

// ─── DB Transaction Editor ───
const DbTransactionEditor: React.FC<{ config: DbTransactionConfig; onChange: (u: Partial<DbTransactionConfig>) => void }> = ({ config, onChange }) => (
    <Section title="Transaction" icon={<Layers size={12}/>}>
        <FieldRow label="Isolation">
            <select className="bi-select" value={config.isolationLevel} onChange={(e)=>onChange({isolationLevel:e.target.value as DbTransactionConfig["isolationLevel"]})}>
                <option value="READ_COMMITTED">Read Committed</option>
                <option value="REPEATABLE_READ">Repeatable Read</option>
                <option value="SERIALIZABLE">Serializable</option>
            </select>
        </FieldRow>
        <FieldRow label="Timeout (ms)"><input className="bi-input" type="number" value={config.timeout} onChange={(e)=>onChange({timeout:parseInt(e.target.value)||5000})} /></FieldRow>
        <FieldRow label="Operations"><textarea className="bi-textarea bi-code-textarea" value={config.operations} onChange={(e)=>onChange({operations:e.target.value})} rows={5} /></FieldRow>
    </Section>
);

// ─── Relation Editor ───
const RelationEditor: React.FC<{ config: RelationConfig; onChange: (u: Partial<RelationConfig>) => void }> = ({ config, onChange }) => (
    <Section title="Relation" icon={<Link2 size={12}/>}>
        <FieldRow label="From Model"><input className="bi-input" value={config.fromModel} onChange={(e)=>onChange({fromModel:e.target.value})} placeholder="User" /></FieldRow>
        <FieldRow label="To Model"><input className="bi-input" value={config.toModel} onChange={(e)=>onChange({toModel:e.target.value})} placeholder="Post" /></FieldRow>
        <FieldRow label="Relation Type">
            <select className="bi-select" value={config.relationType} onChange={(e)=>onChange({relationType:e.target.value as RelationConfig["relationType"]})}>
                <option value="one-to-one">One to One</option>
                <option value="one-to-many">One to Many</option>
                <option value="many-to-many">Many to Many</option>
            </select>
        </FieldRow>
        <FieldRow label="Foreign Key"><input className="bi-input" value={config.foreignKey} onChange={(e)=>onChange({foreignKey:e.target.value})} placeholder="userId" /></FieldRow>
    </Section>
);

// ─── Middleware Editor ───
const MiddlewareEditor: React.FC<{ config: MiddlewareConfig; onChange: (u: Partial<MiddlewareConfig>) => void }> = ({ config, onChange }) => (
    <Section title="Middleware" icon={<Settings size={12}/>}>
        <FieldRow label="Type">
            <select className="bi-select" value={config.middlewareType} onChange={(e)=>onChange({middlewareType:e.target.value as MiddlewareConfig["middlewareType"]})}>
                {["cors","rateLimit","logger","bodyParser","helmet","authentication","authorization","custom"].map(t=><option key={t} value={t}>{t}</option>)}
            </select>
        </FieldRow>
        {config.middlewareType==="cors" && <FieldRow label="Origins"><input className="bi-input" value={config.corsOrigins||""} onChange={(e)=>onChange({corsOrigins:e.target.value})} /></FieldRow>}
        {config.middlewareType==="rateLimit" && <>
            <FieldRow label="Max Requests"><input className="bi-input" type="number" value={config.rateLimit||100} onChange={(e)=>onChange({rateLimit:parseInt(e.target.value)})} /></FieldRow>
            <FieldRow label="Window (min)"><input className="bi-input" type="number" value={config.rateLimitWindow||15} onChange={(e)=>onChange({rateLimitWindow:parseInt(e.target.value)})} /></FieldRow>
        </>}
        {config.middlewareType==="custom" && <FieldRow label="Code"><textarea className="bi-textarea bi-code-textarea" value={config.customCode||""} onChange={(e)=>onChange({customCode:e.target.value})} rows={5} placeholder="module.exports = (req, res, next) => { ... }" /></FieldRow>}
    </Section>
);

// ─── Auth Editor ───
const AuthEditor: React.FC<{ config: AuthConfig; onChange: (u: Partial<AuthConfig>) => void }> = ({ config, onChange }) => (
    <Section title="Authentication" icon={<Shield size={12}/>}>
        <FieldRow label="Strategy">
            <select className="bi-select" value={config.strategy} onChange={(e)=>onChange({strategy:e.target.value as AuthConfig["strategy"]})}>
                {["jwt","oauth","session","apiKey"].map(s=><option key={s} value={s}>{s}</option>)}
            </select>
        </FieldRow>
        <FieldRow label="Secret Key"><input className="bi-input" type="password" value={config.secretKey} onChange={(e)=>onChange({secretKey:e.target.value})} /></FieldRow>
        <FieldRow label="Token Expiry"><input className="bi-input" value={config.tokenExpiry} onChange={(e)=>onChange({tokenExpiry:e.target.value})} placeholder="7d" /></FieldRow>
        {config.strategy==="jwt" && <FieldRow label="Hash Rounds"><input className="bi-input" type="number" value={config.hashRounds||10} onChange={(e)=>onChange({hashRounds:parseInt(e.target.value)})} /></FieldRow>}
        {config.strategy==="oauth" && <FieldRow label="Providers"><TagsInput values={config.providers||[]} onChange={(v)=>onChange({providers:v})} placeholder="google, github..." /></FieldRow>}
    </Section>
);

// ─── Authorization Editors ───
const AuthzRoleEditor: React.FC<{ config: AuthzRoleConfig; onChange: (u: Partial<AuthzRoleConfig>) => void }> = ({ config, onChange }) => (
    <Section title="Role" icon={<UserCheck size={12}/>}>
        <FieldRow label="Role Name"><input className="bi-input" value={config.roleName} onChange={(e)=>onChange({roleName:e.target.value})} /></FieldRow>
        <FieldRow label="Inherits From"><input className="bi-input" value={config.inheritsFrom} onChange={(e)=>onChange({inheritsFrom:e.target.value})} placeholder="user, admin..." /></FieldRow>
        <FieldRow label="Description"><input className="bi-input" value={config.description} onChange={(e)=>onChange({description:e.target.value})} /></FieldRow>
    </Section>
);
const AuthzPermissionEditor: React.FC<{ config: AuthzPermissionConfig; onChange: (u: Partial<AuthzPermissionConfig>) => void }> = ({ config, onChange }) => (
    <Section title="Permission" icon={<Key size={12}/>}>
        <FieldRow label="Permission Key"><input className="bi-input" value={config.permissionKey} onChange={(e)=>onChange({permissionKey:e.target.value})} /></FieldRow>
        <FieldRow label="Resource"><input className="bi-input" value={config.resource} onChange={(e)=>onChange({resource:e.target.value})} /></FieldRow>
        <FieldRow label="Action">
            <select className="bi-select" value={config.action} onChange={(e)=>onChange({action:e.target.value as AuthzPermissionConfig["action"]})}>
                {["create","read","update","delete","execute"].map(a=><option key={a} value={a}>{a}</option>)}
            </select>
        </FieldRow>
        <FieldRow label="Description"><input className="bi-input" value={config.description} onChange={(e)=>onChange({description:e.target.value})} /></FieldRow>
    </Section>
);
const AuthzPolicyEditor: React.FC<{ config: AuthzPolicyConfig; onChange: (u: Partial<AuthzPolicyConfig>) => void }> = ({ config, onChange }) => (
    <Section title="Access Policy" icon={<Lock size={12}/>}>
        <FieldRow label="Policy Name"><input className="bi-input" value={config.policyName} onChange={(e)=>onChange({policyName:e.target.value})} /></FieldRow>
        <FieldRow label="Roles"><TagsInput values={config.roles} onChange={(v)=>onChange({roles:v})} placeholder="admin, manager..." /></FieldRow>
        <FieldRow label="Permissions"><TagsInput values={config.permissions} onChange={(v)=>onChange({permissions:v})} placeholder="resource.read..." /></FieldRow>
        <FieldRow label="Conditions"><textarea className="bi-textarea bi-code-textarea" value={config.conditions} onChange={(e)=>onChange({conditions:e.target.value})} rows={3} placeholder="user.id === resource.ownerId" /></FieldRow>
    </Section>
);

// ─── Logic Editors ───
const LogicIfEditor: React.FC<{ config: LogicIfConfig; onChange: (u: Partial<LogicIfConfig>) => void }> = ({ config, onChange }) => (
    <Section title="If / Else" icon={<GitBranch size={12}/>}>
        <FieldRow label="Condition"><input className="bi-input" value={config.condition} onChange={(e)=>onChange({condition:e.target.value})} /></FieldRow>
        <FieldRow label="True Branch"><textarea className="bi-textarea bi-code-textarea" value={config.trueBranch} onChange={(e)=>onChange({trueBranch:e.target.value})} rows={3} /></FieldRow>
        <FieldRow label="False Branch"><textarea className="bi-textarea bi-code-textarea" value={config.falseBranch} onChange={(e)=>onChange({falseBranch:e.target.value})} rows={3} /></FieldRow>
    </Section>
);
const LogicLoopEditor: React.FC<{ config: LogicLoopConfig; onChange: (u: Partial<LogicLoopConfig>) => void }> = ({ config, onChange }) => (
    <Section title="Loop" icon={<Repeat size={12}/>}>
        <FieldRow label="Loop Type">
            <select className="bi-select" value={config.loopType} onChange={(e)=>onChange({loopType:e.target.value as LogicLoopConfig["loopType"]})}>
                <option value="for">For</option><option value="forEach">For Each</option><option value="while">While</option>
            </select>
        </FieldRow>
        <FieldRow label="Iterator"><input className="bi-input" value={config.iteratorName} onChange={(e)=>onChange({iteratorName:e.target.value})} /></FieldRow>
        <FieldRow label="Collection"><input className="bi-input" value={config.collection} onChange={(e)=>onChange({collection:e.target.value})} /></FieldRow>
    </Section>
);
const TryCatchEditor: React.FC<{ config: LogicTryCatchConfig; onChange: (u: Partial<LogicTryCatchConfig>) => void }> = ({ config, onChange }) => (
    <Section title="Try / Catch" icon={<AlertTriangle size={12}/>}>
        <FieldRow label="Try Body"><textarea className="bi-textarea bi-code-textarea" value={config.tryBody} onChange={(e)=>onChange({tryBody:e.target.value})} rows={4} /></FieldRow>
        <FieldRow label="Catch Body"><textarea className="bi-textarea bi-code-textarea" value={config.catchBody} onChange={(e)=>onChange({catchBody:e.target.value})} rows={4} /></FieldRow>
    </Section>
);
const TransformEditor: React.FC<{ config: LogicTransformConfig; onChange: (u: Partial<LogicTransformConfig>) => void }> = ({ config, onChange }) => (
    <Section title="Transform" icon={<Shuffle size={12}/>}>
        <FieldRow label="Input Var"><input className="bi-input" value={config.inputVar} onChange={(e)=>onChange({inputVar:e.target.value})} /></FieldRow>
        <FieldRow label="Output Var"><input className="bi-input" value={config.outputVar} onChange={(e)=>onChange({outputVar:e.target.value})} /></FieldRow>
        <FieldRow label="Transform Code"><textarea className="bi-textarea bi-code-textarea" value={config.transformCode} onChange={(e)=>onChange({transformCode:e.target.value})} rows={5} /></FieldRow>
    </Section>
);
const FunctionEditor: React.FC<{ config: LogicFunctionConfig; onChange: (u: Partial<LogicFunctionConfig>) => void }> = ({ config, onChange }) => (
    <Section title="Function" icon={<Braces size={12}/>}>
        <FieldRow label="Name"><input className="bi-input" value={config.functionName} onChange={(e)=>onChange({functionName:e.target.value})} /></FieldRow>
        <FieldRow label="Parameters"><input className="bi-input" value={config.parameters} onChange={(e)=>onChange({parameters:e.target.value})} placeholder="param1, param2" /></FieldRow>
        <FieldRow label="Return Type"><input className="bi-input" value={config.returnType} onChange={(e)=>onChange({returnType:e.target.value})} placeholder="any" /></FieldRow>
        <FieldRow label="Async"><Toggle checked={config.isAsync} onChange={(v)=>onChange({isAsync:v})} /></FieldRow>
        <FieldRow label="Body"><textarea className="bi-textarea bi-code-textarea" value={config.body} onChange={(e)=>onChange({body:e.target.value})} rows={6} /></FieldRow>
    </Section>
);

// ─── Validation + Env + Secret ───
const ValidationEditor: React.FC<{ config: ValidationConfig; onChange: (u: Partial<ValidationConfig>) => void }> = ({ config, onChange }) => (
    <Section title="Validation" icon={<CheckCircle size={12}/>}>
        <FieldRow label="Field Name"><input className="bi-input" value={config.fieldName} onChange={(e)=>onChange({fieldName:e.target.value})} /></FieldRow>
        <div className="bi-rules-list">
            {config.rules.map((rule,idx)=>(
                <div key={idx} className="bi-rule-item">
                    <select className="bi-select bi-select-sm" value={rule.type} onChange={(e)=>{const r=[...config.rules];r[idx]={...rule,type:e.target.value as typeof rule.type};onChange({rules:r});}}>
                        {["required","minLength","maxLength","min","max","regex","email","custom"].map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                    <input className="bi-input bi-input-sm" value={rule.message} onChange={(e)=>{const r=[...config.rules];r[idx]={...rule,message:e.target.value};onChange({rules:r});}} placeholder="message" />
                    <button className="bi-remove-field-btn" onClick={()=>onChange({rules:config.rules.filter((_,i)=>i!==idx)})}><X size={10}/></button>
                </div>
            ))}
            <button className="bi-add-field-btn" onClick={()=>onChange({rules:[...config.rules,{type:"required",message:""}]})}><Plus size={12}/> Add Rule</button>
        </div>
    </Section>
);
const EnvVarEditor: React.FC<{ config: EnvVarConfig; onChange: (u: Partial<EnvVarConfig>) => void }> = ({ config, onChange }) => (
    <Section title="Environment Variable" icon={<Settings size={12}/>}>
        <FieldRow label="Key"><input className="bi-input" value={config.key} onChange={(e)=>onChange({key:e.target.value})} /></FieldRow>
        <FieldRow label="Value"><input className="bi-input" value={config.value} onChange={(e)=>onChange({value:e.target.value})} type={config.isSecret?"password":"text"} /></FieldRow>
        <FieldRow label="Secret"><Toggle checked={config.isSecret} onChange={(v)=>onChange({isSecret:v})} /></FieldRow>
        <FieldRow label="Description"><input className="bi-input" value={config.description} onChange={(e)=>onChange({description:e.target.value})} /></FieldRow>
    </Section>
);
const ConfigSecretEditor: React.FC<{ config: ConfigSecretConfig; onChange: (u: Partial<ConfigSecretConfig>) => void }> = ({ config, onChange }) => (
    <Section title="Secret" icon={<Lock size={12}/>}>
        <FieldRow label="Key"><input className="bi-input" value={config.key} onChange={(e)=>onChange({key:e.target.value})} /></FieldRow>
        <FieldRow label="Provider">
            <select className="bi-select" value={config.provider} onChange={(e)=>onChange({provider:e.target.value as ConfigSecretConfig["provider"]})}>
                <option value="env">Environment</option><option value="vault">Vault</option><option value="aws_secrets">AWS Secrets</option>
            </select>
        </FieldRow>
        <FieldRow label="Description"><input className="bi-input" value={config.description} onChange={(e)=>onChange({description:e.target.value})} /></FieldRow>
    </Section>
);

// ─── Async Editors ───
const AsyncEventEditor: React.FC<{ config: AsyncEventConfig; onChange: (u: Partial<AsyncEventConfig>) => void }> = ({ config, onChange }) => (
    <Section title="Event" icon={<Zap size={12}/>}>
        <FieldRow label="Event Name"><input className="bi-input" value={config.eventName} onChange={(e)=>onChange({eventName:e.target.value})} placeholder="resource.created" /></FieldRow>
        <FieldRow label="Description"><input className="bi-input" value={config.description} onChange={(e)=>onChange({description:e.target.value})} /></FieldRow>
        <Section title="Payload" defaultOpen={false}><SchemaFieldsEditor fields={config.payload} onChange={(f)=>onChange({payload:f})} /></Section>
    </Section>
);
const AsyncQueueEditor: React.FC<{ config: AsyncQueueConfig; onChange: (u: Partial<AsyncQueueConfig>) => void }> = ({ config, onChange }) => (
    <Section title="Queue" icon={<List size={12}/>}>
        <FieldRow label="Queue Name"><input className="bi-input" value={config.queueName} onChange={(e)=>onChange({queueName:e.target.value})} /></FieldRow>
        <FieldRow label="Max Retries"><input className="bi-input" type="number" value={config.maxRetries} onChange={(e)=>onChange({maxRetries:parseInt(e.target.value)||3})} /></FieldRow>
        <FieldRow label="Backoff (ms)"><input className="bi-input" type="number" value={config.backoffMs} onChange={(e)=>onChange({backoffMs:parseInt(e.target.value)||1000})} /></FieldRow>
        <FieldRow label="Description"><input className="bi-input" value={config.description} onChange={(e)=>onChange({description:e.target.value})} /></FieldRow>
    </Section>
);
const AsyncJobEditor: React.FC<{ config: AsyncJobConfig; onChange: (u: Partial<AsyncJobConfig>) => void }> = ({ config, onChange }) => (
    <Section title="Job" icon={<Briefcase size={12}/>}>
        <FieldRow label="Job Name"><input className="bi-input" value={config.jobName} onChange={(e)=>onChange({jobName:e.target.value})} /></FieldRow>
        <FieldRow label="Queue Ref"><input className="bi-input" value={config.queueRef} onChange={(e)=>onChange({queueRef:e.target.value})} /></FieldRow>
        <FieldRow label="Body"><textarea className="bi-textarea bi-code-textarea" value={config.body} onChange={(e)=>onChange({body:e.target.value})} rows={5} /></FieldRow>
    </Section>
);
const AsyncWorkerEditor: React.FC<{ config: AsyncWorkerConfig; onChange: (u: Partial<AsyncWorkerConfig>) => void }> = ({ config, onChange }) => (
    <Section title="Worker" icon={<Cpu size={12}/>}>
        <FieldRow label="Worker Name"><input className="bi-input" value={config.workerName} onChange={(e)=>onChange({workerName:e.target.value})} /></FieldRow>
        <FieldRow label="Queue Ref"><input className="bi-input" value={config.queueRef} onChange={(e)=>onChange({queueRef:e.target.value})} /></FieldRow>
        <FieldRow label="Concurrency"><input className="bi-input" type="number" value={config.concurrency} onChange={(e)=>onChange({concurrency:parseInt(e.target.value)||5})} /></FieldRow>
        <FieldRow label="Body"><textarea className="bi-textarea bi-code-textarea" value={config.body} onChange={(e)=>onChange({body:e.target.value})} rows={5} /></FieldRow>
    </Section>
);
const AsyncSchedulerEditor: React.FC<{ config: AsyncSchedulerConfig; onChange: (u: Partial<AsyncSchedulerConfig>) => void }> = ({ config, onChange }) => (
    <Section title="Scheduler" icon={<Clock size={12}/>}>
        <FieldRow label="Name"><input className="bi-input" value={config.schedulerName} onChange={(e)=>onChange({schedulerName:e.target.value})} /></FieldRow>
        <FieldRow label="Cron"><input className="bi-input" value={config.cron} onChange={(e)=>onChange({cron:e.target.value})} placeholder="0 * * * *" /></FieldRow>
        <FieldRow label="Description"><input className="bi-input" value={config.description} onChange={(e)=>onChange({description:e.target.value})} /></FieldRow>
        <FieldRow label="Body"><textarea className="bi-textarea bi-code-textarea" value={config.body} onChange={(e)=>onChange({body:e.target.value})} rows={4} /></FieldRow>
    </Section>
);

// ─── Real-Time Editors ───
const RealtimeWebSocketEditor: React.FC<{ config: RealtimeWebSocketConfig; onChange: (u: Partial<RealtimeWebSocketConfig>) => void }> = ({ config, onChange }) => (
    <Section title="WebSocket" icon={<Radio size={12}/>}>
        <FieldRow label="Path"><input className="bi-input" value={config.path} onChange={(e)=>onChange({path:e.target.value})} placeholder="/ws" /></FieldRow>
        <FieldRow label="Auth Required"><Toggle checked={config.authRequired} onChange={(v)=>onChange({authRequired:v})} /></FieldRow>
        <FieldRow label="Description"><input className="bi-input" value={config.description} onChange={(e)=>onChange({description:e.target.value})} /></FieldRow>
    </Section>
);
const RealtimeSseEditor: React.FC<{ config: RealtimeSseConfig; onChange: (u: Partial<RealtimeSseConfig>) => void }> = ({ config, onChange }) => (
    <Section title="SSE" icon={<Radio size={12}/>}>
        <FieldRow label="Path"><input className="bi-input" value={config.path} onChange={(e)=>onChange({path:e.target.value})} placeholder="/events" /></FieldRow>
        <FieldRow label="Auth Required"><Toggle checked={config.authRequired} onChange={(v)=>onChange({authRequired:v})} /></FieldRow>
        <FieldRow label="Description"><input className="bi-input" value={config.description} onChange={(e)=>onChange({description:e.target.value})} /></FieldRow>
    </Section>
);
const RealtimeSubscribeEditor: React.FC<{ config: RealtimeSubscribeConfig; onChange: (u: Partial<RealtimeSubscribeConfig>) => void }> = ({ config, onChange }) => (
    <Section title="Subscribe" icon={<Bell size={12}/>}>
        <FieldRow label="Channel"><input className="bi-input" value={config.channel} onChange={(e)=>onChange({channel:e.target.value})} placeholder="channel.name" /></FieldRow>
        <FieldRow label="Description"><input className="bi-input" value={config.description} onChange={(e)=>onChange({description:e.target.value})} /></FieldRow>
    </Section>
);
const RealtimePublishEditor: React.FC<{ config: RealtimePublishConfig; onChange: (u: Partial<RealtimePublishConfig>) => void }> = ({ config, onChange }) => (
    <Section title="Publish" icon={<Send size={12}/>}>
        <FieldRow label="Channel"><input className="bi-input" value={config.channel} onChange={(e)=>onChange({channel:e.target.value})} placeholder="channel.name" /></FieldRow>
        <Section title="Payload" defaultOpen={false}><SchemaFieldsEditor fields={config.payload} onChange={(f)=>onChange({payload:f})} /></Section>
    </Section>
);
const RealtimeBroadcastEditor: React.FC<{ config: RealtimeBroadcastConfig; onChange: (u: Partial<RealtimeBroadcastConfig>) => void }> = ({ config, onChange }) => (
    <Section title="Broadcast" icon={<Wifi size={12}/>}>
        <FieldRow label="Channel"><input className="bi-input" value={config.channel} onChange={(e)=>onChange({channel:e.target.value})} placeholder="channel.name" /></FieldRow>
        <FieldRow label="Exclude Sender"><Toggle checked={config.excludeSender} onChange={(v)=>onChange({excludeSender:v})} /></FieldRow>
    </Section>
);

// ─── Integration Editors ───
const IntegrationHttpEditor: React.FC<{ config: IntegrationHttpConfig; onChange: (u: Partial<IntegrationHttpConfig>) => void }> = ({ config, onChange }) => (
    <Section title="HTTP Request" icon={<Globe size={12}/>}>
        <FieldRow label="URL"><input className="bi-input" value={config.url} onChange={(e)=>onChange({url:e.target.value})} placeholder="https://api.example.com" /></FieldRow>
        <FieldRow label="Method">
            <select className="bi-select" value={config.method} onChange={(e)=>onChange({method:e.target.value as IntegrationHttpConfig["method"]})}>
                {["GET","POST","PUT","DELETE","PATCH"].map(m=><option key={m} value={m}>{m}</option>)}
            </select>
        </FieldRow>
        <FieldRow label="Headers"><textarea className="bi-textarea bi-code-textarea" value={config.headers} onChange={(e)=>onChange({headers:e.target.value})} rows={3} placeholder="{}" /></FieldRow>
        <FieldRow label="Body"><textarea className="bi-textarea bi-code-textarea" value={config.body} onChange={(e)=>onChange({body:e.target.value})} rows={3} placeholder="{}" /></FieldRow>
        <FieldRow label="Timeout (ms)"><input className="bi-input" type="number" value={config.timeoutMs} onChange={(e)=>onChange({timeoutMs:parseInt(e.target.value)||5000})} /></FieldRow>
    </Section>
);
const IntegrationWebhookEditor: React.FC<{ config: IntegrationWebhookConfig; onChange: (u: Partial<IntegrationWebhookConfig>) => void }> = ({ config, onChange }) => (
    <Section title="Webhook" icon={<Webhook size={12}/>}>
        <FieldRow label="Path"><input className="bi-input" value={config.path} onChange={(e)=>onChange({path:e.target.value})} placeholder="/webhooks/stripe" /></FieldRow>
        <FieldRow label="Verify Signature"><Toggle checked={config.verifySignature} onChange={(v)=>onChange({verifySignature:v})} /></FieldRow>
        <FieldRow label="Secret"><input className="bi-input" type="password" value={config.secret} onChange={(e)=>onChange({secret:e.target.value})} /></FieldRow>
        <FieldRow label="Description"><input className="bi-input" value={config.description} onChange={(e)=>onChange({description:e.target.value})} /></FieldRow>
    </Section>
);
const IntegrationEmailEditor: React.FC<{ config: IntegrationEmailConfig; onChange: (u: Partial<IntegrationEmailConfig>) => void }> = ({ config, onChange }) => (
    <Section title="Email" icon={<Mail size={12}/>}>
        <FieldRow label="Provider">
            <select className="bi-select" value={config.provider} onChange={(e)=>onChange({provider:e.target.value as IntegrationEmailConfig["provider"]})}>
                <option value="smtp">SMTP</option><option value="sendgrid">SendGrid</option><option value="mailgun">Mailgun</option><option value="ses">AWS SES</option>
            </select>
        </FieldRow>
        <FieldRow label="To"><input className="bi-input" value={config.to} onChange={(e)=>onChange({to:e.target.value})} /></FieldRow>
        <FieldRow label="Subject"><input className="bi-input" value={config.subject} onChange={(e)=>onChange({subject:e.target.value})} /></FieldRow>
        <FieldRow label="Template"><textarea className="bi-textarea bi-code-textarea" value={config.template} onChange={(e)=>onChange({template:e.target.value})} rows={4} /></FieldRow>
    </Section>
);
const IntegrationSmsEditor: React.FC<{ config: IntegrationSmsConfig; onChange: (u: Partial<IntegrationSmsConfig>) => void }> = ({ config, onChange }) => (
    <Section title="SMS" icon={<MessageSquare size={12}/>}>
        <FieldRow label="Provider">
            <select className="bi-select" value={config.provider} onChange={(e)=>onChange({provider:e.target.value as IntegrationSmsConfig["provider"]})}>
                <option value="twilio">Twilio</option><option value="vonage">Vonage</option>
            </select>
        </FieldRow>
        <FieldRow label="To"><input className="bi-input" value={config.to} onChange={(e)=>onChange({to:e.target.value})} placeholder="+1234567890" /></FieldRow>
        <FieldRow label="Body"><textarea className="bi-textarea" value={config.body} onChange={(e)=>onChange({body:e.target.value})} rows={3} /></FieldRow>
    </Section>
);
const IntegrationPaymentEditor: React.FC<{ config: IntegrationPaymentConfig; onChange: (u: Partial<IntegrationPaymentConfig>) => void }> = ({ config, onChange }) => (
    <Section title="Payment" icon={<CreditCard size={12}/>}>
        <FieldRow label="Provider">
            <select className="bi-select" value={config.provider} onChange={(e)=>onChange({provider:e.target.value as IntegrationPaymentConfig["provider"]})}>
                <option value="stripe">Stripe</option><option value="paypal">PayPal</option><option value="square">Square</option>
            </select>
        </FieldRow>
        <FieldRow label="Operation">
            <select className="bi-select" value={config.operation} onChange={(e)=>onChange({operation:e.target.value as IntegrationPaymentConfig["operation"]})}>
                <option value="charge">Charge</option><option value="refund">Refund</option><option value="subscribe">Subscribe</option><option value="webhook">Webhook</option>
            </select>
        </FieldRow>
        <FieldRow label="Description"><input className="bi-input" value={config.description} onChange={(e)=>onChange({description:e.target.value})} /></FieldRow>
    </Section>
);

// ─── Storage Editors ───
const StorageProviderField: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
    <FieldRow label="Provider">
        <select className="bi-select" value={value} onChange={(e)=>onChange(e.target.value)}>
            <option value="local">Local</option><option value="s3">AWS S3</option><option value="gcs">Google GCS</option><option value="cloudinary">Cloudinary</option>
        </select>
    </FieldRow>
);
const StorageUploadEditor: React.FC<{ config: StorageUploadConfig; onChange: (u: Partial<StorageUploadConfig>) => void }> = ({ config, onChange }) => (
    <Section title="Upload" icon={<Upload size={12}/>}>
        <StorageProviderField value={config.provider} onChange={(v)=>onChange({provider:v as StorageUploadConfig["provider"]})} />
        <FieldRow label="Bucket"><input className="bi-input" value={config.bucket} onChange={(e)=>onChange({bucket:e.target.value})} /></FieldRow>
        <FieldRow label="Allowed Types"><input className="bi-input" value={config.allowedTypes} onChange={(e)=>onChange({allowedTypes:e.target.value})} placeholder="image/*,application/pdf" /></FieldRow>
        <FieldRow label="Max Size (MB)"><input className="bi-input" type="number" value={config.maxSizeMb} onChange={(e)=>onChange({maxSizeMb:parseInt(e.target.value)||10})} /></FieldRow>
    </Section>
);
const StorageDownloadEditor: React.FC<{ config: StorageDownloadConfig; onChange: (u: Partial<StorageDownloadConfig>) => void }> = ({ config, onChange }) => (
    <Section title="Download" icon={<Download size={12}/>}>
        <StorageProviderField value={config.provider} onChange={(v)=>onChange({provider:v as StorageDownloadConfig["provider"]})} />
        <FieldRow label="Bucket"><input className="bi-input" value={config.bucket} onChange={(e)=>onChange({bucket:e.target.value})} /></FieldRow>
    </Section>
);
const StorageFileEditor: React.FC<{ config: StorageFileConfig; onChange: (u: Partial<StorageFileConfig>) => void }> = ({ config, onChange }) => (
    <Section title="Storage" icon={<FolderOpen size={12}/>}>
        <StorageProviderField value={config.provider} onChange={(v)=>onChange({provider:v as StorageFileConfig["provider"]})} />
        <FieldRow label="Bucket"><input className="bi-input" value={config.bucket} onChange={(e)=>onChange({bucket:e.target.value})} /></FieldRow>
        <FieldRow label="Description"><input className="bi-input" value={config.description} onChange={(e)=>onChange({description:e.target.value})} /></FieldRow>
    </Section>
);
const StorageDeleteEditor: React.FC<{ config: StorageDeleteConfig; onChange: (u: Partial<StorageDeleteConfig>) => void }> = ({ config, onChange }) => (
    <Section title="Delete File" icon={<Trash2 size={12}/>}>
        <StorageProviderField value={config.provider} onChange={(v)=>onChange({provider:v as StorageDeleteConfig["provider"]})} />
        <FieldRow label="Bucket"><input className="bi-input" value={config.bucket} onChange={(e)=>onChange({bucket:e.target.value})} /></FieldRow>
    </Section>
);

// ─── Cache Editors ───
const CacheProviderField: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
    <FieldRow label="Provider">
        <select className="bi-select" value={value} onChange={(e)=>onChange(e.target.value)}>
            <option value="memory">Memory</option><option value="redis">Redis</option>
        </select>
    </FieldRow>
);
const CacheCacheEditor: React.FC<{ config: CacheCacheConfig; onChange: (u: Partial<CacheCacheConfig>) => void }> = ({ config, onChange }) => (
    <Section title="Cache" icon={<Archive size={12}/>}>
        <CacheProviderField value={config.provider} onChange={(v)=>onChange({provider:v as CacheCacheConfig["provider"]})} />
        <FieldRow label="Key Pattern"><input className="bi-input" value={config.keyPattern} onChange={(e)=>onChange({keyPattern:e.target.value})} placeholder="resource:{{id}}" /></FieldRow>
        <FieldRow label="TTL (seconds)"><input className="bi-input" type="number" value={config.ttlSeconds} onChange={(e)=>onChange({ttlSeconds:parseInt(e.target.value)||300})} /></FieldRow>
        <FieldRow label="Description"><input className="bi-input" value={config.description} onChange={(e)=>onChange({description:e.target.value})} /></FieldRow>
    </Section>
);
const CacheInvalidateEditor: React.FC<{ config: CacheInvalidateConfig; onChange: (u: Partial<CacheInvalidateConfig>) => void }> = ({ config, onChange }) => (
    <Section title="Invalidate Cache" icon={<RefreshCw size={12}/>}>
        <CacheProviderField value={config.provider} onChange={(v)=>onChange({provider:v as CacheInvalidateConfig["provider"]})} />
        <FieldRow label="Key Pattern"><input className="bi-input" value={config.keyPattern} onChange={(e)=>onChange({keyPattern:e.target.value})} placeholder="resource:*" /></FieldRow>
        <FieldRow label="Description"><input className="bi-input" value={config.description} onChange={(e)=>onChange({description:e.target.value})} /></FieldRow>
    </Section>
);

// ─── Observability Editors ───
const ObsErrorHandlerEditor: React.FC<{ config: ObsErrorHandlerConfig; onChange: (u: Partial<ObsErrorHandlerConfig>) => void }> = ({ config, onChange }) => (
    <Section title="Error Handler" icon={<AlertOctagon size={12}/>}>
        <FieldRow label="Catch All"><Toggle checked={config.catchAll} onChange={(v)=>onChange({catchAll:v})} /></FieldRow>
        <FieldRow label="Log to Console"><Toggle checked={config.logToConsole} onChange={(v)=>onChange({logToConsole:v})} /></FieldRow>
        <FieldRow label="Notify on Error"><Toggle checked={config.notifyOnError} onChange={(v)=>onChange({notifyOnError:v})} /></FieldRow>
        <FieldRow label="Custom Handler"><textarea className="bi-textarea bi-code-textarea" value={config.customHandler} onChange={(e)=>onChange({customHandler:e.target.value})} rows={4} placeholder="(err, req, res, next) => { ... }" /></FieldRow>
    </Section>
);
const ObsHealthCheckEditor: React.FC<{ config: ObsHealthCheckConfig; onChange: (u: Partial<ObsHealthCheckConfig>) => void }> = ({ config, onChange }) => (
    <Section title="Health Check" icon={<Activity size={12}/>}>
        <FieldRow label="Path"><input className="bi-input" value={config.path} onChange={(e)=>onChange({path:e.target.value})} placeholder="/health" /></FieldRow>
        <FieldRow label="Include DB Check"><Toggle checked={config.includeDbCheck} onChange={(v)=>onChange({includeDbCheck:v})} /></FieldRow>
        <FieldRow label="Include Cache Check"><Toggle checked={config.includeCacheCheck} onChange={(v)=>onChange({includeCacheCheck:v})} /></FieldRow>
        <FieldRow label="Description"><input className="bi-input" value={config.description} onChange={(e)=>onChange({description:e.target.value})} /></FieldRow>
    </Section>
);
const ObsAuditLogEditor: React.FC<{ config: ObsAuditLogConfig; onChange: (u: Partial<ObsAuditLogConfig>) => void }> = ({ config, onChange }) => (
    <Section title="Audit Log" icon={<FileText size={12}/>}>
        <FieldRow label="Events"><input className="bi-input" value={config.events} onChange={(e)=>onChange({events:e.target.value})} placeholder="create,update,delete" /></FieldRow>
        <FieldRow label="Destination">
            <select className="bi-select" value={config.destination} onChange={(e)=>onChange({destination:e.target.value as ObsAuditLogConfig["destination"]})}>
                <option value="console">Console</option><option value="database">Database</option><option value="file">File</option>
            </select>
        </FieldRow>
        <FieldRow label="Include User"><Toggle checked={config.includeUser} onChange={(v)=>onChange({includeUser:v})} /></FieldRow>
    </Section>
);

export default BackendInspector;
