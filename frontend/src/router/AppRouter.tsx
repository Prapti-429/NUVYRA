import React, { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider, Navigate, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { ProtectedRoute } from '../components/common/ProtectedRoute';
import { LanguageProvider } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';

const DashboardPage=lazy(()=>import('../pages/DashboardPage').then(m=>({default:m.DashboardPage})));
const BiomarkersPage=lazy(()=>import('../pages/BiomarkersPage').then(m=>({default:m.BiomarkersPage})));
const TrendsPage=lazy(()=>import('../pages/TrendsPage').then(m=>({default:m.TrendsPage})));
const TimelinePage=lazy(()=>import('../pages/TimelinePage').then(m=>({default:m.TimelinePage})));
const ClinicalViewPage=lazy(()=>import('../pages/ClinicalViewPage').then(m=>({default:m.ClinicalViewPage})));
const ClinicalWorkspacePage=lazy(()=>import('../pages/ClinicalWorkspacePage').then(m=>({default:m.ClinicalWorkspacePage})));
const PartnerWorkspacePage=lazy(()=>import('../pages/PartnerWorkspacePage').then(m=>({default:m.PartnerWorkspacePage})));
const CheckInPage=lazy(()=>import('../pages/CheckInResearchPage').then(m=>({default:m.CheckInResearchPage})));
const ReportsPage=lazy(()=>import('../pages/ReportsPage').then(m=>({default:m.ReportsPage})));
const PastHistoryPage=lazy(()=>import('../pages/PastHistoryPage').then(m=>({default:m.PastHistoryPage})));
const NotificationsPage=lazy(()=>import('../pages/NotificationsPage').then(m=>({default:m.NotificationsPage})));
const SettingsPage=lazy(()=>import('../pages/SettingsPage').then(m=>({default:m.SettingsPage})));
const ProfilePage=lazy(()=>import('../pages/ProfilePage').then(m=>({default:m.ProfilePage})));
const WelcomePage=lazy(()=>import('../components/NuvyraWelcome').then(m=>({default:m.default})));
const LoginPage=lazy(()=>import('../pages/LoginPage').then(m=>({default:m.LoginPage})));
const RegisterPage=lazy(()=>import('../pages/RegisterPage').then(m=>({default:m.RegisterPage})));
const ForgotPasswordPage=lazy(()=>import('../pages/ForgotPasswordPage').then(m=>({default:m.ForgotPasswordPage})));

const FallbackLoader=()=> <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-sky-400 border-t-transparent animate-spin"/></div>;
const lazyElement=(Component:React.LazyExoticComponent<React.ComponentType>)=><Suspense fallback={<FallbackLoader/>}><Component/></Suspense>;
const onboardingKey = (userId?: string) => userId ? `nuvyra_onboarding_complete:${userId}` : 'nuvyra_onboarding_complete';

const FirstVisitRedirect: React.FC = () => {
  const { user } = useAuth();
  const role = user?.role || 'patient';
  if (role === 'administrator') return <Navigate to="/partner-workspace" replace />;
  if (role === 'clinician' || role === 'researcher') return <Navigate to="/clinical-workspace" replace />;
  return <Navigate to={localStorage.getItem(onboardingKey(user?.id)) === 'true' ? '/dashboard' : '/welcome'} replace />;
};

const WelcomeRoute: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const key = onboardingKey(user?.id);
  return <WelcomePage onComplete={() => { localStorage.setItem(key, 'true'); navigate('/dashboard', { replace: true }); }} />;
};

const router=createBrowserRouter([
  {path:'/login',element:lazyElement(LoginPage)},
  {path:'/register',element:lazyElement(RegisterPage)},
  {path:'/forgot-password',element:lazyElement(ForgotPasswordPage)},
  {path:'/reset-password',element:lazyElement(ForgotPasswordPage)},
  {element:<ProtectedRoute/>,children:[
    {path:'/welcome',element:<WelcomeRoute/>},
    {path:'/',element:<AppShell/>,children:[
      {index:true,element:<FirstVisitRedirect/>},
      {path:'dashboard',element:<ProtectedRoute allowedRoles={['patient']}>{lazyElement(DashboardPage)}</ProtectedRoute>},
      {path:'biomarkers',element:<ProtectedRoute allowedRoles={['patient']}>{lazyElement(BiomarkersPage)}</ProtectedRoute>},
      {path:'trends',element:<ProtectedRoute allowedRoles={['patient']}>{lazyElement(TrendsPage)}</ProtectedRoute>},
      {path:'timeline',element:<ProtectedRoute allowedRoles={['patient']}>{lazyElement(TimelinePage)}</ProtectedRoute>},
      {path:'clinical-view',element:<ProtectedRoute allowedRoles={['patient','clinician','researcher','administrator']}>{lazyElement(ClinicalViewPage)}</ProtectedRoute>},
      {path:'clinical-workspace',element:<ProtectedRoute allowedRoles={['clinician','researcher','administrator']}>{lazyElement(ClinicalWorkspacePage)}</ProtectedRoute>},
      {path:'partner-workspace',element:<ProtectedRoute allowedRoles={['administrator']}>{lazyElement(PartnerWorkspacePage)}</ProtectedRoute>},
      {path:'check-in',element:<ProtectedRoute allowedRoles={['patient']}>{lazyElement(CheckInPage)}</ProtectedRoute>},
      {path:'reports',element:<ProtectedRoute allowedRoles={['patient']}>{lazyElement(ReportsPage)}</ProtectedRoute>},
      {path:'past-history',element:<ProtectedRoute allowedRoles={['patient']}>{lazyElement(PastHistoryPage)}</ProtectedRoute>},
      {path:'notifications',element:<ProtectedRoute allowedRoles={['patient']}>{lazyElement(NotificationsPage)}</ProtectedRoute>},
      {path:'profile',element:lazyElement(ProfilePage)},
      {path:'settings',element:lazyElement(SettingsPage)}
    ]}
  ]},
  {path:'*',element:<Navigate to="/" replace/>}
]);
export const AppRouter:React.FC=()=> <LanguageProvider><RouterProvider router={router}/></LanguageProvider>;
export default AppRouter;
