import { UserRepository } from "../repositories/user.repository.js";

export class UserService {
  private userRepository: UserRepository;

  constructor() {
    this.userRepository = new UserRepository();
  }

  async getOrCreateUser(phoneNumber: string, name?: string) {
    return this.userRepository.findOrCreate(phoneNumber, name || "Empreendedor");
  }

  async updateUserProfile(userId: string, name?: string, businessName?: string) {
    return this.userRepository.update(userId, {
      ...(name ? { name } : {}),
      ...(businessName ? { businessName } : {}),
    });
  }

  async getUserByPhone(phoneNumber: string) {
    return this.userRepository.findByPhoneNumber(phoneNumber);
  }
}
