import { FastifyInstance } from "fastify";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import path from "path";

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

class UpdateController {
  private projectRoot: string;

  constructor() {
    // Determine project root (parent of src folder)
    this.projectRoot = process.env.PROJECT_ROOT || path.resolve(__dirname, "../../../..");
  }

  async registerRoutes(fastify: FastifyInstance): Promise<void> {
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
            message: "Errore nel controllo aggiornamenti: " + error.message,
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
            message: "Errore durante l'aggiornamento: " + error.message,
          };
        }
      }
    );
  }
}

export const updateController = new UpdateController();
