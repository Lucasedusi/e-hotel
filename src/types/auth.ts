export const HOTEL_ROLES = [
  "owner",
  "admin",
  "reception",
  "finance",
  "viewer",
] as const;

export type HotelRole = (typeof HOTEL_ROLES)[number];

export interface AuthenticatedUserAccess {
  userId: string;
  name: string;
  email: string;
  hotelId: string;
  hotelName: string;
  role: HotelRole;
}
