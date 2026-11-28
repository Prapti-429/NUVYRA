import React,{useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {aiService,AIAnalysisResponse} from '../services/aiService';
import {InfoButton} from '../components/common/InfoButton';
import {useLanguage,AppLanguage,APP_LANGUAGES} from '../contexts/LanguageContext';

type Voice={rms:number;zcr:number;pitch:number;speechActivity:number;duration:number;qualityScore:number};
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
const clamp=(n:number,min:number,max:number)=>Math.min(max,Math.max(min,n));
const sd=(a:number[])=>{const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)**2)));};

function mediaAccessError(error:unknown,kind:'microphone'|'camera'):string{
 const name=error instanceof DOMException?error.name:(error as {name?:string})?.name||'';
 const device=kind==='microphone'?'microphone':'camera';
 if(!window.isSecureContext)return 'NUVYRA cannot access the '+device+' because this page is not running in a secure context. Open the official HTTPS app address or the installed NUVYRA app, then try again.';
 if(!navigator.mediaDevices?.getUserMedia)return 'This browser or in-app WebView does not provide media access. Update Chrome/Android System WebView, close and reopen NUVYRA, or try the HTTPS website in Chrome.';
 if(name==='NotAllowedError'||name==='PermissionDeniedError'||name==='SecurityError')return 'NUVYRA does not have permission to use your '+device+'. In your browser, open the site settings for NUVYRA and set '+device+' to Allow, then reload the app. On Android, open Settings → Apps → NUVYRA → Permissions and allow '+device+'. If you previously blocked the request, change it in Settings rather than repeatedly tapping Record.';
 if(name==='NotFoundError'||name==='DevicesNotFoundError')return 'No usable '+device+' was found. Connect or enable a '+device+' and try again.';
 if(name==='NotReadableError'||name==='TrackStartError')return 'Your '+device+' may already be in use by another app, or the operating system could not start it. Close camera/voice apps and browser tabs using it, then try again.';
 if(name==='OverconstrainedError'||name==='ConstraintNotSatisfiedError')return 'The available '+device+' does not support the requested settings. Try another camera or device.';
 if(name==='AbortError')return 'The '+device+' could not start. Close and reopen NUVYRA and try again.';
 return 'NUVYRA could not start the '+device+'. Check that the device is connected, the app has permission, and no other app is using it. Details: '+(error instanceof Error?error.message:'unknown media error');
}

async function requestMedia(kind:'microphone'|'camera',constraints:MediaStreamConstraints):Promise<MediaStream>{
 if(!window.isSecureContext)throw new Error(mediaAccessError(new Error('Insecure context'),kind));
 if(!navigator.mediaDevices?.getUserMedia)throw new Error(mediaAccessError(new Error('getUserMedia unavailable'),kind));
 try{return await navigator.mediaDevices.getUserMedia(constraints);}
 catch(error){throw new Error(mediaAccessError(error,kind));}
}

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
  const speechActivity=frames?active/frames:0;
  const durationScore=clamp(audio.duration/15,0,1),speechScore=clamp((speechActivity-.05)/.45,0,1),levelScore=clamp(1-Math.abs(rms-.08)/.08,0,1);
  const qualityScore=Math.round((durationScore*.2+speechScore*.6+levelScore*.2)*100);
  return{rms:Number(rms.toFixed(6)),zcr:Number(Math.min(1,zcr).toFixed(6)),pitch:Number((pitchN?pitchSum/pitchN:0).toFixed(2)),speechActivity:Number(speechActivity.toFixed(4)),duration:audio.duration,qualityScore};
 }finally{await ctx.close();}
}

export const CheckInResearchPage:React.FC=()=>{
 const navigate=useNavigate();const {language,setLanguage}=useLanguage();
 const [step,setStep]=useState(1),[prompt,setPrompt]=useState((PROMPTS[language] || PROMPTS.English)[0]),[mood,setMood]=useState('same'),[moodLevel,setMoodLevel]=useState(3);
 const [energy,setEnergy]=useState(3),[fatigue,setFatigue]=useState(3),[sleep,setSleep]=useState(3),[sleepHours,setSleepHours]=useState(8),[awakenings,setAwakenings]=useState(0),[concentration,setConcentration]=useState(3),[stress,setStress]=useState(3);
 const [physical,setPhysical]=useState('Comfortable'),[physicalNotes,setPhysicalNotes]=useState(''),[observations,setObservations]=useState<string[]>([]);
 const [voice,setVoice]=useState<Voice|null>(null),[camera,setCamera]=useState<Camera|null>(null),[recording,setRecording]=useState(false),[capturing,setCapturing]=useState(false),[seconds,setSeconds]=useState(20),[result,setResult]=useState<AIAnalysisResponse|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const streamRef=useRef<MediaStream|null>(null),videoRef=useRef<HTMLVideoElement|null>(null),canvasRef=useRef<HTMLCanvasElement|null>(null);
 useEffect(()=>()=>streamRef.current?.getTracks().forEach(t=>t.stop()),[]);
 const info=(t:string,d:string)=><InfoButton title={t}>{d}</InfoButton>;
 const changeLanguage=(l:AppLanguage)=>{setLanguage(l);setPrompt((PROMPTS[l]||PROMPTS.English)[0]);};
 const speak=(message:string)=>{
  if(!('speechSynthesis' in window))return;
  window.speechSynthesis.cancel();
  const utterance=new SpeechSynthesisUtterance(message);
  utterance.lang=APP_LANGUAGES.find(item=>item.value===language)?.locale|| (language==='French'?'fr':'en');
  utterance.rate=.92;utterance.pitch=1;
  window.speechSynthesis.speak(utterance);
 };
 const voiceGuidance=()=>speak(`We are starting the voice check. Move to a quiet room. Keep your phone still, with the microphone about fifteen to twenty centimetres from your mouth. Do not cover the microphone. Listen to the speaking prompt, then speak naturally for the full twenty seconds. Tell us about your day from when you woke up until now. You may mention how you slept, your energy, activities, and anything that feels different from your usual day. Use your normal voice and comfortable pace. Do not whisper, shout, imitate a voice, or force your pitch. If you pause or stumble, continue naturally. The recording must pass the eighty percent technical quality threshold before the camera step unlocks. This is a recording check, not a health accuracy score.`);
 const cameraGuidance=()=>speak(`We are starting the camera check. Place your phone securely at eye level, about an arm's length away. Sit comfortably and keep your full face, forehead, chin, neck, and shoulders visible. Face a soft light source. Do not sit with a bright window behind you. Keep your face centred and look toward the camera. Keep your head in a comfortable forward-facing position. Blink and breathe normally. Do not force expressions, hold your breath, or make fast head movements. This version checks lighting and image stability only. It does not yet track or validate left and right head movements. The camera check must pass the eighty percent technical capture threshold before the daily check-in can be submitted.`);
 useEffect(()=>{if(step===2)voiceGuidance();if(step===3)cameraGuidance();return()=>{if('speechSynthesis' in window)window.speechSynthesis.cancel();};},[step,language]);
 const toggleObs=(x:string)=>setObservations(v=>v.includes(x)?v.filter(y=>y!==x):[...v,x]);

 const record=async()=>{
  setError('');setVoice(null);
  try{
   if(!window.MediaRecorder)throw new Error('Audio recording is not supported by this browser. Please update Chrome or use the installed NUVYRA app.');
   const stream=await requestMedia('microphone',{audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});streamRef.current=stream;
   const mimeCandidates=['audio/webm;codecs=opus','audio/webm','audio/mp4'];
   const mime=mimeCandidates.find(type=>MediaRecorder.isTypeSupported(type));
   const r=new MediaRecorder(stream,mime?{mimeType:mime}:undefined),chunks:Blob[]=[];r.ondataavailable=e=>e.data.size&&chunks.push(e.data);
   r.onstop=async()=>{try{const v=await getVoice(new Blob(chunks,{type:mime}));if(v.duration<10||v.qualityScore<80){setError(`Voice recording quality is ${v.qualityScore}%. NUVYRA requires at least 80% to continue. Please record again: use a quiet room, keep the microphone about 15–20 cm away, speak clearly at your usual pace, and read the full prompt. This score checks recording conditions only, not your health.`);setVoice(null);}else setVoice(v);}catch{setError('Voice analysis failed. Please record the sample again.');}finally{stream.getTracks().forEach(t=>t.stop());streamRef.current=null;setRecording(false);}};
   r.start(250);setRecording(true);const started=performance.now();const timer=window.setInterval(()=>{const left=Math.max(0,Math.ceil(20-(performance.now()-started)/1000));setSeconds(left);if(!left)window.clearInterval(timer);},250);
   window.setTimeout(()=>{window.clearInterval(timer);if(r.state!=='inactive')r.stop();},20000);
  }catch(e){streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;setError(e instanceof Error?e.message:'Microphone could not be started. Check app permissions and try again.');setRecording(false);}
 };

 const capture=async()=>{
  setError('');setCamera(null);setCapturing(true);
  try{
   const stream=await requestMedia('camera',{video:{width:{ideal:640},height:{ideal:480},facingMode:{ideal:'user'}},audio:false});streamRef.current=stream;
   if(!videoRef.current||!canvasRef.current)throw Error('Camera preview is unavailable.');
   videoRef.current.srcObject=stream;await videoRef.current.play();const canvas=canvasRef.current;canvas.width=160;canvas.height=120;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Camera analysis is unavailable.');
   const motion:number[]=[],lum:number[]=[];let prev:Uint8ClampedArray|null=null;const start=performance.now();
   while(performance.now()-start<10000){ctx.drawImage(videoRef.current,0,0,160,120);const p=ctx.getImageData(0,0,160,120).data;let total=0,diff=0;
    for(let i=0;i<p.length;i+=4){const v=.2126*p[i]+.7152*p[i+1]+.0722*p[i+2];total+=v;if(prev)diff+=Math.abs(v-(.2126*prev[i]+.7152*prev[i+1]+.0722*prev[i+2]));}
    motion.push(diff/(160*120*255));lum.push(total/(160*120*255));prev=new Uint8ClampedArray(p);await new Promise(r=>setTimeout(r,200));
   }
   const avgLum=mean(lum),motionVariability=sd(motion);
   const lightingScore=clamp(1-Math.abs(avgLum-.45)/.45,0,1),stabilityScore=clamp(1-motionVariability/.12,0,1);
   const qualityScore=Math.round((lightingScore*.5+stabilityScore*.5)*100);
   if(qualityScore<80)throw Error(`Camera recording quality is ${qualityScore}%. NUVYRA requires at least 80% to continue. Please try again: face a soft light source, avoid a bright window behind you, place the camera at eye level, keep your face and shoulders centered, and steady the phone. This score checks lighting and image stability only; it does not assess your health or verify head position.`);
   const out:Camera={quality_score:qualityScore};
   setCamera(out);
  }catch(e:any){setError(e?.message||'Camera analysis failed. Please check camera permission and try again.');}
  finally{streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;setCapturing(false);}
 };

 const validateSurvey=()=>{if(!mood||moodLevel<1||energy<1||fatigue<1||sleep<1||concentration<1||stress<1){setError('Please answer every required 1–5 check-in field before continuing.');return false;}if(sleepHours<0||awakenings<0){setError('Please enter valid sleep hours and awakenings.');return false;}setError('');return true;};
 const analyze=async()=>{
  setError('');
  if(!voice){setError('Voice analysis is missing. Please record a usable voice sample before continuing.');setStep(2);return;}
  if(!camera){setError('Camera analysis is missing. Please complete the camera check before continuing.');setStep(3);return;}
  setLoading(true);
  try{setResult(await aiService.analyze({fatigue,energy_level:energy,sleep_quality:sleep, sleep_hours:sleepHours,sleep_awakenings:awakenings,stress_level:stress,concentration_level:concentration,physical_comfort:PHYSICAL_INDEX[physical]||1,physical_comfort_observation:physical,physical_comfort_notes:physicalNotes,mood_level:moodLevel,mood_deviation:moodMap[mood]??0,symptom_burden:observations.length/6,voice_language:language,voice_rms:voice.rms,voice_zero_crossing_rate:voice.zcr,voice_pitch_hz:voice.pitch,voice_speech_activity:voice.speechActivity,source_duration_seconds:voice.duration}));}
  catch(e:any){if(e?.status===401)navigate('/login');else setError(e?.message||'NUVYRA analysis failed. Please try the check-in again.');}
  finally{setLoading(false);}
 };
 const PHYSICAL_OPTIONS_EN=['Comfortable','Muscle stiffness','Tremor sensation','Physical weakness','Pain/discomfort','Shortness of breath','Other'];
 const PHYSICAL_INDEX:Record<string,number>={'Comfortable':1,'Muscle stiffness':2,'Tremor sensation':3,'Physical weakness':4,'Pain/discomfort':5,'Shortness of breath':6,'Other':7};

 return <main className="mx-auto max-w-4xl space-y-6 py-5 text-white">
  <div className="flex justify-between text-xs text-slate-500"><span>DAILY MULTIMODAL CHECK-IN · {step}/4</span><span>PERSONAL BASELINE</span></div>
  {error&&<div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">{error}</div>}

  {step===1&&<section className="rounded-2xl border border-slate-800 bg-[#111827] p-6 space-y-6">
   <div><div className="flex items-center gap-2"><h1 className="text-2xl font-semibold">How are you today?</h1>{info('About this step','These are self-reported context signals. Required fields must be completed before analysis. They are not a diagnosis.')}</div><p className="mt-2 text-sm text-slate-400">Use your usual experience today; do not try to give the answer you think NUVYRA expects.</p></div>
   <div><label className="text-sm text-slate-300">Overall experience</label><div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">{[['better','Better than usual','↗'],['same','About the same','•'],['different','A little different','◌'],['significant','Noticeably different','!']].map(([k,v,icon])=><button type="button" key={k} aria-pressed={mood===k} onClick={()=>setMood(k)} className={`min-h-[104px] rounded-2xl border p-4 text-left transition-all duration-200 ${mood===k?'border-sky-400 bg-sky-500/10 ring-1 ring-sky-400/30':'border-slate-800 bg-slate-900/70 hover:border-slate-600 hover:bg-slate-800'}`}><span className="flex items-center justify-between"><span className="text-2xl text-sky-300">{icon}</span><span className={`h-5 w-5 rounded-full border flex items-center justify-center text-[10px] ${mood===k?'border-sky-400 bg-sky-400 text-slate-950':'border-slate-600 text-transparent'}`}>✓</span></span><span className="mt-3 block text-sm font-medium text-white">{v}</span></button>)}</div></div>
   <div className="grid md:grid-cols-2 gap-5">
    {([['Energy level',energy,setEnergy],['Fatigue',fatigue,setFatigue],['Sleep quality',sleep,setSleep],['Concentration',concentration,setConcentration],['Stress',stress,setStress],['Mood',moodLevel,setMoodLevel]] as Array<[string,number,React.Dispatch<React.SetStateAction<number>>]>).map(([label,value,setter])=><label key={label} className="block"><span className="flex justify-between text-sm text-slate-300"><span>{label}</span><span>{value}/5</span></span><input aria-label={label} className="w-full mt-2" type="range" min="1" max="5" value={value} onChange={e=>setter(Number(e.target.value))}/></label>)}
   </div>
   <div className="grid md:grid-cols-2 gap-4"><label className="block"><span className="text-sm text-slate-300">Hours slept</span><input aria-label="Hours slept" className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950 p-3" type="number" min="0" max="24" step=".5" value={sleepHours} onChange={e=>setSleepHours(Number(e.target.value))}/></label><label className="block"><span className="text-sm text-slate-300">Number of awakenings</span><input aria-label="Number of awakenings" className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950 p-3" type="number" min="0" max="30" value={awakenings} onChange={e=>setAwakenings(Number(e.target.value))}/></label></div>
   <div><div className="text-sm text-slate-300 mb-2">Physical comfort</div><div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">{(PHYSICAL[language] || PHYSICAL.English).map((item,index)=><button type="button" key={item} aria-pressed={physical===PHYSICAL_OPTIONS_EN[index]} onClick={()=>setPhysical(PHYSICAL_OPTIONS_EN[index])} className={`min-h-[82px] rounded-xl border p-3 text-left text-xs transition-all ${physical===PHYSICAL_OPTIONS_EN[index]?'border-sky-400 bg-sky-500/10 text-sky-200 ring-1 ring-sky-400/20':'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-600'}`}><span className="block text-lg text-sky-300 mb-2">{['✓','⌁','≈','↘','◇','≋','+'][index]}</span><span>{item}</span></button>)}</div><textarea aria-label="Physical comfort notes" value={physicalNotes} onChange={e=>setPhysicalNotes(e.target.value)} placeholder="Optional notes" className="mt-3 w-full rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm" rows={2}/></div>
   <div><div className="text-sm text-slate-300 mb-2">Anything you noticed? <span className="text-slate-500">Optional</span></div><div className="flex flex-wrap gap-2">{(OBS[language] || OBS.English).map(item=><button type="button" key={item} onClick={()=>toggleObs(item)} className={`rounded-lg border px-3 py-2 text-xs ${observations.includes(item)?'border-sky-400 bg-sky-500/10 text-sky-300':'border-slate-800 text-slate-400'}`}>{item}</button>)}</div></div>
   <button type="button" onClick={()=>validateSurvey()&&setStep(2)} className="w-full rounded-xl bg-sky-500 py-3 font-semibold text-slate-950">Continue to voice</button>
  </section>}

  {step===2&&<section className="rounded-2xl border border-slate-800 bg-[#111827] p-6 space-y-6">
   <div><div className="flex items-center gap-2"><h2 className="text-2xl font-semibold">Voice and speech</h2>{info('Voice capture','NUVYRA needs a usable voice sample to calculate voice features. A short or very quiet sample is rejected instead of being scored as missing data.')}</div><div className="grid grid-cols-3 gap-2 mt-3">{APP_LANGUAGES.map(({value:l,native})=><button type="button" key={l} onClick={()=>changeLanguage(l)} className={`rounded-xl border py-2 text-xs ${language===l?'bg-white text-slate-950':'border-slate-700 text-slate-300'}`}>{native}</button>)}</div></div>
   <div className="rounded-xl border border-slate-800 bg-slate-900 p-5"><p className="text-xs uppercase text-slate-500">Speaking prompt — say this aloud</p><p className="mt-2 leading-7">{prompt}</p><p className="mt-2 text-sm text-slate-300">After the prompt, describe your day in your own words. Include sleep, energy, activities, and anything different from your normal day. Do not guess or exaggerate.</p><button type="button" onClick={()=>speak(prompt)} className="mt-3 mr-4 rounded-lg border border-slate-700 px-3 py-2 text-sm text-sky-300">Hear speaking prompt</button><button type="button" onClick={()=>{const a=(PROMPTS[language] || PROMPTS.English).filter(x=>x!==prompt);setPrompt(a[Math.floor(Math.random()*a.length)]||(PROMPTS[language] || PROMPTS.English)[0])}} className="mt-3 text-sm text-sky-300 underline">Use another prompt</button></div>
   <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 text-sm leading-6 text-slate-300"><strong className="text-white">Listen first, then follow each instruction</strong><button type="button" onClick={voiceGuidance} className="ml-3 rounded-lg border border-slate-700 px-3 py-1 text-xs text-sky-300">Play voice instructions</button><ol className="mt-2 list-decimal space-y-1 pl-5"><li>Move to a quiet room and pause music, television, or nearby conversations.</li><li>Keep the phone still, with its microphone about 15–20 cm from your mouth. Do not cover the microphone.</li><li>Read the prompt shown above in the selected language. Speak in your everyday voice, at a comfortable pace and volume.</li><li>Use complete natural sentences for the full recording. Do not whisper, shout, imitate an accent, or force your pitch.</li><li>If you stumble, simply continue naturally. You can record again if you prefer.</li></ol><p className="mt-2 text-xs text-slate-400">The 80% threshold is a technical audio-capture gate only. It is not speech accuracy, clinical accuracy, or a health score. If the sample is rejected, the camera step stays locked until a new voice sample passes.</p></div>
   <button type="button" disabled={recording} onClick={record} className="mx-auto block rounded-xl bg-sky-500 px-6 py-3 font-semibold text-slate-950 disabled:opacity-50">{recording?`Recording… ${seconds}s`:voice?'Voice sample captured':'Record 20-second sample'}</button>
   {voice&&<div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center text-xs text-slate-400">{[['Recording quality',`${voice.qualityScore}%`],['Duration',`${voice.duration.toFixed(1)} s`],['Pitch estimate',`${voice.pitch.toFixed(0)} Hz`],['Speech activity',`${Math.round(voice.speechActivity*100)}%`],['Sound level',voice.rms.toFixed(4)]].map(([k,v])=><div key={String(k)} className="rounded-xl bg-slate-900 p-3"><b className="block text-white">{v}</b><span>{k}</span></div>)}</div>}
   <button type="button" disabled={!voice} onClick={()=>setStep(3)} className="w-full rounded-xl bg-teal-500 py-3 font-semibold text-slate-950 disabled:opacity-40">Continue to camera</button>
  </section>}

  {step===3&&<section className="rounded-2xl border border-slate-800 bg-[#111827] p-6 space-y-6">
   <div><div className="flex items-center gap-2"><h2 className="text-2xl font-semibold">Camera and visual check</h2>{info('Camera instructions','For a usable capture, keep the camera at eye level, center your face and upper torso, face a light source, avoid a bright light behind you, keep the camera steady, and remain naturally still.')}</div><div className="mt-3 rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 text-sm leading-6 text-slate-300"><strong className="text-white">Listen first, then follow each instruction</strong><button type="button" onClick={cameraGuidance} className="ml-3 rounded-lg border border-slate-700 px-3 py-1 text-xs text-sky-300">Play camera instructions</button><ol className="mt-2 list-decimal space-y-1 pl-5"><li>Prop your phone securely in portrait or landscape position; do not hold it while recording.</li><li>Place the camera at approximately eye level, about an arm’s length away.</li><li>Sit comfortably with your full face, forehead, chin, neck, and shoulders visible in the preview. Keep your face near the centre.</li><li>Face a soft, even light. Avoid a bright window or lamp directly behind you, harsh shadows, and very dim rooms.</li><li>Look towards the camera, keep your head in a comfortable neutral position, and let your face relax.</li><li>During the short capture, keep your head facing forward and centred. Blink and breathe normally. Do not force blinking, hold your breath, exaggerate expressions, or make large or fast head movements.</li></ol><p className="mt-2 text-xs text-slate-400">Important: this version does not have validated face-landmark or head-pose tracking. It cannot confirm left/right turns, blinking rate, or breathing patterns. The camera score is only a technical lighting-and-stability check; it is not evidence that the visual health information is accurate.</p></div></div>
   <video ref={videoRef} muted playsInline className="mx-auto aspect-video w-full max-w-md rounded-xl bg-black object-cover scale-x-[-1]"/><canvas ref={canvasRef} className="hidden"/>
   <button type="button" disabled={capturing} onClick={capture} className="mx-auto block rounded-xl bg-teal-500 px-6 py-3 font-semibold text-slate-950 disabled:opacity-50">{capturing?'Checking camera…':camera?'Camera sample captured':'Start 10-second camera check'}</button>
   {camera&&<div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4"><div className="text-xs text-slate-400">Camera recording quality</div><div className="mt-1 text-2xl font-semibold text-emerald-300">{camera.quality_score}%</div><p className="mt-1 text-xs text-slate-400">Passed the 80% lighting-and-stability threshold. This is not a health or diagnostic confidence score.</p></div>}
   <button type="button" disabled={!camera} onClick={()=>setStep(4)} className="w-full rounded-xl bg-sky-500 py-3 font-semibold text-slate-950 disabled:opacity-40">Review check-in</button>
  </section>}

  {step===4&&<section className="rounded-2xl border border-slate-800 bg-[#111827] p-6 space-y-6">
   <div><h2 className="text-2xl font-semibold">NUVYRA analysis</h2><p className="mt-2 text-sm text-slate-400">NUVYRA will only score the check-in after required inputs and usable voice and camera samples are present.</p></div>
   {!result?<><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[['Questionnaire',true],['Voice',!!voice],['Camera',!!camera],['Baseline','available']].map(([k,v])=><div key={String(k)} className="rounded-xl bg-slate-900 p-4"><div className="text-sm text-white">{k}</div><div className="mt-2 text-xs text-emerald-300">{v?'Ready':'Unavailable'}</div></div>)}</div><button type="button" disabled={loading} onClick={analyze} className="w-full rounded-xl bg-sky-500 py-3 font-semibold text-slate-950 disabled:opacity-50">{loading?'Analyzing…':'Analyze check-in'}</button></>:<><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[['Pattern score',result.overall_score.toFixed(1)],['Confidence',`${Math.round(result.confidence*100)}%`],['Data quality',`${Math.round(result.data_quality_score*100)}%`],['Baseline observations',String(result.baseline_observations)]].map(([k,v])=><div key={String(k)} className="rounded-xl bg-slate-900 p-4"><div className="text-xs text-slate-400">{k}</div><b className="mt-2 block text-white">{v}</b></div>)}</div><div className="rounded-xl border border-slate-800 p-4"><h3 className="font-semibold">What NUVYRA noticed</h3><p className="mt-2 text-sm leading-6 text-slate-300">{result.explanation}</p></div><div className="rounded-xl border border-slate-800 p-4"><h3 className="font-semibold">Data quality and limitations</h3><ul className="mt-2 space-y-1 text-sm text-slate-400">{(result.limitations||[]).map(x=><li key={x}>{x}</li>)}{(result.missing_modalities||[]).map(x=><li key={x}>Missing: {x}</li>)}</ul></div><button type="button" onClick={()=>navigate('/trends')} className="w-full rounded-xl bg-teal-500 py-3 font-semibold text-slate-950">View longitudinal history</button></>}
   <button type="button" onClick={()=>setStep(Math.max(1,step-1))} className="text-sm text-slate-400">Back</button>
  </section>}
 </main>;
};