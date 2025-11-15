import type { AIMessage } from "@langchain/core/messages";

export class LangChainMessageUtils {
  public static extractTextContent(message: AIMessage): string {
    const { content } = message;

    if (typeof content === "string") {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((part) => LangChainMessageUtils.getContentPart(part))
        .join("")
        .trim();
    }

    return "";
  }

  private static getContentPart(part: unknown): string {
    if (typeof part === "string") {
      return part;
    }

    if (
      part &&
      typeof part === "object" &&
      "type" in part &&
      (part as { type?: unknown }).type === "text" &&
      "text" in part &&
      typeof (part as { text?: unknown }).text === "string"
    ) {
      return (part as { text: string }).text;
    }

    return "";
  }
}
