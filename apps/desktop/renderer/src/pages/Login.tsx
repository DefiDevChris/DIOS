import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { logger } from '@dios/shared';
import { useNavigate, Navigate } from 'react-router';
import { LogIn, Loader2 } from 'lucide-react';
import LeafLogo from '../components/LeafLogo';

export default function Login() {
  const { signInWithGoogle, user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleLogin = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
      navigate('/');
    } catch (error) {
      logger.error('Login failed', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen luxury-ambient flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md flex flex-col items-center relative z-10">
        <div className="luxury-logo-orb w-20 h-20 rounded-full flex items-center justify-center mb-6" style={{
          background: 'linear-gradient(135deg, rgba(212,165,116,0.2) 0%, rgba(212,165,116,0.08) 100%)',
        }}>
          <LeafLogo size={36} fill="#d4a574" />
        </div>
        <h2 className="font-serif-display text-4xl font-semibold text-[#2a2420] tracking-wide">
          DIOS Studio
        </h2>
        <p className="mt-2 text-center text-sm text-[#8b7355] font-medium">
          Field Inspector CRM & Routing Dashboard
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="luxury-card rounded-[28px] py-10 px-8 sm:px-10">
          <button
            onClick={handleLogin}
            disabled={loading}
            className="luxury-btn w-full flex justify-center items-center gap-3 py-4 px-4 rounded-2xl text-[15px] font-bold text-white border-0 cursor-pointer"
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : <LogIn size={20} />}
            {loading ? 'Signing in...' : 'Sign in with Google'}
          </button>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="luxury-divider w-full" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-3 text-[#a89b8c] font-medium" style={{ background: 'rgba(255,255,255,0.7)' }}>
                  Requires Google Workspace Account
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
