import { FastifyInstance } from "fastify";
import { getDatabaseClient } from "../prisma.client";
import { requireAuth, requireAdmin } from "../auth/auth.middleware";
import { PLAN_QUOTAS } from "../auth/quota.utils";
import type { UserPlan } from "@prisma/client";

interface UpdatePlanBody {
  plan: UserPlan;
}

export class AdminController {
  async registerRoutes(fastify: FastifyInstance): Promise<void> {
    // All admin routes require auth + admin role
    fastify.addHook("preHandler", requireAuth);
    fastify.addHook("preHandler", requireAdmin);

    // GET /admin/users
    fastify.get(
      "/admin/users",
      {
        schema: {
          description: "List all registered users with stats",
          tags: ["Admin"],
        },
      },
      async (_request, reply) => {
        const client = getDatabaseClient();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const users = await client.user.findMany({
          orderBy: { createdAt: "desc" },
        });

        const usersWithStats = await Promise.all(
          users.map(async (u) => {
            const uploadsThisWeek = await client.pdfExtraction.count({
              where: {
                userId: u.id,
                createdAt: { gte: sevenDaysAgo },
              },
            });

            return {
              id: u.id,
              email: u.email,
              role: u.role,
              plan: u.plan,
              createdAt: u.createdAt.toISOString(),
              uploadsThisWeek,
              quotaLimit: PLAN_QUOTAS[u.plan] || PLAN_QUOTAS.FREE!,
            };
          })
        );

        return reply.send({ users: usersWithStats });
      }
    );

    // PUT /admin/users/:id/plan
    fastify.put<{ Params: { id: string }; Body: UpdatePlanBody }>(
      "/admin/users/:id/plan",
      {
        schema: {
          description: "Change a user's plan",
          tags: ["Admin"],
          params: {
            type: "object",
            properties: { id: { type: "string" } },
            required: ["id"],
          },
          body: {
            type: "object",
            required: ["plan"],
            properties: {
              plan: {
                type: "string",
                enum: ["FREE", "PRO", "ENTERPRISE"],
              },
            },
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params;
        const { plan } = request.body;
        const client = getDatabaseClient();

        try {
          const user = await client.user.update({
            where: { id },
            data: { plan },
          });

          return reply.send({
            id: user.id,
            email: user.email,
            plan: user.plan,
          });
        } catch (error: any) {
          if (error.code === "P2025") {
            return reply.status(404).send({ error: "User not found" });
          }
          throw error;
        }
      }
    );

    // GET /admin/stats
    fastify.get(
      "/admin/stats",
      {
        schema: {
          description: "Get overview statistics",
          tags: ["Admin"],
        },
      },
      async (_request, reply) => {
        const client = getDatabaseClient();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const [totalUsers, totalExtractions, weeklyExtractions, planCounts] =
          await Promise.all([
            client.user.count(),
            client.pdfExtraction.count(),
            client.pdfExtraction.count({
              where: { createdAt: { gte: sevenDaysAgo } },
            }),
            client.user.groupBy({
              by: ["plan"],
              _count: { plan: true },
            }),
          ]);

        return reply.send({
          totalUsers,
          totalExtractions,
          weeklyExtractions,
          planDistribution: planCounts.map((p) => ({
            plan: p.plan,
            count: p._count.plan,
          })),
        });
      }
    );
  }
}

export const adminController = new AdminController();
