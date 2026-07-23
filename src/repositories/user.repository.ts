import { prisma } from "../config/prisma.js";
import type { User } from "@prisma/client";

export class UserRepository {
  async findByPhoneNumber(phoneNumber: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { phoneNumber },
    });
  }

  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  }

  async create(data: { phoneNumber: string; name: string; businessName?: string }): Promise<User> {
    return prisma.user.create({
      data: {
        phoneNumber: data.phoneNumber,
        name: data.name,
        businessName: data.businessName,
      },
    });
  }

  async update(id: string, data: { name?: string; businessName?: string }): Promise<User> {
    return prisma.user.update({
      where: { id },
      data,
    });
  }

  async findOrCreate(phoneNumber: string, defaultName = "Empreendedor"): Promise<User> {
    const existing = await this.findByPhoneNumber(phoneNumber);
    if (existing) return existing;

    return this.create({
      phoneNumber,
      name: defaultName,
    });
  }
}
