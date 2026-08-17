import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { authService } from '../services/auth';
import { Lock, Mail, AlertCircle, Loader2, User, RefreshCw, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Logo from '../assets/logo.png';
import { API_BASE, api, resetAuthState } from '../services/api';
import { useAuthStore } from '../stores/useAuthStore';

export const LoginPage: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const isLocked = new URLSearchParams(location.search).get('locked') === 'true';
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const checkAuthStore = useAuthStore(state => state.checkAuth);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const googleError = params.get('error');
    const googleSignup = params.get('google_signup');
    const googleSuccess = params.get('google') === 'success';

    if (googleSuccess) {
      checkAuthStore()
        .then(() => navigate('/dashboard', { replace: true }))
        .catch(() => setError('Connexion Google valide, mais session locale introuvable.'));
      return;
    }

    if (googleError === 'google_cancelled') {
      // no-op
    } else if (googleError) {
      setError('Erreur Google Login. Vérifiez la configuration OAuth.');
    } else if (googleSignup === 'true') {
      setError('Compte créé via Google — en attente de validation par l\'administrateur.');
    }

    authService.isAuthenticated().then(async (isAuth) => {
      if (isAuth && !isLocked) {
        await checkAuthStore();
        await checkAuthStore();
        navigate('/dashboard');
      } else {
        setIsAuthenticated(isAuth);
      }
    });
  }, [location.search, checkAuthStore, navigate, isLocked]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      resetAuthState(); // Réarme le coupe-circuit auth avant chaque tentative de login
      if (isLogin) {
        await authService.login(email, password);
        if (isLocked) {
          // Si on était verrouillé, on tente de revérifier la licence
          await api.post('/clinics/recheck-license');
        }
        navigate('/dashboard');
      } else {
        navigate('/register');
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  };

  const handleRecheckLicense = async () => {
    setLoading(true);
    setError('');
    try {
      await api.post('/clinics/recheck-license');
      await checkAuthStore();
      navigate('/dashboard');
    } catch (err: any) {
      if (err.response?.status === 402) {
        setError("La licence est toujours invalide. Veuillez contacter le support ou mettre à jour votre abonnement.");
      } else {
        setError(err.response?.data?.detail || "Une erreur inattendue s'est produite.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await authService.logout();
    setIsAuthenticated(false);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background Shapes */}
      <div className={`absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full blur-3xl animate-pulse ${isLocked ? 'bg-red-500/10' : 'bg-primary/5'}`} />
      <div className={`absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full blur-3xl animate-pulse ${isLocked ? 'bg-red-500/10' : 'bg-primary/10'}`} />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        <div className={`bg-white/80 backdrop-blur-xl border border-white p-8 rounded-3xl shadow-2xl ${isLocked ? 'shadow-red-500/10' : 'shadow-primary/10'}`}>
          <div className="flex flex-col items-center mb-8">
            <div className="mb-4">
              <img src={Logo} alt="Digital Crown" className="h-16 w-auto" />
            </div>
            {isLocked ? (
              <>
                <h1 className="font-bold text-red-600 text-xl text-center flex items-center gap-2">
                  <Lock className="w-5 h-5" /> Accès Verrouillé
                </h1>
                <p className="text-slate-500 text-sm mt-2 text-center">
                  Votre licence d'utilisation a expiré ou est invalide.
                </p>
              </>
            ) : (
              <>
                <h1 className="font-bold text-slate-900 text-xl text-center">
                  {isLogin ? 'Digital Crown AI' : 'Créer votre Cabinet'}
                </h1>
                <p className="text-slate-500 text-sm mt-1 text-center">
                  {isLogin ? 'Connectez-vous à votre espace' : 'Inscrivez-vous pour commencer'}
                </p>
              </>
            )}
          </div>

          {/* SI VERROUILLE ET DEJA CONNECTE -> On affiche juste le bouton pour revérifier */}
          {isLocked && isAuthenticated ? (
            <div className="space-y-5">
              <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl text-sm text-orange-800 text-center">
                Vous êtes connecté en tant qu'Administrateur. Vous pouvez forcer la revérification de la licence si vous venez de la renouveler.
              </div>

              {error && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm"
                >
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p>{error}</p>
                </motion.div>
              )}

              <button
                onClick={handleRecheckLicense}
                disabled={loading}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-red-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                Revérifier la licence
              </button>
              
              <button
                onClick={handleLogout}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition-colors font-medium text-sm mt-2"
              >
                <LogOut className="w-4 h-4" /> Se déconnecter
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <AnimatePresence mode="popLayout">
                {!isLogin && !isLocked && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <label className="block text-sm font-medium text-slate-700 mb-2">Nom Complet</label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                        placeholder="Dr. Ahmed Benmoussa"
                        required={!isLogin}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Email Professionnel</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    placeholder="nom@cabinet.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Mot de passe</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    placeholder="••••••••"
                    required
                    minLength={4}
                  />
                </div>
              </div>

              {isLogin && !isLocked && (
                <div className="flex items-center">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input 
                      type="checkbox" 
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary/20 transition-all" 
                    />
                    <span className="text-sm text-slate-600 group-hover:text-slate-900 transition-colors">Rester connecté</span>
                  </label>
                </div>
              )}

              {error && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm"
                >
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p>{error}</p>
                </motion.div>
              )}

              <button
                type="submit"
                disabled={loading}
                className={`w-full text-white font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${isLocked ? 'bg-red-600 hover:bg-red-700 shadow-red-600/20' : 'bg-primary hover:bg-primary/90 shadow-primary/20'}`}
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  isLocked ? 'S\'authentifier en tant qu\'Admin' : (isLogin ? 'Se connecter' : 'Créer mon compte')
                )}
              </button>
            </form>
          )}

          {!isLocked && !isAuthenticated && (
            <div className="mt-6 text-center">
              <p className="text-sm text-slate-600">
                {isLogin ? "Nouveau sur Digital Crown ?" : "Vous avez déjà un compte ?"}
                <button 
                  type="button" 
                  onClick={() => {
                    if (isLogin) {
                      navigate('/register');
                      return;
                    }
                    setIsLogin(true);
                    setError('');
                  }} 
                  className="ml-2 font-bold text-primary hover:underline"
                >
                  {isLogin ? "Créer un compte" : "Se connecter"}
                </button>
              </p>
            </div>
          )}

          {(!isAuthenticated || !isLocked) && (
            <div className="mt-6">
              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-100" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-4 text-slate-400">Ou continuer avec</span>
                </div>
              </div>

              <a
                href={`${API_BASE}/api/auth/google/authorize`}
                className="w-full flex items-center justify-center gap-3 py-3 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all font-medium text-slate-700"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Google
              </a>
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-400">
              © 2026 SANINOVA - Digital Crown Elite Edition v4.0
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
