"use client";
import { useCallback, useEffect, useState } from "react";
import type { SecretMetadata } from "@/lib/server/vault";
export default function SecretsPanel({projectId}:{projectId:string}) {
  const [secrets,setSecrets]=useState<SecretMetadata[]>([]),[name,setName]=useState(""),[value,setValue]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const refresh=useCallback(async()=>{const response=await fetch(`/api/secrets?projectId=${encodeURIComponent(projectId)}`,{cache:"no-store"});const data=await response.json();if(!response.ok)throw new Error(data.error);setSecrets(data);},[projectId]);
  useEffect(()=>{void refresh().catch(error=>setError(error.message));},[refresh]);
  const change=async(action:"put"|"remove"|"rotate",secretName:string,version:number)=>{
    setBusy(true);setError("");
    try {const response=await fetch("/api/secrets",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId,name:secretName,version,action,...(action==="put"?{value}:{})})});if(!response.ok)throw new Error((await response.json()).error);setValue("");await refresh();}catch(error){setError(error instanceof Error?error.message:"Secret operation failed");}finally{setBusy(false);}
  };
  return <section><h2>Project secrets</h2><p>Values are encrypted on the server and never returned to the browser after saving. Reference the secret name in backend configuration. Exports contain environment placeholders; your host must receive the values through its secret manager.</p>{error&&<p role="alert">{error}</p>}<label>Secret name<input value={name} placeholder="PAYMENT_API_KEY" onChange={e=>setName(e.target.value)}/></label><label>New secret value<input type="password" autoComplete="new-password" value={value} onChange={e=>setValue(e.target.value)}/></label><button disabled={busy||!value||!/^[A-Z_][A-Z0-9_]{0,99}$/.test(name)} onClick={()=>void change("put",name,secrets.find(s=>s.name===name)?.version || 0)}>Save encrypted secret</button><button disabled={busy} onClick={()=>void refresh().catch(error=>setError(error.message))}>Refresh secrets</button>{secrets.map(secret=><div className="workspace-list-item" key={secret.name}><span>{secret.name}<small>Version {secret.version} · Key {secret.keyId}</small></span><button disabled={busy} onClick={()=>void change("rotate",secret.name,secret.version)}>Re-encrypt</button><button disabled={busy} onClick={()=>void change("remove",secret.name,secret.version)}>Delete secret</button></div>)}</section>;
}
