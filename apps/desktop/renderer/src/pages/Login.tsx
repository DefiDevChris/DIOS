import { useAuth } from '../contexts/AuthContext';
import { logger } from '@dios/shared';
import { useNavigate, Navigate } from 'react-router';
import { LogIn } from 'lucide-react';
import LeafLogo from '../components/LeafLogo';

export default function Login() {
  const { signInWithGoogle, user } = useAuth();
  const navigate = useNavigate();

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleLogin = async () => {
    try {
      await signInWithGoogle();
      navigate('/');
    } catch (error) {
      logger.error('Login failed', error);
    }
  };

  return (
    <div className="min-h-screen bg-[#F9F8F6] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md flex flex-col items-center">
        <LeafLogo size={56} />
        <h2 className="mt-4 text-center text-3xl font-extrabold text-stone-900 tracking-tight">
          DIOS Studio
        </h2>
        <p className="mt-2 text-center text-sm text-stone-500">
          Field Inspector CRM & Routing Dashboard
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm sm:rounded-3xl sm:px-10 border border-stone-100">
          <button
            onClick={handleLogin}
            className="w-full flex justify-center items-center gap-3 py-3 px-4 rounded-xl text-sm font-medium text-white bg-[#D49A6A] hover:bg-[#c28a5c] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#D49A6A] transition-colors shadow-sm"
          >
            <LogIn size={20} />
            Sign in with Google
          </button>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-stone-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-stone-400">
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
