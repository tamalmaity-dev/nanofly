import { useState, useEffect, useRef, useCallback } from "react"
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts"
import {
  LayoutDashboard, FolderOpen, Server, Database, Terminal, Globe, Rocket,
  Settings, Moon, Sun, Bell, Plus, Play, Square, RefreshCw, Trash2,
  AlertCircle, Zap, HardDrive, Thermometer, GitBranch, Clock, User,
  LogOut, Cpu, Wifi, CheckCircle2, XCircle, Shield, Key,
  MoreHorizontal, Activity, Download, Lock, Edit2, Copy,
  ChevronLeft, ChevronRight, Package, UploadCloud, Search,
  Eye, EyeOff, Check, X, ExternalLink
} from "lucide-react"

// ─── CSS ────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --bg:#070a12;--surf:#0d1120;--surf2:#131929;--surf3:#1a2236;
  --border:#1e2d47;--border2:#253450;
  --text:#e2eaf8;--text2:#5e7099;--text3:#2e3d58;
  --accent:#7875f8;--accent2:#06d6a0;
  --ag:rgba(120,117,248,0.18);--ag2:rgba(6,214,160,0.15);
  --green:#10d48a;--gdim:rgba(16,212,138,0.12);
  --red:#f43f5e;--rdim:rgba(244,63,94,0.12);
  --amber:#f59e0b;--adim:rgba(245,158,11,0.12);
  --blue:#38bdf8;--bdim:rgba(56,189,248,0.12);
  --font:'Poppins',sans-serif;--mono:'JetBrains Mono',monospace;
  --r:10px;--rl:14px;--t:all 0.18s ease;
}
.light{
  --bg:#eef1f9;--surf:#ffffff;--surf2:#f4f7fd;--surf3:#e8edf8;
  --border:#d8e0f0;--border2:#c8d3ea;
  --text:#0d1629;--text2:#5e7099;--text3:#a0aec0;
  --accent:#6158e8;--ag:rgba(97,88,232,0.12);
  --green:#059669;--gdim:rgba(5,150,105,0.1);
  --red:#e11d48;--rdim:rgba(225,29,72,0.1);
  --amber:#d97706;--adim:rgba(217,119,6,0.1);
}
html,body,#root{height:100%;font-family:var(--font);background:var(--bg);color:var(--text);}
::-webkit-scrollbar{width:4px;height:4px;}
::-webkit-scrollbar-track{background:transparent;}
::-webkit-scrollbar-thumb{background:var(--border2);border-radius:3px;}

/* Layout */
.app{display:flex;height:100vh;overflow:hidden;}
.sidebar{width:224px;min-width:224px;background:var(--surf);border-right:1px solid var(--border);display:flex;flex-direction:column;transition:width 0.22s ease,min-width 0.22s ease;overflow:hidden;}
.sidebar.col{width:60px;min-width:60px;}
.main{flex:1;display:flex;flex-direction:column;min-width:0;}
.topbar{height:56px;background:var(--surf);border-bottom:1px solid var(--border);display:flex;align-items:center;padding:0 20px;gap:10px;flex-shrink:0;}
.content{flex:1;overflow-y:auto;padding:28px;}

/* Sidebar */
.logo-area{padding:14px 14px 14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;min-height:56px;}
.logo-dot{width:30px;height:30px;background:linear-gradient(135deg,var(--accent),#a78bfa);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 0 18px rgba(120,117,248,0.35);}
.logo-txt{font-size:15px;font-weight:700;white-space:nowrap;letter-spacing:-0.3px;}
.logo-txt span{color:var(--accent);}
.nav{padding:10px 8px;flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:1px;}
.nav-label{font-size:9.5px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.1em;padding:10px 8px 4px;white-space:nowrap;}
.ni{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:var(--r);cursor:pointer;transition:var(--t);color:var(--text2);font-size:13px;font-weight:500;white-space:nowrap;position:relative;user-select:none;}
.ni:hover{background:var(--surf2);color:var(--text);}
.ni.on{background:var(--ag);color:var(--accent);}
.ni.on::before{content:'';position:absolute;left:0;top:18%;bottom:18%;width:3px;background:var(--accent);border-radius:0 3px 3px 0;}
.ni-icon{flex-shrink:0;width:18px;display:flex;justify-content:center;}
.ni-badge{margin-left:auto;background:var(--red);color:#fff;font-size:9.5px;font-weight:700;padding:1px 6px;border-radius:10px;}
.sidebar-foot{padding:10px 8px;border-top:1px solid var(--border);}

/* Cards */
.card{background:var(--surf);border:1px solid var(--border);border-radius:var(--rl);padding:20px;}
.card-sm{background:var(--surf);border:1px solid var(--border);border-radius:var(--r);padding:16px;}

/* Stat cards */
.stat-card{background:var(--surf);border:1px solid var(--border);border-radius:var(--rl);padding:20px;position:relative;overflow:hidden;}
.stat-card::after{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at top right,var(--glow,transparent) 0%,transparent 60%);pointer-events:none;}

/* Grids */
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;}
.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;}
.g2{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;}
.g21{display:grid;grid-template-columns:2fr 1fr;gap:16px;}

/* Badges */
.badge{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:11.5px;font-weight:500;}
.bg{background:var(--gdim);color:var(--green);}
.br{background:var(--rdim);color:var(--red);}
.ba{background:var(--adim);color:var(--amber);}
.bb{background:var(--bdim);color:var(--blue);}
.bx{background:var(--surf3);color:var(--text2);}

/* Dots */
.dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;}
.dg{background:var(--green);}
.dr{background:var(--red);}
.da{background:var(--amber);}
.dx{background:var(--text3);}
@keyframes pp{0%,100%{box-shadow:0 0 0 0 rgba(16,212,138,0.5);}70%{box-shadow:0 0 0 5px rgba(16,212,138,0);}}
.dg{animation:pp 2.2s ease infinite;}

/* Buttons */
.btn{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:var(--r);border:none;cursor:pointer;font-family:var(--font);font-size:13px;font-weight:500;transition:var(--t);text-decoration:none;}
.btn-p{background:var(--accent);color:#fff;}
.btn-p:hover{opacity:.88;transform:translateY(-1px);}
.btn-g{background:transparent;color:var(--text2);border:1px solid var(--border);}
.btn-g:hover{background:var(--surf2);color:var(--text);}
.btn-ic{padding:7px;border-radius:8px;}
.btn-d{background:var(--rdim);color:var(--red);border:1px solid rgba(244,63,94,0.2);}
.btn-d:hover{background:var(--red);color:#fff;}
.btn-s{background:var(--gdim);color:var(--green);border:1px solid rgba(16,212,138,0.2);}
.btn-s:hover{background:var(--green);color:#fff;}
.tbtn{background:transparent;border:none;padding:7px;border-radius:8px;cursor:pointer;color:var(--text2);display:flex;align-items:center;justify-content:center;transition:var(--t);}
.tbtn:hover{background:var(--surf2);color:var(--text);}

/* Tables */
.tbl{width:100%;border-collapse:collapse;}
.tbl th{text-align:left;font-size:10.5px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;padding:10px 16px;border-bottom:1px solid var(--border);}
.tbl td{padding:13px 16px;font-size:13.5px;border-bottom:1px solid var(--border);vertical-align:middle;}
.tbl tr:last-child td{border-bottom:none;}
.tbl tbody tr{transition:background .12s;}
.tbl tbody tr:hover{background:var(--surf2);}

/* Input */
.inp{background:var(--surf2);border:1px solid var(--border);border-radius:var(--r);padding:8px 12px;font-family:var(--font);font-size:13.5px;color:var(--text);width:100%;outline:none;transition:var(--t);}
.inp:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--ag);}
.inp::placeholder{color:var(--text3);}

/* Section header */
.sh{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:22px;}
.sh-l h1{font-size:19px;font-weight:600;letter-spacing:-.3px;}
.sh-l p{font-size:12.5px;color:var(--text2);margin-top:3px;}

/* Progress */
.prog{background:var(--surf3);border-radius:4px;height:5px;overflow:hidden;}
.prog-f{height:100%;border-radius:4px;transition:width .6s ease;}

/* Terminal */
.term{background:#050810;border:1px solid var(--border);border-radius:var(--rl);overflow:hidden;font-family:var(--mono);}
.term-bar{background:#0a0e1a;padding:10px 16px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border);}
.tdot{width:11px;height:11px;border-radius:50%;}
.term-body{padding:16px;font-size:13px;line-height:1.85;height:480px;overflow-y:auto;}
.t-sys{color:#3d5080;}
.t-cmd{color:#e2eaf8;}
.t-out{color:#5a7090;}
.t-ok{color:#10d48a;}
.t-err{color:#f43f5e;}
.t-prompt{color:var(--accent);}
@keyframes blink{0%,100%{opacity:1;}50%{opacity:0;}}
.cursor{display:inline-block;width:7px;height:14px;background:var(--accent);vertical-align:middle;animation:blink 1.1s step-end infinite;border-radius:1px;}

/* Toggle */
.tgl{position:relative;width:40px;height:22px;cursor:pointer;}
.tgl input{opacity:0;width:0;height:0;position:absolute;}
.tgl-s{position:absolute;inset:0;background:var(--surf3);border-radius:11px;transition:.25s;}
.tgl-s:before{content:'';position:absolute;height:16px;width:16px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:.25s;}
.tgl input:checked+.tgl-s{background:var(--accent);}
.tgl input:checked+.tgl-s:before{transform:translateX(18px);}

/* Animations */
@keyframes fu{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
.fu{animation:fu .28s ease forwards;}

/* Deploy timeline */
.dep-item{display:flex;gap:14px;padding:14px 0;border-bottom:1px solid var(--border);}
.dep-item:last-child{border-bottom:none;}
.dep-icon{width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}

/* Project card */
.proj-card{background:var(--surf);border:1px solid var(--border);border-radius:var(--rl);padding:20px;cursor:pointer;transition:var(--t);position:relative;overflow:hidden;border-left-width:3px;}
.proj-card:hover{transform:translateY(-2px);box-shadow:0 8px 32px rgba(0,0,0,0.25);}

/* DB cards */
.db-card{background:var(--surf);border:1px solid var(--border);border-radius:var(--rl);padding:20px;display:flex;flex-direction:column;gap:14px;}

/* Divider */
.div{height:1px;background:var(--border);margin:20px 0;}

/* Tag */
.tag{display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:500;}
`

// ─── Mock data ───────────────────────────────────────────────────────────────
const genNet = (n=30) => Array.from({length:n},(_,i)=>({t:i,rx:Math.floor(Math.random()*180+20),tx:Math.floor(Math.random()*100+10)}))

const PROJECTS = [
  {id:1,name:"Production",desc:"Main website + API backend",services:5,deploys:48,status:"healthy",ago:"2 min ago",color:"#7875f8"},
  {id:2,name:"Staging",desc:"Testing & QA environment",services:3,deploys:12,status:"healthy",ago:"1 hr ago",color:"#06d6a0"},
  {id:3,name:"Internal Tools",desc:"Admin dashboard & workers",services:2,deploys:7,status:"warning",ago:"3 days ago",color:"#f59e0b"},
]

const SERVICES = [
  {id:1,name:"nginx",proj:"Production",type:"docker",status:"running",port:80,up:"14d 3h",cpu:0.3,ram:48,img:"nginx:alpine"},
  {id:2,name:"api-server",proj:"Production",type:"git",status:"running",port:3000,up:"5d 12h",cpu:2.4,ram:134,img:"node:18"},
  {id:3,name:"worker",proj:"Production",type:"git",status:"running",port:null,up:"5d 12h",cpu:0.9,ram:72,img:"node:18"},
  {id:4,name:"frontend",proj:"Staging",type:"git",status:"stopped",port:5173,up:"--",cpu:0,ram:0,img:"node:20"},
  {id:5,name:"api-staging",proj:"Staging",type:"git",status:"error",port:3001,up:"--",cpu:0,ram:0,img:"node:18"},
  {id:6,name:"redis",proj:"Production",type:"docker",status:"running",port:6379,up:"30d",cpu:0.1,ram:12,img:"redis:7"},
]

const DBS = [
  {name:"PostgreSQL",slug:"postgres",logo:"🐘",ver:"16.3",status:"running",port:5432,ram:"62 MB",size:"420 MB",color:"#336791"},
  {name:"Redis",slug:"redis",logo:"⚡",ver:"7.2",status:"running",port:6379,ram:"12 MB",size:"48 MB",color:"#d82c20"},
  {name:"MySQL",slug:"mysql",logo:"🐬",ver:"8.3",status:"stopped",port:3306,ram:"0 MB",size:"280 MB",color:"#00758f"},
]

const DB_AVAIL = [
  {name:"MongoDB",logo:"🍃",ver:"7.0",desc:"Document database"},
  {name:"MariaDB",logo:"🦭",ver:"11.3",desc:"MySQL fork"},
  {name:"SQLite",logo:"🪶",ver:"3.45",desc:"Embedded database"},
]

const DOMAINS = [
  {id:1,domain:"myapp.com",svc:"nginx",proj:"Production",ssl:"active",proxy:"localhost:80",ago:"5 days ago"},
  {id:2,domain:"api.myapp.com",svc:"api-server",proj:"Production",ssl:"active",proxy:"localhost:3000",ago:"5 days ago"},
  {id:3,domain:"staging.myapp.com",svc:"frontend",proj:"Staging",ssl:"pending",proxy:"localhost:5173",ago:"2 hours ago"},
  {id:4,domain:"tools.internal.com",svc:"api-staging",proj:"Internal Tools",ssl:"error",proxy:"localhost:3001",ago:"1 day ago"},
]

const DEPLOYS = [
  {id:1,svc:"api-server",proj:"Production",status:"success",sha:"a3f8c21",msg:"feat: add webhook signature verify",who:"you",ago:"2 min ago",dur:"43s"},
  {id:2,svc:"frontend",proj:"Staging",status:"running",sha:"b19e554",msg:"fix: dark mode toggle flash",who:"you",ago:"8 min ago",dur:"--"},
  {id:3,svc:"worker",proj:"Production",status:"success",sha:"d74ab33",msg:"chore: update deps",who:"you",ago:"1 hr ago",dur:"31s"},
  {id:4,svc:"api-server",proj:"Production",status:"failed",sha:"c22f091",msg:"refactor: move auth to middleware",who:"you",ago:"2 hr ago",dur:"12s"},
  {id:5,svc:"nginx",proj:"Production",status:"success",sha:"f01b834",msg:"fix: cors headers for cdn",who:"you",ago:"1 day ago",dur:"18s"},
]

const CMD_RESPONSES = {
  help:["Available commands:","  ls, pwd, cat, ps, df -h, free -h, uptime, ping, clear","","Type any command to run it on the server."],
  pwd:["/home/paneld"],
  ls:["api-server/  frontend/  worker/  nginx.conf  .env  logs/  backups/"],
  "ls -la":["total 72","drwxr-xr-x  6 paneld paneld 4096 Jan 15 10:22 .","drwxr-xr-x 12 paneld paneld 4096 Jan  8 09:11 ..","drwxr-xr-x  8 paneld paneld 4096 Jan 15 09:45 api-server","drwxr-xr-x  5 paneld paneld 4096 Jan 14 17:30 frontend","-rw-------  1 paneld paneld  240 Jan 15 08:12 .env","-rw-r--r--  1 paneld paneld 1243 Jan 12 14:55 nginx.conf","drwxr-xr-x  2 paneld paneld 4096 Jan 15 10:22 logs"],
  uptime:[" 10:22:14 up 14 days,  3:14,  1 user,  load average: 0.42, 0.38, 0.35"],
  "free -h":["               total        used        free      shared  buff/cache   available","Mem:           7.7Gi       2.1Gi       3.2Gi        45Mi       2.3Gi       5.3Gi","Swap:          1.0Gi          0B       1.0Gi"],
  "df -h":["Filesystem      Size  Used Avail Use% Mounted on","/dev/mmcblk0p2   59G   28G   29G  49% /","tmpfs           3.9G  180K  3.9G   1% /run","tmpfs           3.9G     0  3.9G   0% /sys/fs/cgroup"],
  "ps aux":["USER       PID %CPU %MEM COMMAND","root         1  0.0  0.1 /sbin/init","paneld     823  0.2  1.2 paneld --config /etc/paneld/paneld.yaml","nginx      910  0.3  0.5 nginx: master process /etc/nginx/nginx.conf","node      1234  2.1  3.4 node /app/api-server/dist/index.js","redis     1455  0.1  0.2 redis-server *:6379"],
  "ping google.com":["PING google.com (142.250.180.46): 56 data bytes","64 bytes from 142.250.180.46: icmp_seq=0 ttl=117 time=12.4 ms","64 bytes from 142.250.180.46: icmp_seq=1 ttl=117 time=11.9 ms","--- google.com ping statistics ---","2 packets transmitted, 2 received, 0% packet loss"],
  clear:["__clear__"],
}

// ─── Small helpers ───────────────────────────────────────────────────────────
const StatusBadge = ({s}) => {
  if (s==="running"||s==="healthy"||s==="active"||s==="success") return <span className="badge bg"><span className="dot dg"/>{{running:"Running",healthy:"Healthy",active:"Active",success:"Success"}[s]||s}</span>
  if (s==="error"||s==="failed") return <span className="badge br"><span className="dot dr"/>{{error:"Error",failed:"Failed"}[s]||s}</span>
  if (s==="warning"||s==="pending") return <span className="badge ba"><span className="dot da"/>{{warning:"Warning",pending:"Pending"}[s]||s}</span>
  if (s==="running_deploy") return <span className="badge bb"><span className="dot" style={{background:"var(--blue)"}}/>Deploying</span>
  return <span className="badge bx"><span className="dot dx"/>{s==="stopped"?"Stopped":s}</span>
}

const TypeTag = ({t}) => {
  const m = {git:{c:"var(--ag)",tc:"var(--accent)",l:"Git"},docker:{c:"var(--bdim)",tc:"var(--blue)",l:"Docker"}}
  const x = m[t]||{c:"var(--surf3)",tc:"var(--text2)",l:t}
  return <span className="tag" style={{background:x.c,color:x.tc}}>{x.l}</span>
}

const MetricRing = ({pct,label,color,sub,icon:Icon}) => {
  const r=40, circ=2*Math.PI*r, offset=circ-(Math.min(pct,100)/100)*circ
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
      <div style={{position:"relative",width:104,height:104}}>
        <svg width="104" height="104" viewBox="0 0 104 104">
          <circle cx="52" cy="52" r={r} fill="none" stroke="var(--surf3)" strokeWidth="8"/>
          <circle cx="52" cy="52" r={r} fill="none" stroke={color} strokeWidth="8"
            strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
            style={{transform:"rotate(-90deg)",transformOrigin:"50% 50%",transition:"stroke-dashoffset 1s ease"}}/>
        </svg>
        <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1}}>
          {Icon && <Icon size={14} style={{color}} />}
          <span style={{fontSize:17,fontWeight:700,lineHeight:1,color:"var(--text)"}}>{Math.round(pct)}<span style={{fontSize:11,color:"var(--text2)"}}>%</span></span>
        </div>
      </div>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>{label}</div>
        <div style={{fontSize:11.5,color:"var(--text2)",marginTop:2}}>{sub}</div>
      </div>
    </div>
  )
}

const TempCard = ({val}) => (
  <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
    <div style={{width:104,height:104,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:`radial-gradient(circle,${val>70?"var(--rdim)":val>55?"var(--adim)":"var(--gdim)"} 0%,transparent 70%)`,borderRadius:"50%",border:`2px solid ${val>70?"var(--red)":val>55?"var(--amber)":"var(--green)"}22`}}>
      <Thermometer size={22} style={{color:val>70?"var(--red)":val>55?"var(--amber)":"var(--green)"}}/>
      <span style={{fontSize:20,fontWeight:700,color:"var(--text)",lineHeight:1.1}}>{val}°</span>
      <span style={{fontSize:10,color:"var(--text2)"}}>C</span>
    </div>
    <div style={{textAlign:"center"}}>
      <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>Temp</div>
      <div style={{fontSize:11.5,color:val>70?"var(--red)":val>55?"var(--amber)":"var(--green)",marginTop:2}}>{val>70?"Critical":val>55?"Warm":"Normal"}</div>
    </div>
  </div>
)

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard() {
  const [net, setNet] = useState(genNet)
  useEffect(() => {
    const id = setInterval(() => setNet(d => {
      const n = [...d.slice(1), {t:d[d.length-1].t+1, rx:Math.floor(Math.random()*180+20), tx:Math.floor(Math.random()*100+10)}]
      return n
    }), 1800)
    return () => clearInterval(id)
  }, [])
  const metrics = [{pct:34,label:"CPU",sub:"0.42 load avg",color:"var(--accent)",icon:Cpu},{pct:42,label:"RAM",sub:"3.4 / 8 GB",color:"var(--green)",icon:null},{pct:49,label:"Disk",sub:"28 / 57 GB",color:"var(--amber)",icon:HardDrive}]
  return (
    <div className="fu">
      <div className="sh">
        <div className="sh-l"><h1>Dashboard</h1><p>System overview — pi-production</p></div>
        <span className="badge bg" style={{fontSize:12}}><span className="dot dg"/>All systems operational</span>
      </div>
      {/* Metric row */}
      <div className="g4" style={{marginBottom:20}}>
        {metrics.map(m=>(
          <div key={m.label} className="stat-card" style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"24px 16px"}}>
            <MetricRing {...m}/>
          </div>
        ))}
        <div className="stat-card" style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"24px 16px"}}>
          <TempCard val={52}/>
        </div>
      </div>
      {/* Network + Activity */}
      <div className="g21" style={{marginBottom:20}}>
        <div className="card">
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <div>
              <div style={{fontWeight:600,fontSize:14}}>Network I/O</div>
              <div style={{fontSize:11.5,color:"var(--text2)",marginTop:2}}>eth0 · live stream</div>
            </div>
            <div style={{display:"flex",gap:16}}>
              <span style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:"var(--accent)"}}><span style={{width:8,height:2,background:"var(--accent)",borderRadius:2,display:"inline-block"}}/>RX</span>
              <span style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:"var(--green)"}}><span style={{width:8,height:2,background:"var(--green)",borderRadius:2,display:"inline-block"}}/>TX</span>
            </div>
          </div>
          <div style={{height:140}}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={net} margin={{top:4,right:4,left:-20,bottom:0}}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#7875f8" stopOpacity={0.25}/><stop offset="95%" stopColor="#7875f8" stopOpacity={0}/></linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10d48a" stopOpacity={0.25}/><stop offset="95%" stopColor="#10d48a" stopOpacity={0}/></linearGradient>
                </defs>
                <Area type="monotone" dataKey="rx" stroke="#7875f8" fill="url(#g1)" strokeWidth={2} dot={false} isAnimationActive={false}/>
                <Area type="monotone" dataKey="tx" stroke="#10d48a" fill="url(#g2)" strokeWidth={2} dot={false} isAnimationActive={false}/>
                <Tooltip contentStyle={{background:"var(--surf2)",border:"1px solid var(--border)",borderRadius:8,fontSize:12,fontFamily:"var(--font)",color:"var(--text)"}} labelFormatter={()=>""} formatter={(v,k)=>[`${v} KB/s`,k==="rx"?"Download":"Upload"]}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div style={{display:"flex",gap:24,marginTop:12,paddingTop:12,borderTop:"1px solid var(--border)"}}>
            {[["↓ Avg","89 KB/s"],["↑ Avg","48 KB/s"],["Peak","312 KB/s"],["Today","4.2 GB"]].map(([k,v])=>(
              <div key={k}><div style={{fontSize:10.5,color:"var(--text3)",fontWeight:600,textTransform:"uppercase",letterSpacing:".05em"}}>{k}</div><div style={{fontSize:14,fontWeight:600,marginTop:3}}>{v}</div></div>
            ))}
          </div>
        </div>
        <div className="card">
          <div style={{fontWeight:600,fontSize:14,marginBottom:14}}>Quick Status</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {[["Running services","4",true],["Stopped","2",false],["Active domains","2",true],["Pending SSL","1",false]].map(([l,v,ok])=>(
              <div key={l} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:"var(--surf2)",borderRadius:var(r)=10}}>
                <span style={{fontSize:13,color:"var(--text2)"}}>{l}</span>
                <span style={{fontSize:15,fontWeight:700,color:ok?"var(--green)":"var(--amber)"}}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Recent deploys */}
      <div className="card">
        <div style={{fontWeight:600,fontSize:14,marginBottom:14}}>Recent Deployments</div>
        {DEPLOYS.slice(0,4).map(d=>(
          <div key={d.id} className="dep-item">
            <div className="dep-icon" style={{background:d.status==="success"?"var(--gdim)":d.status==="failed"?"var(--rdim)":"var(--bdim)"}}>
              {d.status==="success"?<CheckCircle2 size={16} color="var(--green)"/>:d.status==="failed"?<XCircle size={16} color="var(--red)"/>:<RefreshCw size={16} color="var(--blue)" style={{animation:"spin 1.2s linear infinite"}}/>}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                <span style={{fontWeight:600,fontSize:13.5}}>{d.svc}</span>
                <code style={{fontSize:11,background:"var(--surf3)",padding:"1px 6px",borderRadius:4,color:"var(--text2)",fontFamily:"var(--mono)"}}>{d.sha}</code>
              </div>
              <div style={{fontSize:12.5,color:"var(--text2)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.msg}</div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontSize:11.5,color:"var(--text2)"}}>{d.ago}</div>
              {d.dur!=="--"&&<div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>⏱ {d.dur}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Projects ─────────────────────────────────────────────────────────────────
function Projects() {
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState("")
  return (
    <div className="fu">
      <div className="sh">
        <div className="sh-l"><h1>Projects</h1><p>Isolated workspaces for your applications</p></div>
        <button className="btn btn-p" onClick={()=>setShowNew(s=>!s)}><Plus size={15}/>New Project</button>
      </div>
      {showNew&&(
        <div className="card" style={{marginBottom:20,border:"1px solid var(--accent)"}}>
          <div style={{fontWeight:600,marginBottom:14}}>Create Project</div>
          <div style={{display:"flex",gap:10}}>
            <input className="inp" placeholder="Project name (e.g. My API)" value={newName} onChange={e=>setNewName(e.target.value)}/>
            <input className="inp" placeholder="Description (optional)"/>
            <button className="btn btn-p" style={{flexShrink:0}} onClick={()=>{setShowNew(false);setNewName("")}}><Check size={15}/>Create</button>
            <button className="btn btn-g" style={{flexShrink:0}} onClick={()=>setShowNew(false)}><X size={15}/></button>
          </div>
        </div>
      )}
      <div className="g3">
        {PROJECTS.map(p=>(
          <div key={p.id} className="proj-card" style={{borderLeftColor:p.color}}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:12}}>
              <div>
                <div style={{fontWeight:600,fontSize:15}}>{p.name}</div>
                <div style={{fontSize:12.5,color:"var(--text2)",marginTop:3}}>{p.desc}</div>
              </div>
              <StatusBadge s={p.status}/>
            </div>
            <div style={{display:"flex",gap:18,margin:"14px 0",paddingTop:14,borderTop:"1px solid var(--border)"}}>
              <div><div style={{fontSize:10.5,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em"}}>Services</div><div style={{fontSize:18,fontWeight:700,marginTop:2}}>{p.services}</div></div>
              <div><div style={{fontSize:10.5,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em"}}>Deploys</div><div style={{fontSize:18,fontWeight:700,marginTop:2}}>{p.deploys}</div></div>
              <div style={{marginLeft:"auto",textAlign:"right"}}><div style={{fontSize:10.5,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em"}}>Last deploy</div><div style={{fontSize:12,fontWeight:500,color:"var(--text2)",marginTop:2}}>{p.ago}</div></div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button className="btn btn-g" style={{fontSize:12,padding:"5px 12px",flex:1}}><Server size={13}/>Services</button>
              <button className="btn btn-g" style={{fontSize:12,padding:"5px 12px",flex:1}}><Rocket size={13}/>Deploys</button>
              <button className="tbtn" style={{marginLeft:"auto"}}><MoreHorizontal size={15}/></button>
            </div>
          </div>
        ))}
        <div onClick={()=>setShowNew(true)} style={{background:"var(--surf)",border:"2px dashed var(--border)",borderRadius:"var(--rl)",padding:20,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,cursor:"pointer",transition:"var(--t)",color:"var(--text3)",minHeight:180}} onMouseEnter={e=>e.currentTarget.style.borderColor="var(--accent)"} onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border)"}>
          <Plus size={28} style={{color:"var(--text3)"}}/>
          <span style={{fontSize:13,fontWeight:500}}>New Project</span>
        </div>
      </div>
    </div>
  )
}

// ─── Services ─────────────────────────────────────────────────────────────────
function Services() {
  const [services, setServices] = useState(SERVICES)
  const toggle = (id) => setServices(s=>s.map(x=>x.id===id?{...x,status:x.status==="running"?"stopped":"running"}:x))
  return (
    <div className="fu">
      <div className="sh">
        <div className="sh-l"><h1>Services</h1><p>All running and stopped services</p></div>
        <button className="btn btn-p"><Plus size={15}/>New Service</button>
      </div>
      <div className="card" style={{padding:0,overflow:"hidden"}}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Service</th><th>Project</th><th>Type</th><th>Status</th>
              <th>Port</th><th>CPU</th><th>RAM</th><th>Uptime</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {services.map(s=>(
              <tr key={s.id}>
                <td style={{fontWeight:600}}>{s.name}</td>
                <td><span style={{fontSize:12.5,color:"var(--text2)"}}>{s.proj}</span></td>
                <td><TypeTag t={s.type}/></td>
                <td><StatusBadge s={s.status}/></td>
                <td><code style={{fontSize:12,fontFamily:"var(--mono)",color:"var(--accent)"}}>{s.port||"—"}</code></td>
                <td>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div className="prog" style={{width:48}}><div className="prog-f" style={{width:`${Math.min(s.cpu*20,100)}%`,background:"var(--accent)"}}/></div>
                    <span style={{fontSize:12,color:"var(--text2)"}}>{s.cpu}%</span>
                  </div>
                </td>
                <td>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div className="prog" style={{width:48}}><div className="prog-f" style={{width:`${Math.min((s.ram/256)*100,100)}%`,background:"var(--green)"}}/></div>
                    <span style={{fontSize:12,color:"var(--text2)"}}>{s.ram}M</span>
                  </div>
                </td>
                <td style={{fontSize:12.5,color:"var(--text2)"}}>{s.up}</td>
                <td>
                  <div style={{display:"flex",gap:4}}>
                    <button className="tbtn" title={s.status==="running"?"Stop":"Start"} onClick={()=>toggle(s.id)} style={{color:s.status==="running"?"var(--red)":"var(--green)"}}>
                      {s.status==="running"?<Square size={14}/>:<Play size={14}/>}
                    </button>
                    <button className="tbtn" title="Restart"><RefreshCw size={14}/></button>
                    <button className="tbtn" title="Logs"><Activity size={14}/></button>
                    <button className="tbtn" title="Settings"><Settings size={14}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Databases ────────────────────────────────────────────────────────────────
function Databases() {
  const [dbs, setDbs] = useState(DBS)
  const toggle = (i) => setDbs(d=>d.map((x,j)=>j===i?{...x,status:x.status==="running"?"stopped":"running"}:x))
  return (
    <div className="fu">
      <div className="sh"><div className="sh-l"><h1>Databases</h1><p>Managed database instances</p></div></div>
      <h2 style={{fontSize:13,fontWeight:700,color:"var(--text2)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:12}}>Installed</h2>
      <div className="g3" style={{marginBottom:28}}>
        {dbs.map((d,i)=>(
          <div key={d.slug} className="db-card">
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:42,height:42,borderRadius:10,background:`${d.color}22`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{d.logo}</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:15}}>{d.name}</div>
                <div style={{fontSize:12,color:"var(--text2)"}}>v{d.ver}</div>
              </div>
              <StatusBadge s={d.status}/>
            </div>
            <div style={{display:"flex",gap:16,paddingTop:12,borderTop:"1px solid var(--border)"}}>
              {[["Port",<code style={{fontFamily:"var(--mono)",color:"var(--accent)",fontSize:12}}>{d.port}</code>],["RAM",d.ram],["Size",d.size]].map(([k,v])=>(
                <div key={k}><div style={{fontSize:10.5,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em"}}>{k}</div><div style={{fontSize:13,fontWeight:500,marginTop:3}}>{v}</div></div>
              ))}
            </div>
            <div style={{display:"flex",gap:8}}>
              <button className="btn btn-g" style={{fontSize:12,flex:1}}><Key size={13}/>Credentials</button>
              <button className={`btn ${d.status==="running"?"btn-d":"btn-s"}`} style={{fontSize:12}} onClick={()=>toggle(i)}>
                {d.status==="running"?<><Square size={13}/>Stop</>:<><Play size={13}/>Start</>}
              </button>
              <button className="tbtn"><Trash2 size={14}/></button>
            </div>
          </div>
        ))}
      </div>
      <h2 style={{fontSize:13,fontWeight:700,color:"var(--text2)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:12}}>Available to Install</h2>
      <div className="g3">
        {DB_AVAIL.map(d=>(
          <div key={d.name} className="db-card" style={{flexDirection:"row",alignItems:"center",gap:14,padding:"16px 20px"}}>
            <div style={{width:38,height:38,borderRadius:9,background:"var(--surf3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{d.logo}</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:600,fontSize:14}}>{d.name} <span style={{fontSize:11.5,color:"var(--text2)",fontWeight:400}}>v{d.ver}</span></div>
              <div style={{fontSize:12,color:"var(--text2)"}}>{d.desc}</div>
            </div>
            <button className="btn btn-p" style={{fontSize:12,padding:"6px 12px",flexShrink:0}}><Download size={13}/>Install</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Terminal ─────────────────────────────────────────────────────────────────
function TerminalView() {
  const [history, setHistory] = useState([
    {type:"sys",text:"paneld shell — connected to pi-production (localhost)"},
    {type:"sys",text:'Type "help" for available commands. Ctrl+C to interrupt.'},
  ])
  const [input, setInput] = useState("")
  const [cmdHist, setCmdHist] = useState([])
  const [hIdx, setHIdx] = useState(-1)
  const bodyRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(()=>{
    if(bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  },[history])

  const run = () => {
    const cmd = input.trim()
    if(!cmd) return
    const resp = CMD_RESPONSES[cmd]
    setHistory(h=>{
      const next=[...h,{type:"cmd",text:cmd}]
      if(resp){
        if(resp[0]==="__clear__") return []
        resp.forEach(l=>next.push({type:"out",text:l}))
      } else {
        next.push({type:"err",text:`bash: ${cmd}: command not found`})
      }
      return next
    })
    setCmdHist(h=>[cmd,...h.slice(0,49)])
    setHIdx(-1)
    setInput("")
  }

  const onKey = (e) => {
    if(e.key==="Enter"){run();return}
    if(e.key==="ArrowUp"){e.preventDefault();const ni=Math.min(hIdx+1,cmdHist.length-1);setHIdx(ni);setInput(cmdHist[ni]||"");return}
    if(e.key==="ArrowDown"){e.preventDefault();const ni=Math.max(hIdx-1,-1);setHIdx(ni);setInput(ni===-1?"":cmdHist[ni]||"");return}
  }

  return (
    <div className="fu">
      <div className="sh"><div className="sh-l"><h1>Terminal</h1><p>Direct shell access to pi-production</p></div>
        <div style={{display:"flex",gap:8}}>
          <span className="badge bb"><Lock size={11}/>Encrypted</span>
          <span className="badge bg"><span className="dot dg"/>Connected</span>
        </div>
      </div>
      <div className="term">
        <div className="term-bar">
          <div className="tdot" style={{background:"#ff5f56"}}/>
          <div className="tdot" style={{background:"#ffbd2e"}}/>
          <div className="tdot" style={{background:"#27c93f"}}/>
          <span style={{marginLeft:8,fontSize:12.5,color:"var(--text2)",fontFamily:"var(--mono)"}}>pi-production — bash</span>
          <button className="tbtn" style={{marginLeft:"auto",fontSize:12}} onClick={()=>setHistory([])}><RefreshCw size={13}/></button>
        </div>
        <div className="term-body" ref={bodyRef} onClick={()=>inputRef.current?.focus()}>
          {history.map((l,i)=>(
            <div key={i}>
              {l.type==="sys"&&<div className="t-sys"># {l.text}</div>}
              {l.type==="cmd"&&<div><span className="t-prompt">paneld@pi-production</span><span style={{color:"var(--text3)"}}>:~$ </span><span className="t-cmd">{l.text}</span></div>}
              {l.type==="out"&&<div className="t-out">{l.text}</div>}
              {l.type==="err"&&<div className="t-err">{l.text}</div>}
              {l.type==="ok"&&<div className="t-ok">{l.text}</div>}
            </div>
          ))}
          <div style={{display:"flex",alignItems:"center"}}>
            <span className="t-prompt">paneld@pi-production</span>
            <span style={{color:"var(--text3)"}}>:~$ </span>
            <span className="t-cmd">{input}</span>
            <span className="cursor"/>
          </div>
          <input ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={onKey}
            style={{position:"absolute",opacity:0,width:1,height:1,pointerEvents:"none"}} autoFocus/>
        </div>
      </div>
      <div style={{marginTop:14,display:"flex",gap:8,flexWrap:"wrap"}}>
        {["uptime","df -h","free -h","ps aux","ls -la","clear"].map(c=>(
          <button key={c} className="btn btn-g" style={{fontSize:12,padding:"5px 12px",fontFamily:"var(--mono)"}} onClick={()=>{setInput(c);inputRef.current?.focus()}}>{c}</button>
        ))}
      </div>
    </div>
  )
}

// ─── Domains ─────────────────────────────────────────────────────────────────
function Domains() {
  const [showAdd, setShowAdd] = useState(false)
  return (
    <div className="fu">
      <div className="sh">
        <div className="sh-l"><h1>Domains</h1><p>Custom domains with automatic HTTPS via Let's Encrypt</p></div>
        <button className="btn btn-p" onClick={()=>setShowAdd(s=>!s)}><Plus size={15}/>Add Domain</button>
      </div>
      {showAdd&&(
        <div className="card" style={{marginBottom:20,border:"1px solid var(--accent)"}}>
          <div style={{fontWeight:600,marginBottom:14,display:"flex",alignItems:"center",gap:8}}><Globe size={16} color="var(--accent)"/>Add Domain</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto auto",gap:10,alignItems:"end"}}>
            <div><label style={{fontSize:12,color:"var(--text2)",fontWeight:500,display:"block",marginBottom:6}}>Domain name</label><input className="inp" placeholder="myapp.com"/></div>
            <div><label style={{fontSize:12,color:"var(--text2)",fontWeight:500,display:"block",marginBottom:6}}>Target service</label>
              <select className="inp" style={{cursor:"pointer"}}><option>nginx (port 80)</option><option>api-server (port 3000)</option></select>
            </div>
            <button className="btn btn-p" style={{alignSelf:"end"}} onClick={()=>setShowAdd(false)}><Check size={15}/>Add &amp; Secure</button>
            <button className="btn btn-g" style={{alignSelf:"end"}} onClick={()=>setShowAdd(false)}><X size={15}/></button>
          </div>
          <div style={{marginTop:12,padding:"10px 14px",background:"var(--gdim)",borderRadius:8,fontSize:12.5,color:"var(--green)"}}>
            ✓ Point an A record to <strong>your-server-ip</strong> first, then click Add &amp; Secure — HTTPS will be live in ~10 seconds.
          </div>
        </div>
      )}
      <div className="card" style={{padding:0,overflow:"hidden"}}>
        <table className="tbl">
          <thead><tr><th>Domain</th><th>Service</th><th>Project</th><th>SSL Status</th><th>Proxy Target</th><th>Added</th><th>Actions</th></tr></thead>
          <tbody>
            {DOMAINS.map(d=>(
              <tr key={d.id}>
                <td>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <Globe size={14} style={{color:"var(--text3)",flexShrink:0}}/>
                    <span style={{fontWeight:500}}>{d.domain}</span>
                    <a href="#" style={{color:"var(--text3)",display:"flex"}}><ExternalLink size={12}/></a>
                  </div>
                </td>
                <td><span style={{fontSize:12.5,color:"var(--accent)"}}>{d.svc}</span></td>
                <td><span style={{fontSize:12.5,color:"var(--text2)"}}>{d.proj}</span></td>
                <td>
                  {d.ssl==="active"&&<span className="badge bg"><Lock size={11}/>HTTPS Active</span>}
                  {d.ssl==="pending"&&<span className="badge ba"><RefreshCw size={11}/>Provisioning</span>}
                  {d.ssl==="error"&&<span className="badge br"><AlertCircle size={11}/>SSL Error</span>}
                </td>
                <td><code style={{fontSize:12,fontFamily:"var(--mono)",color:"var(--text2)"}}>{d.proxy}</code></td>
                <td style={{fontSize:12.5,color:"var(--text2)"}}>{d.ago}</td>
                <td>
                  <div style={{display:"flex",gap:4}}>
                    <button className="tbtn" title="Edit"><Edit2 size={14}/></button>
                    <button className="tbtn" title="Remove" style={{color:"var(--red)"}}><Trash2 size={14}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Deployments ─────────────────────────────────────────────────────────────
function Deployments() {
  const [filter, setFilter] = useState("all")
  const filtered = filter==="all"?DEPLOYS:DEPLOYS.filter(d=>d.status===filter)
  return (
    <div className="fu">
      <div className="sh"><div className="sh-l"><h1>Deployments</h1><p>Build &amp; deploy history across all projects</p></div></div>
      <div style={{display:"flex",gap:8,marginBottom:18}}>
        {["all","success","running","failed"].map(f=>(
          <button key={f} className={`btn ${filter===f?"btn-p":"btn-g"}`} style={{fontSize:12,padding:"5px 14px",textTransform:"capitalize"}} onClick={()=>setFilter(f)}>{f}</button>
        ))}
      </div>
      <div className="card">
        {filtered.map((d,i)=>(
          <div key={d.id} className="dep-item">
            <div className="dep-icon" style={{background:d.status==="success"?"var(--gdim)":d.status==="failed"?"var(--rdim)":d.status==="running"?"var(--bdim)":"var(--surf3)"}}>
              {d.status==="success"?<CheckCircle2 size={16} color="var(--green)"/>:d.status==="failed"?<XCircle size={16} color="var(--red)"/>:<Loader2 size={16} color="var(--blue)" style={{animation:"spin 1.2s linear infinite"}}/>}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4}}>
                <span style={{fontWeight:600,fontSize:14}}>{d.svc}</span>
                <span style={{fontSize:12,color:"var(--text3)"}}>in</span>
                <span style={{fontSize:12.5,color:"var(--text2)"}}>{d.proj}</span>
                <code style={{fontSize:11,background:"var(--surf3)",padding:"2px 7px",borderRadius:5,color:"var(--text2)",fontFamily:"var(--mono)"}}>{d.sha}</code>
              </div>
              <div style={{fontSize:13,color:"var(--text2)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.msg}</div>
              <div style={{display:"flex",gap:14,marginTop:6}}>
                <span style={{fontSize:11.5,color:"var(--text3)",display:"flex",alignItems:"center",gap:4}}><Clock size={11}/>{d.ago}</span>
                {d.dur!=="--"&&<span style={{fontSize:11.5,color:"var(--text3)",display:"flex",alignItems:"center",gap:4}}><Zap size={11}/>{d.dur}</span>}
              </div>
            </div>
            <div style={{display:"flex",gap:6,flexShrink:0}}>
              <button className="btn btn-g" style={{fontSize:12,padding:"5px 12px"}}><Activity size={13}/>Logs</button>
              {d.status==="failed"&&<button className="btn btn-p" style={{fontSize:12,padding:"5px 12px"}}><RefreshCw size={13}/>Retry</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Settings ────────────────────────────────────────────────────────────────
function SettingsView({theme,setTheme}) {
  const [showKey, setShowKey] = useState(false)
  const Section = ({title,desc,children}) => (
    <div className="card" style={{marginBottom:16}}>
      <div style={{marginBottom:16,paddingBottom:14,borderBottom:"1px solid var(--border)"}}>
        <div style={{fontWeight:600,fontSize:15}}>{title}</div>
        {desc&&<div style={{fontSize:12.5,color:"var(--text2)",marginTop:3}}>{desc}</div>}
      </div>
      {children}
    </div>
  )
  const Row = ({label,desc,children}) => (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0",borderBottom:"1px solid var(--border)"}}>
      <div><div style={{fontSize:13.5,fontWeight:500}}>{label}</div>{desc&&<div style={{fontSize:12,color:"var(--text2)",marginTop:2}}>{desc}</div>}</div>
      <div style={{flexShrink:0,marginLeft:24}}>{children}</div>
    </div>
  )
  return (
    <div className="fu">
      <div className="sh"><div className="sh-l"><h1>Settings</h1><p>Panel configuration</p></div></div>
      <Section title="General" desc="Basic panel settings">
        <Row label="Panel name" desc="Shown in the browser tab"><input className="inp" defaultValue="pi-production" style={{width:200}}/></Row>
        <Row label="Appearance" desc="Dark or light theme">
          <div style={{display:"flex",background:"var(--surf3)",borderRadius:8,padding:3,gap:2}}>
            {[["dark","Dark",Moon],["light","Light",Sun]].map(([v,l,Icon])=>(
              <button key={v} className="btn" onClick={()=>setTheme(v)} style={{fontSize:12,padding:"5px 14px",background:theme===v?"var(--accent)":"transparent",color:theme===v?"#fff":"var(--text2)",gap:5}}>
                <Icon size={13}/>{l}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Port" desc="HTTP server port (requires restart)"><input className="inp" defaultValue="8080" style={{width:100}}/></Row>
      </Section>
      <Section title="Security" desc="Auth and access control">
        <Row label="Secret key" desc="Used to sign JWT tokens — keep this safe">
          <div style={{display:"flex",gap:8}}>
            <input className="inp" type={showKey?"text":"password"} defaultValue="sk_live_aBcD1234efGH5678" style={{width:220}}/>
            <button className="tbtn" onClick={()=>setShowKey(s=>!s)}>{showKey?<EyeOff size={15}/>:<Eye size={15}/>}</button>
            <button className="tbtn" title="Copy"><Copy size={15}/></button>
          </div>
        </Row>
        <Row label="Session timeout" desc="Auto logout after inactivity">
          <select className="inp" style={{width:160,cursor:"pointer"}}><option>7 days</option><option>24 hours</option><option>1 hour</option></select>
        </Row>
        <Row label="Two-factor auth" desc="Require TOTP on login">
          <label className="tgl"><input type="checkbox"/><span className="tgl-s"/></label>
        </Row>
      </Section>
      <Section title="Notifications" desc="Alert channels">
        <Row label="Email alerts" desc="Deployment failures, SSL errors">
          <label className="tgl"><input type="checkbox" defaultChecked/><span className="tgl-s"/></label>
        </Row>
        <Row label="SMTP host" desc="For sending email notifications"><input className="inp" placeholder="smtp.example.com" style={{width:220}}/></Row>
        <Row label="Webhook URL" desc="POST alerts to a custom URL"><input className="inp" placeholder="https://..." style={{width:280}}/></Row>
      </Section>
      <Section title="Danger Zone">
        <Row label="Clear all deployments" desc="Permanently delete deployment logs">
          <button className="btn btn-d"><Trash2 size={13}/>Clear logs</button>
        </Row>
        <Row label="Reset panel" desc="Wipe all data and start fresh">
          <button className="btn btn-d"><AlertCircle size={13}/>Factory reset</button>
        </Row>
      </Section>
      <button className="btn btn-p" style={{padding:"9px 24px"}}><Check size={15}/>Save changes</button>
    </div>
  )
}

// ─── App shell ───────────────────────────────────────────────────────────────
const NAV = [
  {id:"dashboard",label:"Dashboard",icon:LayoutDashboard},
  {id:"projects",label:"Projects",icon:FolderOpen},
  {id:"services",label:"Services",icon:Server},
  {id:"databases",label:"Databases",icon:Database},
  {id:"terminal",label:"Terminal",icon:Terminal},
  {id:"domains",label:"Domains",icon:Globe},
  {id:"deployments",label:"Deployments",icon:Rocket,badge:1},
  {id:"settings",label:"Settings",icon:Settings},
]

export default function App() {
  const [theme, setTheme] = useState("dark")
  const [section, setSection] = useState("dashboard")
  const [col, setCol] = useState(false)

  const views = {
    dashboard:<Dashboard/>, projects:<Projects/>, services:<Services/>,
    databases:<Databases/>, terminal:<TerminalView/>, domains:<Domains/>,
    deployments:<Deployments/>, settings:<SettingsView theme={theme} setTheme={setTheme}/>
  }

  return (
    <>
      <style>{CSS}</style>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div className={`app ${theme==="light"?"light":""}`}>
        {/* Sidebar */}
        <div className={`sidebar ${col?"col":""}`}>
          <div className="logo-area">
            <div className="logo-dot"><Zap size={17} color="#fff"/></div>
            {!col&&<span className="logo-txt">panel<span>d</span></span>}
          </div>
          <div className="nav">
            {NAV.map(({id,label,icon:Icon,badge})=>(
              <div key={id} className={`ni ${section===id?"on":""}`} onClick={()=>setSection(id)} title={col?label:""}>
                <span className="ni-icon"><Icon size={17}/></span>
                {!col&&<><span>{label}</span>{badge&&<span className="ni-badge">{badge}</span>}</>}
              </div>
            ))}
          </div>
          <div className="sidebar-foot">
            <div className="ni" onClick={()=>setCol(s=>!s)}>
              <span className="ni-icon">{col?<ChevronRight size={17}/>:<ChevronLeft size={17}/>}</span>
              {!col&&<span>Collapse</span>}
            </div>
          </div>
        </div>
        {/* Main */}
        <div className="main">
          <div className="topbar">
            <div style={{flex:1,display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:13.5,fontWeight:600,color:"var(--text2)"}}>{NAV.find(n=>n.id===section)?.label}</span>
            </div>
            <div style={{display:"flex",gap:2,alignItems:"center"}}>
              <button className="tbtn" title="Search"><Search size={17}/></button>
              <button className="tbtn" title="Notifications"><Bell size={17}/></button>
              <button className="tbtn" title="Toggle theme" onClick={()=>setTheme(t=>t==="dark"?"light":"dark")}>
                {theme==="dark"?<Sun size={17}/>:<Moon size={17}/>}
              </button>
              <div style={{width:1,height:20,background:"var(--border)",margin:"0 6px"}}/>
              <div style={{display:"flex",alignItems:"center",gap:8,padding:"4px 10px",borderRadius:8,cursor:"pointer",transition:"var(--t)"}} onMouseEnter={e=>e.currentTarget.style.background="var(--surf2)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <div style={{width:26,height:26,borderRadius:7,background:"linear-gradient(135deg,var(--accent),#a78bfa)",display:"flex",alignItems:"center",justifyContent:"center"}}><User size={14} color="#fff"/></div>
                <span style={{fontSize:13,fontWeight:500}}>Admin</span>
              </div>
            </div>
          </div>
          <div className="content" key={section}>
            {views[section]}
          </div>
        </div>
      </div>
    </>
  )
}