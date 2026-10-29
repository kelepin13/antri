/** Shapes returned by the Antri API. */

export type Role = 'CUSTOMER' | 'STAFF' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  venueId: string | null;
}

export interface Session {
  accessToken: string;
  user: User;
}

export interface VenueSnapshot {
  id: string;
  name: string;
  category: string;
  address: string;
  isOpen: boolean;
  waitingCount: number;
  lastIssuedNumber: number;
  nowServing: { number: number; counter: string | null }[];
  avgServiceMinutes: number;
  estimatedWaitMinutes: number;
  updatedAt: string;
}

export interface QueueEntry {
  id: string;
  number: number;
  counter: string | null;
  customerName: string;
  createdAt: string;
  calledAt: string | null;
}

export interface StaffQueue {
  venue: VenueSnapshot;
  called: QueueEntry[];
  waiting: QueueEntry[];
}

export interface Ticket {
  id: string;
  number: number;
  status: 'WAITING' | 'CALLED' | 'SERVED' | 'NO_SHOW' | 'CANCELLED';
  counter: string | null;
}

export interface CallNextResult {
  ticket: Ticket | null;
  completedTicketIds: string[];
}

export interface VenueOverview extends VenueSnapshot {
  staffCount: number;
  timezone: string;
  notifyAhead: number;
  configuredServiceMinutes: number;
  today: {
    issued: number;
    served: number;
    noShow: number;
    cancelled: number;
    avgWaitMinutes: number | null;
    ticketsPerHour: number[];
  };
}

export interface StaffAccount {
  id: string;
  email: string;
  name: string;
  venueId: string;
  venueName: string;
  createdAt: string;
}

export interface VenueInput {
  name: string;
  category: string;
  address: string;
  timezone: string;
  avgServiceMinutes: number;
  notifyAhead: number;
}

export interface StaffInput {
  name: string;
  email: string;
  password: string;
  venueId: string;
}
