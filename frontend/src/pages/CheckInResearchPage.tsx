import React,{useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {aiService,AIAnalysisResponse} from '../services/aiService';
import {InfoButton} from '../components/common/InfoButton';
import {useLanguage,AppLanguage} from '../contexts/LanguageContext';

type Voice={rms:number;zcr:number;pitch:number;speechActivity:number;duration:number};
type Camera=Record<string,number>;

const PROMPTS:Record<AppLanguage,string[]>={
 English:['Describe your day naturally for 20 seconds.','Tell us about one thing you did today.','Describe something you noticed today.'],
 Hindi:['अपने दिन के बारे में 20 सेकंड तक सामान्य तरीके से बताइए।','आज आपने क्या किया, उसके बारे में बताइए।','आज आपने क्या खास देखा? सामान्य तरीके से बताइए।'],
 French:['Décrivez naturellement votre journée pendant 20 secondes.','Parlez-nous d’une chose que vous avez faite aujourd’hui.','Décrivez quelque chose que vous avez remarqué aujourd’hui.']
};
const PHYSICAL:Record<AppLanguage,string[]>={
 English:['Comfortable','Muscle stiffness','Tremor sensation','Physical weakness','Pain/discomfort','Shortness of breath','Other'],
 Hindi:['आरामदायक','मांसपेशियों में जकड़न','कंपन जैसा महसूस होना','शारीरिक कमजोरी','दर्द/असहजता','सांस लेने में तकलीफ','अन्य'],
 French:['Confortable','Raideur musculaire','Sensation de tremblement','Faiblesse physique','Douleur/inconfort','Essoufflement','Autre']
};
const OBS:Record<AppLanguage,string[]>={
 English:['Vocal strain','Motor stiffness','Tremor sensations','Facial tightness','Brain fog','Sleep disruption'],
 Hindi:['आवाज़ में खिंचाव','शारीरिक जकड़न','कंपन जैसा महसूस होना','चेहरे में खिंचाव','मानसिक धुंधलापन','नींद में बदलाव'],
 French:['Fatigue vocale','Raideur des mouvements','Sensation de tremblement','Tension du visage','Brouillard mental','Perturbation du sommeil']
};
const moodMap:Record<string,number>={better:.1,same:0,different:.5,significant:1};
const mean=(a:number[])=>a.reduce((x,y)=>x+y,0)/Math.max(1,a.length);
const sd=(a:number[])=>{const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)**2)));};

async function getVoice(blob:Blob):Promise<Voice>{
 const AC=window.AudioContext||(window as typeof window&{webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
 if(!AC)throw Error('Audio analysis is unavailable in this browser.');
 const ctx=new AC();
 try{
  const audio=await ctx.decodeAudioData(await blob.arrayBuffer()),d=audio.getChannelData(0);
  const step=Math.max(1,Math.floor(d.length/160000));let sum=0,cross=0,n=0,prev=0;
  for(let i=0;i<d.length;i+=step){const v=d[i];sum+=v*v;n++;if(i&&((prev<0&&v>=0)||(prev>=0&&v<0)))cross++;prev=v;}
  const rms=Math.sqrt(sum/Math.max(1,n)),zcr=cross/Math.max(1,n-1);
  const frame=Math.max(256,Math.floor(audio.sampleRate*.025)),hop=Math.max(128,Math.floor(audio.sampleRate*.01));
  let frames=0,active=0,pitchSum=0,pitchN=0;
  for(let s=0;s+frame<d.length;s+=hop){let e=0;for(let j=0;j<frame;j++)e+=d[s+j]**2;const fr=Math.sqrt(e/frame);frames++;if(fr>Math.max(rms*.35,.01)){active++;const minLag=Math.floor(audio.sampleRate/400),maxLag=Math.min(Math.floor(audio.sampleRate/70),frame-1);let best=0,bestC=-Infinity;for(let lag=minLag;lag<=maxLag;lag++){let c=0;for(let j=0;j<frame-lag;j+=4)c+=d[s+j]*d[s+j+lag];if(c>bestC){bestC=c;best=lag;}}const p=best?audio.sampleRate/best:0;if(p>=70&&p<=400){pitchSum+=p;pitchN++;}}}
  return{rms:Number(rms.toFixed(6)),zcr:Number(Math.min(1,zcr).toFixed(6)),pitch:Number((pitchN?pitchSum/pitchN:0).toFixed(2)),speechActivity:Number((frames?active/frames:0).toFixed(4)),duration:audio.duration};
 }finally{await ctx.close();}
}

export const CheckInResearchPage:React.FC=()=>{
 const navigate=useNavigate();const {language,setLanguage}=useLanguage();
 const [step,setStep]=useState(1),[prompt,setPrompt]=useState(PROMPTS[language][0]),[mood,setMood]=useState('same'),[moodLevel,setMoodLevel]=useState(3);
 const [energy,setEnergy]=useState(3),[fatigue,setFatigue]=useState(3),[sleep,setSleep]=useState(3),[sleepHours,setSleepHours]=useState(8),[awakenings,setAwakenings]=useState(0),[concentration,setConcentration]=useState(3),[stress,setStress]=useState(3);
 const [physical,setPhysical]=useState('Comfortable'),[physicalNotes,setPhysicalNotes]=useState(''),[observations,setObservations]=useState<string[]>([]);
 const [voice,setVoice]=useState<Voice|null>(null),[camera,setCamera]=useState<Camera|null>(null),[recording,setRecording]=useState(false),[capturing,setCapturing]=useState(false),[seconds,setSeconds]=useState(20),[result,setResult]=useState<AIAnalysisResponse|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const streamRef=useRef<MediaStream|null>(null),videoRef=useRef<HTMLVideoElement|null>(null),canvasRef=useRef<HTMLCanvasElement|null>(null);
 useEffect(()=>()=>streamRef.current?.getTracks().forEach(t=>t.stop()),[]);
 const info=(t:string,d:string)=><InfoButton title={t}>{d}</InfoButton>;
 const changeLanguage=(l:AppLanguage)=>{setLanguage(l);setPrompt(PROMPTS[l][0]);};
 const toggleObs=(x:string)=>setObservations(v=>v.includes(x)?v.filter(y=>y!==x):[...v,x]);

 const record=async()=>{
  setError('');setVoice(null);
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:true});streamRef.current=stream;
   const mime=MediaRecorder.isTypeSupported('audio/webm;codecs=opus')?'audio/webm;codecs=opus':'audio/webm';
   const r=new MediaRecorder(stream,{mimeType:mime}),chunks:Blob[]=[];r.ondataavailable=e=>e.data.size&&chunks.push(e.data);
   r.onstop=async()=>{try{const v=await getVoice(new Blob(chunks,{type:mime}));if(v.duration<3||v.speechActivity<.08){setError('Voice sample is too short or too quiet. Please record again for at least 3 seconds and speak naturally.');setVoice(null);}else setVoice(v);}catch{setError('Voice analysis failed. Please record the sample again.');}finally{stream.getTracks().forEach(t=>t.stop());streamRef.current=null;setRecording(false);}};
   r.start(250);setRecording(true);const started=performance.now();const timer=window.setInterval(()=>{const left=Math.max(0,Math.ceil(20-(performance.now()-started)/1000));setSeconds(left);if(!left)window.clearInterval(timer);},250);
   window.setTimeout(()=>{window.clearInterval(timer);if(r.state!=='inactive')r.stop();},20000);
  }catch{setError('Microphone access was unavailable. Please allow microphone access and record the voice sample again.');setRecording(false);}
 };

 const capture=async()=>{
  setError('');setCamera(null);setCapturing(true);
  try{
   const stream=await navigator.mediaDevices.getUserMedia({video:{width:640,height:480,facingMode:'user'},audio:false});streamRef.current=stream;
   if(!videoRef.current||!canvasRef.current)throw Error('Camera preview is unavailable.');
   videoRef.current.srcObject=stream;await videoRef.current.play();const canvas=canvasRef.current;canvas.width=160;canvas.height=120;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Camera analysis is unavailable.');
   const motion:number[]=[],lum:number[]=[],head:number[]=[],breath:number[]=[];let prev:Uint8ClampedArray|null=null;const start=performance.now();
   while(performance.now()-start<10000){ctx.drawImage(videoRef.current,0,0,160,120);const p=ctx.getImageData(0,0,160,120).data;let total=0,diff=0,left=0,right=0,lower=0,n=0;
    for(let i=0;i<p.length;i+=4){const x=(i/4)%160,y=Math.floor((i/4)/160),v=.2126*p[i]+.7152*p[i+1]+.0722*p[i+2];total+=v;if(x<55)left+=v;if(x>105)right+=v;if(y>65&&x>35&&x<125){lower+=v;n++;}if(prev)diff+=Math.abs(v-(.2126*prev[i]+.7152*prev[i+1]+.0722*prev[i+2]));}
    motion.push(diff/(160*120*255));lum.push(total/(160*120*255));head.push(Math.abs(left-right)/(160*120*255));breath.push(lower/Math.max(1,n)/255);prev=new Uint8ClampedArray(p);await new Promise(r=>setTimeout(r,200));
   }
   const avgLum=mean(lum);if(avgLum<.12||avgLum>.9)throw Error('Camera lighting is insufficient. Please face a light source, keep the camera at eye level, center your face and upper torso, and record again.');
   if(sd(motion)>.12)throw Error('Camera signal is unstable. Keep the camera steady, center your face and upper torso, and record again.');
   const out:Camera={face_motion:Number(mean(motion).toFixed(6)),face_luminance_variability:Number(sd(lum).toFixed(6)),head_motion:Number(mean(head).toFixed(6)),head_motion_variability:Number(sd(head).toFixed(6))};
   const low=mean(breath);out.breathing_variability=Number(sd(breath).toFixed(6));out.breathing_rate_per_minute=Number(Math.max(6,Math.min(30,12+low*10)).toFixed(2));
   setCamera(out);
  }catch(e:any){setError(e?.message||'Camera analysis failed. Please record the camera sample again.');}
  finally{streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;setCapturing(false);}
 };

 const validateSurvey=()=>{if(!mood||moodLevel<1||energy<1||fatigue<1||sleep<1||concentration<1||stress<1){setError('Please answer every required 1–5 check-in field before continuing.');return false;}if(sleepHours<0||awakenings<0){setError('Please enter valid sleep hours and awakenings.');return false;}setError('');return true;};
 const analyze=async()=>{
  setError('');
  if(!voice){setError('Voice analysis is missing. Please record a usable voice sample before continuing.');setStep(2);return;}
  if(!camera){setError('Camera analysis is missing. Please complete the camera check before continuing.');setStep(3);return;}
  setLoading(true);
  try{setResult(await aiService.analyze({fatigue,energy_level:energy,sleep_quality:sleep, sleep_hours:sleepHours,sleep_awakenings:awakenings,stress_level:stress,concentration_level:concentration,physical_comfort:PHYSICAL_INDEX[physical]||1,physical_comfort_observation:physical,physical_comfort_notes:physicalNotes,mood_level:moodLevel,mood_deviation:moodMap[mood]??0,symptom_burden:observations.length/6,voice_language:language,voice_rms:voice.rms,voice_zero_crossing_rate:voice.zcr,voice_pitch_hz:voice.pitch,voice_speech_activity:voice.speechActivity,face_motion:camera.face_motion,face_luminance_variability:camera.face_luminance_variability,head_motion:camera.head_motion,head_motion_variability:camera.head_motion_variability,breathing_rate_per_minute:camera.breathing_rate_per_minute,breathing_variability:camera.breathing_variability,source_duration_seconds:voice.duration}));}
  catch(e:any){if(e?.status===401)navigate('/login');else setError(e?.message||'NUVYRA analysis failed. Please try the check-in again.');}
  finally{setLoading(false);}
 };
 const PHYSICAL_INDEX:Record<string,number>={'Comfortable':1,'Muscle stiffness':2,'Tremor sensation':3,'Physical weakness':4,'Pain/discomfort':5,'Shortness of breath':6,'Other':7};

 return <main className="mx-auto max-w-4xl space-y-6 py-5 text-white">
  <div className="flex justify-between text-xs text-slate-500"><span>DAILY MULTIMODAL CHECK-IN · {step}/4</span><span>PERSONAL BASELINE</span></div>
  {error&&<div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">{error}</div>}

  {step===1&&<section className="rounded-2xl border border-slate-800 bg-[#111827] p-6 space-y-6">
   <div><div className="flex items-center gap-2"><h1 className="text-2xl font-semibold">How are you today?</h1>{info('About this step','These are self-reported context signals. Required fields must be completed before analysis. They are not a diagnosis.')}</div><p className="mt-2 text-sm text-slate-400">Use your usual experience today; do not try to give the answer you think NUVYRA expects.</p></div>
   <div><label className="text-sm text-slate-300">Overall experience</label><div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">{[['better','Better than usual'],['same','About the same'],['different','A little different'],['significant','Noticeably different']].map(([k,v])=><button type="button" key={k} onClick={()=>setMood(k)} className={`rounded-xl border p-3 text-left ${mood===k?'border-sky-400 bg-sky-500/10':'border-slate-800 bg-slate-900'}`}>{v}</button>)}</div></div>
   <div className="grid md:grid-cols-2 gap-5">
    {[[ 'Energy level',energy,setEnergy],[ 'Fatigue',fatigue,setFatigue],[ 'Sleep quality',sleep,setSleep],[ 'Concentration',concentration,setConcentration],[ 'Stress',stress,setStress],[ 'Mood',moodLevel,setMoodLevel]].map(([label,value,setter])=><label key={String(label)} className="block"><span className="flex justify-between text-sm text-slate-300"><span>{label}</span><span>{String(value)}/5</span></span><input aria-label={String(label)} className="w-full mt-2" type="range" min="1" max="5" value={Number(value)} onChange={e=>(setter as (v:number)=>void)(Number(e.target.value))}/></label>)}
   </div>
   <div className="grid md:grid-cols-2 gap-4"><label className="block"><span className="text-sm text-slate-300">Hours slept</span><input aria-label="Hours slept" className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950 p-3" type="number" min="0" max="24" step=".5" value={sleepHours} onChange={e=>setSleepHours(Number(e.target.value))}/></label><label className="block"><span className="text-sm text-slate-300">Number of awakenings</span><input aria-label="Number of awakenings" className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950 p-3" type="number" min="0" max="30" value={awakenings} onChange={e=>setAwakenings(Number(e.target.value))}/></label></div>
   <div><div className="text-sm text-slate-300 mb-2">Physical comfort</div><div className="grid grid-cols-2 md:grid-cols-4 gap-2">{PHYSICAL[language].map(item=><button type="button" key={item} onClick={()=>setPhysical(PHYSICAL[language].indexOf(item)===0?'Comfortable':item)} className={`rounded-lg border px-3 py-2 text-xs ${physical===item|| (physical==='Comfortable'&&PHYSICAL[language].indexOf(item)===0)?'border-sky-400 bg-sky-500/10 text-sky-300':'border-slate-800 text-slate-400'}`}>{item}</button>)}</div><textarea aria-label="Physical comfort notes" value={physicalNotes} onChange={e=>setPhysicalNotes(e.target.value)} placeholder="Optional notes" className="mt-3 w-full rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm" rows={2}/></div>
   <div><div className="text-sm text-slate-300 mb-2">Anything you noticed? <span className="text-slate-500">Optional</span></div><div className="flex flex-wrap gap-2">{OBS[language].map(item=><button type="button" key={item} onClick={()=>toggleObs(item)} className={`rounded-lg border px-3 py-2 text-xs ${observations.includes(item)?'border-sky-400 bg-sky-500/10 text-sky-300':'border-slate-800 text-slate-400'}`}>{item}</button>)}</div></div>
   <button type="button" onClick={()=>validateSurvey()&&setStep(2)} className="w-full rounded-xl bg-sky-500 py-3 font-semibold text-slate-950">Continue to voice</button>
  </section>}

  {step===2&&<section className="rounded-2xl border border-slate-800 bg-[#111827] p-6 space-y-6">
   <div><div className="flex items-center gap-2"><h2 className="text-2xl font-semibold">Voice and speech</h2>{info('Voice capture','NUVYRA needs a usable voice sample to calculate voice features. A short or very quiet sample is rejected instead of being scored as missing data.')}</div><div className="grid grid-cols-3 gap-2 mt-3">{(['English','Hindi','French'] as AppLanguage[]).map(l=><button type="button" key={l} onClick={()=>changeLanguage(l)} className={`rounded-xl border py-2 ${language===l?'bg-white text-slate-950':'border-slate-700 text-slate-300'}`}>{l==='Hindi'?'हिन्दी':l==='French'?'Français':'English'}</button>)}</div></div>
   <div className="rounded-xl border border-slate-800 bg-slate-900 p-5"><p className="text-xs uppercase text-slate-500">Speaking prompt</p><p className="mt-2 leading-7">{prompt}</p><button type="button" onClick={()=>{const a=PROMPTS[language].filter(x=>x!==prompt);setPrompt(a[Math.floor(Math.random()*a.length)]||PROMPTS[language][0])}} className="mt-3 text-sm text-sky-300 underline">Use another prompt</button></div>
   <div className="rounded-xl border border-slate-800 p-4 text-sm leading-6 text-slate-300"><strong className="text-white">Before recording:</strong> use a reasonably quiet place, keep a comfortable distance from the microphone, speak naturally at your normal pace and volume, and do not deliberately change your voice.</div>
   <button type="button" disabled={recording} onClick={record} className="mx-auto block rounded-xl bg-sky-500 px-6 py-3 font-semibold text-slate-950 disabled:opacity-50">{recording?`Recording… ${seconds}s`:voice?'Voice sample captured':'Record 20-second sample'}</button>
   {voice&&<div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center text-xs text-slate-400">{[['Duration',`${voice.duration.toFixed(1)} s`],['Pitch',`${voice.pitch.toFixed(0)} Hz`],['Speech activity',`${Math.round(voice.speechActivity*100)}%`],['Sound level',voice.rms.toFixed(4)]].map(([k,v])=><div key={String(k)} className="rounded-xl bg-slate-900 p-3"><b className="block text-white">{v}</b><span>{k}</span></div>)}</div>}
   <button type="button" disabled={!voice} onClick={()=>setStep(3)} className="w-full rounded-xl bg-teal-500 py-3 font-semibold text-slate-950 disabled:opacity-40">Continue to camera</button>
  </section>}

  {step===3&&<section className="rounded-2xl border border-slate-800 bg-[#111827] p-6 space-y-6">
   <div><div className="flex items-center gap-2"><h2 className="text-2xl font-semibold">Camera and visual check</h2>{info('Camera instructions','For a usable capture, keep the camera at eye level, center your face and upper torso, face a light source, avoid a bright light behind you, keep the camera steady, and remain naturally still.')}</div><div className="mt-3 rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm leading-6 text-slate-300"><strong className="text-white">Positioning:</strong> camera at eye level; face and upper torso centered; even front lighting; no strong backlight; camera steady; blink and breathe normally.</div></div>
   <video ref={videoRef} muted playsInline className="mx-auto aspect-video w-full max-w-md rounded-xl bg-black object-cover scale-x-[-1]"/><canvas ref={canvasRef} className="hidden"/>
   <button type="button" disabled={capturing} onClick={capture} className="mx-auto block rounded-xl bg-teal-500 px-6 py-3 font-semibold text-slate-950 disabled:opacity-50">{capturing?'Checking camera…':camera?'Camera sample captured':'Start 10-second camera check'}</button>
   {camera&&<div className="grid grid-cols-2 md:grid-cols-3 gap-2">{Object.entries(camera).map(([k,v])=><div key={k} className="rounded-xl bg-slate-900 p-3 text-xs"><div className="text-slate-400">{k.replaceAll('_',' ')}</div><b className="mt-1 block text-white">{Number(v).toFixed(4)}</b></div>)}</div>}
   <button type="button" disabled={!camera} onClick={()=>setStep(4)} className="w-full rounded-xl bg-sky-500 py-3 font-semibold text-slate-950 disabled:opacity-40">Review check-in</button>
  </section>}

  {step===4&&<section className="rounded-2xl border border-slate-800 bg-[#111827] p-6 space-y-6">
   <div><h2 className="text-2xl font-semibold">NUVYRA analysis</h2><p className="mt-2 text-sm text-slate-400">NUVYRA will only score the check-in after required inputs and usable voice and camera samples are present.</p></div>
   {!result?<><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[['Questionnaire',true],['Voice',!!voice],['Camera',!!camera],['Baseline','available']].map(([k,v])=><div key={String(k)} className="rounded-xl bg-slate-900 p-4"><div className="text-sm text-white">{k}</div><div className="mt-2 text-xs text-emerald-300">{v?'Ready':'Unavailable'}</div></div>)}</div><button type="button" disabled={loading} onClick={analyze} className="w-full rounded-xl bg-sky-500 py-3 font-semibold text-slate-950 disabled:opacity-50">{loading?'Analyzing…':'Analyze check-in'}</button></>:<><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[['Pattern score',result.overall_score.toFixed(1)],['Confidence',`${Math.round(result.confidence*100)}%`],['Data quality',`${Math.round(result.data_quality_score*100)}%`],['Baseline observations',String(result.baseline_observations)]].map(([k,v])=><div key={String(k)} className="rounded-xl bg-slate-900 p-4"><div className="text-xs text-slate-400">{k}</div><b className="mt-2 block text-white">{v}</b></div>)}</div><div className="rounded-xl border border-slate-800 p-4"><h3 className="font-semibold">What NUVYRA noticed</h3><p className="mt-2 text-sm leading-6 text-slate-300">{result.explanation}</p></div><div className="rounded-xl border border-slate-800 p-4"><h3 className="font-semibold">Data quality and limitations</h3><ul className="mt-2 space-y-1 text-sm text-slate-400">{(result.limitations||[]).map(x=><li key={x}>{x}</li>)}{(result.missing_modalities||[]).map(x=><li key={x}>Missing: {x}</li>)}</ul></div><button type="button" onClick={()=>navigate('/trends')} className="w-full rounded-xl bg-teal-500 py-3 font-semibold text-slate-950">View longitudinal history</button></>}
   <button type="button" onClick={()=>setStep(Math.max(1,step-1))} className="text-sm text-slate-400">Back</button>
  </section>}
 </main>;
};