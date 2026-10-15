import { useRef, useState } from "react";
import { api } from "../api";
import "./view-switcher.css";
type Session = { user: {role: string} | null; demoAccounts: boolean };
export default function ViewSwitcher() {
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const panel=useRef<HTMLDetailsElement>(null);
 const path=location.pathname;
 const current=path==="/admin"?"Store admin":path==="/desk"?"Dealer desk":"Customer store";
 async function owner(destination:string){
  setBusy(true);setError("");
  try {
   const latest=await api<Session>("/api/auth/session");
   if(latest.user?.role!=="owner"){
    if(!latest.demoAccounts){location.assign('/desk');return;}
    await api('/api/auth/login',{method:'POST',body:JSON.stringify({email:'owner@quoteledger.demo',password:'Demo-owner-2026!'})});
   }
   location.assign(destination);
  }catch(e){setError(e instanceof Error?e.message:'Unable to switch views. Please try again.');setBusy(false);}
 }
 if(new URLSearchParams(location.search).has('token'))return null;
 return <aside className="view-switcher" aria-label="Demo view controls">
  <div className="view-switcher-inner"><span className="view-context"><span className="view-demo-label">PORTFOLIO DEMO</span><strong>{current}</strong></span>
  <details ref={panel} onKeyDown={e=>{if(e.key==='Escape'){panel.current!.open=false;panel.current?.querySelector('summary')?.focus();}}}>
   <summary>Switch view <span aria-hidden="true">âŒ„</span></summary>
   <div className="view-options"><p>Explore both sides of the business</p>
    <a href="/store" aria-current={current==='Customer store'?'page':undefined}><strong>Customer store</strong><span>Browse metals, prices and your basket</span></a>
    <a href="/account"><strong>Customer account</strong><span>Your fictional orders and holdings</span></a>
    <button disabled={busy} onClick={()=>void owner('/admin')}><strong>{busy?'Openingâ€¦':'Owner demo · Admin'}</strong><span>Manage orders, stock, pricing and profit</span></button>
    <button disabled={busy} onClick={()=>void owner('/desk')}><strong>Dealer desk</strong><span>Create quotes and manage reservations</span></button>
    <small>Demo access only. Switching views does not place an order.</small>
    {error&&<p role="alert">{error}</p>}
   </div>
  </details></div>
 </aside>;
}
