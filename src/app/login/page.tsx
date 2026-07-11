import { redirect } from "next/navigation";
import { login } from "@/lib/actions";
import { getSessionUser } from "@/lib/auth";
import { inputCls, btnPrimary, Field } from "@/components/ui";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/");
  const params = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-navy-700 text-lg font-bold text-white">
            SW
          </div>
          <h1 className="text-xl font-semibold text-slate-900">School Work Tracker</h1>
          <p className="mt-1 text-sm text-slate-600">Sign in with your school account</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {params.error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              That email or password is not right. Please try again.
            </div>
          )}
          <form action={login} className="space-y-4">
            <Field label="Email">
              <input name="email" type="email" required autoFocus className={inputCls} placeholder="you@school.org" />
            </Field>
            <Field label="Password">
              <input name="password" type="password" required className={inputCls} placeholder="Your password" />
            </Field>
            <button type="submit" className={`${btnPrimary} w-full`}>
              Sign in
            </button>
          </form>
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">
          Forgotten your password? Ask your administrator to reset it.
        </p>
      </div>
    </main>
  );
}
