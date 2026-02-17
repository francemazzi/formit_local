import { FastifyRequest, FastifyReply } from "fastify";
import {
  verifyAccessToken,
  ACCESS_COOKIE_NAME,
  AccessTokenPayload,
} from "./auth.utils";

declare module "fastify" {
  interface FastifyRequest {
    user?: AccessTokenPayload;
  }
}

export const requireAuth = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const token = request.cookies?.[ACCESS_COOKIE_NAME];

  if (!token) {
    reply.status(401).send({ error: "Authentication required" });
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    request.user = payload;
  } catch {
    reply.status(401).send({ error: "Invalid or expired token" });
    return;
  }
};

export const requireAdmin = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  if (!request.user) {
    reply.status(401).send({ error: "Authentication required" });
    return;
  }

  if (request.user.role !== "ADMIN") {
    reply.status(403).send({ error: "Admin access required" });
    return;
  }
};
