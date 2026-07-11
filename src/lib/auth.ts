import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { getDb } from "./db";

// Checked lazily (not at module load) so `next build` can run without the secret.
function getSecret(): Uint8Array {
  if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
    throw new Error(
      "SESSION_SECRET is not set. Add it as an environment variable (a long random string) before running in production."
    );
  }
  return new TextEncoder().encode(
    process.env.SESSION_SECRET ?? "dev-secret-change-me-before-going-live"
  );
}
const COOKIE = "school_session";

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "manager" | "employee";
  job_title: string;
  manager_id: number | null;
  template_id: number | null;
};

export async function createSession(userId: number) {
  const token = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

// Pages render in parallel with the layout, so every page must enforce
// login itself rather than relying on the layout's redirect.
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const uid = payload.uid as number;
    const user = getDb()
      .prepare(
        "SELECT id, name, email, role, job_title, manager_id, template_id FROM users WHERE id = ? AND active = 1"
      )
      .get(uid) as SessionUser | undefined;
    return user ?? null;
  } catch {
    return null;
  }
}
