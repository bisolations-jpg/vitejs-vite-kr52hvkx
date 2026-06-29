import { useState, useEffect, useMemo, useRef } from "react";

// ═══════════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════════
const PRODUITS_CEE = ["Pompe à chaleur flottante","Déstratificateur d'air","Récupération de chaleur","Isolation des combles","Isolation des murs","Isolation des planchers","Chaudière biomasse","Régulation / GTB","Éclairage LED","Autre"];
const TYPES_BATIMENT = ["Entrepôt / Hangar","Bureau / Tertiaire","Commerce / GMS","Industrie / Atelier","Restaurant / CHR","Établissement scolaire","Bâtiment de santé","Autre"];
const CHAUFFAGES = ["Gaz naturel","Fioul","Électrique","Bois / Biomasse","Pompe à chaleur","Réseau de chaleur","Charbon","Propane / GPL","Autre / Inconnu"];
const SOURCES = ["Phoning","Terrain / Porte-à-porte","Recommandation","Site web","Partenaire","Salon / Événement","Autre"];
const STATUTS = ["À contacter","En cours","RDV planifié","RDV effectué","Devis envoyé","Signé","Pas intéressé","Déjà installé","Annulé"];
const STATUT_META = {
  "À contacter":   { bg:"#F3F4F6", text:"#374151", dot:"#6B7280" },
  "En cours":      { bg:"#EDE9FE", text:"#5B21B6", dot:"#7C3AED" },
  "RDV planifié":  { bg:"#E8F4FD", text:"#1565C0", dot:"#1976D2" },
  "RDV effectué":  { bg:"#E8F5E9", text:"#2E7D32", dot:"#388E3C" },
  "Devis envoyé":  { bg:"#FFF8E1", text:"#F57F17", dot:"#E8A020" },
  "Signé":         { bg:"#F3E5F5", text:"#6A1B9A", dot:"#7B1FA2" },
  "Pas intéressé": { bg:"#FFF3F3", text:"#C62828", dot:"#EF5350" },
  "Déjà installé": { bg:"#E0F2F1", text:"#00695C", dot:"#00897B" },
  "Annulé":        { bg:"#FAFAFA", text:"#757575", dot:"#9E9E9E" },
};
// Rappel et suppression automatiques (en jours)
const RAPPEL_DELAI     = { "Déjà installé":365, "Annulé":180 };
const SUPPRESSION_DELAI = { "Pas intéressé":30 };
const addDays = (d,n)=>{ const dt=new Date(d); dt.setDate(dt.getDate()+n); return dt.toISOString().slice(0,10); };
const EMPTY_RDV = {
  agentId:"", dateRdv:"", heureRdv:"", statut:"À contacter", pendingStatut:"",
  rappelDate:"", suppressionDate:"",
  raisonSociale:"", siret:"", naf:"", adresse:"", codePostal:"", ville:"",
  nomContact:"", prenomContact:"", poste:"", telephone:"", email:"",
  typeBatiment:"", chauffageActuel:"", surface:"", hauteurSous:"",
  anneeConstruction:"", facture:"", source:"", proprietaire:"",
  produits:[], observations:"", compteRendu:"", relances:[], historique:[],
};
const DRAFT_KEY = "crm_draft_final";
const PAGE_SIZE = 25;

// ═══════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════
const ls  = (k,fb) => { try { const v=localStorage.getItem(k); return v?JSON.parse(v):fb; } catch { return fb; } };
const lss = (k,v)  => { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} };
const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const fmtSiret = v => { const d=v.replace(/\D/g,"").slice(0,14); return d.replace(/(\d{3})(\d{3})(\d{3})(\d{0,5})/,(_,a,b,c,dd)=>[a,b,c,dd].filter(Boolean).join(" ")); };
const todayStr = () => new Date().toISOString().slice(0,10);
const nowStr   = () => new Date().toTimeString().slice(0,5);
const uname = u => u?(u.nom?`${u.prenom} ${u.nom}`:u.prenom):"—";
const fmtDate = d => { if(!d) return "—"; const [y,m,j]=d.split("-"); return `${j}/${m}/${y}`; };
const daysUntil = ds => { if(!ds) return null; return Math.ceil((new Date(ds)-new Date(todayStr()))/86400000); };
const timeToMins = t => { if(!t) return null; const [h,m]=t.split(":").map(Number); return h*60+m; };
const fmtDur = m => { if(m===null||isNaN(m)) return "—"; return `${Math.floor(m/60)}h${m%60>0?String(m%60).padStart(2,"0"):""}` };
const simpleHash = s => { let h=0; for(let i=0;i<s.length;i++){h=((h<<5)-h)+s.charCodeAt(i);h|=0;} return h.toString(36); };
const calcDuree = p => { if(!p?.arrivee||!p?.depart) return null; const d=timeToMins(p.depart)-timeToMins(p.arrivee); return d>0?d:null; };
const joursOuvres = (y,mo) => { let c=0,d=new Date(y,mo,1); while(d.getMonth()===mo){if(d.getDay()!==0)c++;d.setDate(d.getDate()+1);} return c; };
const moisLabel = (y,mo) => new Date(y,mo,1).toLocaleString("fr-FR",{month:"long",year:"numeric"});

const DEFAULT_USERS = [
  { id:"admin",  prenom:"Admin",  nom:"",       role:"admin",  passwordHash:simpleHash("admin123"),  salaire:0 },
  { id:"agent1", prenom:"Marie",  nom:"Dupont", role:"agent",  passwordHash:simpleHash("marie123"),  salaire:400 },
  { id:"agent2", prenom:"Karim",  nom:"Benali", role:"agent",  passwordHash:simpleHash("karim123"),  salaire:200 },
  { id:"agent3", prenom:"Sophie", nom:"Leroy",  role:"agent",  passwordHash:simpleHash("sophie123"), salaire:200 },
];

// ═══════════════════════════════════════════════════════════════
// ATOMS UI
// ═══════════════════════════════════════════════════════════════
const Badge = ({ statut, small }) => {
  const c=STATUT_META[statut]||STATUT_META["RDV planifié"];
  return <span style={{background:c.bg,color:c.text,border:`1px solid ${c.dot}50`,borderRadius:20,
    padding:small?"2px 8px":"3px 10px",fontSize:small?11:12,fontWeight:600,
    display:"inline-flex",alignItems:"center",gap:4,whiteSpace:"nowrap"}}>
    <span style={{width:6,height:6,borderRadius:"50%",background:c.dot,flexShrink:0}}/>{statut}
  </span>;
};

function Inp({ label, required, full, ...p }) {
  const [f,setF]=useState(false);
  return <div style={{display:"flex",flexDirection:"column",gap:4,gridColumn:full?"1/-1":undefined}}>
    {label&&<label style={{fontSize:11,fontWeight:700,color:"#4A5568",textTransform:"uppercase",letterSpacing:"0.05em"}}>
      {label}{required&&<span style={{color:"#E8A020",marginLeft:2}}>*</span>}
    </label>}
    <input {...p} style={{border:`1.5px solid ${f?"#2E7D52":"#DDE3DD"}`,borderRadius:8,padding:"9px 12px",
      fontSize:14,color:"#1C1C1E",background:p.disabled?"#F8FAF8":"#fff",outline:"none",
      width:"100%",boxSizing:"border-box",...p.style}}
      onFocus={()=>setF(true)} onBlur={()=>setF(false)}/>
  </div>;
}

function Sel({ label, required, options, full, ...p }) {
  const [f,setF]=useState(false);
  return <div style={{display:"flex",flexDirection:"column",gap:4,gridColumn:full?"1/-1":undefined}}>
    {label&&<label style={{fontSize:11,fontWeight:700,color:"#4A5568",textTransform:"uppercase",letterSpacing:"0.05em"}}>
      {label}{required&&<span style={{color:"#E8A020",marginLeft:2}}>*</span>}
    </label>}
    <select {...p} style={{border:`1.5px solid ${f?"#2E7D52":"#DDE3DD"}`,borderRadius:8,padding:"9px 12px",
      fontSize:14,color:p.value?"#1C1C1E":"#999",background:"#fff",outline:"none",cursor:"pointer",
      width:"100%",boxSizing:"border-box"}} onFocus={()=>setF(true)} onBlur={()=>setF(false)}>
      <option value="">— Sélectionner —</option>
      {options.map(o=>typeof o==="object"?<option key={o.v} value={o.v}>{o.l}</option>:<option key={o} value={o}>{o}</option>)}
    </select>
  </div>;
}

function Card({ children, style, accent }) {
  return <div style={{background:"#fff",borderRadius:14,border:`1px solid ${accent?"#2E7D52":"#E4EAE4"}`,padding:20,...style}}>{children}</div>;
}

function SHead({ icon, title, sub }) {
  return <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16,paddingBottom:8,borderBottom:"1px solid #EDF2ED"}}>
    <span style={{fontSize:15}}>{icon}</span>
    <div>
      <div style={{fontSize:11,fontWeight:700,color:"#1A4D2E",textTransform:"uppercase",letterSpacing:"0.07em"}}>{title}</div>
      {sub&&<div style={{fontSize:11,color:"#999",marginTop:1}}>{sub}</div>}
    </div>
  </div>;
}

function DRow({ label, val, mono, chip }) {
  if(val===null||val===undefined||val==="") return null;
  return <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:8}}>
    <span style={{fontSize:12,color:"#888",fontWeight:500,flexShrink:0,minWidth:110}}>{label}</span>
    {chip?<span style={{background:"#E8F5EE",color:"#1A4D2E",borderRadius:20,padding:"2px 10px",fontSize:12,fontWeight:600}}>{val}</span>
    :<span style={{fontSize:13,color:"#1C1C1E",fontWeight:600,textAlign:"right",fontFamily:mono?"monospace":"inherit"}}>{val}</span>}
  </div>;
}

function Toast({ t }) {
  if(!t) return null;
  const bg=t.type==="error"?"#B71C1C":t.type==="warn"?"#E65100":"#1A4D2E";
  return <div style={{position:"fixed",bottom:28,right:28,zIndex:9999,background:bg,color:"#fff",
    borderRadius:10,padding:"12px 20px",fontSize:14,fontWeight:600,
    boxShadow:"0 4px 24px rgba(0,0,0,0.25)",animation:"su 0.2s ease"}}>
    {t.msg}<style>{`@keyframes su{from{transform:translateY(10px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
  </div>;
}

function Modal({ title, onClose, children }) {
  return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:1000,
    display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div style={{background:"#fff",borderRadius:16,padding:28,maxWidth:480,width:"100%",
      maxHeight:"80vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <h3 style={{margin:0,fontSize:16,fontWeight:700,color:"#1C1C1E"}}>{title}</h3>
        <button onClick={onClose} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"#aaa",lineHeight:1}}>×</button>
      </div>
      {children}
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════
// RELANCES
// ═══════════════════════════════════════════════════════════════
function RelancesPanel({ relances, onChange, readOnly }) {
  const [date,setDate]=useState(""); const [note,setNote]=useState("");
  const add=()=>{ if(!date) return; onChange([...relances,{id:uid(),date,note,done:false}]); setDate(""); setNote(""); };
  const toggle=id=>onChange(relances.map(r=>r.id===id?{...r,done:!r.done}:r));
  const remove=id=>onChange(relances.filter(r=>r.id!==id));
  const sorted=[...relances].sort((a,b)=>a.date.localeCompare(b.date));
  const overdue=sorted.filter(r=>!r.done&&daysUntil(r.date)<0);
  const upcoming=sorted.filter(r=>!r.done&&daysUntil(r.date)>=0&&daysUntil(r.date)<=3);
  return <div>
    {overdue.length>0&&<div style={{background:"#FFF3F3",border:"1px solid #FFCDD2",borderRadius:8,padding:"10px 14px",marginBottom:10,fontSize:13,color:"#C62828",fontWeight:600}}>⚠️ {overdue.length} relance{overdue.length>1?"s":""} en retard</div>}
    {upcoming.length>0&&<div style={{background:"#FFF8E1",border:"1px solid #FFE082",borderRadius:8,padding:"10px 14px",marginBottom:10,fontSize:13,color:"#E65100",fontWeight:600}}>🔔 {upcoming.length} relance{upcoming.length>1?"s":""} dans les 3 prochains jours</div>}
    {!readOnly&&<div style={{background:"#F5FBF7",border:"1px solid #C8E6C9",borderRadius:10,padding:"14px 16px",marginBottom:14}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <Inp label="Date" type="date" value={date} onChange={e=>setDate(e.target.value)}/>
        <Inp label="Note" value={note} onChange={e=>setNote(e.target.value)} placeholder="Ex: Rappeler pour devis"/>
      </div>
      <button onClick={add} disabled={!date} style={{background:date?"#2E7D52":"#ccc",color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",fontSize:13,fontWeight:700,cursor:date?"pointer":"default"}}>+ Ajouter</button>
    </div>}
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {sorted.length===0&&<div style={{color:"#aaa",fontSize:13,textAlign:"center",padding:"16px 0"}}>Aucune relance planifiée.</div>}
      {sorted.map(r=>{ const d=daysUntil(r.date); let uc="#888"; if(!r.done){if(d<0)uc="#C62828";else if(d<=3)uc="#E65100";else if(d<=7)uc="#F57F17";}
        return <div key={r.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:8,background:r.done?"#FAFAFA":"#fff",border:`1px solid ${r.done?"#eee":"#E4EAE4"}`,opacity:r.done?0.65:1}}>
          {!readOnly&&<input type="checkbox" checked={r.done} onChange={()=>toggle(r.id)} style={{width:16,height:16,cursor:"pointer",accentColor:"#2E7D52",flexShrink:0}}/>}
          {readOnly&&<span>{r.done?"✅":"🔔"}</span>}
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:600,color:r.done?"#999":uc}}>{fmtDate(r.date)}
              {!r.done&&d!==null&&<span style={{fontSize:11,marginLeft:8,color:uc}}>{d<0?`${Math.abs(d)}j de retard`:d===0?"Aujourd'hui":`Dans ${d}j`}</span>}
            </div>
            {r.note&&<div style={{fontSize:12,color:"#777",marginTop:2}}>{r.note}</div>}
          </div>
          {!readOnly&&<button onClick={()=>remove(r.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#ccc",fontSize:18,padding:"0 4px",lineHeight:1}}>×</button>}
        </div>;
      })}
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════
// POINTAGE — VUE AGENT (lecture seule + boutons étapes)
// La connexion pointe l'arrivée automatiquement.
// L'agent ne peut pas modifier ses horaires.
// ═══════════════════════════════════════════════════════════════
function PointageAgent({ me, pointages, onPointer }) {
  const today=todayStr();
  const p=pointages.find(x=>x.agentId===me.id&&x.date===today);
  const getEtape=()=>{ if(!p) return "pauseDebut"; if(!p.pauseDebut) return "pauseDebut"; if(!p.pauseFin) return "pauseFin"; if(!p.depart) return "depart"; return "done"; };
  const etape=getEtape();
  const duree=p?calcDuree(p):null;
  const heuresRef=16*60;
  const pct=duree?Math.min(100,Math.round(duree/heuresRef*100)):0;
  const ETAPES=[
    {id:"arrivee",   label:"Arrivée",     icon:"🟢", color:"#2E7D52", info:"Enregistrée à la connexion"},
    {id:"pauseDebut",label:"Début pause", icon:"🟡", color:"#F57F17"},
    {id:"pauseFin",  label:"Fin pause",   icon:"🔵", color:"#1565C0"},
    {id:"depart",    label:"Départ",      icon:"🔴", color:"#C62828"},
  ];

  return <div style={{maxWidth:500,margin:"0 auto"}}>
    <Card style={{marginBottom:14,background:"linear-gradient(135deg,#1A4D2E,#2E7D52)",border:"none"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:13,color:"#A8D4B8",fontWeight:600}}>Bonjour,</div>
          <div style={{fontSize:20,fontWeight:800,color:"#fff"}}>{uname(me)}</div>
          <div style={{fontSize:12,color:"#A8D4B8",marginTop:4}}>{fmtDate(today)}</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:11,color:"#A8D4B8",marginBottom:2}}>Objectif journée</div>
          <div style={{fontSize:26,fontWeight:800,color:"#E8A020"}}>16h</div>
        </div>
      </div>
    </Card>

    {/* Arrivée auto — info */}
    {p?.arrivee&&<div style={{background:"#E8F5EE",border:"1px solid #A5D6A7",borderRadius:10,
      padding:"10px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
      <span style={{fontSize:18}}>🟢</span>
      <div>
        <div style={{fontSize:13,fontWeight:700,color:"#1A4D2E"}}>Arrivée enregistrée automatiquement</div>
        <div style={{fontSize:12,color:"#555"}}>Connexion à <strong>{p.arrivee}</strong></div>
      </div>
    </div>}

    {p&&<Card style={{marginBottom:14}}>
      <div style={{fontSize:12,fontWeight:700,color:"#1A4D2E",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>Progression</div>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
        <span style={{fontSize:13,color:"#555"}}>Temps travaillé</span>
        <span style={{fontSize:15,fontWeight:800,color:duree&&duree>=heuresRef?"#2E7D52":"#1C1C1E"}}>{duree?fmtDur(duree):"En cours…"}</span>
      </div>
      <div style={{height:10,background:"#EEE",borderRadius:6,overflow:"hidden",marginBottom:8}}>
        <div style={{height:"100%",width:`${pct}%`,background:pct>=100?"#2E7D52":pct>=75?"#E8A020":"#1976D2",borderRadius:6,transition:"width 0.5s"}}/>
      </div>
      {etape==="done"&&duree&&<div style={{fontSize:13,color:duree>=heuresRef?"#2E7D52":"#C62828",fontWeight:600,textAlign:"center"}}>
        {duree>=heuresRef?"✅ Journée complète !":"⚠️ "+fmtDur(heuresRef-duree)+" manquantes"}
      </div>}
    </Card>}

    <Card style={{marginBottom:14}}>
      <div style={{fontSize:12,fontWeight:700,color:"#1A4D2E",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:14}}>Pointage du jour</div>
      <div style={{display:"flex",flexDirection:"column",gap:0}}>
        {ETAPES.map((e,i)=>{ const val=p?.[e.id]; const isDone=!!val; const isNext=etape===e.id&&e.id!=="arrivee"; const isFuture=!isDone&&!isNext;
          return <div key={e.id} style={{display:"flex",gap:14,alignItems:"flex-start"}}>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",flexShrink:0}}>
              <div style={{width:34,height:34,borderRadius:"50%",background:isDone?e.color:isNext?"#fff":"#F5F5F5",border:`2px solid ${isDone||isNext?e.color:"#DDD"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:isDone?13:15}}>
                {isDone?"✓":e.icon}
              </div>
              {i<ETAPES.length-1&&<div style={{width:2,height:22,background:isDone?e.color:"#EEE",margin:"2px 0"}}/>}
            </div>
            <div style={{flex:1,paddingBottom:i<ETAPES.length-1?6:0,paddingTop:4}}>
              <div style={{fontSize:14,fontWeight:700,color:isFuture?"#CCC":isDone?e.color:"#1C1C1E"}}>{e.label}</div>
              {val&&<div style={{fontSize:12,color:"#888",marginTop:1}}>{e.id==="arrivee"?"Connexion à":"Pointé à"} <strong style={{color:"#1C1C1E"}}>{val}</strong></div>}
              {e.id==="arrivee"&&!val&&<div style={{fontSize:12,color:"#aaa",marginTop:1,fontStyle:"italic"}}>Enregistrée à la connexion</div>}
              {isNext&&<div style={{fontSize:12,color:"#888",marginTop:1}}>En attente…</div>}
            </div>
          </div>;
        })}
      </div>
    </Card>

    {/* Bouton unique — pause, reprise, départ uniquement */}
    {etape!=="done"&&etape!=="arrivee"&&<button onClick={()=>onPointer(today,me.id,etape,nowStr())}
      style={{width:"100%",background:ETAPES.find(e=>e.id===etape)?.color||"#2E7D52",color:"#fff",border:"none",
        borderRadius:10,padding:"16px",fontSize:16,fontWeight:700,cursor:"pointer"}}>
      {ETAPES.find(e=>e.id===etape)?.icon} Pointer — {ETAPES.find(e=>e.id===etape)?.label} ({nowStr()})
    </button>}

    {etape==="done"&&<div style={{textAlign:"center",padding:"12px 0"}}>
      <div style={{fontSize:15,fontWeight:700,color:"#2E7D52"}}>✅ Journée terminée</div>
      <div style={{fontSize:12,color:"#aaa",marginTop:6}}>Pour toute correction, contactez votre responsable.</div>
    </div>}

    <div style={{marginTop:14,padding:"10px 14px",background:"#F5F8F5",borderRadius:8,
      display:"flex",alignItems:"center",gap:8}}>
      <span style={{fontSize:16}}>🔒</span>
      <span style={{fontSize:12,color:"#888"}}>Les horaires sont verrouillés. Seul l'admin peut les modifier.</span>
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════
// POINTAGE — VUE ADMIN
// ═══════════════════════════════════════════════════════════════
function AdminPointage({ users, pointages, onSetSalaire, onSupprimerPointage, onModifierPointage }) {
  const [moisIdx,setMoisIdx]=useState(0);
  const [agentSel,setAgentSel]=useState(null);
  const [showSalaires,setShowSalaires]=useState(false);
  const [editSalaires,setEditSalaires]=useState({});
  const now=new Date();
  const moisList=Array.from({length:6},(_,i)=>{ const d=new Date(now.getFullYear(),now.getMonth()-i,1); return {y:d.getFullYear(),mo:d.getMonth()}; });
  const {y,mo}=moisList[moisIdx];
  const jours=joursOuvres(y,mo);
  const agents=users.filter(u=>u.role==="agent");
  const moisStr=`${y}-${String(mo+1).padStart(2,"0")}`;

  const getStats=a=>{
    const mp=pointages.filter(p=>p.agentId===a.id&&p.date.startsWith(moisStr));
    const complets=mp.filter(p=>p.arrivee&&p.depart).length;
    const totalMins=mp.reduce((acc,p)=>acc+(calcDuree(p)||0),0);
    const paie=jours>0?Math.round((a.salaire||0)*complets/jours):0;
    return {mp,complets,totalMins,paie};
  };

  const totalPaie=agents.reduce((acc,a)=>acc+getStats(a).paie,0);

  const exportCSV=()=>{
    const rows=agents.map(a=>{ const s=getStats(a); return [uname(a),s.complets,jours,fmtDur(s.totalMins),a.salaire||0,s.paie].join(";"); });
    const csv="\uFEFF"+"Agent;Jours pointés;Jours ouvrés;Heures totales;Salaire base;Salaire dû\n"+rows.join("\n");
    const el=document.createElement("a"); el.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})); el.download=`Paie_${moisLabel(y,mo).replace(" ","_")}.csv`; el.click();
  };

  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
      <h2 style={{fontSize:22,fontWeight:800,color:"#1C1C1E",margin:0}}>Pointages & Paie</h2>
      <div style={{display:"flex",gap:8}}>
        <button onClick={()=>setShowSalaires(s=>!s)} style={{background:"#fff",color:"#1A4D2E",border:"1px solid #2E7D52",borderRadius:8,padding:"8px 14px",fontSize:13,fontWeight:600,cursor:"pointer"}}>⚙️ Salaires</button>
        <button onClick={exportCSV} style={{background:"#fff",color:"#1A4D2E",border:"1px solid #2E7D52",borderRadius:8,padding:"8px 14px",fontSize:13,fontWeight:600,cursor:"pointer"}}>⬇ Export CSV</button>
      </div>
    </div>

    <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
      {moisList.map((m,i)=><button key={i} onClick={()=>setMoisIdx(i)}
        style={{padding:"7px 14px",borderRadius:20,border:"none",cursor:"pointer",fontSize:13,fontWeight:600,
          background:moisIdx===i?"#1A4D2E":"#fff",color:moisIdx===i?"#fff":"#555"}}>
        {moisLabel(m.y,m.mo)}
      </button>)}
    </div>

    {showSalaires&&<Card style={{marginBottom:20,border:"1.5px solid #2E7D52",background:"#F5FBF7"}}>
      <div style={{fontSize:13,fontWeight:700,color:"#1A4D2E",marginBottom:14}}>⚙️ Salaires mensuels</div>
      {agents.map(a=><div key={a.id} style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
        <div style={{width:32,height:32,borderRadius:"50%",background:"#E8F5EE",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#2E7D52",flexShrink:0}}>{a.prenom[0]}{a.nom?a.nom[0]:""}</div>
        <span style={{fontSize:14,fontWeight:600,color:"#1C1C1E",flex:1}}>{uname(a)}</span>
        <input type="number" defaultValue={a.salaire||0} onChange={e=>setEditSalaires(s=>({...s,[a.id]:parseInt(e.target.value)||0}))}
          style={{border:"1.5px solid #DDE3DD",borderRadius:8,padding:"7px 12px",fontSize:14,width:90,outline:"none",textAlign:"right"}}/>
        <span style={{fontSize:13,color:"#888"}}>€</span>
        <button onClick={()=>onSetSalaire(a.id,editSalaires[a.id]??a.salaire)}
          style={{background:"#2E7D52",color:"#fff",border:"none",borderRadius:7,padding:"7px 14px",fontSize:13,fontWeight:700,cursor:"pointer"}}>OK</button>
      </div>)}
    </Card>}

    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:12,marginBottom:20}}>
      <Card style={{textAlign:"center"}}><div style={{fontSize:22,marginBottom:4}}>📅</div><div style={{fontSize:22,fontWeight:800,color:"#1A4D2E"}}>{jours}</div><div style={{fontSize:11,color:"#888"}}>Jours ouvrés</div></Card>
      <Card style={{textAlign:"center"}}><div style={{fontSize:22,marginBottom:4}}>👥</div><div style={{fontSize:22,fontWeight:800,color:"#1565C0"}}>{agents.length}</div><div style={{fontSize:11,color:"#888"}}>Agents</div></Card>
      <Card style={{textAlign:"center",background:"linear-gradient(135deg,#1A4D2E,#2E7D52)",border:"none"}}><div style={{fontSize:22,marginBottom:4}}>💶</div><div style={{fontSize:22,fontWeight:800,color:"#fff"}}>{totalPaie} €</div><div style={{fontSize:11,color:"#A8D4B8"}}>Total à payer</div></Card>
    </div>

    <Card style={{marginBottom:16}}>
      <table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead><tr style={{background:"#F5F8F5",borderBottom:"1px solid #E4EAE4"}}>
          {["Agent","Jours pointés","Jours ouvrés","Heures","Salaire base","💶 À payer",""].map(h=><th key={h} style={{padding:"9px 12px",fontSize:11,fontWeight:700,color:"#1A4D2E",textTransform:"uppercase",textAlign:"left"}}>{h}</th>)}
        </tr></thead>
        <tbody>
          {agents.map((a,i)=>{ const s=getStats(a); const pct=jours>0?Math.round(s.complets/jours*100):0;
            return <tr key={a.id} style={{borderBottom:i<agents.length-1?"1px solid #F0F2F0":"none",cursor:"pointer"}}
              onMouseEnter={e=>e.currentTarget.style.background="#F9FBF9"}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}
              onClick={()=>setAgentSel(agentSel===a.id?null:a.id)}>
              <td style={{padding:"11px 12px"}}><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:30,height:30,borderRadius:"50%",background:"#E8F5EE",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#2E7D52",flexShrink:0}}>{a.prenom[0]}{a.nom?a.nom[0]:""}</div><span style={{fontSize:14,fontWeight:700,color:"#1C1C1E"}}>{uname(a)}</span></div></td>
              <td style={{padding:"11px 12px"}}><div style={{fontSize:14,fontWeight:700,color:"#1C1C1E"}}>{s.complets}</div><div style={{height:4,background:"#EEE",borderRadius:3,marginTop:4,width:50,overflow:"hidden"}}><div style={{height:"100%",width:`${pct}%`,background:pct>=90?"#2E7D52":pct>=70?"#E8A020":"#C62828",borderRadius:3}}/></div></td>
              <td style={{padding:"11px 12px",fontSize:14,color:"#555"}}>{jours}</td>
              <td style={{padding:"11px 12px",fontSize:14,fontWeight:600,color:"#1565C0"}}>{fmtDur(s.totalMins)}</td>
              <td style={{padding:"11px 12px",fontSize:14,color:"#888"}}>{a.salaire||0} €</td>
              <td style={{padding:"11px 12px"}}><span style={{fontSize:15,fontWeight:800,color:s.paie>=(a.salaire||0)?"#2E7D52":"#E65100"}}>{s.paie} €</span>{s.paie<(a.salaire||0)&&<span style={{fontSize:11,color:"#E65100",marginLeft:6}}>(-{(a.salaire||0)-s.paie}€)</span>}</td>
              <td style={{padding:"11px 12px"}}><button style={{background:"none",border:"1px solid #DDE3DD",borderRadius:6,padding:"4px 10px",fontSize:12,cursor:"pointer",color:"#555"}}>{agentSel===a.id?"▲":"▼"}</button></td>
            </tr>;
          })}
        </tbody>
      </table>
    </Card>

    {agentSel&&<AgentDetailAdmin agent={users.find(u=>u.id===agentSel)}
      pointages={pointages.filter(p=>p.agentId===agentSel&&p.date.startsWith(moisStr))}
      onSupprimer={onSupprimerPointage} onModifier={onModifierPointage}/>}
  </div>;
}

function AgentDetailAdmin({ agent, pointages, onSupprimer, onModifier }) {
  const [editId,setEditId]=useState(null); const [ef,setEf]=useState({});
  const [showAdd,setShowAdd]=useState(false); const [addF,setAddF]=useState({date:"",arrivee:"",pauseDebut:"",pauseFin:"",depart:""});
  const sorted=[...pointages].sort((a,b)=>b.date.localeCompare(a.date));
  return <Card style={{marginBottom:16,border:"1.5px solid #2E7D52"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <div style={{fontSize:13,fontWeight:700,color:"#1A4D2E"}}>📋 {uname(agent)}</div>
      <button onClick={()=>setShowAdd(s=>!s)} style={{background:"#fff",color:"#1A4D2E",border:"1px solid #2E7D52",borderRadius:7,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer"}}>{showAdd?"Annuler":"+ Ajouter"}</button>
    </div>
    {showAdd&&<div style={{background:"#F5FBF7",borderRadius:10,padding:14,marginBottom:14,border:"1px solid #C8E6C9"}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:10}}>
        {[{k:"date",l:"Date",t:"date"},{k:"arrivee",l:"🟢 Arrivée",t:"time"},{k:"pauseDebut",l:"🟡 Pause",t:"time"},{k:"pauseFin",l:"🔵 Reprise",t:"time"},{k:"depart",l:"🔴 Départ",t:"time"}].map(f=><div key={f.k}>
          <label style={{fontSize:11,fontWeight:600,color:"#4A5568",display:"block",marginBottom:4}}>{f.l}</label>
          <input type={f.t} value={addF[f.k]} onChange={e=>setAddF(x=>({...x,[f.k]:e.target.value}))}
            style={{border:"1.5px solid #DDE3DD",borderRadius:7,padding:"7px 9px",fontSize:13,outline:"none",width:"100%",boxSizing:"border-box"}}/>
        </div>)}
      </div>
      <button onClick={()=>{ if(!addF.date||!addF.arrivee) return; onModifier(addF.date,agent.id,addF,null); setShowAdd(false); setAddF({date:"",arrivee:"",pauseDebut:"",pauseFin:"",depart:""}); }}
        style={{background:"#2E7D52",color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",fontSize:13,fontWeight:700,cursor:"pointer"}}>Enregistrer</button>
    </div>}
    {sorted.length===0&&<div style={{color:"#aaa",fontSize:13,textAlign:"center",padding:"12px 0"}}>Aucun pointage ce mois.</div>}
    <table style={{width:"100%",borderCollapse:"collapse"}}>
      <thead><tr style={{borderBottom:"1px solid #E4EAE4"}}>{["Date","🟢 Arrivée","🟡 Pause","🔵 Reprise","🔴 Départ","Durée",""].map(h=><th key={h} style={{padding:"7px 10px",fontSize:11,fontWeight:700,color:"#888",textAlign:"left"}}>{h}</th>)}</tr></thead>
      <tbody>{sorted.map((p,i)=>{ const dur=calcDuree(p); const isE=editId===p.id;
        return <tr key={p.id||p.date} style={{borderBottom:i<sorted.length-1?"1px solid #F5F5F5":"none"}}>
          {isE?<>
            <td style={{padding:"8px 10px",fontSize:13,fontWeight:600}}>{fmtDate(p.date)}</td>
            {["arrivee","pauseDebut","pauseFin","depart"].map(k=><td key={k} style={{padding:"5px 8px"}}>
              <input type="time" value={ef[k]} onChange={e=>setEf(f=>({...f,[k]:e.target.value}))}
                style={{border:"1.5px solid #2E7D52",borderRadius:6,padding:"5px 8px",fontSize:13,outline:"none",width:88}}/>
            </td>)}
            <td style={{padding:"5px 8px",fontSize:13,color:"#888"}}>{dur?fmtDur(dur):"—"}</td>
            <td style={{padding:"5px 8px"}}><div style={{display:"flex",gap:5}}>
              <button onClick={()=>{onModifier(p.date,p.agentId,ef,p.id);setEditId(null);}} style={{background:"#2E7D52",color:"#fff",border:"none",borderRadius:6,padding:"4px 10px",fontSize:12,fontWeight:700,cursor:"pointer"}}>✓</button>
              <button onClick={()=>setEditId(null)} style={{background:"#fff",color:"#555",border:"1px solid #DDE3DD",borderRadius:6,padding:"4px 8px",fontSize:12,cursor:"pointer"}}>✗</button>
            </div></td>
          </>:<>
            <td style={{padding:"9px 10px",fontSize:13,fontWeight:600,color:"#1C1C1E"}}>{fmtDate(p.date)}</td>
            <td style={{padding:"9px 10px",fontSize:13,color:"#2E7D52",fontWeight:600}}>{p.arrivee||"—"}</td>
            <td style={{padding:"9px 10px",fontSize:13,color:"#F57F17"}}>{p.pauseDebut||"—"}</td>
            <td style={{padding:"9px 10px",fontSize:13,color:"#1565C0"}}>{p.pauseFin||"—"}</td>
            <td style={{padding:"9px 10px",fontSize:13,color:"#C62828",fontWeight:600}}>{p.depart||"—"}</td>
            <td style={{padding:"9px 10px",fontSize:13,fontWeight:700,color:dur&&dur>=16*60?"#2E7D52":dur?"#E65100":"#888"}}>{dur?fmtDur(dur):"En cours"}</td>
            <td style={{padding:"9px 10px"}}><div style={{display:"flex",gap:5}}>
              <button onClick={()=>{setEditId(p.id);setEf({arrivee:p.arrivee||"",pauseDebut:p.pauseDebut||"",pauseFin:p.pauseFin||"",depart:p.depart||""});}} style={{background:"none",border:"1px solid #DDE3DD",borderRadius:6,padding:"4px 9px",fontSize:11,cursor:"pointer",color:"#555"}}>✏️</button>
              <button onClick={()=>onSupprimer(p.id)} style={{background:"none",border:"1px solid #FFCDD2",borderRadius:6,padding:"4px 9px",fontSize:11,cursor:"pointer",color:"#C62828"}}>🗑</button>
            </div></td>
          </>}
        </tr>;
      })}</tbody>
    </table>
  </Card>;
}

// ═══════════════════════════════════════════════════════════════
// RDV FORM
// ═══════════════════════════════════════════════════════════════
function RdvForm({ form, setForm, agents, currentUser, onSave, onCancel, isEdit, allRdvs }) {
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const toggle=p=>setForm(f=>({...f,produits:f.produits.includes(p)?f.produits.filter(x=>x!==p):[...f.produits,p]}));
  const isAdmin=currentUser.role==="admin";
  const agentOpts=agents.filter(u=>u.role==="agent").map(u=>({v:u.id,l:uname(u)}));
  const dupSiret=form.siret&&form.siret.replace(/\s/g,"").length===14?allRdvs.find(r=>r.id!==form.id&&r.siret.replace(/\s/g,"")=== form.siret.replace(/\s/g,"")):null;

  useEffect(()=>{ if(isEdit) return; const t=setInterval(()=>lss(DRAFT_KEY,form),15000); return ()=>clearInterval(t); },[form,isEdit]);

  return <div style={{maxWidth:800,background:"#fff",borderRadius:16,border:"1px solid #E4EAE4",padding:"28px 32px",margin:"0 auto"}}>
    <SHead icon="📅" title="Informations RDV"/>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:"12px 16px",marginBottom:28}}>
      {isAdmin?<Sel label="Agent" required options={agentOpts} value={form.agentId} onChange={e=>set("agentId",e.target.value)}/>
        :<Inp label="Agent" value={uname(currentUser)} disabled/>}
      {isAdmin?<Sel label="Statut" options={STATUTS} value={form.statut} onChange={e=>set("statut",e.target.value)}/>
        :<div><label style={{fontSize:11,fontWeight:700,color:"#4A5568",textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:6}}>Statut actuel</label><div style={{display:"flex",alignItems:"center",gap:10}}><Badge statut={form.statut}/>{isEdit&&<span style={{fontSize:12,color:"#888"}}>(demandez à l'admin)</span>}</div></div>}
      <Inp label="Date du RDV" required type="date" value={form.dateRdv} onChange={e=>set("dateRdv",e.target.value)}/>
      <Inp label="Heure" type="time" value={form.heureRdv} onChange={e=>set("heureRdv",e.target.value)}/>
    </div>

    <SHead icon="🏢" title="Entreprise"/>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:"12px 16px",marginBottom:28}}>
      <Inp full label="Raison sociale" required value={form.raisonSociale} onChange={e=>set("raisonSociale",e.target.value)}/>
      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        <Inp label="SIRET" required value={form.siret} onChange={e=>set("siret",fmtSiret(e.target.value))} placeholder="XXX XXX XXX XXXXX"/>
        {dupSiret&&<div style={{background:"#FFF8E1",border:"1px solid #FFE082",borderRadius:7,padding:"7px 12px",fontSize:12,color:"#E65100",fontWeight:500}}>⚠️ SIRET déjà utilisé : <strong>{dupSiret.raisonSociale}</strong></div>}
      </div>
      <Inp label="Code NAF / APE" value={form.naf} onChange={e=>set("naf",e.target.value)} placeholder="4321A"/>
      <Sel label="Propriétaire ou locataire" options={["Propriétaire","Locataire","Mixte","Inconnu"]} value={form.proprietaire} onChange={e=>set("proprietaire",e.target.value)}/>
      <Inp full label="Adresse" value={form.adresse} onChange={e=>set("adresse",e.target.value)}/>
      <Inp label="Code postal" value={form.codePostal} onChange={e=>set("codePostal",e.target.value)}/>
      <Inp label="Ville" value={form.ville} onChange={e=>set("ville",e.target.value)}/>
    </div>

    <SHead icon="👤" title="Contact sur place"/>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:"12px 16px",marginBottom:28}}>
      <Inp label="Nom" value={form.nomContact} onChange={e=>set("nomContact",e.target.value)}/>
      <Inp label="Prénom" value={form.prenomContact} onChange={e=>set("prenomContact",e.target.value)}/>
      <Inp label="Poste / Fonction" value={form.poste} onChange={e=>set("poste",e.target.value)} placeholder="Resp. technique"/>
      <Inp label="Téléphone" type="tel" value={form.telephone} onChange={e=>set("telephone",e.target.value)}/>
      <Inp full label="Email" type="email" value={form.email} onChange={e=>set("email",e.target.value)}/>
    </div>

    <SHead icon="📐" title="Données techniques"/>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:"12px 16px",marginBottom:28}}>
      <Sel label="Type de bâtiment" options={TYPES_BATIMENT} value={form.typeBatiment} onChange={e=>set("typeBatiment",e.target.value)}/>
      <Sel label="Chauffage actuel" options={CHAUFFAGES} value={form.chauffageActuel} onChange={e=>set("chauffageActuel",e.target.value)}/>
      <Inp label="Surface (m²)" type="number" value={form.surface} onChange={e=>set("surface",e.target.value)} placeholder="1500"/>
      <Inp label="Hauteur sous plafond (m)" type="number" value={form.hauteurSous} onChange={e=>set("hauteurSous",e.target.value)} placeholder="6"/>
      <Inp label="Année de construction" type="number" value={form.anneeConstruction} onChange={e=>set("anneeConstruction",e.target.value)} placeholder="1985"/>
      <Inp label="Facture énergétique / an (€)" type="number" value={form.facture} onChange={e=>set("facture",e.target.value)} placeholder="24000"/>
    </div>

    <SHead icon="📡" title="Lead"/>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:"12px 16px",marginBottom:28}}>
      <Sel label="Source du lead" options={SOURCES} value={form.source} onChange={e=>set("source",e.target.value)}/>
    </div>

    <SHead icon="⚡" title="Produits CEE concernés"/>
    <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:28}}>
      {PRODUITS_CEE.map(p=><button key={p} onClick={()=>toggle(p)}
        style={{padding:"6px 14px",borderRadius:20,fontSize:13,cursor:"pointer",
          border:form.produits.includes(p)?"2px solid #2E7D52":"1px solid #DDE3DD",
          background:form.produits.includes(p)?"#E8F5EE":"#fff",
          color:form.produits.includes(p)?"#1A4D2E":"#555",fontWeight:form.produits.includes(p)?700:400}}>
        {form.produits.includes(p)?"✓ ":""}{p}
      </button>)}
    </div>

    <SHead icon="📝" title="Observations"/>
    <textarea value={form.observations} onChange={e=>set("observations",e.target.value)} rows={3}
      placeholder="Contexte, besoins, points de vigilance…"
      style={{width:"100%",boxSizing:"border-box",border:"1.5px solid #DDE3DD",borderRadius:8,padding:"10px 12px",fontSize:14,resize:"vertical",outline:"none",fontFamily:"inherit",marginBottom:28}}/>

    {isEdit&&<><SHead icon="📋" title="Compte-rendu post-RDV"/>
    <textarea value={form.compteRendu} onChange={e=>set("compteRendu",e.target.value)} rows={4}
      placeholder="Résumé du RDV, décisions, prochaines étapes…"
      style={{width:"100%",boxSizing:"border-box",border:"1.5px solid #DDE3DD",borderRadius:8,padding:"10px 12px",fontSize:14,resize:"vertical",outline:"none",fontFamily:"inherit",marginBottom:28}}/>
    <SHead icon="🔔" title="Relances"/>
    <div style={{marginBottom:28}}><RelancesPanel relances={form.relances||[]} onChange={v=>set("relances",v)}/></div></>}

    {!isEdit&&<div style={{fontSize:12,color:"#999",marginBottom:16,textAlign:"center"}}>💾 Brouillon sauvegardé automatiquement</div>}

    <div style={{display:"flex",gap:12}}>
      <button onClick={onSave} style={{background:"#2E7D52",color:"#fff",border:"none",borderRadius:10,padding:"12px 28px",fontSize:15,fontWeight:700,cursor:"pointer",flex:1}}>
        {isEdit?"Enregistrer les modifications":"Créer le RDV"}
      </button>
      <button onClick={onCancel} style={{background:"#fff",color:"#555",border:"1px solid #DDE3DD",borderRadius:10,padding:"12px 20px",fontSize:14,fontWeight:600,cursor:"pointer"}}>Annuler</button>
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════
// RDV TABLE
// ═══════════════════════════════════════════════════════════════
function RdvTable({ rdvs, users, onSelect, onEdit, showAgent }) {
  const [sk,setSk]=useState("dateRdv"); const [asc,setAsc]=useState(false); const [page,setPage]=useState(0);
  const gn=id=>uname(users.find(u=>u.id===id)||{prenom:id});
  const sorted=useMemo(()=>[...rdvs].sort((a,b)=>{ const va=a[sk]||"",vb=b[sk]||""; return asc?va.localeCompare(vb):vb.localeCompare(va); }),[rdvs,sk,asc]);
  const pages=Math.ceil(sorted.length/PAGE_SIZE);
  const slice=sorted.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
  const Th=({k,l})=><th onClick={()=>{if(sk===k)setAsc(a=>!a);else{setSk(k);setAsc(true);setPage(0);}}} style={{padding:"10px 14px",fontSize:11,fontWeight:700,color:"#1A4D2E",textAlign:"left",textTransform:"uppercase",letterSpacing:"0.05em",cursor:"pointer",whiteSpace:"nowrap",userSelect:"none"}}>{l} {sk===k?(asc?"↑":"↓"):<span style={{color:"#ddd"}}>↕</span>}</th>;
  if(sorted.length===0) return <div style={{textAlign:"center",padding:"60px 0"}}><div style={{fontSize:40,marginBottom:12}}>📋</div><div style={{fontSize:15,fontWeight:600,color:"#888"}}>Aucun RDV trouvé</div></div>;
  return <div>
    <div style={{background:"#fff",borderRadius:12,border:"1px solid #E4EAE4",overflow:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",minWidth:600}}>
        <thead><tr style={{background:"#F5F8F5",borderBottom:"1px solid #E4EAE4"}}>
          <Th k="dateRdv" l="Date"/><Th k="raisonSociale" l="Société"/>
          <th style={{padding:"10px 14px",fontSize:11,fontWeight:700,color:"#1A4D2E",textTransform:"uppercase"}}>SIRET</th>
          <Th k="nomContact" l="Contact"/>{showAgent&&<Th k="agentId" l="Agent"/>}
          <Th k="statut" l="Statut"/>
          <th style={{padding:"10px 14px",fontSize:11,fontWeight:700,color:"#1A4D2E",textTransform:"uppercase"}}>🔔</th>
          <th/>
        </tr></thead>
        <tbody>{slice.map((r,i)=>{ const ovd=(r.relances||[]).filter(x=>!x.done&&daysUntil(x.date)<0).length; const sn=(r.relances||[]).filter(x=>!x.done&&daysUntil(x.date)<=3&&daysUntil(x.date)>=0).length;
          return <tr key={r.id} style={{borderBottom:i<slice.length-1?"1px solid #F0F2F0":"none",cursor:"pointer"}}
            onMouseEnter={e=>e.currentTarget.style.background="#F9FBF9"} onMouseLeave={e=>e.currentTarget.style.background="transparent"} onClick={()=>onSelect(r)}>
            <td style={{padding:"11px 14px"}}><div style={{fontSize:13,fontWeight:600,color:"#1C1C1E",whiteSpace:"nowrap"}}>{fmtDate(r.dateRdv)}</div><div style={{fontSize:11,color:"#999"}}>{r.heureRdv}</div></td>
            <td style={{padding:"11px 14px"}}><div style={{fontSize:13,fontWeight:700,color:"#1C1C1E"}}>{r.raisonSociale||"—"}</div><div style={{fontSize:11,color:"#999"}}>{r.ville}</div></td>
            <td style={{padding:"11px 14px",fontSize:12,color:"#666",fontFamily:"monospace",whiteSpace:"nowrap"}}>{r.siret||"—"}</td>
            <td style={{padding:"11px 14px"}}><div style={{fontSize:13,color:"#1C1C1E"}}>{[r.nomContact,r.prenomContact].filter(Boolean).join(" ")||"—"}</div><div style={{fontSize:11,color:"#999"}}>{r.telephone}</div></td>
            {showAgent&&<td style={{padding:"11px 14px",fontSize:13,color:"#1C1C1E",whiteSpace:"nowrap"}}>{gn(r.agentId)}</td>}
            <td style={{padding:"11px 14px"}}><Badge statut={r.statut} small/>{r.pendingStatut&&<div style={{fontSize:10,color:"#E65100",marginTop:3,fontWeight:600}}>⏳ {r.pendingStatut}</div>}</td>
            <td style={{padding:"11px 14px",textAlign:"center"}}>{ovd>0&&<span style={{fontSize:12,color:"#C62828",fontWeight:700}}>⚠️{ovd}</span>}{!ovd&&sn>0&&<span style={{fontSize:12,color:"#E65100",fontWeight:700}}>🔔{sn}</span>}</td>
            <td style={{padding:"11px 14px"}}><button onClick={e=>{e.stopPropagation();onEdit(r);}} style={{background:"none",border:"1px solid #DDE3DD",borderRadius:6,padding:"5px 10px",fontSize:12,cursor:"pointer",color:"#555",whiteSpace:"nowrap"}}>Modifier</button></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {pages>1&&<div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginTop:14}}>
      <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0} style={{background:"#fff",border:"1px solid #DDE3DD",borderRadius:8,padding:"7px 14px",cursor:page===0?"default":"pointer",color:page===0?"#ccc":"#555",fontSize:13}}>‹ Préc.</button>
      <span style={{fontSize:13,color:"#888"}}>{page+1} / {pages} ({sorted.length} RDV)</span>
      <button onClick={()=>setPage(p=>Math.min(pages-1,p+1))} disabled={page>=pages-1} style={{background:"#fff",border:"1px solid #DDE3DD",borderRadius:8,padding:"7px 14px",cursor:page>=pages-1?"default":"pointer",color:page>=pages-1?"#ccc":"#555",fontSize:13}}>Suiv. ›</button>
    </div>}
  </div>;
}

// ═══════════════════════════════════════════════════════════════
// KANBAN
// ═══════════════════════════════════════════════════════════════
function Kanban({ rdvs, users, onSelect }) {
  const gn=id=>uname(users.find(u=>u.id===id)||{prenom:id});
  return <div style={{display:"flex",gap:12,overflowX:"auto",paddingBottom:8}}>
    {STATUTS.map(s=>{ const items=rdvs.filter(r=>r.statut===s); const c=STATUT_META[s];
      return <div key={s} style={{minWidth:210,maxWidth:240,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,padding:"6px 10px",background:c.bg,borderRadius:8,border:`1px solid ${c.dot}30`}}>
          <span style={{fontSize:12,fontWeight:700,color:c.text}}>{s}</span>
          <span style={{fontSize:12,fontWeight:700,color:c.dot,background:"#fff",borderRadius:20,padding:"1px 8px"}}>{items.length}</span>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {items.map(r=>{ const ovd=(r.relances||[]).filter(x=>!x.done&&daysUntil(x.date)<0).length; const sn=(r.relances||[]).filter(x=>!x.done&&daysUntil(x.date)<=3&&daysUntil(x.date)>=0).length;
            return <div key={r.id} onClick={()=>onSelect(r)} style={{background:"#fff",borderRadius:10,border:"1px solid #E4EAE4",padding:"12px 14px",cursor:"pointer"}}
              onMouseEnter={e=>e.currentTarget.style.boxShadow="0 2px 12px rgba(0,0,0,0.1)"} onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
              <div style={{fontSize:13,fontWeight:700,color:"#1C1C1E",marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.raisonSociale}</div>
              <div style={{fontSize:11,color:"#999",marginBottom:4}}>{r.ville} · {fmtDate(r.dateRdv)}</div>
              <div style={{fontSize:11,color:"#888"}}>{gn(r.agentId)}</div>
              {(ovd>0||sn>0)&&<div style={{fontSize:11,fontWeight:600,color:ovd?"#C62828":"#E65100",marginTop:4}}>{ovd?`⚠️ ${ovd} relance(s) en retard`:sn?`🔔 ${sn} à venir`:""}</div>}
            </div>;
          })}
          {items.length===0&&<div style={{padding:"16px 0",textAlign:"center",color:"#ccc",fontSize:12}}>—</div>}
        </div>
      </div>;
    })}
  </div>;
}

// ═══════════════════════════════════════════════════════════════
// CALENDRIER
// ═══════════════════════════════════════════════════════════════
function CalView({ rdvs, users, onSelect }) {
  const [cur,setCur]=useState(new Date());
  const y=cur.getFullYear(),m=cur.getMonth();
  const first=new Date(y,m,1).getDay(),dim=new Date(y,m+1,0).getDate();
  const isToday=d=>{ const n=new Date(); return n.getFullYear()===y&&n.getMonth()===m&&n.getDate()===d; };
  const byDay={};
  rdvs.forEach(r=>{ if(!r.dateRdv) return; const [ry,rm,rd]=r.dateRdv.split("-"); if(parseInt(ry)===y&&parseInt(rm)-1===m){const k=parseInt(rd);byDay[k]=(byDay[k]||[]).concat(r);} });
  const offset=(first+6)%7; const cells=[];
  for(let i=0;i<offset;i++) cells.push(null);
  for(let d=1;d<=dim;d++) cells.push(d);
  return <div>
    <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:20}}>
      <button onClick={()=>setCur(new Date(y,m-1,1))} style={{background:"none",border:"1px solid #DDE3DD",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:14}}>‹</button>
      <h3 style={{margin:0,fontSize:17,fontWeight:700,color:"#1C1C1E",textTransform:"capitalize",flex:1,textAlign:"center"}}>{cur.toLocaleString("fr-FR",{month:"long",year:"numeric"})}</h3>
      <button onClick={()=>setCur(new Date(y,m+1,1))} style={{background:"none",border:"1px solid #DDE3DD",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:14}}>›</button>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
      {["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"].map(j=><div key={j} style={{textAlign:"center",fontSize:11,fontWeight:700,color:"#888",padding:"6px 0",textTransform:"uppercase"}}>{j}</div>)}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
      {cells.map((d,i)=>{ if(!d) return <div key={`e${i}`}/>; const items=byDay[d]||[];
        return <div key={d} style={{minHeight:70,background:isToday(d)?"#E8F5EE":"#fff",border:`1px solid ${isToday(d)?"#2E7D52":"#E4EAE4"}`,borderRadius:8,padding:"5px 7px",overflow:"hidden"}}>
          <div style={{fontSize:12,fontWeight:isToday(d)?700:500,color:isToday(d)?"#1A4D2E":"#555",marginBottom:3}}>{d}</div>
          {items.slice(0,2).map(r=>{ const c=STATUT_META[r.statut]||STATUT_META["RDV planifié"]; return <div key={r.id} onClick={()=>onSelect(r)} style={{fontSize:10,fontWeight:600,color:c.text,background:c.bg,borderRadius:4,padding:"2px 5px",marginBottom:2,cursor:"pointer",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.heureRdv?r.heureRdv+" ":""}{r.raisonSociale}</div>; })}
          {items.length>2&&<div style={{fontSize:10,color:"#999"}}>+{items.length-2}</div>}
        </div>;
      })}
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════
// MES RELANCES
// ═══════════════════════════════════════════════════════════════
function MesRelances({ rdvs, users, onSelectRdv, isAdmin, meId }) {
  const [filter,setFilter]=useState("today");
  const gn=id=>uname(users.find(u=>u.id===id)||{prenom:id});
  const all=rdvs.flatMap(rdv=>{ if(!isAdmin&&rdv.agentId!==meId) return []; return (rdv.relances||[]).filter(r=>{ if(r.done) return false; const d=daysUntil(r.date); if(filter==="today") return d===0; if(filter==="week") return d>=0&&d<=7; if(filter==="overdue") return d<0; return true; }).map(r=>({...r,rdv})); }).sort((a,b)=>a.date.localeCompare(b.date));
  const counts={ overdue:rdvs.flatMap(rdv=>(isAdmin||rdv.agentId===meId)?(rdv.relances||[]).filter(r=>!r.done&&daysUntil(r.date)<0):[]).length, today:rdvs.flatMap(rdv=>(isAdmin||rdv.agentId===meId)?(rdv.relances||[]).filter(r=>!r.done&&daysUntil(r.date)===0):[]).length, week:rdvs.flatMap(rdv=>(isAdmin||rdv.agentId===meId)?(rdv.relances||[]).filter(r=>!r.done&&daysUntil(r.date)>=0&&daysUntil(r.date)<=7):[]).length };
  return <div>
    <h2 style={{fontSize:22,fontWeight:800,color:"#1C1C1E",margin:"0 0 20px"}}>Relances</h2>
    <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
      {[{id:"overdue",l:`⚠️ En retard (${counts.overdue})`},{id:"today",l:`📅 Aujourd'hui (${counts.today})`},{id:"week",l:`🗓 Cette semaine (${counts.week})`},{id:"all",l:"Toutes"}].map(f=><button key={f.id} onClick={()=>setFilter(f.id)} style={{padding:"8px 16px",borderRadius:20,border:filter===f.id?"2px solid #1A4D2E":"1px solid #DDE3DD",cursor:"pointer",fontSize:13,fontWeight:600,background:filter===f.id?"#1A4D2E":"#fff",color:filter===f.id?"#fff":"#555"}}>{f.l}</button>)}
    </div>
    {all.length===0?<div style={{textAlign:"center",padding:"40px 0",color:"#aaa"}}><div style={{fontSize:32,marginBottom:8}}>🎉</div><div style={{fontSize:14,fontWeight:600,color:"#888"}}>Aucune relance dans cette période</div></div>
    :<div style={{display:"flex",flexDirection:"column",gap:10}}>
      {all.map(item=>{ const d=daysUntil(item.date); const uc=d<0?"#C62828":d===0?"#E65100":d<=3?"#F57F17":"#2E7D52";
        return <div key={item.id} style={{background:"#fff",borderRadius:12,border:"1px solid #E4EAE4",padding:"14px 18px",display:"flex",alignItems:"center",gap:14,cursor:"pointer"}}
          onClick={()=>onSelectRdv(item.rdv)} onMouseEnter={e=>e.currentTarget.style.background="#F9FBF9"} onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
          <div style={{width:42,height:42,borderRadius:10,background:d<0?"#FFF3F3":d===0?"#FFF8E1":"#E8F5EE",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{d<0?"⚠️":d===0?"🔔":"📅"}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:14,fontWeight:700,color:"#1C1C1E"}}>{item.rdv.raisonSociale}</div>
            <div style={{fontSize:12,color:"#888",marginTop:2}}>{isAdmin&&<span style={{marginRight:8}}>{gn(item.rdv.agentId)} · </span>}{fmtDate(item.date)}{item.note&&<span style={{marginLeft:8,fontStyle:"italic"}}>"{item.note}"</span>}</div>
          </div>
          <div style={{fontSize:13,fontWeight:700,color:uc,flexShrink:0}}>{d<0?`${Math.abs(d)}j retard`:d===0?"Aujourd'hui":`J-${d}`}</div>
        </div>;
      })}
    </div>}
  </div>;
}

// ═══════════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════════
function StatsPanel({ rdvs, users }) {
  const agents=users.filter(u=>u.role==="agent");
  const total=rdvs.length;
  const signes=rdvs.filter(r=>r.statut==="Signé").length;
  const planifies=rdvs.filter(r=>["RDV planifié","RDV effectué","Devis envoyé","Signé"].includes(r.statut)).length;
  const tauxConv=planifies>0?Math.round(signes/planifies*100):0;
  const byProd={};rdvs.forEach(r=>(r.produits||[]).forEach(p=>{byProd[p]=(byProd[p]||0)+1;}));
  const topProd=Object.entries(byProd).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const bySrc={};rdvs.forEach(r=>{if(r.source)bySrc[r.source]=(bySrc[r.source]||0)+1;});
  const Bar=({label,val,max,color})=><div style={{marginBottom:10}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:13,color:"#555"}}>{label}</span><span style={{fontSize:13,fontWeight:700,color}}>{val}</span></div>
    <div style={{height:6,background:"#EEE",borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",width:`${max>0?Math.round(val/max*100):0}%`,background:color,borderRadius:4}}/></div>
  </div>;
  return <div>
    <h2 style={{fontSize:22,fontWeight:800,color:"#1C1C1E",margin:"0 0 24px"}}>Statistiques & Performance</h2>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:14,marginBottom:28}}>
      {[{l:"Total RDV",v:total,c:"#1A4D2E",i:"📋"},{l:"Taux conversion",v:`${tauxConv}%`,c:"#6A1B9A",i:"📈"},{l:"Signés",v:signes,c:"#7B1FA2",i:"✅"},{l:"Relances retard",v:rdvs.flatMap(r=>(r.relances||[]).filter(x=>!x.done&&daysUntil(x.date)<0)).length,c:"#C62828",i:"⚠️"}].map(s=><Card key={s.l}><div style={{fontSize:22,marginBottom:6}}>{s.i}</div><div style={{fontSize:26,fontWeight:800,color:s.c}}>{s.v}</div><div style={{fontSize:12,color:"#888",marginTop:4,fontWeight:500}}>{s.l}</div></Card>)}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:16}}>
      <Card><div style={{fontSize:11,fontWeight:700,color:"#1A4D2E",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:14}}>🔄 Pipeline</div>{STATUTS.map((s,i)=><Bar key={s} label={s} val={rdvs.filter(r=>r.statut===s).length} max={total||1} color={["#1976D2","#388E3C","#F57F17","#7B1FA2","#9E9E9E"][i]}/>)}</Card>
      <Card><div style={{fontSize:11,fontWeight:700,color:"#1A4D2E",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:14}}>👥 Par agent</div>{agents.map(a=>{ const ar=rdvs.filter(r=>r.agentId===a.id); const sg=ar.filter(r=>r.statut==="Signé").length; return <div key={a.id} style={{marginBottom:12}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:13,fontWeight:600,color:"#1C1C1E"}}>{uname(a)}</span><span style={{fontSize:12,color:"#888"}}>{ar.length} RDV · <span style={{color:"#7B1FA2",fontWeight:700}}>{sg}</span> signés</span></div><div style={{height:5,background:"#EEE",borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",width:`${total>0?ar.length/total*100:0}%`,background:"#2E7D52",borderRadius:4}}/></div></div>; })}</Card>
      <Card><div style={{fontSize:11,fontWeight:700,color:"#1A4D2E",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:14}}>⚡ Top produits CEE</div>{topProd.length===0?<div style={{color:"#aaa",fontSize:13}}>Pas encore de données.</div>:topProd.map(([p,n])=><Bar key={p} label={p} val={n} max={total||1} color="#E8A020"/>)}</Card>
      <Card><div style={{fontSize:11,fontWeight:700,color:"#1A4D2E",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:14}}>📡 Sources leads</div>{Object.keys(bySrc).length===0?<div style={{color:"#aaa",fontSize:13}}>Pas encore de données.</div>:Object.entries(bySrc).sort((a,b)=>b[1]-a[1]).map(([s,n])=><Bar key={s} label={s} val={n} max={total||1} color="#1565C0"/>)}</Card>
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════
// RDV DETAIL
// ═══════════════════════════════════════════════════════════════
function RdvDetail({ rdv, onBack, onEdit, onDelete, canEdit, agentName, isAdmin, onValidate, onDemandeStatut, users }) {
  const [tab,setTab]=useState("infos");
  const [showModal,setShowModal]=useState(false);
  const [newS,setNewS]=useState("");
  const ovd=(rdv.relances||[]).filter(r=>!r.done&&daysUntil(r.date)<0).length;
  const sn=(rdv.relances||[]).filter(r=>!r.done&&daysUntil(r.date)>=0&&daysUntil(r.date)<=3).length;

  const exportPDF=()=>{
    const w=window.open("","_blank"); const p=v=>v||"—";
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Fiche RDV – ${rdv.raisonSociale}</title>
    <style>body{font-family:Arial,sans-serif;padding:32px;color:#1C1C1E;max-width:800px;margin:0 auto}h1{color:#1A4D2E;font-size:22px}h2{color:#1A4D2E;font-size:13px;text-transform:uppercase;border-bottom:1px solid #E4EAE4;padding-bottom:6px;margin:20px 0 10px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px}.row{display:flex;gap:8px;font-size:13px;margin-bottom:5px}.lbl{color:#888;min-width:140px;flex-shrink:0}.val{font-weight:600}.chip{display:inline-block;background:#E8F5EE;color:#1A4D2E;border-radius:20px;padding:3px 10px;font-size:12px;margin:2px}.obs{background:#FFFDF5;border:1px solid #F0E8C8;border-radius:8px;padding:14px;font-size:13px;line-height:1.6}@media print{body{padding:0}}</style></head><body>
    <h1>${p(rdv.raisonSociale)}</h1><p style="color:#888;font-size:13px">Agent : ${agentName} · ${fmtDate(rdv.dateRdv)} ${rdv.heureRdv||""} · Statut : ${rdv.statut}</p>
    <h2>🏢 Entreprise</h2><div class="grid"><div class="row"><span class="lbl">SIRET</span><span class="val">${p(rdv.siret)}</span></div><div class="row"><span class="lbl">NAF</span><span class="val">${p(rdv.naf)}</span></div><div class="row" style="grid-column:1/-1"><span class="lbl">Adresse</span><span class="val">${[rdv.adresse,rdv.codePostal,rdv.ville].filter(Boolean).join(", ")||"—"}</span></div></div>
    <h2>👤 Contact</h2><div class="grid"><div class="row"><span class="lbl">Nom</span><span class="val">${[rdv.nomContact,rdv.prenomContact].filter(Boolean).join(" ")||"—"}</span></div><div class="row"><span class="lbl">Poste</span><span class="val">${p(rdv.poste)}</span></div><div class="row"><span class="lbl">Tél</span><span class="val">${p(rdv.telephone)}</span></div><div class="row"><span class="lbl">Email</span><span class="val">${p(rdv.email)}</span></div></div>
    <h2>📐 Technique</h2><div class="grid"><div class="row"><span class="lbl">Bâtiment</span><span class="val">${p(rdv.typeBatiment)}</span></div><div class="row"><span class="lbl">Chauffage</span><span class="val">${p(rdv.chauffageActuel)}</span></div><div class="row"><span class="lbl">Surface</span><span class="val">${rdv.surface?rdv.surface+" m²":"—"}</span></div><div class="row"><span class="lbl">Facture/an</span><span class="val">${rdv.facture?parseInt(rdv.facture).toLocaleString("fr-FR")+" €":"—"}</span></div></div>
    ${rdv.produits?.length?`<h2>⚡ Produits CEE</h2><div>${rdv.produits.map(p=>`<span class="chip">${p}</span>`).join("")}</div>`:""}
    ${rdv.observations?`<h2>📝 Observations</h2><div class="obs">${rdv.observations.replace(/\n/g,"<br>")}</div>`:""}
    ${rdv.compteRendu?`<h2>📋 Compte-rendu</h2><div class="obs">${rdv.compteRendu.replace(/\n/g,"<br>")}</div>`:""}
    <script>window.print();</script></body></html>`);
    w.document.close();
  };

  return <div>
    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,flexWrap:"wrap"}}>
      <button onClick={onBack} style={{background:"none",border:"1px solid #DDE3DD",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:13,color:"#555",flexShrink:0}}>← Retour</button>
      <div style={{flex:1,minWidth:0}}><h2 style={{fontSize:18,fontWeight:800,color:"#1C1C1E",margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{rdv.raisonSociale}</h2><div style={{fontSize:12,color:"#888",marginTop:2}}>{rdv.ville}</div></div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        <Badge statut={rdv.statut}/>
        {rdv.rappelDate&&<span style={{fontSize:11,background:"#E0F2F1",color:"#00695C",borderRadius:20,padding:"3px 10px",fontWeight:600,flexShrink:0}}>📅 Rappel {fmtDate(rdv.rappelDate)}</span>}
        {rdv.pendingStatut&&isAdmin&&<div style={{display:"flex",gap:6,alignItems:"center",background:"#FFF8E1",border:"1px solid #FFE082",borderRadius:8,padding:"6px 10px"}}>
          <span style={{fontSize:12,color:"#E65100",fontWeight:600}}>⏳ Demande: <strong>{rdv.pendingStatut}</strong></span>
          <button onClick={()=>onValidate(rdv.id,true)} style={{background:"#2E7D52",color:"#fff",border:"none",borderRadius:6,padding:"4px 10px",fontSize:12,fontWeight:700,cursor:"pointer"}}>✓</button>
          <button onClick={()=>onValidate(rdv.id,false)} style={{background:"#fff",color:"#C62828",border:"1px solid #FFCDD2",borderRadius:6,padding:"4px 8px",fontSize:12,cursor:"pointer"}}>✗</button>
        </div>}
        {!isAdmin&&canEdit&&!rdv.pendingStatut&&<button onClick={()=>setShowModal(true)} style={{background:"#fff",color:"#555",border:"1px solid #DDE3DD",borderRadius:8,padding:"7px 12px",fontSize:12,cursor:"pointer"}}>Demander statut</button>}
        {canEdit&&<button onClick={onEdit} style={{background:"#2E7D52",color:"#fff",border:"none",borderRadius:8,padding:"9px 18px",fontSize:13,fontWeight:700,cursor:"pointer"}}>Modifier</button>}
        <button onClick={exportPDF} style={{background:"#fff",color:"#1A4D2E",border:"1px solid #2E7D52",borderRadius:8,padding:"9px 14px",fontSize:13,cursor:"pointer"}}>⬇ PDF</button>
        {isAdmin&&<button onClick={()=>onDelete(rdv.id)} style={{background:"#fff",color:"#C62828",border:"1px solid #FFCDD2",borderRadius:8,padding:"9px 12px",fontSize:13,cursor:"pointer"}}>Supprimer</button>}
      </div>
    </div>

    <div style={{display:"flex",gap:4,marginBottom:20,background:"#F0F2F0",borderRadius:10,padding:4,width:"fit-content",flexWrap:"wrap"}}>
      {[["infos","📋 Infos"],["cr","📝 Compte-rendu"],["relances",`🔔 Relances${ovd?` ⚠️${ovd}`:sn?` (${sn})`:""}`],["histo","🕐 Historique"]].map(([id,l])=>(
        <button key={id} onClick={()=>setTab(id)} style={{padding:"7px 14px",borderRadius:8,border:"none",cursor:"pointer",fontSize:13,fontWeight:600,background:tab===id?"#fff":"transparent",color:tab===id?"#1A4D2E":"#888",boxShadow:tab===id?"0 1px 4px rgba(0,0,0,0.1)":"none"}}>{l}</button>
      ))}
    </div>

    {tab==="infos"&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:14,maxWidth:880}}>
      <Card><div style={{fontSize:11,fontWeight:700,color:"#1A4D2E",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:14}}>📅 RDV</div><DRow label="Agent" val={agentName}/><DRow label="Date" val={fmtDate(rdv.dateRdv)}/><DRow label="Heure" val={rdv.heureRdv}/><DRow label="Source" val={rdv.source} chip/></Card>
      <Card><div style={{fontSize:11,fontWeight:700,color:"#1A4D2E",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:14}}>🏢 Entreprise</div><DRow label="SIRET" val={rdv.siret} mono/><DRow label="Code NAF" val={rdv.naf}/><DRow label="Propriétaire" val={rdv.proprietaire} chip/><DRow label="Adresse" val={[rdv.adresse,rdv.codePostal,rdv.ville].filter(Boolean).join(", ")}/></Card>
      <Card><div style={{fontSize:11,fontWeight:700,color:"#1A4D2E",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:14}}>👤 Contact</div><DRow label="Nom" val={[rdv.nomContact,rdv.prenomContact].filter(Boolean).join(" ")||null}/><DRow label="Poste" val={rdv.poste}/><DRow label="Tél" val={rdv.telephone}/><DRow label="Email" val={rdv.email}/></Card>
      <Card><div style={{fontSize:11,fontWeight:700,color:"#1A4D2E",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:14}}>📐 Technique</div><DRow label="Bâtiment" val={rdv.typeBatiment}/><DRow label="Chauffage" val={rdv.chauffageActuel} chip/><DRow label="Surface" val={rdv.surface?`${rdv.surface} m²`:null}/><DRow label="Hauteur" val={rdv.hauteurSous?`${rdv.hauteurSous} m`:null}/><DRow label="Année" val={rdv.anneeConstruction}/><DRow label="Facture/an" val={rdv.facture?`${parseInt(rdv.facture).toLocaleString("fr-FR")} €`:null}/></Card>
      {rdv.produits?.length>0&&<Card style={{gridColumn:"1/-1"}}><div style={{fontSize:11,fontWeight:700,color:"#1A4D2E",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12}}>⚡ Produits CEE</div><div style={{display:"flex",flexWrap:"wrap",gap:8}}>{rdv.produits.map(p=><span key={p} style={{background:"#E8F5EE",color:"#1A4D2E",border:"1px solid #2E7D5240",borderRadius:20,padding:"5px 14px",fontSize:13,fontWeight:600}}>{p}</span>)}</div></Card>}
      {rdv.observations&&<Card style={{gridColumn:"1/-1",background:"#FFFDF5",border:"1px solid #F0E8C8"}}><div style={{fontSize:11,fontWeight:700,color:"#876A00",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>📝 Observations</div><p style={{fontSize:14,color:"#555",lineHeight:1.65,margin:0,whiteSpace:"pre-wrap"}}>{rdv.observations}</p></Card>}
    </div>}
    {tab==="cr"&&<div style={{maxWidth:700}}><Card>{rdv.compteRendu?<p style={{fontSize:14,color:"#333",lineHeight:1.7,margin:0,whiteSpace:"pre-wrap"}}>{rdv.compteRendu}</p>:<div style={{color:"#aaa",fontSize:13,textAlign:"center",padding:"20px 0"}}>Aucun compte-rendu. Cliquez sur "Modifier".</div>}</Card></div>}
    {tab==="relances"&&<div style={{maxWidth:600}}><Card><RelancesPanel relances={rdv.relances||[]} onChange={()=>{}} readOnly/></Card></div>}
    {tab==="histo"&&<div style={{maxWidth:600}}><Card><div style={{fontSize:11,fontWeight:700,color:"#1A4D2E",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:14}}>🕐 Historique</div>
      {!(rdv.historique?.length)&&<div style={{color:"#aaa",fontSize:13,textAlign:"center",padding:"16px 0"}}>Aucun historique.</div>}
      {[...(rdv.historique||[])].reverse().map((h,i)=>{ const u=users.find(u=>u.id===h.userId); return <div key={i} style={{display:"flex",gap:12,padding:"10px 14px",background:"#FAFAFA",borderRadius:8,border:"1px solid #F0F2F0",marginBottom:8}}>
        <div style={{width:28,height:28,borderRadius:"50%",background:"#E8F5EE",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#2E7D52"}}>{u?uname(u)[0]:"?"}</div>
        <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:"#1C1C1E"}}>{h.action}</div>{h.detail&&<div style={{fontSize:12,color:"#888",marginTop:2}}>{h.detail}</div>}<div style={{fontSize:11,color:"#bbb",marginTop:4}}>{u?uname(u):"Inconnu"} · {fmtDate(h.date)}</div></div>
      </div>; })}
    </Card></div>}

    {showModal&&<Modal title="Demander un changement de statut" onClose={()=>setShowModal(false)}>
      <p style={{fontSize:13,color:"#888",marginBottom:14}}>Statut actuel : <Badge statut={rdv.statut}/><br/><span style={{display:"block",marginTop:6}}>Votre demande sera validée par l'admin.</span></p>
      <Sel label="Nouveau statut souhaité" options={STATUTS.filter(s=>s!==rdv.statut)} value={newS} onChange={e=>setNewS(e.target.value)}/>
      <div style={{display:"flex",gap:10,marginTop:16}}>
        <button onClick={()=>{if(newS){onDemandeStatut(rdv.id,newS);setShowModal(false);}}} disabled={!newS} style={{background:newS?"#2E7D52":"#ccc",color:"#fff",border:"none",borderRadius:8,padding:"10px 20px",fontSize:14,fontWeight:700,cursor:newS?"pointer":"default",flex:1}}>Envoyer</button>
        <button onClick={()=>setShowModal(false)} style={{background:"#fff",color:"#555",border:"1px solid #DDE3DD",borderRadius:8,padding:"10px 16px",fontSize:14,cursor:"pointer"}}>Annuler</button>
      </div>
    </Modal>}
  </div>;
}

// ═══════════════════════════════════════════════════════════════
// AGENTS MANAGER
// ═══════════════════════════════════════════════════════════════
function AgentsManager({ users, setUsers, rdvs, showToast }) {
  const [editId,setEditId]=useState(null); const [ef,setEf]=useState({});
  const [na,setNa]=useState({prenom:"",nom:"",password:""}); const [showNew,setShowNew]=useState(false);
  const agents=users.filter(u=>u.role==="agent");
  const save=(id)=>{ if(!ef.prenom||!ef.password) return; setUsers(us=>us.map(u=>u.id===id?{...u,...ef,passwordHash:simpleHash(ef.password),password:undefined}:u)); setEditId(null); showToast("Agent mis à jour ✓"); };
  const add=()=>{ if(!na.prenom||!na.password){showToast("Prénom et mot de passe requis","error");return;} setUsers(us=>[...us,{id:"agent_"+uid(),prenom:na.prenom,nom:na.nom,role:"agent",passwordHash:simpleHash(na.password),salaire:0}]); setNa({prenom:"",nom:"",password:""}); setShowNew(false); showToast("Agent ajouté ✓"); };
  const remove=(id)=>{ setUsers(us=>us.filter(u=>u.id!==id)); showToast("Agent supprimé"); };
  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
      <h2 style={{fontSize:20,fontWeight:800,color:"#1C1C1E",margin:0}}>Gérer les agents</h2>
      <button onClick={()=>setShowNew(s=>!s)} style={{background:"#2E7D52",color:"#fff",border:"none",borderRadius:10,padding:"10px 20px",fontSize:14,fontWeight:700,cursor:"pointer"}}>{showNew?"Annuler":"＋ Ajouter"}</button>
    </div>
    {showNew&&<Card style={{marginBottom:20,border:"1.5px solid #2E7D52",background:"#F5FBF7"}}>
      <div style={{fontSize:13,fontWeight:700,color:"#1A4D2E",marginBottom:14}}>Nouvel agent</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:14}}>
        <Inp label="Prénom" required value={na.prenom} onChange={e=>setNa(f=>({...f,prenom:e.target.value}))}/>
        <Inp label="Nom" value={na.nom} onChange={e=>setNa(f=>({...f,nom:e.target.value}))}/>
        <Inp label="Mot de passe" required value={na.password} onChange={e=>setNa(f=>({...f,password:e.target.value}))}/>
      </div>
      <button onClick={add} style={{background:"#2E7D52",color:"#fff",border:"none",borderRadius:8,padding:"10px 24px",fontSize:14,fontWeight:700,cursor:"pointer"}}>Créer</button>
    </Card>}
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {agents.map(u=>{ const count=rdvs.filter(r=>r.agentId===u.id).length; const isE=editId===u.id;
        return <Card key={u.id}>
          {isE?<div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:14}}>
              <Inp label="Prénom" value={ef.prenom} onChange={e=>setEf(f=>({...f,prenom:e.target.value}))}/>
              <Inp label="Nom" value={ef.nom} onChange={e=>setEf(f=>({...f,nom:e.target.value}))}/>
              <Inp label="Nouveau mot de passe" value={ef.password} onChange={e=>setEf(f=>({...f,password:e.target.value}))}/>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>save(u.id)} style={{background:"#2E7D52",color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",fontSize:13,fontWeight:700,cursor:"pointer"}}>Enregistrer</button>
              <button onClick={()=>setEditId(null)} style={{background:"#fff",color:"#555",border:"1px solid #DDE3DD",borderRadius:8,padding:"8px 14px",fontSize:13,cursor:"pointer"}}>Annuler</button>
            </div>
          </div>:<div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
            <div style={{width:40,height:40,borderRadius:"50%",background:"#E8F5EE",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:"#2E7D52",flexShrink:0}}>{u.prenom[0]}{u.nom?u.nom[0]:""}</div>
            <div style={{flex:1}}><div style={{fontSize:15,fontWeight:700,color:"#1C1C1E"}}>{uname(u)}</div><div style={{fontSize:12,color:"#888",marginTop:2}}>{count} RDV</div></div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{setEditId(u.id);setEf({prenom:u.prenom,nom:u.nom||"",password:""});}} style={{background:"none",border:"1px solid #DDE3DD",borderRadius:8,padding:"7px 14px",fontSize:12,cursor:"pointer",color:"#555"}}>Modifier</button>
              <button onClick={()=>remove(u.id)} style={{background:"none",border:"1px solid #FFCDD2",borderRadius:8,padding:"7px 12px",fontSize:12,cursor:"pointer",color:"#C62828"}}>Supprimer</button>
            </div>
          </div>}
        </Card>;
      })}
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════
function Dashboard({ rdvs, users, onSelectRdv }) {
  const agents=users.filter(u=>u.role==="agent");
  const gn=id=>uname(users.find(u=>u.id===id)||{prenom:id});
  const recent=[...rdvs].sort((a,b)=>b.id-a.id).slice(0,6);
  const pending=rdvs.filter(r=>r.pendingStatut);
  const ovdAll=rdvs.flatMap(r=>(r.relances||[]).filter(x=>!x.done&&daysUntil(x.date)<0));
  return <div>
    <h2 style={{fontSize:22,fontWeight:800,color:"#1C1C1E",margin:"0 0 20px"}}>Tableau de bord</h2>
    {(pending.length>0||ovdAll.length>0)&&<div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
      {pending.length>0&&<div style={{background:"#FFF8E1",border:"1px solid #FFE082",borderRadius:10,padding:"12px 16px",fontSize:14,fontWeight:600,color:"#E65100"}}>⏳ {pending.length} changement{pending.length>1?"s":""} de statut en attente</div>}
      {ovdAll.length>0&&<div style={{background:"#FFF3F3",border:"1px solid #FFCDD2",borderRadius:10,padding:"12px 16px",fontSize:14,fontWeight:600,color:"#C62828"}}>⚠️ {ovdAll.length} relance{ovdAll.length>1?"s":""} en retard</div>}
    </div>}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:14,marginBottom:28}}>
      {[{l:"Total RDV",v:rdvs.length,c:"#1A4D2E",i:"📋"},{l:"Planifiés",v:rdvs.filter(r=>r.statut==="RDV planifié").length,c:"#1565C0",i:"📅"},{l:"Devis envoyés",v:rdvs.filter(r=>r.statut==="Devis envoyé").length,c:"#F57F17",i:"📄"},{l:"Signés",v:rdvs.filter(r=>r.statut==="Signé").length,c:"#6A1B9A",i:"✅"}].map(s=><Card key={s.l}><div style={{fontSize:22,marginBottom:6}}>{s.i}</div><div style={{fontSize:26,fontWeight:800,color:s.c}}>{s.v}</div><div style={{fontSize:12,color:"#888",marginTop:4,fontWeight:500}}>{s.l}</div></Card>)}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:16}}>
      <Card><div style={{fontSize:11,fontWeight:700,color:"#1A4D2E",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:14}}>👥 Agents</div>
        {agents.map(a=>{ const ar=rdvs.filter(r=>r.agentId===a.id); const sg=ar.filter(r=>r.statut==="Signé").length; const pct=rdvs.length?Math.round(ar.length/rdvs.length*100):0;
          return <div key={a.id} style={{marginBottom:12}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:26,height:26,borderRadius:"50%",background:"#E8F5EE",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#2E7D52",flexShrink:0}}>{a.prenom[0]}{a.nom?a.nom[0]:""}</div><span style={{fontSize:13,fontWeight:600,color:"#1C1C1E"}}>{uname(a)}</span></div><span style={{fontSize:12,color:"#888"}}>{ar.length} RDV · <span style={{color:"#7B1FA2",fontWeight:700}}>{sg}</span></span></div><div style={{height:5,background:"#EEE",borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",width:`${pct}%`,background:"#2E7D52",borderRadius:4}}/></div></div>;
        })}
      </Card>
      <Card><div style={{fontSize:11,fontWeight:700,color:"#1A4D2E",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:14}}>🕐 Derniers RDV</div>
        {recent.map(r=><div key={r.id} onClick={()=>onSelectRdv(r)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,cursor:"pointer",padding:"6px 8px",borderRadius:8}} onMouseEnter={e=>e.currentTarget.style.background="#F5F8F5"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
          <div><div style={{fontSize:13,fontWeight:600,color:"#1C1C1E"}}>{r.raisonSociale}</div><div style={{fontSize:11,color:"#888"}}>{gn(r.agentId)} · {fmtDate(r.dateRdv)}</div></div>
          <Badge statut={r.statut} small/>
        </div>)}
      </Card>
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════
// NAVIGATION — sidebar desktop / top bar + bottom nav mobile
// ═══════════════════════════════════════════════════════════════
function Sidebar({ user, view, setView, stats, onLogout, pendingCount }) {
  const isAdmin=user.role==="admin";
  const [drawerOpen,setDrawerOpen]=useState(false);
  const [isMobile,setIsMobile]=useState(typeof window!=="undefined"&&window.innerWidth<700);
  useEffect(()=>{
    const fn=()=>setIsMobile(window.innerWidth<700);
    window.addEventListener("resize",fn); return ()=>window.removeEventListener("resize",fn);
  },[]);
  useEffect(()=>{
    const s=document.createElement("style");
    s.textContent="@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}";
    document.head.appendChild(s); return()=>document.head.removeChild(s);
  },[]);

  const allItems=isAdmin
    ?[{id:"dashboard",l:"Tableau de bord",i:"📊"},{id:"all_rdvs",l:"Tous les RDV",i:"📋"},{id:"import",l:"Importer prospects",i:"📥"},{id:"kanban",l:"Pipeline",i:"🗂️"},{id:"calendar",l:"Calendrier",i:"📅"},{id:"relances",l:"Relances",i:"🔔"},{id:"stats",l:"Statistiques",i:"📈"},{id:"new_rdv",l:"Nouveau RDV",i:"➕"},{id:"pointage_admin",l:"Pointages & Paie",i:"💶"},{id:"agents",l:"Agents",i:"👥"}]
    :[{id:"pointer",l:"Pointage",i:"⏱️"},{id:"my_rdvs",l:"Mes RDV",i:"📋"},{id:"new_rdv",l:"Nouveau RDV",i:"➕"},{id:"my_relances",l:"Relances",i:"🔔"},{id:"my_kanban",l:"Pipeline",i:"🗂️"},{id:"my_calendar",l:"Calendrier",i:"📅"}];

  const go=id=>{setView(id);setDrawerOpen(false);};
  const bottomItems=allItems.slice(0,4);

  if(!isMobile) return (
    <div style={{width:210,minHeight:"100vh",background:"#1A4D2E",display:"flex",flexDirection:"column",flexShrink:0}}>
      <div style={{padding:"22px 16px 16px",borderBottom:"1px solid #2E7D5230"}}>
        <div style={{fontSize:10,color:"#7FBA9A",fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4}}>Mon espace</div>
        <div style={{fontSize:17,fontWeight:800,color:"#fff",lineHeight:1.2}}>CRM Pro</div>
        <div style={{fontSize:11,color:"#7FBA9A",marginTop:8,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
          <span style={{background:isAdmin?"#E8A020":"#2E7D52",borderRadius:20,padding:"2px 8px",fontSize:10,fontWeight:700,color:"#fff"}}>{isAdmin?"ADMIN":"AGENT"}</span>
          {uname(user)}
        </div>
      </div>
      <nav style={{padding:"12px 10px",flex:1}}>
        {allItems.map(item=><button key={item.id} onClick={()=>go(item.id)}
          style={{width:"100%",textAlign:"left",padding:"9px 10px",borderRadius:8,border:"none",cursor:"pointer",marginBottom:2,background:view===item.id?"#2E7D52":"transparent",color:view===item.id?"#fff":"#A8D4B8",fontSize:13,fontWeight:view===item.id?600:400,display:"flex",alignItems:"center",gap:8,justifyContent:"space-between"}}>
          <span style={{display:"flex",alignItems:"center",gap:8}}><span>{item.i}</span>{item.l}</span>
          {item.id==="dashboard"&&pendingCount>0&&<span style={{background:"#E8A020",color:"#fff",borderRadius:20,padding:"1px 7px",fontSize:10,fontWeight:700}}>{pendingCount}</span>}
        </button>)}
      </nav>
      <div style={{padding:"12px 16px",borderTop:"1px solid #2E7D5230"}}>
        {isAdmin&&<div style={{marginBottom:10}}>{[{l:"Total",v:stats.total},{l:"Planifiés",v:stats.planifies},{l:"Signés",v:stats.signes}].map(s=><div key={s.l} style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,color:"#A8D4B8"}}>{s.l}</span><span style={{fontSize:13,fontWeight:700,color:"#E8A020"}}>{s.v}</span></div>)}</div>}
        <button onClick={onLogout} style={{width:"100%",background:"none",border:"1px solid #2E7D5250",borderRadius:8,padding:"8px",color:"#A8D4B8",fontSize:13,cursor:"pointer"}}>Se déconnecter</button>
      </div>
    </div>
  );

  // ── MOBILE ──────────────────────────────────────────────────
  return <div style={{position:"relative"}}>
    {/* Top bar fixe */}
    <div style={{position:"fixed",top:0,left:0,right:0,zIndex:200,background:"#1A4D2E",
      display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 16px",
      boxShadow:"0 2px 8px rgba(0,0,0,0.2)"}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:20}}>⚡</span>
        <div>
          <div style={{fontSize:15,fontWeight:800,color:"#fff",lineHeight:1}}>CRM Pro</div>
          <div style={{fontSize:11,color:"#A8D4B8"}}>{uname(user)}</div>
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        {pendingCount>0&&<span style={{background:"#E8A020",color:"#fff",borderRadius:20,padding:"2px 8px",fontSize:11,fontWeight:700}}>{pendingCount}</span>}
        <button onClick={()=>setDrawerOpen(true)} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,padding:"7px 10px",cursor:"pointer",color:"#fff",fontSize:20,lineHeight:1}}>☰</button>
      </div>
    </div>
    {/* Bottom nav */}
    <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:200,background:"#1A4D2E",
      display:"flex",alignItems:"center",justifyContent:"space-around",padding:"6px 0 10px",
      boxShadow:"0 -2px 12px rgba(0,0,0,0.15)"}}>
      {bottomItems.map(item=>{const active=view===item.id; return <button key={item.id} onClick={()=>go(item.id)}
        style={{background:active?"rgba(255,255,255,0.15)":"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"4px 10px",borderRadius:8,minWidth:0}}>
        <span style={{fontSize:22}}>{item.i}</span>
        <span style={{fontSize:10,color:active?"#fff":"#7FBA9A",fontWeight:active?700:400,whiteSpace:"nowrap"}}>{item.l}</span>
      </button>;})}
      <button onClick={()=>setDrawerOpen(true)} style={{background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"4px 10px"}}>
        <span style={{fontSize:22}}>⋯</span>
        <span style={{fontSize:10,color:"#7FBA9A"}}>Plus</span>
      </button>
    </div>
    {/* Drawer */}
    {drawerOpen&&<>
      <div onClick={()=>setDrawerOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300}}/>
      <div style={{position:"fixed",top:0,right:0,bottom:0,width:"78%",maxWidth:280,background:"#1A4D2E",zIndex:400,display:"flex",flexDirection:"column",boxShadow:"-4px 0 20px rgba(0,0,0,0.3)",animation:"slideIn 0.22s ease"}}>
        <div style={{padding:"18px 16px 12px",borderBottom:"1px solid #2E7D5230",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:15,fontWeight:800,color:"#fff"}}>Menu</div>
            <div style={{fontSize:11,color:"#7FBA9A",marginTop:4}}>
              <span style={{background:isAdmin?"#E8A020":"#2E7D52",borderRadius:20,padding:"2px 8px",fontSize:10,fontWeight:700,color:"#fff",marginRight:6}}>{isAdmin?"ADMIN":"AGENT"}</span>{uname(user)}
            </div>
          </div>
          <button onClick={()=>setDrawerOpen(false)} style={{background:"none",border:"none",color:"#A8D4B8",fontSize:24,cursor:"pointer",lineHeight:1}}>×</button>
        </div>
        <nav style={{padding:"8px 10px",flex:1,overflowY:"auto"}}>
          {allItems.map(item=><button key={item.id} onClick={()=>go(item.id)}
            style={{width:"100%",textAlign:"left",padding:"13px 12px",borderRadius:8,border:"none",cursor:"pointer",marginBottom:3,background:view===item.id?"#2E7D52":"transparent",color:view===item.id?"#fff":"#A8D4B8",fontSize:14,fontWeight:view===item.id?600:400,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:18}}>{item.i}</span>{item.l}
            {item.id==="dashboard"&&pendingCount>0&&<span style={{background:"#E8A020",color:"#fff",borderRadius:20,padding:"1px 7px",fontSize:10,fontWeight:700,marginLeft:"auto"}}>{pendingCount}</span>}
          </button>)}
        </nav>
        <div style={{padding:"12px 16px",borderTop:"1px solid #2E7D5230"}}>
          <button onClick={onLogout} style={{width:"100%",background:"none",border:"1px solid #2E7D5250",borderRadius:8,padding:"11px",color:"#A8D4B8",fontSize:14,cursor:"pointer"}}>🚪 Se déconnecter</button>
        </div>
      </div>
    </>}
  </div>;
}

// ═══════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════
function LoginScreen({ users, onLogin, loading }) {
  const [username,setUsername]=useState(""); const [password,setPassword]=useState(""); const [error,setError]=useState("");
  const handle=()=>{
    const u=users.find(u=>{ const full=uname(u).toLowerCase(); const inp=username.toLowerCase().trim(); return (inp===full||inp===u.prenom.toLowerCase())&&simpleHash(password)===u.passwordHash; });
    if(u) onLogin(u); else setError("Identifiant ou mot de passe incorrect.");
  };
  return <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#1A4D2E 0%,#2E7D52 60%,#1A4D2E 100%)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
    <div style={{background:"#fff",borderRadius:20,padding:"40px 36px",width:"100%",maxWidth:380,boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
      <div style={{textAlign:"center",marginBottom:32}}>
        <div style={{fontSize:36,marginBottom:8}}>⚡</div>
        <div style={{fontSize:22,fontWeight:800,color:"#1A4D2E"}}>CRM Pro</div>
        <div style={{fontSize:13,color:"#888",marginTop:6}}>Efficacité énergétique & Gestion d'équipe</div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div style={{display:"flex",flexDirection:"column",gap:5}}>
          <label style={{fontSize:12,fontWeight:700,color:"#4A5568",textTransform:"uppercase",letterSpacing:"0.05em"}}>Prénom ou Prénom Nom</label>
          <input value={username} onChange={e=>{setUsername(e.target.value);setError("");}} onKeyDown={e=>e.key==="Enter"&&handle()} placeholder="Ex : Marie" style={{border:"1.5px solid #DDE3DD",borderRadius:8,padding:"10px 14px",fontSize:15,outline:"none"}}/>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:5}}>
          <label style={{fontSize:12,fontWeight:700,color:"#4A5568",textTransform:"uppercase",letterSpacing:"0.05em"}}>Mot de passe</label>
          <input type="password" value={password} onChange={e=>{setPassword(e.target.value);setError("");}} onKeyDown={e=>e.key==="Enter"&&handle()} placeholder="••••••••" style={{border:"1.5px solid #DDE3DD",borderRadius:8,padding:"10px 14px",fontSize:15,outline:"none"}}/>
        </div>
        {error&&<div style={{background:"#FFF3F3",border:"1px solid #FFCDD2",borderRadius:8,padding:"10px 14px",color:"#C62828",fontSize:13,fontWeight:500}}>{error}</div>}
        <button onClick={handle} disabled={loading} style={{background:loading?"#aaa":"#2E7D52",color:"#fff",border:"none",borderRadius:10,padding:"13px",fontSize:15,fontWeight:700,cursor:loading?"default":"pointer"}}>{loading?"Chargement…":"Se connecter"}</button>
      </div>

    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════
// SUPABASE CONFIG
// ═══════════════════════════════════════════════════════════════
const SUPA_URL = "https://uorsholetmcyfbnnczgu.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvcnNob2xldG1jeWZibm5jemd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MDAyMTAsImV4cCI6MjA5ODI3NjIxMH0.3eyc8yeun_1quR5pKA_S5F9YdulprJa9bhfc0V-Ccmg";
const HEADERS = { "apikey": SUPA_KEY, "Authorization": `Bearer ${SUPA_KEY}`, "Content-Type": "application/json", "Prefer": "return=representation" };

const db = {
  async get(table, params="") {
    const r = await fetch(`${SUPA_URL}/rest/v1/${table}?${params}`, { headers: HEADERS });
    if(!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async post(table, body) {
    const r = await fetch(`${SUPA_URL}/rest/v1/${table}`, { method:"POST", headers: HEADERS, body: JSON.stringify(body) });
    if(!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async patch(table, id, body) {
    const r = await fetch(`${SUPA_URL}/rest/v1/${table}?id=eq.${id}`, { method:"PATCH", headers: HEADERS, body: JSON.stringify(body) });
    if(!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async delete(table, id) {
    const r = await fetch(`${SUPA_URL}/rest/v1/${table}?id=eq.${id}`, { method:"DELETE", headers: HEADERS });
    if(!r.ok) throw new Error(await r.text());
  },
  async upsert(table, body) {
    const r = await fetch(`${SUPA_URL}/rest/v1/${table}`, { method:"POST", headers: {...HEADERS, "Prefer":"resolution=merge-duplicates,return=representation"}, body: JSON.stringify(body) });
    if(!r.ok) throw new Error(await r.text());
    return r.json();
  }
};

// Conversion snake_case (Supabase) <-> camelCase (React)
const toLead = r => ({
  id:r.id, agentId:r.agent_id, statut:r.statut, dateRdv:r.date_rdv||"", heureRdv:r.heure_rdv||"",
  raisonSociale:r.raison_sociale||"", siret:r.siret||"", naf:r.naf||"",
  adresse:r.adresse||"", codePostal:r.code_postal||"", ville:r.ville||"",
  nomContact:r.nom_contact||"", prenomContact:r.prenom_contact||"", poste:r.poste||"",
  telephone:r.telephone||"", email:r.email||"",
  typeBatiment:r.type_batiment||"", chauffageActuel:r.chauffage_actuel||"",
  surface:r.surface||"", hauteurSous:r.hauteur_sous||"",
  anneeConstruction:r.annee_construction||"", facture:r.facture||"",
  source:r.source||"", proprietaire:r.proprietaire||"",
  produits:r.produits||[], observations:r.observations||"", compteRendu:r.compte_rendu||"",
  historique:r.historique||[], pendingStatut:r.pending_statut||"",
  rappelDate:r.rappel_date||"", suppressionDate:r.suppression_date||"",
  relances:r.relances||[],
});
const fromLead = d => ({
  id:d.id, agent_id:d.agentId, statut:d.statut, date_rdv:d.dateRdv, heure_rdv:d.heureRdv,
  raison_sociale:d.raisonSociale, siret:d.siret, naf:d.naf,
  adresse:d.adresse, code_postal:d.codePostal, ville:d.ville,
  nom_contact:d.nomContact, prenom_contact:d.prenomContact, poste:d.poste,
  telephone:d.telephone, email:d.email,
  type_batiment:d.typeBatiment, chauffage_actuel:d.chauffageActuel,
  surface:d.surface, hauteur_sous:d.hauteurSous,
  annee_construction:d.anneeConstruction, facture:d.facture,
  source:d.source, proprietaire:d.proprietaire,
  produits:d.produits||[], observations:d.observations, compte_rendu:d.compteRendu,
  historique:d.historique||[], pending_statut:d.pendingStatut||"",
  rappel_date:d.rappelDate||"", suppression_date:d.suppressionDate||"",
  relances:d.relances||[], updated_at:new Date().toISOString(),
});
const toAgent = r => ({ id:r.id, prenom:r.prenom, nom:r.nom||"", role:r.role, passwordHash:r.password_hash, salaire:r.salaire||0 });
const toPtg = r => ({ id:r.id, agentId:r.agent_id, date:r.date, arrivee:r.arrivee||"", pauseDebut:r.pause_debut||"", pauseFin:r.pause_fin||"", depart:r.depart||"" });

// ═══════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [users,setUsers]     = useState([]);
  const [rdvs,setRdvs]       = useState([]);
  const [pointages,setPointages] = useState([]);
  const [loading,setLoading] = useState(true);
  const [me,setMe]           = useState(null);
  const [view,setView]       = useState("");
  const [form,setForm]       = useState(EMPTY_RDV);
  const [editId,setEditId]   = useState(null);
  const [sel,setSel]         = useState(null);
  const [search,setSearch]   = useState(""); const [fStatut,setFStatut]=useState(""); const [fAgent,setFAgent]=useState("");
  const [toast,setToast]     = useState(null);
  const [showImport,setShowImport] = useState(false);
  const [isMob,setIsMob]     = useState(typeof window!=="undefined"&&window.innerWidth<700);

  // Resize listener
  useEffect(()=>{
    const fn=()=>setIsMob(window.innerWidth<700);
    window.addEventListener("resize",fn); return()=>window.removeEventListener("resize",fn);
  },[]);

  // Chargement initial depuis Supabase
  useEffect(()=>{
    (async()=>{
      try {
        setLoading(true);
        const [ags, lds, pts] = await Promise.all([
          db.get("agents","select=*&order=created_at.asc"),
          db.get("leads","select=*&order=created_at.desc"),
          db.get("pointages","select=*&order=date.desc"),
        ]);
        setUsers(ags.map(toAgent));
        // Purge auto "Pas intéressé" expirés
        const today = todayStr();
        const actifs = lds.filter(l => !(l.statut==="Pas intéressé" && l.suppression_date && l.suppression_date<=today));
        const expires = lds.filter(l => l.statut==="Pas intéressé" && l.suppression_date && l.suppression_date<=today);
        setRdvs(actifs.map(toLead));
        // Supprimer les expirés en base silencieusement
        expires.forEach(l => db.delete("leads", l.id).catch(()=>{}));
        setPointages(pts.map(toPtg));
      } catch(e) {
        console.error("Erreur chargement Supabase:", e);
      } finally {
        setLoading(false);
      }
    })();
  },[]);

  const showToast=(msg,type="success")=>{ setToast({msg,type}); setTimeout(()=>setToast(null),3500); };
  const isAdmin=me?.role==="admin";
  const goList=()=>{ setView(isAdmin?"all_rdvs":"my_rdvs"); setSel(null); };

  const handleLogin = async u => {
    setMe(u);
    setView(u.role==="admin"?"dashboard":"pointer");
    // Pointer arrivée auto à la connexion pour les agents
    if(u.role==="agent"){
      const today = todayStr();
      const ex = pointages.find(p=>p.agentId===u.id&&p.date===today);
      if(!ex){
        const newPtg = { id:uid(), agentId:u.id, date:today, arrivee:nowStr() };
        try {
          await db.upsert("pointages", { id:newPtg.id, agent_id:u.id, date:today, arrivee:newPtg.arrivee });
          setPointages(prev=>[...prev, newPtg]);
        } catch(e){ console.error(e); }
      }
    }
  };
  const handleLogout=()=>{ setMe(null); setView(""); setSel(null); };

  const openEdit=rdv=>{ setForm({...EMPTY_RDV,...rdv}); setEditId(rdv.id); setView("form"); };
  const addHisto=(rdv,action,detail)=>({...rdv,historique:[...(rdv.historique||[]),{date:todayStr(),userId:me.id,action,detail:detail||""}]});

  const saveRdv = async () => {
    const agentId=isAdmin?form.agentId:me.id;
    if(!form.raisonSociale||!form.siret||!agentId||!form.dateRdv){showToast("Champs requis : Société, SIRET, Agent, Date","error");return;}
    let rappelDate="", suppressionDate="";
    if(RAPPEL_DELAI[form.statut]) rappelDate=addDays(todayStr(),RAPPEL_DELAI[form.statut]);
    if(SUPPRESSION_DELAI[form.statut]) suppressionDate=addDays(todayStr(),SUPPRESSION_DELAI[form.statut]);
    const data={...form,agentId,rappelDate,suppressionDate};
    try {
      if(editId){
        const prev=rdvs.find(r=>r.id===editId); const details=[];
        if(prev.statut!==data.statut) details.push(`Statut: ${prev.statut} → ${data.statut}`);
        if(prev.raisonSociale!==data.raisonSociale) details.push("Société modifiée");
        const updated=addHisto(data,isAdmin?"Modification admin":"Modification agent",details.join(" | "));
        await db.patch("leads", editId, fromLead({...updated,id:editId}));
        setRdvs(r=>r.map(x=>x.id===editId?{...updated,id:editId}:x));
        showToast("RDV mis à jour ✓");
      } else {
        const newId=uid();
        const newRdv=addHisto({...data,id:newId},"Création du RDV","");
        await db.post("leads", fromLead(newRdv));
        setRdvs(r=>[newRdv,...r]);
        try{localStorage.removeItem(DRAFT_KEY);}catch{}
        showToast("RDV créé ✓");
      }
      setForm(EMPTY_RDV); setEditId(null); goList();
    } catch(e){ showToast("Erreur sauvegarde : "+e.message,"error"); }
  };

  const deleteRdv = async id => {
    try {
      await db.delete("leads", id);
      setRdvs(r=>r.filter(x=>x.id!==id)); goList(); showToast("RDV supprimé");
    } catch(e){ showToast("Erreur suppression","error"); }
  };

  const validateStatut = async (id,approve) => {
    const rdv = rdvs.find(x=>x.id===id);
    const updated = approve
      ? addHisto({...rdv,statut:rdv.pendingStatut,pendingStatut:""},"Statut validé",`→ ${rdv.pendingStatut}`)
      : addHisto({...rdv,pendingStatut:""},"Statut refusé","");
    try {
      await db.patch("leads", id, fromLead(updated));
      setRdvs(r=>r.map(x=>x.id===id?updated:x));
      showToast(approve?"Statut validé ✓":"Demande refusée","warn"); setSel(null);
    } catch(e){ showToast("Erreur","error"); }
  };

  const demandeStatut = async (rdvId,newS) => {
    const rdv = rdvs.find(x=>x.id===rdvId);
    const updated = addHisto({...rdv,pendingStatut:newS},"Demande de statut",`→ ${newS}`);
    try {
      await db.patch("leads", rdvId, fromLead(updated));
      setRdvs(r=>r.map(x=>x.id===rdvId?updated:x));
      showToast("Demande envoyée ✓","warn");
    } catch(e){ showToast("Erreur","error"); }
  };

  // Pointage
  const handlePointer = async (date,agentId,etape,heure) => {
    const ex = pointages.find(p=>p.agentId===agentId&&p.date===date);
    try {
      if(ex){
        await db.patch("pointages", ex.id, {[etape==="pauseDebut"?"pause_debut":etape==="pauseFin"?"pause_fin":etape]:heure});
        setPointages(prev=>prev.map(p=>p.agentId===agentId&&p.date===date?{...p,[etape]:heure}:p));
      } else {
        const newId=uid();
        await db.post("pointages", {id:newId,agent_id:agentId,date,[etape==="pauseDebut"?"pause_debut":etape==="pauseFin"?"pause_fin":etape]:heure});
        setPointages(prev=>[...prev,{id:newId,agentId,date,[etape]:heure}]);
      }
      const labels={arrivee:"Arrivée",pauseDebut:"Début pause",pauseFin:"Fin pause",depart:"Départ"};
      showToast(`${labels[etape]} — ${heure} ✓`);
    } catch(e){ showToast("Erreur pointage","error"); }
  };

  const handleModifierPointage = async (date,agentId,formData,existingId) => {
    const ex = pointages.find(p=>p.id===existingId||(p.agentId===agentId&&p.date===date));
    try {
      const dbData = { arrivee:formData.arrivee||null, pause_debut:formData.pauseDebut||null, pause_fin:formData.pauseFin||null, depart:formData.depart||null };
      if(ex){
        await db.patch("pointages", ex.id, dbData);
        setPointages(prev=>prev.map(p=>(p.id===ex.id)?{...p,...formData}:p));
      } else {
        const newId=uid();
        await db.post("pointages", {id:newId,agent_id:agentId,date,...dbData});
        setPointages(prev=>[...prev,{id:newId,agentId,date,...formData}]);
      }
      showToast("Pointage mis à jour ✓");
    } catch(e){ showToast("Erreur","error"); }
  };

  const handleSupprimerPointage = async id => {
    try {
      await db.delete("pointages", id);
      setPointages(p=>p.filter(x=>x.id!==id)); showToast("Pointage supprimé","warn");
    } catch(e){ showToast("Erreur","error"); }
  };

  const handleSetSalaire = async (agentId,salaire) => {
    try {
      await db.patch("agents", agentId, {salaire});
      setUsers(us=>us.map(u=>u.id===agentId?{...u,salaire}:u));
      showToast(`Salaire mis à jour : ${salaire}€ ✓`);
    } catch(e){ showToast("Erreur","error"); }
  };

  const handleImport = async (newLeads) => {
    const today=todayStr();
    const toInsert = newLeads.map(l=>{
      let rappelDate="", suppressionDate="";
      if(RAPPEL_DELAI[l.statut]) rappelDate=addDays(today,RAPPEL_DELAI[l.statut]);
      if(SUPPRESSION_DELAI[l.statut]) suppressionDate=addDays(today,SUPPRESSION_DELAI[l.statut]);
      return fromLead({...l,rappelDate,suppressionDate});
    });
    try {
      // Insérer par lots de 100
      for(let i=0;i<toInsert.length;i+=100){
        await db.post("leads", toInsert.slice(i,i+100));
      }
      setRdvs(prev=>[...newLeads,...prev]);
      showToast(`${newLeads.length} leads importés ✓`);
    } catch(e){ showToast("Erreur import : "+e.message,"error"); }
  };

  const pendingCount=rdvs.filter(r=>r.pendingStatut).length;
  const myRdvs=rdvs.filter(r=>isAdmin||r.agentId===me?.id);
  const filtered=myRdvs.filter(r=>{
    const q=search.toLowerCase();
    const ms=!q||r.raisonSociale?.toLowerCase().includes(q)||r.siret?.includes(q)||r.nomContact?.toLowerCase().includes(q)||r.ville?.toLowerCase().includes(q)||r.chauffageActuel?.toLowerCase().includes(q)||r.source?.toLowerCase().includes(q);
    return ms&&(!fStatut||r.statut===fStatut)&&(!fAgent||r.agentId===fAgent);
  });
  const stats={total:rdvs.length,planifies:rdvs.filter(r=>r.statut==="RDV planifié").length,signes:rdvs.filter(r=>r.statut==="Signé").length};

  const handleSetView=v=>{
    if(v==="new_rdv"){ const draft=ls(DRAFT_KEY,null); if(draft?.raisonSociale){setForm({...EMPTY_RDV,...draft});showToast("Brouillon restauré 💾","warn");}else setForm(EMPTY_RDV); setEditId(null); setView("form"); }
    else setView(v);
  };

  const gn=id=>uname(users.find(u=>u.id===id)||{prenom:id});

  if(!me) return <LoginScreen users={users} onLogin={handleLogin} loading={loading}/>;

  const renderMain=()=>{
    if(view==="pointer") return <PointageAgent me={me} pointages={pointages} onPointer={handlePointer}/>;
    if(view==="my_rdvs"||view==="all_rdvs") return null; // handled below
    if(view==="detail"&&sel){ const rdv=rdvs.find(r=>r.id===sel.id)||sel;
      return <RdvDetail rdv={rdv} agentName={gn(rdv.agentId)} canEdit={isAdmin||rdv.agentId===me.id}
        isAdmin={isAdmin} users={users} onBack={goList} onEdit={()=>openEdit(rdv)}
        onDelete={isAdmin?deleteRdv:null} onValidate={validateStatut} onDemandeStatut={demandeStatut}/>; }
    if(view==="form") return <div>
      <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:24}}>
        <button onClick={()=>{setForm(EMPTY_RDV);setEditId(null);goList();}} style={{background:"#fff",border:"1px solid #DDE3DD",borderRadius:8,padding:"8px 14px",fontSize:13,cursor:"pointer",color:"#555"}}>← Retour</button>
        <h2 style={{fontSize:20,fontWeight:800,color:"#1C1C1E",margin:0}}>{editId?"Modifier":"Nouveau"} rendez-vous</h2>
      </div>
      <RdvForm form={form} setForm={setForm} users={users} isAdmin={isAdmin} me={me} onSave={saveRdv} onCancel={()=>{setForm(EMPTY_RDV);setEditId(null);goList();}} editId={editId} allRdvs={rdvs}/>
    </div>;
    if(view==="dashboard"&&isAdmin) return <div>
      <Dashboard rdvs={rdvs} users={users} onSelectRdv={r=>{setSel(r);setView("detail");}}/>
      <div style={{marginTop:20}}>
        <button onClick={()=>setShowImport(true)} style={{background:"#1A4D2E",color:"#fff",border:"none",borderRadius:12,padding:"13px 24px",fontSize:14,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:10,boxShadow:"0 2px 8px rgba(0,0,0,0.15)"}}>
          📥 Importer des prospects aux agents
        </button>
      </div>
    </div>;
    if(view==="import"&&isAdmin){ return <div style={{maxWidth:600,margin:"0 auto"}}><h2 style={{fontSize:22,fontWeight:800,color:"#1C1C1E",margin:"0 0 20px"}}>📥 Importer des prospects</h2><div style={{background:"#fff",borderRadius:14,border:"1px solid #E4EAE4",padding:28,textAlign:"center"}}><div style={{fontSize:48,marginBottom:16}}>📂</div><div style={{fontSize:16,fontWeight:700,color:"#1A4D2E",marginBottom:8}}>Importer un fichier de leads</div><div style={{fontSize:13,color:"#888",marginBottom:20,lineHeight:1.6}}>Formats acceptés : <strong>.xlsx · .xls · .csv</strong><br/>Les leads seront assignés automatiquement à vos agents.</div><button onClick={()=>setShowImport(true)} style={{background:"#1A4D2E",color:"#fff",border:"none",borderRadius:12,padding:"14px 32px",fontSize:15,fontWeight:700,cursor:"pointer"}}>📥 Choisir un fichier</button></div></div>; }
    if(view==="agents"&&isAdmin) return <AgentsManager users={users} setUsers={setUsers} rdvs={rdvs} showToast={showToast}/>;
    if(view==="stats"&&isAdmin) return <StatsPanel rdvs={rdvs} users={users}/>;
    if(view==="kanban"||view==="my_kanban") return <div><h2 style={{fontSize:22,fontWeight:800,color:"#1C1C1E",margin:"0 0 20px"}}>{isAdmin?"Pipeline global":"Mon pipeline"}</h2><Kanban rdvs={myRdvs} users={users} onSelect={r=>{setSel(r);setView("detail");}}/></div>;
    if(view==="calendar"||view==="my_calendar") return <div><h2 style={{fontSize:22,fontWeight:800,color:"#1C1C1E",margin:"0 0 20px"}}>Calendrier</h2><Card><CalView rdvs={myRdvs} users={users} onSelect={r=>{setSel(r);setView("detail");}}/></Card></div>;
    if(view==="relances"||view==="my_relances") return <MesRelances rdvs={rdvs} users={users} onSelectRdv={r=>{setSel(r);setView("detail");}} isAdmin={isAdmin} meId={me.id}/>;
    if(view==="pointage_admin") return <AdminPointage users={users} pointages={pointages} onSetSalaire={handleSetSalaire} onSupprimerPointage={handleSupprimerPointage} onModifierPointage={handleModifierPointage}/>;
    // Liste RDV (défaut)
    return <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,gap:12,flexWrap:"wrap"}}>
        <div><h2 style={{fontSize:22,fontWeight:800,color:"#1C1C1E",margin:0}}>{isAdmin?"Tous les rendez-vous":"Mes rendez-vous"}</h2><p style={{fontSize:13,color:"#888",margin:"4px 0 0"}}>{filtered.length} résultat{filtered.length!==1?"s":""}</p></div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {isAdmin&&<button onClick={()=>setShowImport(true)} style={{background:"#1A4D2E",color:"#fff",border:"none",borderRadius:10,padding:"10px 16px",fontSize:14,fontWeight:700,cursor:"pointer"}}>📥 Importer</button>}
          {isAdmin&&<button onClick={()=>{ const h=["Date","Heure","Agent","Statut","Société","SIRET","NAF","Adresse","CP","Ville","Nom","Prénom","Poste","Tél","Email","Bâtiment","Chauffage","m²","Hauteur","Année","Facture","Source","Propriétaire","Produits","Observations","CR"]; const rows=filtered.map(r=>[r.dateRdv,r.heureRdv,gn(r.agentId),r.statut,r.raisonSociale,r.siret,r.naf,r.adresse,r.codePostal,r.ville,r.nomContact,r.prenomContact,r.poste,r.telephone,r.email,r.typeBatiment,r.chauffageActuel,r.surface,r.hauteurSous,r.anneeConstruction,r.facture,r.source,r.proprietaire,(r.produits||[]).join("|"),r.observations,r.compteRendu].map(v=>`"${(v||"").toString().replace(/"/g,'""')}"`)); const csv="\uFEFF"+[h.join(";"),...rows.map(r=>r.join(";"))].join("\n"); const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download=`CRM_${todayStr()}.csv`;a.click(); }} style={{background:"#fff",color:"#1A4D2E",border:"1px solid #2E7D52",borderRadius:10,padding:"10px 16px",fontSize:14,fontWeight:600,cursor:"pointer"}}>⬇ CSV</button>}
          <button onClick={()=>handleSetView("new_rdv")} style={{background:"#2E7D52",color:"#fff",border:"none",borderRadius:10,padding:"10px 20px",fontSize:14,fontWeight:700,cursor:"pointer"}}>＋ Nouveau RDV</button>
        </div>
      </div>
      <div style={{display:"flex",gap:10,marginBottom:18,flexWrap:"wrap"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍  Rechercher…" style={{flex:1,minWidth:200,border:"1.5px solid #DDE3DD",borderRadius:8,padding:"9px 14px",fontSize:14,background:"#fff",outline:"none"}}/>
        <select value={fStatut} onChange={e=>setFStatut(e.target.value)} style={{border:"1.5px solid #DDE3DD",borderRadius:8,padding:"9px 12px",fontSize:13,background:"#fff",color:"#444",cursor:"pointer"}}><option value="">Tous statuts</option>{STATUTS.map(s=><option key={s}>{s}</option>)}</select>
        {isAdmin&&<select value={fAgent} onChange={e=>setFAgent(e.target.value)} style={{border:"1.5px solid #DDE3DD",borderRadius:8,padding:"9px 12px",fontSize:13,background:"#fff",color:"#444",cursor:"pointer"}}><option value="">Tous agents</option>{users.filter(u=>u.role==="agent").map(a=><option key={a.id} value={a.id}>{uname(a)}</option>)}</select>}
      </div>
      <RdvTable rdvs={filtered} users={users} showAgent={isAdmin} onSelect={r=>{setSel(r);setView("detail");}} onEdit={openEdit}/>
    </div>;
  };

  return <div style={{display:"flex",minHeight:"100vh",background:"#F0F2F0",fontFamily:"'Inter',system-ui,sans-serif"}}>
    <Sidebar user={me} view={view} setView={handleSetView} stats={stats} onLogout={handleLogout} pendingCount={pendingCount}/>
    <div style={{flex:1,padding:isMob?"72px 14px 80px":"24px 28px",overflowY:"auto",maxWidth:isMob?"100vw":"calc(100vw - 210px)",boxSizing:"border-box"}}>
      {renderMain()}
    </div>
    <Toast t={toast}/>
    {showImport&&<ImportModalInline onClose={()=>setShowImport(false)} onImport={handleImport} agents={users} allLeads={rdvs}/>}
  </div>;
}

// ═══════════════════════════════════════════════════════════════
// IMPORT MODAL INTÉGRÉE (version simplifiée)
// Pour la version complète voir crm-import-module.jsx
// ═══════════════════════════════════════════════════════════════
function ImportModalInline({ onClose, onImport, agents, allLeads }) {
  const [step,setStep]=useState(1); const [rows,setRows]=useState([]); const [headers,setHeaders]=useState([]); const [mapping,setMapping]=useState({}); const [assignMode,setAssignMode]=useState("round"); const [assignAgent,setAssignAgent]=useState(""); const [doublons,setDoublons]=useState("skip"); const [fileName,setFileName]=useState(""); const [loading,setLoading]=useState(false);
  const fileRef=useRef();
  const COL_MAP_I={"raison sociale":"raisonSociale","société":"raisonSociale","company":"raisonSociale","entreprise":"raisonSociale","siret":"siret","siren":"siret","naf":"naf","ape":"naf","code naf":"naf","adresse":"adresse","code postal":"codePostal","cp":"codePostal","ville":"ville","commune":"ville","nom":"nomContact","contact":"nomContact","prénom":"prenomContact","prenom":"prenomContact","poste":"poste","fonction":"poste","téléphone":"telephone","telephone":"telephone","tel":"telephone","mobile":"telephone","email":"email","mail":"email","type bâtiment":"typeBatiment","chauffage":"chauffageActuel","chauffage actuel":"chauffageActuel","énergie":"chauffageActuel","surface":"surface","m²":"surface","m2":"surface","hauteur":"hauteurSous","année construction":"anneeConstruction","annee":"anneeConstruction","facture":"facture","source":"source","observations":"observations","notes":"observations","commentaires":"observations"};
  const FIELDS=[{v:"raisonSociale",l:"⭐ Raison sociale"},{v:"siret",l:"SIRET"},{v:"naf",l:"Code NAF"},{v:"adresse",l:"Adresse"},{v:"codePostal",l:"Code postal"},{v:"ville",l:"Ville"},{v:"nomContact",l:"Nom contact"},{v:"prenomContact",l:"Prénom contact"},{v:"poste",l:"Poste"},{v:"telephone",l:"Téléphone"},{v:"email",l:"Email"},{v:"typeBatiment",l:"Type bâtiment"},{v:"chauffageActuel",l:"Chauffage actuel"},{v:"surface",l:"Surface m²"},{v:"hauteurSous",l:"Hauteur plafond"},{v:"anneeConstruction",l:"Année construction"},{v:"facture",l:"Facture énergie"},{v:"source",l:"Source lead"},{v:"proprietaire",l:"Propriétaire"},{v:"observations",l:"Observations"},{v:"ignore",l:"— Ignorer —"}];

  const handleFile=async(e)=>{ const file=e.target.files[0]; if(!file) return; setLoading(true); setFileName(file.name);
    try {
      // Charger xlsx depuis CDN si pas déjà chargé
      if(!window.XLSX){
        await new Promise((res,rej)=>{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";s.onload=res;s.onerror=rej;document.head.appendChild(s);});
      }
      const XLSX=window.XLSX;
      const buf=await file.arrayBuffer(); const wb=XLSX.read(buf,{type:"array",cellDates:true}); const ws=wb.Sheets[wb.SheetNames[0]]; const data=XLSX.utils.sheet_to_json(ws,{header:1,defval:"",raw:false});
      if(data.length<2){alert("Fichier vide.");setLoading(false);return;}
      const hdrs=data[0].map(h=>String(h||"").trim()); const dataRows=data.slice(1).filter(r=>r.some(c=>String(c).trim()!==""));
      setHeaders(hdrs); setRows(dataRows);
      const auto={}; hdrs.forEach((h,i)=>{ const k=h.toLowerCase().trim().replace(/[_\-.]/g," "); auto[i]=COL_MAP_I[k]||"ignore"; }); setMapping(auto); setStep(2);
    } catch(err){alert("Erreur: "+err.message);}
    setLoading(false);
  };

  const doImport=()=>{
    const agentIds=agents.filter(u=>u.role==="agent").map(u=>u.id); let ri=0; const toAdd=[],toUpdate=[]; let skipped=0;
    rows.forEach(row=>{ const obj={id:uid(),createdAt:todayStr(),source:"Import fichier",statut:"À contacter",agentId:"",dateRdv:"",heureRdv:"",pendingStatut:"",rappelDate:"",suppressionDate:"",raisonSociale:"",siret:"",naf:"",adresse:"",codePostal:"",ville:"",nomContact:"",prenomContact:"",poste:"",telephone:"",email:"",typeBatiment:"",chauffageActuel:"",surface:"",hauteurSous:"",anneeConstruction:"",facture:"",source:"Import fichier",proprietaire:"",produits:[],observations:"",compteRendu:"",relances:[],historique:[]};
      headers.forEach((_,i)=>{ if(mapping[i]&&mapping[i]!=="ignore") obj[mapping[i]]=String(row[i]||"").trim(); });
      if(!obj.raisonSociale&&!obj.telephone) return;
      if(obj.siret) obj.siret=fmtSiret(obj.siret.replace(/\D/g,""));
      const cTel=obj.telephone.replace(/\D/g,""),cSiret=obj.siret.replace(/\s/g,"");
      const ex=allLeads.find(l=>(cSiret&&l.siret.replace(/\s/g,"")===cSiret)||(cTel&&l.telephone.replace(/\D/g,"")===cTel));
      if(ex){ if(doublons==="skip"){skipped++;return;} if(doublons==="update"){toUpdate.push({...ex,...obj,id:ex.id,statut:ex.statut,historique:[...(ex.historique||[]),{date:todayStr(),userId:"admin",action:"Mis à jour via import",detail:fileName}]});return;} }
      if(assignMode==="all"&&assignAgent) obj.agentId=assignAgent;
      else if(assignMode==="round"&&agentIds.length>0){obj.agentId=agentIds[ri%agentIds.length];ri++;}
      obj.historique=[{date:todayStr(),userId:"admin",action:"Importé depuis fichier",detail:fileName}];
      toAdd.push(obj);
    });
    onImport(toAdd,toUpdate,skipped); onClose();
  };

  const sc=i=>step===i+1?"#1A4D2E":step>i+1?"#2E7D52":"#E4EAE4"; const st=i=>step===i+1||step>i+1?"#fff":"#aaa";

  return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
    <div style={{background:"#fff",borderRadius:16,padding:28,maxWidth:720,width:"100%",maxHeight:"92vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}><h3 style={{margin:0,fontSize:18,fontWeight:800,color:"#1C1C1E"}}>📥 Import de leads</h3><button onClick={onClose} style={{background:"none",border:"none",fontSize:24,cursor:"pointer",color:"#aaa",lineHeight:1}}>×</button></div>
      <div style={{display:"flex",gap:6,marginBottom:24}}>{["1. Fichier","2. Colonnes","3. Options"].map((s,i)=><div key={i} style={{flex:1,textAlign:"center",padding:"8px 4px",borderRadius:8,fontSize:12,fontWeight:700,background:sc(i),color:st(i)}}>{step>i+1?"✓ ":""}{s}</div>)}</div>

      {step===1&&<div>
        <div onClick={()=>!loading&&fileRef.current.click()} style={{border:"2px dashed #2E7D52",borderRadius:14,padding:"48px 24px",textAlign:"center",cursor:"pointer",background:"#F5FBF7"}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f){const ev={target:{files:[f]}};handleFile(ev);}}}>
          {loading?<div style={{fontSize:36,marginBottom:8}}>⏳</div>:<><div style={{fontSize:48,marginBottom:12}}>📂</div><div style={{fontSize:16,fontWeight:700,color:"#1A4D2E",marginBottom:6}}>Glissez votre fichier ici ou cliquez</div><div style={{display:"flex",gap:8,justifyContent:"center",marginTop:10}}>{[".xlsx",".xls",".csv"].map(f=><span key={f} style={{background:"#E8F5EE",color:"#1A4D2E",borderRadius:20,padding:"4px 12px",fontSize:12,fontWeight:600}}>{f}</span>)}</div></>}
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{display:"none"}}/>
        </div>
        <div style={{marginTop:14,padding:"12px 14px",background:"#F5F8F5",borderRadius:8,fontSize:12,color:"#888",lineHeight:1.6}}><strong style={{color:"#1A4D2E"}}>Colonnes reconnues auto :</strong> Raison sociale · SIRET · Téléphone · Email · Ville · Chauffage · Surface · Adresse…</div>
      </div>}

      {step===2&&<div>
        <div style={{marginBottom:14,padding:"10px 14px",background:"#E8F5EE",borderRadius:8,fontSize:13,color:"#1A4D2E",fontWeight:600}}>✅ {rows.length} lignes dans <strong>{fileName}</strong></div>
        <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:360,overflowY:"auto",marginBottom:18}}>
          {headers.map((h,i)=>{ const auto=mapping[i]&&mapping[i]!=="ignore";
            return <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:auto?"#F5FBF7":"#FAFAFA",borderRadius:8,border:`1px solid ${auto?"#C8E6C9":"#E4EAE4"}`}}>
              <div style={{fontSize:13,fontWeight:600,color:"#1C1C1E",width:140,flexShrink:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{auto&&<span style={{color:"#2E7D52",marginRight:4}}>✓</span>}{h}</div>
              <span style={{color:"#bbb",fontSize:16,flexShrink:0}}>→</span>
              <select value={mapping[i]||"ignore"} onChange={e=>setMapping(m=>({...m,[i]:e.target.value}))} style={{flex:1,border:`1.5px solid ${auto?"#2E7D52":"#DDE3DD"}`,borderRadius:7,padding:"7px 10px",fontSize:13,background:"#fff",outline:"none",color:mapping[i]==="ignore"?"#999":"#1C1C1E"}}>
                {FIELDS.map(f=><option key={f.v} value={f.v}>{f.l}</option>)}
              </select>
              {rows[0]&&<span style={{fontSize:11,color:"#aaa",maxWidth:90,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flexShrink:0}}>{String(rows[0][i]||"").slice(0,16)}</span>}
            </div>;})}
        </div>
        <div style={{display:"flex",gap:10}}><button onClick={()=>setStep(3)} style={{background:"#2E7D52",color:"#fff",border:"none",borderRadius:8,padding:"11px 24px",fontSize:14,fontWeight:700,cursor:"pointer",flex:1}}>Suivant →</button><button onClick={()=>setStep(1)} style={{background:"#fff",color:"#555",border:"1px solid #DDE3DD",borderRadius:8,padding:"11px 16px",fontSize:14,cursor:"pointer"}}>← Retour</button></div>
      </div>}

      {step===3&&<div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:20,marginBottom:20}}>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:"#1A4D2E",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:10}}>👤 Assignation</div>
            {[{v:"round",l:"Répartir entre tous les agents"},{v:"all",l:"Tout à un seul agent"}].map(o=><label key={o.v} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"10px 12px",borderRadius:8,border:`1.5px solid ${assignMode===o.v?"#2E7D52":"#DDE3DD"}`,background:assignMode===o.v?"#F5FBF7":"#fff",marginBottom:8}}><input type="radio" value={o.v} checked={assignMode===o.v} onChange={()=>setAssignMode(o.v)} style={{accentColor:"#2E7D52"}}/><span style={{fontSize:13,color:"#1C1C1E"}}>{o.l}</span></label>)}
            {assignMode==="all"&&<select value={assignAgent} onChange={e=>setAssignAgent(e.target.value)} style={{border:"1.5px solid #DDE3DD",borderRadius:8,padding:"9px 12px",fontSize:14,background:"#fff",outline:"none",width:"100%"}}><option value="">— Choisir un agent —</option>{agents.filter(u=>u.role==="agent").map(a=><option key={a.id} value={a.id}>{uname(a)}</option>)}</select>}
          </div>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:"#1A4D2E",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:10}}>🔁 Doublons</div>
            {[{v:"skip",l:"Ignorer"},{v:"update",l:"Mettre à jour"},{v:"import",l:"Importer quand même"}].map(o=><label key={o.v} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"10px 12px",borderRadius:8,border:`1.5px solid ${doublons===o.v?"#2E7D52":"#DDE3DD"}`,background:doublons===o.v?"#F5FBF7":"#fff",marginBottom:8}}><input type="radio" value={o.v} checked={doublons===o.v} onChange={()=>setDoublons(o.v)} style={{accentColor:"#2E7D52"}}/><span style={{fontSize:13,color:"#1C1C1E"}}>{o.l}</span></label>)}
          </div>
        </div>
        <div style={{background:"#F5F8F5",borderRadius:8,padding:"12px 14px",marginBottom:16,fontSize:12,color:"#666",lineHeight:1.7}}><strong style={{color:"#1A4D2E"}}>⚙️ Règles auto :</strong> Pas intéressé → supprimé après 30j · Annulé → rappel 6 mois · Déjà installé → rappel 12 mois · Signé → conservé</div>
        <div style={{background:"#E8F5EE",borderRadius:8,padding:"12px",marginBottom:16,fontSize:14,color:"#1A4D2E",fontWeight:700,textAlign:"center"}}>📊 {rows.length} leads à importer</div>
        <div style={{display:"flex",gap:10}}><button onClick={doImport} style={{background:"#2E7D52",color:"#fff",border:"none",borderRadius:10,padding:"13px 28px",fontSize:15,fontWeight:700,cursor:"pointer",flex:1}}>✅ Importer {rows.length} leads</button><button onClick={()=>setStep(2)} style={{background:"#fff",color:"#555",border:"1px solid #DDE3DD",borderRadius:10,padding:"13px 16px",fontSize:14,cursor:"pointer"}}>← Retour</button></div>
      </div>}
    </div>
  </div>;
}
