import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import { getDatabaseClient } from "../prisma.client";
import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  COOKIE_OPTIONS,
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  REFRESH_TOKEN_EXPIRY_MS,
} from "../auth/auth.utils";
import { requireAuth } from "../auth/auth.middleware";
import { checkUserQuota } from "../auth/quota.utils";

interface RegisterBody {
  email: string;
  password: string;
}

interface LoginBody {
  email: string;
  password: string;
}

export class AuthController {
  async registerRoutes(fastify: FastifyInstance): Promise<void> {
    // POST /auth/register (rate limited: 5 per 15 min)
    fastify.post<{ Body: RegisterBody }>(
      "/auth/register",
      {
        config: {
          rateLimit: {
            max: 5,
            timeWindow: "15 minutes",
          },
        },
        schema: {
          description: "Register a new user account",
          tags: ["Auth"],
          body: {
            type: "object",
            required: ["email", "password"],
            properties: {
              email: { type: "string", format: "email" },
              password: { type: "string", minLength: 10 },
            },
          },
        },
      },
      async (request, reply) => {
        const { email, password } = request.body;
        const client = getDatabaseClient();

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return reply.status(400).send({ error: "Formato email non valido" });
        }

        if (password.length < 10) {
          return reply
            .status(400)
            .send({ error: "La password deve avere almeno 10 caratteri" });
        }
        if (!/[A-Z]/.test(password)) {
          return reply
            .status(400)
            .send({ error: "La password deve contenere almeno una lettera maiuscola" });
        }
        if (!/[0-9]/.test(password)) {
          return reply
            .status(400)
            .send({ error: "La password deve contenere almeno un numero" });
        }
        if (!/[^A-Za-z0-9]/.test(password)) {
          return reply
            .status(400)
            .send({ error: "La password deve contenere almeno un carattere speciale" });
        }

        const existingUser = await client.user.findUnique({
          where: { email: email.toLowerCase() },
        });
        if (existingUser) {
          return reply
            .status(409)
            .send({ error: "Email già registrata" });
        }

        const passwordHash = await hashPassword(password);
        const user = await client.user.create({
          data: {
            email: email.toLowerCase(),
            passwordHash,
            role: "USER",
            plan: "FREE",
          },
        });

        await this.setAuthCookies(reply, user);

        return reply.status(201).send({
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
            plan: user.plan,
          },
        });
      }
    );

    // POST /auth/login (rate limited: 10 per 15 min)
    fastify.post<{ Body: LoginBody }>(
      "/auth/login",
      {
        config: {
          rateLimit: {
            max: 10,
            timeWindow: "15 minutes",
          },
        },
        schema: {
          description: "Login with email and password",
          tags: ["Auth"],
          body: {
            type: "object",
            required: ["email", "password"],
            properties: {
              email: { type: "string" },
              password: { type: "string" },
            },
          },
        },
      },
      async (request, reply) => {
        const { email, password } = request.body;
        const client = getDatabaseClient();

        const user = await client.user.findUnique({
          where: { email: email.toLowerCase() },
        });
        if (!user) {
          request.log.warn({ action: "login_failed", email: email.toLowerCase(), reason: "user_not_found" }, "Failed login attempt");
          return reply
            .status(401)
            .send({ error: "Email o password non validi" });
        }

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) {
          request.log.warn({ action: "login_failed", email: email.toLowerCase(), reason: "invalid_password" }, "Failed login attempt");
          return reply
            .status(401)
            .send({ error: "Email o password non validi" });
        }

        request.log.info({ action: "login_success", userId: user.id }, "Successful login");

        await this.setAuthCookies(reply, user);

        return reply.status(200).send({
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
            plan: user.plan,
          },
        });
      }
    );

    // POST /auth/logout
    fastify.post(
      "/auth/logout",
      {
        schema: {
          description: "Logout and clear auth cookies",
          tags: ["Auth"],
        },
      },
      async (request, reply) => {
        const refreshToken = request.cookies?.[REFRESH_COOKIE_NAME];
        if (refreshToken) {
          try {
            const payload = verifyRefreshToken(refreshToken);
            const client = getDatabaseClient();
            await client.refreshToken
              .delete({ where: { id: payload.tokenId } })
              .catch(() => {});
          } catch {
            // Token already invalid, just clear cookies
          }
        }

        reply.clearCookie(ACCESS_COOKIE_NAME, { path: "/" });
        reply.clearCookie(REFRESH_COOKIE_NAME, { path: "/" });

        return reply.status(200).send({ message: "Logout effettuato" });
      }
    );

    // POST /auth/refresh
    fastify.post(
      "/auth/refresh",
      {
        schema: {
          description: "Refresh access token using refresh token cookie",
          tags: ["Auth"],
        },
      },
      async (request, reply) => {
        const refreshTokenCookie = request.cookies?.[REFRESH_COOKIE_NAME];
        if (!refreshTokenCookie) {
          return reply.status(401).send({ error: "No refresh token" });
        }

        try {
          const payload = verifyRefreshToken(refreshTokenCookie);
          const client = getDatabaseClient();

          const storedToken = await client.refreshToken.findUnique({
            where: { id: payload.tokenId },
            include: { user: true },
          });

          if (!storedToken || storedToken.expiresAt < new Date()) {
            reply.clearCookie(ACCESS_COOKIE_NAME, { path: "/" });
            reply.clearCookie(REFRESH_COOKIE_NAME, { path: "/" });
            return reply
              .status(401)
              .send({ error: "Refresh token expired or revoked" });
          }

          const user = storedToken.user;

          // Token rotation: delete old, create new
          await client.refreshToken.delete({
            where: { id: payload.tokenId },
          });

          await this.setAuthCookies(reply, user);

          return reply.status(200).send({
            user: {
              id: user.id,
              email: user.email,
              role: user.role,
              plan: user.plan,
            },
          });
        } catch {
          reply.clearCookie(ACCESS_COOKIE_NAME, { path: "/" });
          reply.clearCookie(REFRESH_COOKIE_NAME, { path: "/" });
          return reply.status(401).send({ error: "Invalid refresh token" });
        }
      }
    );

    // GET /auth/me (protected)
    fastify.get(
      "/auth/me",
      {
        preHandler: [requireAuth],
        schema: {
          description: "Get current authenticated user info",
          tags: ["Auth"],
        },
      },
      async (request, reply) => {
        const client = getDatabaseClient();
        const user = await client.user.findUnique({
          where: { id: request.user!.userId },
        });

        if (!user) {
          return reply.status(404).send({ error: "User not found" });
        }

        const quota = await checkUserQuota(user.id, user.plan);

        return reply.status(200).send({
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
            plan: user.plan,
            createdAt: user.createdAt.toISOString(),
          },
          quota,
        });
      }
    );
  }

  private async setAuthCookies(
    reply: FastifyReply,
    user: { id: string; email: string; role: string; plan: string }
  ): Promise<void> {
    const client = getDatabaseClient();

    const refreshTokenRecord = await client.refreshToken.create({
      data: {
        userId: user.id,
        token: randomUUID(),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
      },
    });

    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role as "ADMIN" | "USER",
      plan: user.plan as "FREE" | "PRO" | "ENTERPRISE",
    });

    const refreshToken = generateRefreshToken({
      userId: user.id,
      tokenId: refreshTokenRecord.id,
    });

    reply.setCookie(ACCESS_COOKIE_NAME, accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: 15 * 60, // 15 minutes
    });

    reply.setCookie(REFRESH_COOKIE_NAME, refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: "/auth", // Restrict refresh cookie to auth endpoints
    });
  }
}

export const authController = new AuthController();
