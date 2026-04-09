import {Clock} from 'lucide-react';
import {motion} from 'motion/react';

export function AppSignedOutScreen({
  onLogin,
}: {
  onLogin: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-indigo-50 to-white p-4">
      <motion.div
        initial={{opacity: 0, y: 20}}
        animate={{opacity: 1, y: 0}}
        className="bg-white p-10 rounded-2xl shadow-xl max-w-md w-full text-center border border-gray-100"
      >
        <div className="bg-indigo-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-200">
          <Clock className="text-white" size={32} />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">TimeClaim Pro</h1>
        <p className="text-gray-500 mb-8">Streamline your timesheets and expense claims in one place.</p>
        <button
          onClick={onLogin}
          className="w-full py-4 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-indigo-100 flex items-center justify-center gap-3"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="Google" />
          Sign in with Google
        </button>
      </motion.div>
    </div>
  );
}
