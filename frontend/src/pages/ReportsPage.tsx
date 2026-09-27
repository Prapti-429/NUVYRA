import React, { useEffect, useMemo, useState } from 'react';
import { aiService, AIHistoryPoint } from '../services/aiService';
import { useLanguage, AppLanguage } from '../contexts/LanguageContext';

type ReportDefinition={key:string;title:string;description:string;fileName:string;observations:number};
const REPORTS:ReportDefinition[]=[
 {key:'weekly',title:'Weekly Longitudinal Summary',description:'Your most recent 7 usable observations.',fileName:'nuvyra-weekly-longitudinal-report.csv',observations:7},
 {key:'monthly',title:'Monthly Multimodal Synthesis',description:'Your most recent 30 usable observations.',fileName:'nuvyra-monthly-multimodal-report.csv',observations:30},
 {key:'baseline',title:'Baseline Calibration Benchmark',description:'Up to 90 observations for personal-baseline and trajectory review.',fileName:'nuvyra-baseline-trajectory-report.csv',observations:90},
];

const COPY:Record<AppLanguage,Record<string,string>>={
 English:{title:'Longitudinal Reports',subtitle:'A visual record of how your NUVYRA observations change over time. Export the same underlying data when you need a portable file.',download:'Export data',preparing:'Preparing…',loading:'Loading saved observations…',available:'observations available',empty:'No saved observations are available for this report yet.',notice:'These are research/observational summaries, not diagnostic medical reports. Changes should be interpreted with data quality, personal baseline, and clinical context.',what:'Your longitudinal picture',score:'Pattern score',confidence:'Confidence',latest:'Latest observation',change:'Change across selected period',trend:'Current trend',observations:'Usable observations',noData:'Complete more check-ins to build this visual report.',csv:'CSV export',error:'The report could not be prepared.',select:'Select report window'},
 Hindi:{title:'लॉन्गिट्यूडिनल रिपोर्ट',subtitle:'समय के साथ आपके NUVYRA अवलोकनों में होने वाले बदलाव का विज़ुअल रिकॉर्ड। जरूरत होने पर इसी डेटा को फाइल के रूप में एक्सपोर्ट करें।',download:'डेटा एक्सपोर्ट करें',preparing:'तैयार हो रही है…',loading:'सेव किए गए अवलोकन लोड हो रहे हैं…',available:'अवलोकन उपलब्ध',empty:'इस रिपोर्ट के लिए अभी कोई सेव किया गया अवलोकन उपलब्ध नहीं है।',notice:'ये रिसर्च/अवलोकन सारांश हैं, निदान संबंधी मेडिकल रिपोर्ट नहीं। बदलावों को डेटा क्वालिटी, व्यक्तिगत बेसलाइन और क्लिनिकल संदर्भ के साथ समझना चाहिए।',what:'आपकी लॉन्गिट्यूडिनल तस्वीर',score:'पैटर्न स्कोर',confidence:'कॉन्फिडेंस',latest:'नवीनतम अवलोकन',change:'चयनित अवधि में बदलाव',trend:'वर्तमान ट्रेंड',observations:'उपयोगी अवलोकन',noData:'इस विज़ुअल रिपोर्ट को बनाने के लिए और चेक-इन पूरे करें।',csv:'CSV एक्सपोर्ट',error:'रिपोर्ट तैयार नहीं हो सकी।',select:'रिपोर्ट अवधि चुनें'},
 French:{title:'Rapports longitudinaux',subtitle:'Une vue visuelle de l’évolution de vos observations NUVYRA au fil du temps. Exportez les mêmes données lorsque nécessaire.',download:'Exporter les données',preparing:'Préparation…',loading:'Chargement des observations…',available:'observations disponibles',empty:'Aucune observation enregistrée n’est encore disponible.',notice:'Ces résumés sont destinés à la recherche et à l’observation, pas au diagnostic médical. Les changements doivent être interprétés avec la qualité des données, la référence personnelle et le contexte clinique.',what:'Votre trajectoire longitudinale',score:'Score de tendance',confidence:'Confiance',latest:'Observation récente',change:'Variation sur la période',trend:'Tendance actuelle',observations:'Observations utilisables',noData:'Effectuez davantage de check-ins pour construire ce rapport visuel.',csv:'Export CSV',error:'Le rapport n’a pas pu être préparé.',select:'Choisir la période'}
};

const csvCell=(value:unknown)=>{const text=value==null?'':String(value);return '"'+text.replace(/"/g,'""')+'"';};
const buildCsv=(title:string,points:AIHistoryPoint[],language:AppLanguage)=>{
 const notice=language==='Hindi'?'केवल रिसर्च/अवलोकन सारांश; निदान या चिकित्सीय रिपोर्ट नहीं।':language==='French'?'Résumé de recherche/observation uniquement ; pas un diagnostic ni un rapport médical.':'Research/observational summary only; not a diagnosis or medical report.';
 const rows=[['NUVYRA Longitudinal Report',title],['Generated',new Date().toISOString()],['Notice',notice],[],['Check-in ID','Generated at','Pattern score','Confidence','Trend'],...points.map(p=>[p.check_in_id,p.generated_at,Number(p.score).toFixed(2),Number(p.confidence||0).toFixed(4),p.trend])];
 return rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
};
const triggerDownload=(csv:string,fileName:string)=>{
 const blob=new Blob(['\uFEFF',csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=fileName;a.rel='noopener';a.style.position='fixed';a.style.left='-9999px';document.body.appendChild(a);a.click();window.setTimeout(()=>{a.remove();URL.revokeObjectURL(url)},1500);
};

const formatDate=(value:string,language:AppLanguage)=>new Intl.DateTimeFormat(language==='Hindi'?'hi-IN':language==='French'?'fr-FR':'en-US',{month:'short',day:'numeric'}).format(new Date(value));
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));

const TrendChart:React.FC<{points:AIHistoryPoint[];language:AppLanguage}>=({points,language})=>{
 if(!points.length)return <div className="h-64 flex items-center justify-center text-sm text-slate-500">No usable observations yet.</div>;
 const width=900,height=300,padX=42,padY=30;
 const values=points.map(p=>clamp(Number(p.score)||0,0,100));const min=Math.min(...values,0),max=Math.max(...values,100);
 const range=Math.max(1,max-min);
 const coords=values.map((v,i)=>({x:padX+(i*Math.max(1,width-padX*2))/Math.max(1,values.length-1),y:height-padY-((v-min)/range)*(height-padY*2),v}));
 const path=coords.map((p,i)=>(i?'L':'M')+p.x.toFixed(1)+' '+p.y.toFixed(1)).join(' ');
 const area=path+' L '+coords[coords.length-1].x+' '+(height-padY)+' L '+coords[0].x+' '+(height-padY)+' Z';
 const start=values[0],end=values[values.length-1],delta=end-start;
 return <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 sm:p-5">
   <div className="flex flex-wrap items-end justify-between gap-3 mb-4"><div><p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Pattern trajectory</p><p className="text-sm text-slate-300 mt-1">{points.length} observations · {formatDate(points[0].generated_at,language)} — {formatDate(points[points.length-1].generated_at,language)}</p></div><div className="text-right"><p className="text-2xl font-semibold text-white">{end.toFixed(1)}</p><p className="text-xs text-slate-500">latest score</p></div></div>
   <div className="overflow-x-auto"><svg viewBox={'0 0 '+width+' '+height} className="w-full min-w-[620px] h-64" role="img" aria-label="Longitudinal pattern score chart">
    <defs><linearGradient id="nuvyraReportArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".22"/><stop offset="100%" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs>
    {[0,25,50,75,100].map(v=>{const y=height-padY-(v/100)*(height-padY*2);return <g key={v}><line x1={padX} x2={width-padX} y1={y} y2={y} stroke="currentColor" className="text-slate-800"/><text x="6" y={y+4} fontSize="11" className="fill-slate-600">{v}</text></g>})}
    <path d={area} fill="url(#nuvyraReportArea)" className="text-sky-400"/>
    <path d={path} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" pathLength="1" className="text-sky-400 nuvyra-report-line"/>
    {coords.map((p,i)=><g key={i}><circle cx={p.x} cy={p.y} r="5" fill="currentColor" className="text-slate-950 stroke-sky-400" strokeWidth="2"/><title>{formatDate(points[i].generated_at,language)}: {p.v.toFixed(1)}</title></g>)}
   </svg></div>
   <div className="flex justify-between text-xs text-slate-600 mt-1"><span>{formatDate(points[0].generated_at,language)}</span><span className={delta>=0?'text-sky-300':'text-amber-300'}>{delta>=0?'+':''}{delta.toFixed(1)} across period</span><span>{formatDate(points[points.length-1].generated_at,language)}</span></div>
 </div>;
};

export const ReportsPage:React.FC=()=>{
 const {language}=useLanguage();const t=COPY[language];
 const [history,setHistory]=useState<AIHistoryPoint[]>([]),[latestAnalysis,setLatestAnalysis]=useState<Awaited<ReturnType<typeof aiService.latest>>|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null),[downloading,setDownloading]=useState<string|null>(null),[selected,setSelected]=useState('monthly');
 useEffect(()=>{let active=true;Promise.all([aiService.history(90),aiService.latest().catch(()=>null)]).then(([r,a])=>{if(active){setHistory(r?.items||[]);setLatestAnalysis(a)}}).catch((e:any)=>{if(active)setError(e?.message||t.error)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[]);
 const sorted=useMemo(()=>[...history].sort((a,b)=>new Date(a.generated_at).getTime()-new Date(b.generated_at).getTime()),[history]);
 const report=REPORTS.find(r=>r.key===selected)||REPORTS[1];
 const points=sorted.slice(-report.observations);
 const latest=points[points.length-1],first=points[0];
 const score=latest?Number(latest.score):0,confidence=latest?Number(latest.confidence||0):0;
 const delta=latest&&first?score-Number(first.score):0;
 const download=()=>{setDownloading(report.key);setError(null);try{if(!points.length)throw new Error(t.empty);triggerDownload(buildCsv(report.title,points,language),report.fileName)}catch(e:any){setError(e?.message||t.error)}finally{window.setTimeout(()=>setDownloading(null),400)}};
 return <div className="space-y-7 max-w-6xl">
  <style>{'@media (prefers-reduced-motion: reduce){.nuvyra-report-line{animation:none!important;stroke-dashoffset:0!important}.nuvyra-report-card{animation:none!important}} .nuvyra-report-line{stroke-dasharray:1;stroke-dashoffset:1;animation:nuvyraDraw 1.4s ease-out forwards} @keyframes nuvyraDraw{to{stroke-dashoffset:0}} .nuvyra-report-card{animation:nuvyraRise .45s ease-out both} @keyframes nuvyraRise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}'}</style>
  <header className="nuvyra-report-card"><p className="text-[11px] uppercase tracking-[0.18em] text-sky-400">NUVYRA · Longitudinal view</p><h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-2">{t.title}</h1><p className="text-slate-400 text-sm mt-2 max-w-3xl leading-6">{t.subtitle}</p></header>
  {error&&<div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">{error}</div>}
  <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
   <span className="text-xs text-slate-500 mr-1">{t.select}</span>
   {REPORTS.map(r=><button key={r.key} type="button" onClick={()=>setSelected(r.key)} className={'px-3 py-2 rounded-lg text-xs border transition '+(selected===r.key?'border-sky-500/40 bg-sky-500/10 text-sky-300':'border-slate-800 text-slate-400 hover:bg-slate-900')}>{r.title.replace('Longitudinal Summary','7-day').replace('Multimodal Synthesis','30-day').replace('Baseline Calibration Benchmark','90-day')}</button>)}
  </div>
  {loading?<div className="rounded-2xl border border-slate-800 bg-[#111827] p-10 text-center text-sm text-slate-400">{t.loading}</div>:!points.length?<div className="rounded-2xl border border-slate-800 bg-[#111827] p-10 text-center"><p className="text-sm text-slate-300">{t.noData}</p><p className="text-xs text-slate-500 mt-2">{t.empty}</p></div>:<>
   <TrendChart points={points} language={language}/>
   <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
    {[{label:t.score,value:score.toFixed(1),detail:'Latest usable pattern score'},{label:t.confidence,value:Math.round(confidence*100)+'%',detail:'Reported confidence'},{label:t.change,value:(delta>=0?'+':'')+delta.toFixed(1),detail:'First to latest in window'},{label:t.observations,value:String(points.length),detail:'Included in this report'}].map((c,i)=><article key={c.label} style={{animationDelay:(i*70)+'ms'}} className="nuvyra-report-card rounded-2xl border border-slate-800 bg-[#111827] p-5"><p className="text-xs text-slate-500">{c.label}</p><p className="text-2xl font-semibold text-white mt-2">{c.value}</p><p className="text-[11px] text-slate-500 mt-1">{c.detail}</p></article>)}
   </section>
   <section className="rounded-2xl border border-slate-800 bg-[#111827] p-5">
    <h2 className="text-sm font-semibold text-white">What was analyzed from your saved history</h2>
    <p className="text-xs text-slate-400 mt-2 leading-5">This report keeps the distinction between information saved from your documents and signals collected during NUVYRA check-ins. Document findings are context for longitudinal review; they are not silently converted into a diagnosis or score.</p>
    {latestAnalysis?.context ? <div className="mt-4 space-y-4">
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="rounded-xl bg-slate-950/50 p-4"><p className="text-[10px] uppercase tracking-wider text-slate-600">Saved history</p><p className="text-sm text-slate-200 mt-2">{latestAnalysis.context.past_history_count} record{latestAnalysis.context.past_history_count===1?'':'s'}</p></div>
        <div className="rounded-xl bg-slate-950/50 p-4"><p className="text-[10px] uppercase tracking-wider text-slate-600">Uploaded documents</p><p className="text-sm text-slate-200 mt-2">{latestAnalysis.context.document_count}</p></div>
        <div className="rounded-xl bg-slate-950/50 p-4"><p className="text-[10px] uppercase tracking-wider text-slate-600">Pending reminders</p><p className="text-sm text-slate-200 mt-2">{latestAnalysis.context.pending_reminder_count}</p></div>
      </div>
      {latestAnalysis.context.history_items?.length>0 && <div><h3 className="text-xs font-semibold text-slate-300">Saved patient history used as context</h3><ul className="mt-2 space-y-1 text-xs text-slate-400">{latestAnalysis.context.history_items.slice(0,8).map((item,i)=><li key={i}>{item}</li>)}</ul></div>}
      {latestAnalysis.context.analyzed_documents?.length>0 && <div><h3 className="text-xs font-semibold text-slate-300">Document information available to the report</h3><div className="mt-2 space-y-2">{latestAnalysis.context.analyzed_documents.slice(0,8).map((doc,i)=><div key={i} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"><div className="flex flex-wrap justify-between gap-2"><span className="text-xs font-medium text-slate-200">{doc.filename}</span><span className="text-[10px] text-slate-600">{doc.document_type}</span></div>{doc.summary&&<p className="text-xs text-slate-400 mt-2">{doc.summary}</p>}<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500"><span>Tests: {doc.tests?.length?doc.tests.join(', '):'none identified'}</span><span>Medications: {doc.medications?.length?doc.medications.join(', '):'none identified'}</span><span>Dates: {doc.dates?.length?doc.dates.join(', '):'none identified'}</span><span>Follow-up: {doc.follow_up_mentions?.length?doc.follow_up_mentions.join('; '):'none identified'}</span></div></div>)}</div></div>}
      <p className="text-[11px] text-slate-600">Only information actually extracted and saved from uploaded documents is displayed here. Missing or unreadable document information remains missing.</p>
    </div> : <p className="mt-3 text-xs text-slate-500">No saved document/history context is available for the current report.</p>}
   </section>
   <section className="grid lg:grid-cols-[1fr_320px] gap-4">
    <article className="rounded-2xl border border-slate-800 bg-[#111827] p-5"><h2 className="text-sm font-semibold text-white">{report.title}</h2><p className="text-xs text-slate-400 mt-1">{report.description}</p><div className="mt-5 grid sm:grid-cols-3 gap-3"><div className="rounded-xl bg-slate-950/50 p-4"><p className="text-[10px] uppercase tracking-wider text-slate-600">{t.latest}</p><p className="text-sm text-slate-200 mt-2">{formatDate(latest.generated_at,language)}</p></div><div className="rounded-xl bg-slate-950/50 p-4"><p className="text-[10px] uppercase tracking-wider text-slate-600">{t.trend}</p><p className="text-sm text-slate-200 mt-2">{latest.trend||'—'}</p></div><div className="rounded-xl bg-slate-950/50 p-4"><p className="text-[10px] uppercase tracking-wider text-slate-600">{t.available}</p><p className="text-sm text-slate-200 mt-2">{Math.min(report.observations,sorted.length)}</p></div></div></article>
    <article className="rounded-2xl border border-slate-800 bg-sky-500/5 p-5 flex flex-col justify-between"><div><h2 className="text-sm font-semibold text-white">{t.what}</h2><p className="text-xs text-slate-400 mt-2 leading-5">{t.notice}</p></div><button type="button" onClick={download} disabled={!points.length||!!downloading} className="mt-5 w-full px-4 py-3 rounded-xl text-xs font-semibold bg-sky-500 text-slate-950 hover:bg-sky-400 transition disabled:opacity-40 disabled:cursor-not-allowed">{downloading===report.key?t.preparing:t.download}</button><p className="text-[10px] text-slate-600 mt-2 text-center">{t.csv}</p></article>
   </section>
  </>}
 </div>;
};
export default ReportsPage;