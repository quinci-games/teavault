import { useSearchParams } from 'react-router-dom';
import { authApi } from '../lib/api';
import { Leaf } from 'lucide-react';

const ERROR_MESSAGES: Record<string, string> = {
  not_allowed: "This email isn't on the allow list. Ask the admin to add you.",
  no_code: 'Sign-in cancelled.',
  auth_failed: 'Sign-in failed. Try again.',
};

export default function Login() {
  const [params] = useSearchParams();
  const error = params.get('error');

  return (
    <div className="h-full flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-tea-900/60 rounded-2xl p-8 flex flex-col items-center gap-6 border border-tea-800">
        <div className="w-16 h-16 rounded-full bg-tea-700 flex items-center justify-center">
          <Leaf className="w-8 h-8 text-tea-50" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-tea-50">TeaVault</h1>
          <p className="text-sm text-tea-300 mt-1">Sign in to access your collection</p>
        </div>

        {error && ERROR_MESSAGES[error] && (
          <div className="w-full p-3 rounded-lg bg-red-900/40 border border-red-700 text-red-200 text-sm">
            {ERROR_MESSAGES[error]}
          </div>
        )}

        <a
          href={authApi.loginUrl()}
          className="w-full py-3 rounded-xl bg-white text-gray-900 font-medium text-center hover:bg-gray-100 transition"
        >
          Sign in with Google
        </a>
      </div>
    </div>
  );
}
