import { pgTable, text, serial, integer, boolean, json, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  waterGoal: integer("water_goal").default(1400),
  initialQuizCompleted: boolean("initial_quiz_completed").default(false),
  name: text("name"),
  email: text("email"),
  phone: text("phone"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

// Initial Quiz responses
export const initialQuizResponses = pgTable("initial_quiz_responses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  appliances: json("appliances").$type<string[]>().default([]),
  greywater: boolean("greywater").default(false),
  bathsPerMonth: integer("baths_per_month").default(0),
  dishwasherType: text("dishwasher_type").default("none"),
  dishwasherFrequency: integer("dishwasher_frequency").default(0),
  laundryType: text("laundry_type").default("none"),
  laundryFrequency: integer("laundry_frequency").default(0),
  hasGarden: boolean("has_garden").default(false),
  gardenArea: integer("garden_area").default(0),
  gardenFrequency: integer("garden_frequency").default(0),
  hasPool: boolean("has_pool").default(false),
  carWashMethod: text("car_wash_method").default("none"),
  carWashFrequency: integer("car_wash_frequency").default(0),
  utilityPercentage: integer("utility_percentage").default(0),
  shoppingHabits: text("shopping_habits").default("basics"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInitialQuizSchema = createInsertSchema(initialQuizResponses).omit({
  id: true,
  createdAt: true,
});

// Daily Quiz responses
export const dailyQuizResponses = pgTable("daily_quiz_responses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  showerMinutes: integer("shower_minutes").default(0),
  bathroomSinkMinutes: integer("bathroom_sink_minutes").default(0),
  kitchenSinkMinutes: integer("kitchen_sink_minutes").default(0),
  toiletFlushes: integer("toilet_flushes").default(0),
  rainwaterCollected: integer("rainwater_collected").default(0),
  milesDriven: integer("miles_driven").default(0),
  recycledPaper: integer("recycled_paper").default(0),
  recycledPlastic: integer("recycled_plastic").default(0),
  recycledBottlesCans: integer("recycled_bottles_cans").default(0),
  veggiesConsumed: integer("veggies_consumed").default(0),
  meatConsumed: integer("meat_consumed").default(0),
  petFoodUsed: integer("pet_food_used").default(0),
  date: timestamp("date").defaultNow(),
});

export const insertDailyQuizSchema = createInsertSchema(dailyQuizResponses).omit({
  id: true,
  date: true,
});

// Water consumption calculations
export const waterConsumption = pgTable("water_consumption", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  totalGallons: integer("total_gallons").default(0),
  showerGallons: integer("shower_gallons").default(0),
  toiletGallons: integer("toilet_gallons").default(0),
  kitchenGallons: integer("kitchen_gallons").default(0),
  dishwasherGallons: integer("dishwasher_gallons").default(0),
  laundryGallons: integer("laundry_gallons").default(0),
  gardenGallons: integer("garden_gallons").default(0),
  poolGallons: integer("pool_gallons").default(0),
  carWashGallons: integer("car_wash_gallons").default(0),
  energyGallons: integer("energy_gallons").default(0),
  shoppingGallons: integer("shopping_gallons").default(0),
  otherGallons: integer("other_gallons").default(0),
  date: timestamp("date").defaultNow(),
});

export const insertWaterConsumptionSchema = createInsertSchema(waterConsumption).omit({
  id: true,
  date: true,
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InitialQuizResponse = typeof initialQuizResponses.$inferSelect;
export type InsertInitialQuizResponse = z.infer<typeof insertInitialQuizSchema>;
export type DailyQuizResponse = typeof dailyQuizResponses.$inferSelect;
export type InsertDailyQuizResponse = z.infer<typeof insertDailyQuizSchema>;
export type WaterConsumption = typeof waterConsumption.$inferSelect;
export type InsertWaterConsumption = z.infer<typeof insertWaterConsumptionSchema>;

// Additional validation schemas
export const initialQuizValidationSchema = z.object({
  appliances: z.array(z.string()).optional(),
  greywater: z.boolean().optional(),
  bathsPerMonth: z.number().min(0).optional(),
  dishwasherType: z.enum(["none", "yes_efficient", "yes_not_efficient"]).optional(),
  dishwasherFrequency: z.number().min(0).optional(),
  laundryType: z.enum(["none", "yes_efficient", "yes_not_efficient"]).optional(),
  laundryFrequency: z.number().min(0).optional(),
  hasGarden: z.boolean().optional(),
  gardenArea: z.number().min(0).optional(),
  gardenFrequency: z.number().min(0).optional(),
  hasPool: z.boolean().optional(),
  carWashMethod: z.enum(["none", "garden_hose", "drive_through", "self_service"]).optional(),
  carWashFrequency: z.number().min(0).optional(),
  utilityPercentage: z.number().min(0).max(100).optional(),
  shoppingHabits: z.enum(["basics", "moderate", "addict"]).optional(),
});

export const dailyQuizValidationSchema = z.object({
  showerMinutes: z.number().min(0).optional(),
  bathroomSinkMinutes: z.number().min(0).optional(),
  kitchenSinkMinutes: z.number().min(0).optional(),
  toiletFlushes: z.number().min(0).optional(),
  rainwaterCollected: z.number().min(0).optional(),
  milesDriven: z.number().min(0).optional(),
  recycledPaper: z.number().min(0).optional(),
  recycledPlastic: z.number().min(0).optional(),
  recycledBottlesCans: z.number().min(0).optional(),
  veggiesConsumed: z.number().min(0).optional(),
  meatConsumed: z.number().min(0).optional(),
  petFoodUsed: z.number().min(0).optional(),
});
