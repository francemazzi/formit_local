import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { CustomSampleType, CriterionType } from "@prisma/client";

import {
  customCheckService,
  CreateCategoryInput,
  UpdateCategoryInput,
  CreateParameterInput,
  UpdateParameterInput,
  CategoryWithParameters,
} from "../custom-check.service";

// ========================================
// Request Body Types
// ========================================

interface CreateCategoryBody {
  name: string;
  description?: string;
  sampleType?: CustomSampleType;
}

interface UpdateCategoryBody {
  name?: string;
  description?: string;
  sampleType?: CustomSampleType;
}

interface CreateParameterBody {
  parameter: string;
  analysisMethod?: string;
  criterionType?: CriterionType;
  satisfactoryValue?: string;
  acceptableValue?: string;
  unsatisfactoryValue?: string;
  bibliographicReferences?: string;
  notes?: string;
}

interface UpdateParameterBody {
  parameter?: string;
  analysisMethod?: string;
  criterionType?: CriterionType;
  satisfactoryValue?: string;
  acceptableValue?: string;
  unsatisfactoryValue?: string;
  bibliographicReferences?: string;
  notes?: string;
}

interface ImportCategoryBody extends CreateCategoryBody {
  parameters: CreateParameterBody[];
}

// ========================================
// Controller Implementation
// ========================================

export class CustomChecksController {
  async registerRoutes(fastify: FastifyInstance): Promise<void> {
    // ========================================
    // Category Routes
    // ========================================

    // GET /api/custom-checks/categories - List all categories
    fastify.get(
      "/custom-checks/categories",
      {
        schema: {
          description: "Retrieve all custom check categories with their parameters",
          tags: ["Custom Checks"],
          summary: "List all categories",
          response: {
            200: {
              description: "List of categories",
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  description: { type: "string", nullable: true },
                  sampleType: { type: "string" },
                  createdAt: { type: "string" },
                  updatedAt: { type: "string" },
                  parameters: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        parameter: { type: "string" },
                        analysisMethod: { type: "string", nullable: true },
                        criterionType: { type: "string" },
                        satisfactoryValue: { type: "string", nullable: true },
                        acceptableValue: { type: "string", nullable: true },
                        unsatisfactoryValue: { type: "string", nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      async (_request: FastifyRequest, reply: FastifyReply) => {
        const categories = await customCheckService.getAllCategories();
        return reply.send(categories);
      }
    );

    // GET /api/custom-checks/categories/:id - Get single category
    fastify.get<{ Params: { id: string } }>(
      "/custom-checks/categories/:id",
      {
        schema: {
          description: "Retrieve a single category by ID",
          tags: ["Custom Checks"],
          summary: "Get category by ID",
          params: {
            type: "object",
            properties: {
              id: { type: "string", description: "Category UUID" },
            },
            required: ["id"],
          },
          response: {
            200: {
              description: "Category details",
              type: "object",
            },
            404: {
              description: "Category not found",
              type: "object",
              properties: {
                error: { type: "string" },
              },
            },
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params;
        const category = await customCheckService.getCategoryById(id);

        if (!category) {
          return reply.status(404).send({ error: "Category not found" });
        }

        return reply.send(category);
      }
    );

    // POST /api/custom-checks/categories - Create category
    fastify.post<{ Body: CreateCategoryBody }>(
      "/custom-checks/categories",
      {
        schema: {
          description: "Create a new custom check category",
          tags: ["Custom Checks"],
          summary: "Create category",
          body: {
            type: "object",
            required: ["name"],
            properties: {
              name: { type: "string", description: "Unique category name" },
              description: { type: "string", description: "Category description" },
              sampleType: {
                type: "string",
                enum: ["FOOD_PRODUCT", "BEVERAGE", "ENVIRONMENTAL_SWAB", "PERSONNEL_SWAB", "OTHER"],
                description: "Type of sample this category applies to",
              },
            },
          },
          response: {
            201: {
              description: "Category created successfully",
              type: "object",
            },
            400: {
              description: "Bad request",
              type: "object",
              properties: {
                error: { type: "string" },
              },
            },
          },
        },
      },
      async (request, reply) => {
        const { name, description, sampleType } = request.body;

        if (!name || name.trim().length === 0) {
          return reply.status(400).send({ error: "Name is required" });
        }

        try {
          const category = await customCheckService.createCategory({
            name: name.trim(),
            description: description ?? null,
            sampleType,
          });

          return reply.status(201).send(category);
        } catch (error: any) {
          if (error.code === "P2002") {
            return reply.status(400).send({ error: "A category with this name already exists" });
          }
          throw error;
        }
      }
    );

    // PUT /api/custom-checks/categories/:id - Update category
    fastify.put<{ Params: { id: string }; Body: UpdateCategoryBody }>(
      "/custom-checks/categories/:id",
      {
        schema: {
          description: "Update an existing category",
          tags: ["Custom Checks"],
          summary: "Update category",
          params: {
            type: "object",
            properties: {
              id: { type: "string" },
            },
            required: ["id"],
          },
          body: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              sampleType: {
                type: "string",
                enum: ["FOOD_PRODUCT", "BEVERAGE", "ENVIRONMENTAL_SWAB", "PERSONNEL_SWAB", "OTHER"],
              },
            },
          },
          response: {
            200: { description: "Updated category", type: "object" },
            404: { description: "Category not found", type: "object" },
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params;
        const updateData = request.body;

        try {
          const category = await customCheckService.updateCategory(id, updateData);
          return reply.send(category);
        } catch (error: any) {
          if (error.code === "P2025") {
            return reply.status(404).send({ error: "Category not found" });
          }
          throw error;
        }
      }
    );

    // DELETE /api/custom-checks/categories/:id - Delete category
    fastify.delete<{ Params: { id: string } }>(
      "/custom-checks/categories/:id",
      {
        schema: {
          description: "Delete a category and all its parameters",
          tags: ["Custom Checks"],
          summary: "Delete category",
          params: {
            type: "object",
            properties: {
              id: { type: "string" },
            },
            required: ["id"],
          },
          response: {
            204: { description: "Category deleted successfully" },
            404: { description: "Category not found", type: "object" },
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params;

        try {
          await customCheckService.deleteCategory(id);
          return reply.status(204).send();
        } catch (error: any) {
          if (error.code === "P2025") {
            return reply.status(404).send({ error: "Category not found" });
          }
          throw error;
        }
      }
    );

    // ========================================
    // Parameter Routes
    // ========================================

    // POST /api/custom-checks/categories/:categoryId/parameters - Add parameter
    fastify.post<{ Params: { categoryId: string }; Body: CreateParameterBody }>(
      "/custom-checks/categories/:categoryId/parameters",
      {
        schema: {
          description: "Add a new parameter to a category",
          tags: ["Custom Checks"],
          summary: "Add parameter to category",
          params: {
            type: "object",
            properties: {
              categoryId: { type: "string" },
            },
            required: ["categoryId"],
          },
          body: {
            type: "object",
            required: ["parameter"],
            properties: {
              parameter: { type: "string", description: "Parameter name (e.g., 'Escherichia coli')" },
              analysisMethod: { type: "string", description: "Analysis method (e.g., 'ISO 7932')" },
              criterionType: {
                type: "string",
                enum: ["HYGIENE", "SAFETY"],
                description: "Type of criterion",
              },
              satisfactoryValue: { type: "string", description: "Satisfactory limit (e.g., '<10 (ufc/g)')" },
              acceptableValue: { type: "string", description: "Acceptable range (e.g., '10≤ x <102 (ufc/g)')" },
              unsatisfactoryValue: { type: "string", description: "Unsatisfactory limit (e.g., '≥102 (ufc/g)')" },
              bibliographicReferences: { type: "string", description: "Reference standards" },
              notes: { type: "string", description: "Additional notes" },
            },
          },
          response: {
            201: { description: "Parameter created", type: "object" },
            400: { description: "Bad request", type: "object" },
            404: { description: "Category not found", type: "object" },
          },
        },
      },
      async (request, reply) => {
        const { categoryId } = request.params;
        const body = request.body;

        if (!body.parameter || body.parameter.trim().length === 0) {
          return reply.status(400).send({ error: "Parameter name is required" });
        }

        // Check if category exists
        const category = await customCheckService.getCategoryById(categoryId);
        if (!category) {
          return reply.status(404).send({ error: "Category not found" });
        }

        try {
          const parameter = await customCheckService.addParameter({
            categoryId,
            parameter: body.parameter.trim(),
            analysisMethod: body.analysisMethod ?? null,
            criterionType: body.criterionType,
            satisfactoryValue: body.satisfactoryValue ?? null,
            acceptableValue: body.acceptableValue ?? null,
            unsatisfactoryValue: body.unsatisfactoryValue ?? null,
            bibliographicReferences: body.bibliographicReferences ?? null,
            notes: body.notes ?? null,
          });

          return reply.status(201).send(parameter);
        } catch (error: any) {
          if (error.code === "P2002") {
            return reply.status(400).send({
              error: "A parameter with this name already exists in this category",
            });
          }
          throw error;
        }
      }
    );

    // PUT /api/custom-checks/parameters/:id - Update parameter
    fastify.put<{ Params: { id: string }; Body: UpdateParameterBody }>(
      "/custom-checks/parameters/:id",
      {
        schema: {
          description: "Update an existing parameter",
          tags: ["Custom Checks"],
          summary: "Update parameter",
          params: {
            type: "object",
            properties: {
              id: { type: "string" },
            },
            required: ["id"],
          },
          body: {
            type: "object",
            properties: {
              parameter: { type: "string" },
              analysisMethod: { type: "string" },
              criterionType: { type: "string", enum: ["HYGIENE", "SAFETY"] },
              satisfactoryValue: { type: "string" },
              acceptableValue: { type: "string" },
              unsatisfactoryValue: { type: "string" },
              bibliographicReferences: { type: "string" },
              notes: { type: "string" },
            },
          },
          response: {
            200: { description: "Updated parameter", type: "object" },
            404: { description: "Parameter not found", type: "object" },
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params;
        const updateData = request.body;

        try {
          const parameter = await customCheckService.updateParameter(id, updateData);
          return reply.send(parameter);
        } catch (error: any) {
          if (error.code === "P2025") {
            return reply.status(404).send({ error: "Parameter not found" });
          }
          throw error;
        }
      }
    );

    // DELETE /api/custom-checks/parameters/:id - Delete parameter
    fastify.delete<{ Params: { id: string } }>(
      "/custom-checks/parameters/:id",
      {
        schema: {
          description: "Delete a parameter",
          tags: ["Custom Checks"],
          summary: "Delete parameter",
          params: {
            type: "object",
            properties: {
              id: { type: "string" },
            },
            required: ["id"],
          },
          response: {
            204: { description: "Parameter deleted" },
            404: { description: "Parameter not found", type: "object" },
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params;

        try {
          await customCheckService.deleteParameter(id);
          return reply.status(204).send();
        } catch (error: any) {
          if (error.code === "P2025") {
            return reply.status(404).send({ error: "Parameter not found" });
          }
          throw error;
        }
      }
    );

    // ========================================
    // Import/Export Routes
    // ========================================

    // POST /api/custom-checks/import - Import category with parameters
    fastify.post<{ Body: ImportCategoryBody }>(
      "/custom-checks/import",
      {
        schema: {
          description: "Import a complete category with all parameters",
          tags: ["Custom Checks"],
          summary: "Import category",
          body: {
            type: "object",
            required: ["name", "parameters"],
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              sampleType: {
                type: "string",
                enum: ["FOOD_PRODUCT", "BEVERAGE", "ENVIRONMENTAL_SWAB", "PERSONNEL_SWAB", "OTHER"],
              },
              parameters: {
                type: "array",
                items: {
                  type: "object",
                  required: ["parameter"],
                  properties: {
                    parameter: { type: "string" },
                    analysisMethod: { type: "string" },
                    criterionType: { type: "string", enum: ["HYGIENE", "SAFETY"] },
                    satisfactoryValue: { type: "string" },
                    acceptableValue: { type: "string" },
                    unsatisfactoryValue: { type: "string" },
                    bibliographicReferences: { type: "string" },
                    notes: { type: "string" },
                  },
                },
              },
            },
          },
          response: {
            201: { description: "Category imported", type: "object" },
            400: { description: "Bad request", type: "object" },
          },
        },
      },
      async (request, reply) => {
        const body = request.body;

        if (!body.name || body.name.trim().length === 0) {
          return reply.status(400).send({ error: "Category name is required" });
        }

        if (!body.parameters || body.parameters.length === 0) {
          return reply.status(400).send({ error: "At least one parameter is required" });
        }

        try {
          const category = await customCheckService.importCategory({
            name: body.name.trim(),
            description: body.description ?? null,
            sampleType: body.sampleType,
            parameters: body.parameters.map((p) => ({
              parameter: p.parameter,
              analysisMethod: p.analysisMethod ?? null,
              criterionType: p.criterionType,
              satisfactoryValue: p.satisfactoryValue ?? null,
              acceptableValue: p.acceptableValue ?? null,
              unsatisfactoryValue: p.unsatisfactoryValue ?? null,
              bibliographicReferences: p.bibliographicReferences ?? null,
              notes: p.notes ?? null,
            })),
          });

          return reply.status(201).send(category);
        } catch (error: any) {
          if (error.code === "P2002") {
            return reply.status(400).send({ error: "A category with this name already exists" });
          }
          throw error;
        }
      }
    );

    // GET /api/custom-checks/export/:id - Export category
    fastify.get<{ Params: { id: string } }>(
      "/custom-checks/export/:id",
      {
        schema: {
          description: "Export a category with all parameters as JSON",
          tags: ["Custom Checks"],
          summary: "Export category",
          params: {
            type: "object",
            properties: {
              id: { type: "string" },
            },
            required: ["id"],
          },
          response: {
            200: { description: "Exported category", type: "object" },
            404: { description: "Category not found", type: "object" },
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params;
        const exported = await customCheckService.exportCategory(id);

        if (!exported) {
          return reply.status(404).send({ error: "Category not found" });
        }

        return reply.send(exported);
      }
    );
  }
}

export const customChecksController = new CustomChecksController();

