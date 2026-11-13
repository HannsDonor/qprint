import "server-only";
import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";

export type OwnerSession = {
  userId?: number;
  role?: "shop_owner";
  fullName?: string;
};

const OWNER_SESSION_TTL_SECONDS = 5 * 60 * 60;

function options(): SessionOptions {
  const password = process.env.SESSION_PASSWORD;
  if (!password || password.length < 32) {
    throw new Error("Set SESSION_PASSWORD to a random value of at least 32 characters.");
  }

  return {
    cookieName: "qprint_owner_session",
    password,
    ttl: OWNER_SESSION_TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: OWNER_SESSION_TTL_SECONDS,
    },
  };
}

export async function getOwnerSession() {
  return getIronSession<OwnerSession>(await cookies(), options());
}
