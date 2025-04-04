import { users, type User, type InsertUser, initialQuizResponses, type InitialQuizResponse, type InsertInitialQuizResponse, dailyQuizResponses, type DailyQuizResponse, type InsertDailyQuizResponse, waterConsumption, type WaterConsumption, type InsertWaterConsumption } from "@shared/schema";
import session from "express-session";
import { db } from "./db";
import { eq, and, sql } from "drizzle-orm";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";

const PostgresSessionStore = connectPgSimple(session);

type SessionStore = session.Store;

// Interface for storage operations
export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserGoal(userId: number, goal: number): Promise<User | undefined>;
  updateUserInitialQuizStatus(userId: number, completed: boolean): Promise<User | undefined>;
  updateUserProfile(userId: number, profileData: { name?: string; email?: string; phone?: string }): Promise<User | undefined>;
  
  // Initial quiz operations
  getInitialQuizResponse(userId: number): Promise<InitialQuizResponse | undefined>;
  createInitialQuizResponse(response: InsertInitialQuizResponse): Promise<InitialQuizResponse>;
  updateInitialQuizResponse(userId: number, response: Partial<InsertInitialQuizResponse>): Promise<InitialQuizResponse | undefined>;
  
  // Daily quiz operations
  getDailyQuizResponse(userId: number, date: Date): Promise<DailyQuizResponse | undefined>;
  createDailyQuizResponse(response: InsertDailyQuizResponse): Promise<DailyQuizResponse>;
  updateDailyQuizResponse(userId: number, date: Date, response: Partial<InsertDailyQuizResponse>): Promise<DailyQuizResponse | undefined>;
  
  // Water consumption operations
  getWaterConsumption(userId: number, date: Date): Promise<WaterConsumption | undefined>;
  createWaterConsumption(consumption: InsertWaterConsumption): Promise<WaterConsumption>;
  updateWaterConsumption(userId: number, date: Date, consumption: Partial<InsertWaterConsumption>): Promise<WaterConsumption | undefined>;
  
  // Session store
  sessionStore: SessionStore;
}

export class DatabaseStorage implements IStorage {
  sessionStore: SessionStore;

  constructor() {
    this.sessionStore = new PostgresSessionStore({ 
      pool, 
      createTableIfMissing: true 
    });
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUserGoal(userId: number, goal: number): Promise<User | undefined> {
    try {
      // Log the update operation
      console.log(`[Storage-Debug] Updating water goal in database for user ${userId} to ${goal}`);
      
      // Perform the update
      const [updatedUser] = await db
        .update(users)
        .set({ waterGoal: goal })
        .where(eq(users.id, userId))
        .returning();
      
      // Log the result
      console.log(`[Storage-Debug] Update result: ${JSON.stringify(updatedUser)}`);
      
      // If we didn't get a full user object back or only got the waterGoal field, fetch the complete user
      if (updatedUser && (!updatedUser.username || 
          (Object.keys(updatedUser).length === 1 && 'waterGoal' in updatedUser) ||
          (Object.keys(updatedUser).length === 2 && 'waterGoal' in updatedUser && 'id' in updatedUser))) {
        console.log(`[Storage-Debug] Incomplete user object returned, fetching complete user`);
        return this.getUser(userId);
      }
      
      return updatedUser;
    } catch (error) {
      console.error(`[Storage-Error] Failed to update water goal: ${error}`);
      throw error;
    }
  }

  async updateUserInitialQuizStatus(userId: number, completed: boolean): Promise<User | undefined> {
    try {
      // Log the update operation
      console.log(`[Storage-Debug] Updating initial quiz status for user ${userId} to ${completed}`);
      
      // Perform the update
      const [updatedUser] = await db
        .update(users)
        .set({ initialQuizCompleted: completed })
        .where(eq(users.id, userId))
        .returning();
      
      // Log the result
      console.log(`[Storage-Debug] Initial quiz status update result: ${JSON.stringify(updatedUser)}`);
      
      // If we didn't get a full user object back or only got the initialQuizCompleted field, fetch the complete user
      if (updatedUser && (!updatedUser.username || 
          (Object.keys(updatedUser).length === 1 && 'initialQuizCompleted' in updatedUser) ||
          (Object.keys(updatedUser).length === 2 && 'initialQuizCompleted' in updatedUser && 'id' in updatedUser))) {
        console.log(`[Storage-Debug] Incomplete user object returned, fetching complete user`);
        return this.getUser(userId);
      }
      
      return updatedUser;
    } catch (error) {
      console.error(`[Storage-Error] Failed to update initial quiz status: ${error}`);
      throw error;
    }
  }

  async updateUserProfile(userId: number, profileData: { name?: string; email?: string; phone?: string }): Promise<User | undefined> {
    try {
      // Log the update operation
      console.log(`[Storage-Debug] Updating profile in database for user ${userId}: ${JSON.stringify(profileData)}`);
      
      // Perform the update
      const [updatedUser] = await db
        .update(users)
        .set(profileData)
        .where(eq(users.id, userId))
        .returning();
      
      // Log the result
      console.log(`[Storage-Debug] Profile update result: ${JSON.stringify(updatedUser)}`);
      
      // If we didn't get a full user object back or only got profile fields, fetch the complete user
      if (updatedUser && (!updatedUser.username || 
          (Object.keys(updatedUser).length <= 3 && 
           Object.keys(updatedUser).every(key => ['name', 'email', 'phone', 'id'].includes(key))))) {
        console.log(`[Storage-Debug] Incomplete user object returned, fetching complete user`);
        return this.getUser(userId);
      }
      
      return updatedUser;
    } catch (error) {
      console.error(`[Storage-Error] Failed to update profile: ${error}`);
      throw error;
    }
  }

  // Initial quiz operations
  async getInitialQuizResponse(userId: number): Promise<InitialQuizResponse | undefined> {
    const [response] = await db
      .select()
      .from(initialQuizResponses)
      .where(eq(initialQuizResponses.userId, userId));
    return response;
  }

  async createInitialQuizResponse(insertResponse: InsertInitialQuizResponse): Promise<InitialQuizResponse> {
    // Create a valid copy with properly typed appliances field
    const responseToInsert: InsertInitialQuizResponse = {
      ...insertResponse
    };
    
    // Ensure appliances is a string array
    if (insertResponse.appliances !== undefined) {
      responseToInsert.appliances = Array.isArray(insertResponse.appliances) 
        ? insertResponse.appliances 
        : [];
    }
    
    console.log(`[Storage] Creating initial quiz response with appliances:`, responseToInsert.appliances);
    
    try {
      const [response] = await db
        .insert(initialQuizResponses)
        .values(responseToInsert)
        .returning();
      return response;
    } catch (error) {
      console.error('[Storage] Error creating initial quiz response:', error);
      throw error;
    }
  }

  async updateInitialQuizResponse(userId: number, updateData: Partial<InsertInitialQuizResponse>): Promise<InitialQuizResponse | undefined> {
    // Create a fresh copy that won't include the typescript errors
    const dataToUpdate: Partial<InsertInitialQuizResponse> = {};
    
    // Copy each property carefully
    Object.keys(updateData).forEach(key => {
      if (key === 'appliances') {
        // Special handling for appliances to ensure it's a string array
        dataToUpdate.appliances = Array.isArray(updateData.appliances) 
          ? updateData.appliances 
          : [];
      } else {
        // Copy other properties
        // @ts-ignore - This is safe as we're copying from one object to another of the same type
        dataToUpdate[key] = updateData[key];
      }
    });
    
    console.log(`[Storage] Updating initial quiz for user ${userId}`, dataToUpdate);
    
    try {
      const [updatedResponse] = await db
        .update(initialQuizResponses)
        .set(dataToUpdate)
        .where(eq(initialQuizResponses.userId, userId))
        .returning();
      return updatedResponse;
    } catch (error) {
      console.error('[Storage] Error updating initial quiz response:', error);
      throw error;
    }
  }

  // Daily quiz operations
  async getDailyQuizResponse(userId: number, date: Date): Promise<DailyQuizResponse | undefined> {
    const startOfDayDate = new Date(date);
    startOfDayDate.setHours(0, 0, 0, 0);
    
    const endOfDayDate = new Date(date);
    endOfDayDate.setHours(23, 59, 59, 999);
    
    console.log(`[Storage] Searching for daily quiz for user ${userId} between ${startOfDayDate.toISOString()} and ${endOfDayDate.toISOString()}`);
    
    try {
      const [response] = await db
        .select()
        .from(dailyQuizResponses)
        .where(
          and(
            eq(dailyQuizResponses.userId, userId),
            sql`${dailyQuizResponses.date} >= ${startOfDayDate}`,
            sql`${dailyQuizResponses.date} <= ${endOfDayDate}`
          )
        );
      
      console.log(`[Storage] Daily quiz response found:`, response ? "yes" : "no");
      return response;
    } catch (error) {
      console.error(`[Storage] Error getting daily quiz response:`, error);
      throw error;
    }
  }

  async createDailyQuizResponse(insertResponse: InsertDailyQuizResponse): Promise<DailyQuizResponse> {
    console.log(`[Storage] Creating daily quiz response for user ${insertResponse.userId}`);
    
    try {
      const [response] = await db
        .insert(dailyQuizResponses)
        .values(insertResponse)
        .returning();
      
      console.log(`[Storage] Daily quiz created with ID ${response.id}`);
      return response;
    } catch (error) {
      console.error(`[Storage] Error creating daily quiz response:`, error);
      throw error;
    }
  }

  async updateDailyQuizResponse(userId: number, date: Date, updateData: Partial<InsertDailyQuizResponse>): Promise<DailyQuizResponse | undefined> {
    const startOfDayDate = new Date(date);
    startOfDayDate.setHours(0, 0, 0, 0);
    
    const endOfDayDate = new Date(date);
    endOfDayDate.setHours(23, 59, 59, 999);
    
    console.log(`[Storage] Updating daily quiz for user ${userId} between ${startOfDayDate.toISOString()} and ${endOfDayDate.toISOString()}`);
    console.log(`[Storage] Update data:`, JSON.stringify(updateData));
    
    try {
      const [updatedResponse] = await db
        .update(dailyQuizResponses)
        .set(updateData)
        .where(
          and(
            eq(dailyQuizResponses.userId, userId),
            sql`${dailyQuizResponses.date} >= ${startOfDayDate}`,
            sql`${dailyQuizResponses.date} <= ${endOfDayDate}`
          )
        )
        .returning();
      
      console.log(`[Storage] Daily quiz updated:`, updatedResponse ? "yes" : "no");
      return updatedResponse;
    } catch (error) {
      console.error(`[Storage] Error updating daily quiz response:`, error);
      throw error;
    }
  }

  // Water consumption operations
  async getWaterConsumption(userId: number, date: Date): Promise<WaterConsumption | undefined> {
    const startOfDayDate = new Date(date);
    startOfDayDate.setHours(0, 0, 0, 0);
    
    const endOfDayDate = new Date(date);
    endOfDayDate.setHours(23, 59, 59, 999);
    
    console.log(`[Storage] Fetching water consumption for user ${userId} between ${startOfDayDate.toISOString()} and ${endOfDayDate.toISOString()}`);
    
    try {
      const [consumption] = await db
        .select()
        .from(waterConsumption)
        .where(
          and(
            eq(waterConsumption.userId, userId),
            sql`${waterConsumption.date} >= ${startOfDayDate}`,
            sql`${waterConsumption.date} <= ${endOfDayDate}`
          )
        );
      
      console.log(`[Storage] Water consumption found:`, consumption ? "yes" : "no");
      return consumption;
    } catch (error) {
      console.error(`[Storage] Error getting water consumption:`, error);
      throw error;
    }
  }

  async createWaterConsumption(insertConsumption: InsertWaterConsumption): Promise<WaterConsumption> {
    console.log(`[Storage] Creating water consumption for user ${insertConsumption.userId} with total gallons: ${insertConsumption.totalGallons}`);
    
    try {
      const [consumption] = await db
        .insert(waterConsumption)
        .values(insertConsumption)
        .returning();
      
      console.log(`[Storage] Water consumption created with ID ${consumption.id}`);
      return consumption;
    } catch (error) {
      console.error(`[Storage] Error creating water consumption:`, error);
      throw error;
    }
  }

  async updateWaterConsumption(userId: number, date: Date, updateData: Partial<InsertWaterConsumption>): Promise<WaterConsumption | undefined> {
    const startOfDayDate = new Date(date);
    startOfDayDate.setHours(0, 0, 0, 0);
    
    const endOfDayDate = new Date(date);
    endOfDayDate.setHours(23, 59, 59, 999);
    
    console.log(`[Storage] Updating water consumption for user ${userId} between ${startOfDayDate.toISOString()} and ${endOfDayDate.toISOString()}`);
    console.log(`[Storage] Water consumption update data:`, JSON.stringify(updateData));
    
    try {
      const [updatedConsumption] = await db
        .update(waterConsumption)
        .set(updateData)
        .where(
          and(
            eq(waterConsumption.userId, userId),
            sql`${waterConsumption.date} >= ${startOfDayDate}`,
            sql`${waterConsumption.date} <= ${endOfDayDate}`
          )
        )
        .returning();
      
      console.log(`[Storage] Water consumption updated:`, updatedConsumption ? "yes" : "no");
      return updatedConsumption;
    } catch (error) {
      console.error(`[Storage] Error updating water consumption:`, error);
      throw error;
    }
  }
}

export const storage = new DatabaseStorage();
