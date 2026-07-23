import { prisma } from "../config/prisma.js";
import { ChatRole } from "@prisma/client";

export class ChatHistoryRepository {
  async addMessage(userId: string, role: ChatRole, content: string) {
    return prisma.chatHistory.create({
      data: {
        userId,
        role,
        content,
      },
    });
  }

  async getRecentHistory(userId: string, limit = 10) {
    const history = await prisma.chatHistory.findMany({
      where: { userId },
      orderBy: { timestamp: "desc" },
      take: limit,
    });

    // Inverte para ficar em ordem cronológica (mais antigo -> mais recente)
    return history.reverse();
  }

  async clearHistory(userId: string) {
    return prisma.chatHistory.deleteMany({
      where: { userId },
    });
  }
}
