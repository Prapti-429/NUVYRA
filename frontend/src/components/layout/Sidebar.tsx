import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { NuvyraLogo } from '../common/NuvyraLogo';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage, AppLanguage } from '../../contexts/LanguageContext';

interface SidebarProps { onCloseMobile?: () => void; }
const navText: Record<AppLanguage, Record<string,string>> = {
  English: { intelligence:'Workspace', personal:'NUVYRA Personal', clinicalWorkspace:'NUVYRA Clinical', partner:'NUVYRA Partner', overview:'Overview', checkin:'Daily Check-in', biomarkers:'Biomarkers', trends:'Trends', timeline:'Timeline', clinical:'Clinical View', history:'Past History', notifications:'Notifications', reports:'Reports', profile:'Profile', settings:'Privacy & Settings', logout:'Log out', confirm:'Log out of NUVYRA?', cancel:'Cancel', signed:'You will be signed out of this device. Your account and saved NUVYRA data will not be deleted.' },
  Hindi: { intelligence:'वर्कस्पेस', personal:'NUVYRA Personal', clinicalWorkspace:'NUVYRA Clinical', partner:'NUVYRA Partner', overview:'ओवरव्यू', checkin:'दैनिक चेक-इन', biomarkers:'बायोमार्कर', trends:'ट्रेंड', timeline:'टाइमलाइन', clinical:'क्लिनिकल व्यू', history:'पिछला इतिहास', notifications:'सूचनाएँ', reports:'रिपोर्ट', profile:'प्रोफ़ाइल', settings:'गोपनीयता और सेटिंग्स', logout:'लॉग आउट', confirm:'क्या NUVYRA से लॉग आउट करना है?', cancel:'रद्द करें', signed:'आप इस डिवाइस से साइन आउट हो जाएंगे। आपका अकाउंट और सेव किया गया NUVYRA डेटा डिलीट नहीं होगा।' },
  French: { intelligence:'Espace de travail', personal:'NUVYRA Personal', clinicalWorkspace:'NUVYRA Clinical', partner:'NUVYRA Partner', overview:'Vue d’ensemble', checkin:'Contrôle quotidien', biomarkers:'Biomarqueurs', trends:'Tendances', timeline:'Chronologie', clinical:'Vue clinique', history:'Historique', notifications:'Notifications', reports:'Rapports', profile:'Profil', settings:'Confidentialité et réglages', logout:'Se déconnecter', confirm:'Se déconnecter de NUVYRA ?', cancel:'Annuler', signed:'Vous serez déconnecté de cet appareil. Votre compte et vos données NUVYRA enregistrées ne seront pas supprimés.' },
};

export const Sidebar: React.FC<SidebarProps> = ({ onCloseMobile }) => {
  const { user, logout } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const t = navText[language];
  const role = user?.role || 'patient';
  const navigation = role === 'patient'
    ? [{ key:'overview', href:'/dashboard' }, { key:'checkin', href:'/check-in' }, { key:'biomarkers', href:'/biomarkers' }, { key:'trends', href:'/trends' }, { key:'timeline', href:'/timeline' }, { key:'history', href:'/past-history' }, { key:'notifications', href:'/notifications' }, { key:'reports', href:'/reports' }]
    : role === 'administrator'
      ? [{ key:'partner', href:'/partner-workspace' }, { key:'clinicalWorkspace', href:'/clinical-workspace' }]
      : [{ key:'clinicalWorkspace', href:'/clinical-workspace' }];
  const confirmLogout = () => { setShowLogoutConfirm(false); logout(); };
  return <>
    <aside className="w-64 flex-shrink-0 bg-[#0E1524] border-r border-slate-800/80 flex flex-col justify-between h-screen sticky top-0">
      <div className="p-6"><NuvyraLogo size="md"/><div className="mt-8 space-y-1">
        <p className="px-3 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">{t.intelligence}</p>
        {navigation.map(item => <NavLink key={item.key} to={item.href} onClick={onCloseMobile} className={({isActive})=>`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium ${isActive?'bg-sky-500/10 text-sky-400 border border-sky-500/20':'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'}`}><span>{t[item.key]}</span></NavLink>)}
      </div></div>
      <div className="p-4 border-t border-slate-800/60 bg-[#0B101D] space-y-2">
        <NavLink to="/profile" onClick={onCloseMobile} className={({isActive})=>`flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${isActive?'bg-sky-500/10 text-white border border-sky-500/20':'text-slate-400 hover:text-white hover:bg-slate-800/40'}`}><span aria-hidden="true">👤</span><span>{t.profile}</span></NavLink>
        <NavLink to="/settings" onClick={onCloseMobile} className={({isActive})=>`block px-3 py-2 rounded-xl text-sm ${isActive?'bg-slate-800 text-white':'text-slate-400 hover:text-white hover:bg-slate-800/40'}`}>{t.settings}</NavLink>
        <button type="button" onClick={()=>navigate('/profile')} className="w-full px-3 py-2.5 flex items-center justify-between rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 text-left" aria-label="Open your profile"><div className="truncate"><p className="text-xs text-slate-200 truncate">{user?.full_name||'NUVYRA user'}</p><p className="text-[10px] text-slate-500 font-mono truncate">{user?.email||role}</p></div><span className="text-slate-500 text-xs ml-2" aria-hidden="true">›</span></button>
        <button type="button" onClick={()=>setShowLogoutConfirm(true)} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition" title={t.logout}><span className="text-lg leading-none" aria-hidden="true">↪</span><span>{t.logout}</span></button>
      </div>
    </aside>
    {showLogoutConfirm&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="logout-title"><div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-[#111827] p-6 shadow-2xl"><div className="flex items-center gap-3 mb-3"><div className="h-10 w-10 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-300 text-xl" aria-hidden="true">↪</div><h2 id="logout-title" className="text-lg font-semibold text-white">{t.confirm}</h2></div><p className="text-sm leading-6 text-slate-400">{t.signed}</p><div className="mt-6 grid grid-cols-2 gap-3"><button type="button" onClick={()=>setShowLogoutConfirm(false)} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-800">{t.cancel}</button><button type="button" onClick={confirmLogout} className="rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-400">{t.logout}</button></div></div></div>}
  </>;
};
