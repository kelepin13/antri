import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { Role } from '../common/auth.decorators';
import { DatabaseService, isUniqueViolation } from '../db/database.service';
import { LoginDto, RegisterDto } from './auth.dto';

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  venue_id: string | null;
  password_hash: string;
}

export interface AuthResponse {
  accessToken: string;
  user: { id: string; email: string; name: string; role: Role; venueId: string | null };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
  ) {}

  /** Public sign-up always creates a CUSTOMER; staff accounts are provisioned by an admin or the seed. */
  async register(dto: RegisterDto): Promise<AuthResponse> {
    const hash = await bcrypt.hash(dto.password, 10);
    try {
      const user = await this.db.one<UserRow>(
        `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)
         RETURNING id, email, name, role, venue_id, password_hash`,
        [dto.email.trim(), hash, dto.name.trim()],
      );
      return this.issue(user!);
    } catch (error) {
      if (isUniqueViolation(error, 'users_email_key')) {
        throw new ConflictException({ code: 'EMAIL_TAKEN', message: 'An account with this email already exists' });
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.db.one<UserRow>(
      `SELECT id, email, name, role, venue_id, password_hash FROM users WHERE lower(email) = lower($1)`,
      [dto.email.trim()],
    );
    if (!user || !(await bcrypt.compare(dto.password, user.password_hash))) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect' });
    }
    return this.issue(user);
  }

  private async issue(user: UserRow): Promise<AuthResponse> {
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
      venueId: user.venue_id,
    });
    return {
      accessToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, venueId: user.venue_id },
    };
  }
}
