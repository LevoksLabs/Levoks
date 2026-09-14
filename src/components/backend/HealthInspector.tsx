"use client";
import type { HealthConfig } from '@/types/backend';
import { useBackendStore } from '@/store/backendStore';
export default function HealthInspector({config, serviceId, onChange}: {config: HealthConfig; serviceId: string; onChange: (value: Partial<HealthConfig>) => void}) {
  const services = useBackendStore(s => s.services);
  return <section className="bi-section-body" aria-label="Health check configuration">
    <label className="bi-field">Readiness route<input className="bi-input" value={config.route} onChange={e => onChange({route: e.target.value})}/></label>
    <label className="bi-checkbox-label"><input type="checkbox" checked={config.checkDatabase} onChange={e => onChange({checkDatabase: e.target.checked})}/>Require a successful database ping</label>
    <label className="bi-field">Probe timeout (ms)<input className="bi-input" type="number" min={100} max={10000} value={config.timeoutMs} onChange={e => onChange({timeoutMs: Number(e.target.value)})}/></label>
    <label className="bi-field">Result cache (ms)<input className="bi-input" type="number" min={0} max={30000} value={config.cacheMs} onChange={e => onChange({cacheMs: Number(e.target.value)})}/></label>
    <fieldset><legend>Required services</legend>{services.filter(s => s.id !== serviceId).map(s => <label className="bi-checkbox-label" key={s.id}><input type="checkbox" checked={config.serviceIds.includes(s.id)} onChange={e => onChange({serviceIds: e.target.checked ? [...config.serviceIds, s.id] : config.serviceIds.filter(id => id !== s.id)})}/>{s.name}</label>)}</fieldset>
    <p className="bi-hint">Readiness returns 503 when a required probe fails. /health/live reports process liveness. Service probes use their liveness routes to avoid recursive health checks; configure HEALTH_ORIGIN_&lt;port&gt; in the service environment.</p>
  </section>;
}
