import { FastifyInstance } from "fastify";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import path from "path";
import { pdfProcessingQueue } from "../queue/pdf-processing.queue";
import { clearCeirsaCheckCaches } from "../modules/checks/ceirsa.check";
import { requireAuth, requireAdmin } from "../auth/auth.middleware";

const execAsync = promisify(exec);

interface UpdateResponse {
  success: boolean;
  message: string;
  details?: {
    gitOutput?: string;
    hasChanges: boolean;
    restartScheduled: boolean;
  };
}

interface UpdateCheckResponse {
  hasUpdates: boolean;
  currentCommit: string;
  remoteCommit: string;
  behindBy: number;
}

interface CleanupResponse {
  success: boolean;
  message: string;
  details: {
    failedJobsRemoved: number;
    cacheEntriesCleared: number;
    complianceDecisionEntriesCleared: number;
    parameterMatchEntriesCleared: number;
  };
}

class UpdateController {
  private projectRoot: string;

  constructor() {
    // Determine project root (parent of src folder)
    this.projectRoot = process.env.PROJECT_ROOT || path.resolve(__dirname, "../../../..");
  }

  async registerRoutes(fastify: FastifyInstance): Promise<void> {
    // All update/maintenance routes require admin access
    fastify.addHook("preHandler", requireAuth);
    fastify.addHook("preHandler", requireAdmin);

    // Check for available updates
    fastify.get<{ Reply: UpdateCheckResponse }>(
      "/update/check",
      {
        schema: {
          description: "Check if updates are available from the remote repository",
          tags: ["Settings"],
          summary: "Check for updates",
          response: {
            200: {
              type: "object",
              properties: {
                hasUpdates: { type: "boolean" },
                currentCommit: { type: "string" },
                remoteCommit: { type: "string" },
                behindBy: { type: "number" },
              },
            },
          },
        },
      },
      async () => {
        try {
          // Fetch latest from remote
          await execAsync("git fetch origin main", { cwd: this.projectRoot });

          // Get current commit
          const { stdout: currentCommit } = await execAsync("git rev-parse HEAD", {
            cwd: this.projectRoot,
          });

          // Get remote commit
          const { stdout: remoteCommit } = await execAsync("git rev-parse origin/main", {
            cwd: this.projectRoot,
          });

          // Count commits behind
          const { stdout: behindCount } = await execAsync(
            "git rev-list HEAD..origin/main --count",
            { cwd: this.projectRoot }
          );

          const behindBy = parseInt(behindCount.trim(), 10);

          return {
            hasUpdates: behindBy > 0,
            currentCommit: currentCommit.trim().substring(0, 7),
            remoteCommit: remoteCommit.trim().substring(0, 7),
            behindBy,
          };
        } catch (error: any) {
          fastify.log.error("Error checking for updates:", error);
          throw {
            statusCode: 500,
            message: "Errore nel controllo aggiornamenti",
          };
        }
      }
    );

    // Perform update
    fastify.post<{ Reply: UpdateResponse }>(
      "/update",
      {
        schema: {
          description: "Pull latest changes from origin/main and restart the application",
          tags: ["Settings"],
          summary: "Update application",
          response: {
            200: {
              type: "object",
              properties: {
                success: { type: "boolean" },
                message: { type: "string" },
                details: {
                  type: "object",
                  properties: {
                    gitOutput: { type: "string" },
                    hasChanges: { type: "boolean" },
                    restartScheduled: { type: "boolean" },
                  },
                },
              },
            },
          },
        },
      },
      async () => {
        try {
          // First, stash any local changes to avoid conflicts
          await execAsync("git stash", { cwd: this.projectRoot }).catch(() => {
            // Ignore stash errors (might have nothing to stash)
          });

          // Pull latest changes
          const { stdout: gitOutput } = await execAsync("git pull origin main", {
            cwd: this.projectRoot,
          });

          const hasChanges = !gitOutput.includes("Already up to date");

          if (hasChanges) {
            // Schedule restart after response is sent
            // Use spawn with detached to keep the process running after parent exits
            setTimeout(() => {
              fastify.log.info("Restarting application with docker compose...");

              const restart = spawn(
                "docker",
                ["compose", "up", "--build", "-d"],
                {
                  cwd: this.projectRoot,
                  detached: true,
                  stdio: "ignore",
                }
              );

              restart.unref();
            }, 1000);

            return {
              success: true,
              message: "Aggiornamento completato. L'applicazione si riavvierà automaticamente. Ricarica la pagina tra qualche secondo.",
              details: {
                gitOutput: gitOutput.trim(),
                hasChanges: true,
                restartScheduled: true,
              },
            };
          }

          return {
            success: true,
            message: "Nessun aggiornamento disponibile. L'applicazione è già aggiornata.",
            details: {
              gitOutput: gitOutput.trim(),
              hasChanges: false,
              restartScheduled: false,
            },
          };
        } catch (error: any) {
          fastify.log.error("Error updating application:", error);
          throw {
            statusCode: 500,
            message: "Errore durante l'aggiornamento",
          };
        }
      }
    );

    // Cleanup in-memory cache and failed queue jobs
    fastify.post<{ Reply: CleanupResponse }>(
      "/maintenance/cleanup",
      {
        schema: {
          description: "Clear application cache and remove failed queue jobs",
          tags: ["Settings"],
          summary: "Cleanup cache and failed jobs",
          response: {
            200: {
              type: "object",
              properties: {
                success: { type: "boolean" },
                message: { type: "string" },
                details: {
                  type: "object",
                  properties: {
                    failedJobsRemoved: { type: "number" },
                    cacheEntriesCleared: { type: "number" },
                    complianceDecisionEntriesCleared: { type: "number" },
                    parameterMatchEntriesCleared: { type: "number" },
                  },
                },
              },
            },
          },
        },
      },
      async () => {
        try {
          const removedFailedJobIds = await pdfProcessingQueue.cleanFailedJobs(
            10000
          );
          const cacheCleanup = clearCeirsaCheckCaches();
          const cacheEntriesCleared =
            cacheCleanup.complianceDecisionEntries +
            cacheCleanup.parameterMatchEntries;

          return {
            success: true,
            message:
              "Pulizia completata: cache applicativa e job falliti rimossi.",
            details: {
              failedJobsRemoved: removedFailedJobIds.length,
              cacheEntriesCleared,
              complianceDecisionEntriesCleared:
                cacheCleanup.complianceDecisionEntries,
              parameterMatchEntriesCleared: cacheCleanup.parameterMatchEntries,
            },
          };
        } catch (error: any) {
          fastify.log.error("Error during maintenance cleanup:", error);
          throw {
            statusCode: 500,
            message: "Errore durante la pulizia",
          };
        }
      }
    );
  }
}

export const updateController = new UpdateController();
