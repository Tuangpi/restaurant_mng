import { useState } from "react";
import { useNavigate } from "react-router";
import { useLanguage } from "../hooks/useLanguage";
import { useAuth } from "../hooks/useAuth";
import { t, Language } from "../lib/translations";

export function Login() {
  const { t: tl, language } = useLanguage();
  const { login, isLoading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const res = await login(email, password);
    if (res.success) {
      navigate("/dashboard");
    } else {
      setError(res.error || tl("somethingWentWrong"));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-burmese-bg/50 px-4">
      <div className="max-w-md w-full bg-burmese-bg p-8 rounded-xl shadow-lg border border-burmese-secondary/20">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-burmese-primary">{tl(
            language as Language,
            "title"
          )}</h1>
          <p className="text-burmese-secondary">{tl("signInSubtitle")}</p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-burmese-secondary mb-1">
              {tl("email")}
            </label>
            <input
              type="email"
              required
              className="w-full px-4 py-2 border border-burmese-secondary/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-burmese-accent text-burmese-primary bg-burmese-bg"
              placeholder="you@restaurant.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-burmese-secondary mb-1">
              {tl("password")}
            </label>
            <input
              type="password"
              required
              className="w-full px-4 py-2 border border-burmese-secondary/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-burmese-accent text-burmese-primary bg-burmese-bg"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 bg-burmese-primary text-white rounded-lg font-medium disabled:opacity-50 hover:bg-burmese-secondary transition-colors"
          >
            {isLoading ? tl("loading") : tl("signIn")}
          </button>
        </form>
      </div>
    </div>
  );
}