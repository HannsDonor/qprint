import "server-only";
import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";

export type OwnerSession = {
  userId?: number;
  role?: "shop_owner";
  fullName?: string;
};

function options(): SessionOptions {
  const password = process.env.SESSION_PASSWORD;
  if (!password || password.length < 32) {
    throw new Error("Set SESSION_PASSWORD to a random value of at least 32 characters.");
  }

  return {
    cookieName: "qprint_owner_session",
    password,
    ttl: 8 * 60 * 60,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 8 * 60 * 60,
    },
  };
}

export async function getOwnerSession() {
  return getIronSession<OwnerSession>(await cookies(), options());
}
