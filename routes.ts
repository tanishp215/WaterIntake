import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, saveSession } from "./auth";
import { dailyQuizValidationSchema, initialQuizValidationSchema } from "@shared/schema";
import schedule from "node-schedule";

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication routes
  setupAuth(app);

  // Goal setting route
  app.post("/api/goal", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    const { goal } = req.body;
    if (!goal || typeof goal !== "number" || goal < 800 || goal > 2000) {
      return res.status(400).send("Invalid goal value. Must be between 800 and 2000 gallons.");
    }
    
    const updatedUser = await storage.updateUserGoal(req.user.id, goal);
    if (!updatedUser) return res.status(404).send("User not found");
    
    res.status(200).json({ waterGoal: updatedUser.waterGoal });
  });

  // Initial quiz routes
  app.post("/api/initial-quiz", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      // Ensure appliances is an array before validation
      const requestData = {
        ...req.body,
        appliances: Array.isArray(req.body.appliances) ? req.body.appliances : []
      };
      
      const validatedData = initialQuizValidationSchema.parse(requestData);
      const userId = req.user.id;
      
      console.log("Processing initial quiz for user:", userId);
      console.log("Quiz data:", JSON.stringify(validatedData));
      
      // Check if user already has quiz responses
      const existingResponse = await storage.getInitialQuizResponse(userId);
      
      if (existingResponse) {
        console.log("Updating existing quiz response for user:", userId);
        // Update existing response
        const updatedResponse = await storage.updateInitialQuizResponse(userId, {
          ...validatedData,
          userId
        });
        
        if (!updatedResponse) return res.status(500).send("Failed to update quiz response");
        
        // Mark initial quiz as completed
        await storage.updateUserInitialQuizStatus(userId, true);
        
        // Update session user with completed quiz status
        req.user.initialQuizCompleted = true;
        // Explicitly save session
        await saveSession(req);
        
        // Calculate baseline water consumption based on initial quiz responses
        const baseConsumption = calculateInitialWaterConsumption(updatedResponse);
        
        // Save or update water consumption data
        const today = new Date();
        const existingConsumption = await storage.getWaterConsumption(userId, today);
        
        if (existingConsumption) {
          // If this is a retake and there's existing consumption data,
          // check if there's daily quiz data we need to preserve
          const dailyQuizResponse = await storage.getDailyQuizResponse(userId, today);
          
          if (dailyQuizResponse) {
            console.log(`Found daily quiz data for today, preserving daily quiz effects`);
            // Calculate consumption with both initial quiz and daily quiz data
            const updatedConsumption = calculateDailyWaterConsumption(dailyQuizResponse, updatedResponse);
            await storage.updateWaterConsumption(userId, today, updatedConsumption);
          } else {
            // No daily quiz for today, use the baseline consumption
            console.log(`No daily quiz data found for today, using baseline consumption`);
            await storage.updateWaterConsumption(userId, today, baseConsumption);
          }
        } else {
          // No existing consumption data, create new record with baseline
          await storage.createWaterConsumption({
            ...baseConsumption,
            userId
          });
        }
        
        res.status(200).json(updatedResponse);
      } else {
        console.log("Creating new quiz response for user:", userId);
        // Create new response
        const newResponse = await storage.createInitialQuizResponse({
          ...validatedData,
          userId
        });
        
        // Mark initial quiz as completed
        const updatedUserQuizStatus = await storage.updateUserInitialQuizStatus(userId, true);
        
        // Update session user with completed quiz status
        if (updatedUserQuizStatus) {
          req.user.initialQuizCompleted = true;
          // Explicitly save session
          await saveSession(req);
        }
        
        // Calculate water consumption based on quiz responses
        const consumption = calculateInitialWaterConsumption(newResponse);
        
        // Save water consumption data
        await storage.createWaterConsumption({
          ...consumption,
          userId
        });
        
        res.status(201).json(newResponse);
      }
    } catch (error) {
      console.error("Error processing initial quiz:", error);
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/initial-quiz", async (req, res) => {
    if (!req.isAuthenticated()) {
      console.log("Unauthorized initial quiz fetch attempt");
      return res.sendStatus(401);
    }
    
    try {
      console.log(`Fetching initial quiz for user ${req.user.id}`);
      const response = await storage.getInitialQuizResponse(req.user.id);
      
      if (!response) {
        console.log(`Initial quiz not found for user ${req.user.id}`);
        return res.status(404).json({ error: "Initial quiz not found" });
      }
      
      console.log(`Initial quiz data found for user ${req.user.id}:`, JSON.stringify(response));
      res.status(200).json(response);
    } catch (error) {
      console.error(`Error fetching initial quiz for user ${req.user.id}:`, error);
      res.status(500).json({ error: "Failed to fetch initial quiz data" });
    }
  });

  // Daily quiz routes
  app.post("/api/daily-quiz", async (req, res) => {
    if (!req.isAuthenticated()) {
      console.log("Unauthorized daily quiz submission attempt");
      return res.sendStatus(401);
    }
    
    try {
      console.log("Received daily quiz data:", JSON.stringify(req.body));
      
      const validatedData = dailyQuizValidationSchema.parse(req.body);
      const userId = req.user.id;
      const today = new Date();
      
      console.log(`Processing daily quiz for user ${userId} on ${today.toISOString()}`);
      
      // Check if user already has quiz responses for today
      const existingResponse = await storage.getDailyQuizResponse(userId, today);
      console.log(`Existing daily quiz response for today:`, existingResponse ? "found" : "not found");
      
      // Get initial quiz responses for calculation
      const initialQuizResponse = await storage.getInitialQuizResponse(userId);
      if (!initialQuizResponse) {
        console.log(`User ${userId} has not completed initial quiz yet`);
        return res.status(400).send("Initial quiz must be completed first");
      }
      
      if (existingResponse) {
        // Update existing response
        const updatedResponse = await storage.updateDailyQuizResponse(userId, today, {
          ...validatedData,
          userId
        });
        
        if (!updatedResponse) return res.status(500).send("Failed to update quiz response");
        
        // Calculate water consumption based on quiz responses
        const consumption = calculateDailyWaterConsumption(updatedResponse, initialQuizResponse);
        
        // Save or update water consumption data
        const existingConsumption = await storage.getWaterConsumption(userId, today);
        
        if (existingConsumption) {
          await storage.updateWaterConsumption(userId, today, consumption);
        } else {
          await storage.createWaterConsumption({
            ...consumption,
            userId
          });
        }
        
        res.status(200).json(updatedResponse);
      } else {
        // Create new response
        const newResponse = await storage.createDailyQuizResponse({
          ...validatedData,
          userId
        });
        
        // Calculate water consumption based on quiz responses
        const consumption = calculateDailyWaterConsumption(newResponse, initialQuizResponse);
        
        // Get existing water consumption (from initial quiz)
        const existingConsumption = await storage.getWaterConsumption(userId, today);
        
        if (existingConsumption) {
          // Update with daily consumption
          await storage.updateWaterConsumption(userId, today, consumption);
        } else {
          // Create new consumption entry
          await storage.createWaterConsumption({
            ...consumption,
            userId
          });
        }
        
        res.status(201).json(newResponse);
      }
    } catch (error) {
      console.error("Error in daily quiz submission:", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Error processing daily quiz" });
    }
  });

  app.get("/api/daily-quiz", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    const today = new Date();
    const response = await storage.getDailyQuizResponse(req.user.id, today);
    
    res.status(200).json(response || null);
  });
  
  // PATCH route to update an existing daily quiz
  app.patch("/api/daily-quiz", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      console.log("[Storage] Updating daily quiz for user", req.user.id);
      
      // Validate the request body
      const result = dailyQuizValidationSchema.safeParse(req.body);
      if (!result.success) {
        const errorMessage = JSON.stringify(result.error.format());
        console.error("[Storage] Daily quiz validation failed:", errorMessage);
        return res.status(400).json({ error: "Invalid daily quiz data: " + errorMessage });
      }
      
      const today = new Date();
      
      // Check if daily quiz exists for today
      const existingResponse = await storage.getDailyQuizResponse(req.user.id, today);
      if (!existingResponse) {
        console.error("[Storage] Cannot update: No daily quiz found for today");
        return res.status(404).json({ error: "No daily quiz found for today" });
      }
      
      // Update the daily quiz response
      const updatedResponse = await storage.updateDailyQuizResponse(req.user.id, today, req.body);
      if (!updatedResponse) {
        console.error("[Storage] Failed to update daily quiz");
        return res.status(500).json({ error: "Failed to update daily quiz" });
      }
      
      // Calculate and update water consumption
      const initialResponse = await storage.getInitialQuizResponse(req.user.id);
      if (initialResponse) {
        const waterConsumption = calculateDailyWaterConsumption(updatedResponse, initialResponse);
        
        // Get existing water consumption for today
        const existingConsumption = await storage.getWaterConsumption(req.user.id, today);
        
        if (existingConsumption) {
          // Update existing water consumption
          await storage.updateWaterConsumption(req.user.id, today, waterConsumption);
          console.log("[Storage] Updated water consumption for user", req.user.id);
        } else {
          // Create new water consumption (shouldn't normally happen but just in case)
          await storage.createWaterConsumption({
            userId: req.user.id,
            date: today,
            ...waterConsumption
          });
          console.log("[Storage] Created new water consumption for user", req.user.id);
        }
      }
      
      console.log("[Storage] Daily quiz updated successfully for user", req.user.id);
      res.status(200).json(updatedResponse);
    } catch (error) {
      console.error("Error in daily quiz update:", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Error updating daily quiz" });
    }
  });

  // Water consumption route
  app.get("/api/water-consumption", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    const today = new Date();
    const consumption = await storage.getWaterConsumption(req.user.id, today);
    
    if (!consumption) {
      // If no consumption data exists, check if initial quiz is completed
      const initialQuizResponse = await storage.getInitialQuizResponse(req.user.id);
      
      if (initialQuizResponse) {
        // Calculate and create consumption based on initial quiz
        const calculatedConsumption = calculateInitialWaterConsumption(initialQuizResponse);
        const newConsumption = await storage.createWaterConsumption({
          ...calculatedConsumption,
          userId: req.user.id
        });
        
        return res.status(200).json(newConsumption);
      }
      
      return res.status(200).json(null);
    }
    
    res.status(200).json(consumption);
  });

  // Endpoint to update user's water goal
  app.post("/api/goal", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Unauthorized");
    
    const { goal } = req.body;
    
    if (typeof goal !== 'number' || goal < 0) {
      return res.status(400).send("Invalid goal value");
    }
    
    try {
      console.log(`[Storage] Updating water goal for user ${req.user.id} to ${goal}`);
      
      // Round goal to nearest integer
      const roundedGoal = Math.round(goal);
      
      // Update the user in the database
      const updatedUser = await storage.updateUserGoal(req.user.id, roundedGoal);
      
      if (!updatedUser) {
        console.error(`[Storage] Failed to update goal for user ${req.user.id}`);
        return res.status(500).send("Failed to update goal");
      }
      
      // Update the session user with the new goal
      req.user.waterGoal = roundedGoal;
      // Explicitly save session
      await saveSession(req);
      
      console.log(`[Storage] Goal updated successfully for user ${req.user.id} to ${roundedGoal}`);
      console.log(`[Storage] Returned user data:`, JSON.stringify(updatedUser));
      
      // Make sure we return the full user object to the client
      if (updatedUser) {
        // If we're returning a partial object with just waterGoal, convert it to full user
        if (Object.keys(updatedUser).length === 1 && 'waterGoal' in updatedUser) {
          console.log('[Storage] Converting partial user to full user');
          res.status(200).json(req.user);
        } else {
          res.status(200).json(updatedUser);
        }
      } else {
        res.status(200).json(req.user);
      }
    } catch (error) {
      console.error("Error updating goal:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to update goal" 
      });
    }
  });

  // Profile update endpoint
  app.post("/api/profile", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).send("Unauthorized");
    
    const { name, email, phone } = req.body;
    
    // Validate inputs
    if ((email && typeof email !== 'string') || 
        (name && typeof name !== 'string') || 
        (phone && typeof phone !== 'string')) {
      return res.status(400).send("Invalid input data");
    }
    
    try {
      console.log(`[Storage] Updating profile for user ${req.user.id}`);
      const profileData = {
        name: name || undefined,
        email: email || undefined,
        phone: phone || undefined
      };
      
      const updatedUser = await storage.updateUserProfile(req.user.id, profileData);
      
      if (!updatedUser) {
        console.error(`[Storage] Failed to update profile for user ${req.user.id}`);
        return res.status(500).send("Failed to update profile");
      }
      
      // Update the session user with the new profile data
      if (name) req.user.name = name;
      if (email) req.user.email = email;
      if (phone) req.user.phone = phone;
      // Explicitly save session
      await saveSession(req);
      
      console.log(`[Storage] Profile updated successfully for user ${req.user.id}`);
      console.log(`[Storage] Returned profile data:`, JSON.stringify(updatedUser));
      
      // Make sure we return the full user object to the client
      if (updatedUser) {
        // If we're returning a partial user object, convert it to full user
        const hasOnlyProfileFields = Object.keys(updatedUser).every(key => 
          ['name', 'email', 'phone'].includes(key));
          
        if (hasOnlyProfileFields) {
          console.log('[Storage] Converting partial user to full user');
          res.status(200).json(req.user);
        } else {
          res.status(200).json(updatedUser);
        }
      } else {
        res.status(200).json(req.user);
      }
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to update profile" 
      });
    }
  });

  // Set up a daily reset at midnight
  schedule.scheduleJob('0 0 * * *', async () => {
    console.log("Running daily reset of water consumption data");
    // No need to reset data as we're storing by date
    // New requests will create new entries for the new day
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Helper functions for water consumption calculations
function calculateInitialWaterConsumption(response: any): any {
  // Start with base values
  let totalGallons = 0;
  let showerGallons = 0;
  let toiletGallons = 0;
  let kitchenGallons = 0;
  let dishwasherGallons = 0;
  let laundryGallons = 0;
  let gardenGallons = 0;
  let poolGallons = 0;
  let carWashGallons = 0;
  let energyGallons = 0;
  let shoppingGallons = 0;
  let otherGallons = 0;

  // 1. Low-flow appliances (subtract gallons for each)
  const appliances = response.appliances || [];
  if (appliances.includes('showerhead')) {
    showerGallons -= 63;
  }
  
  // 2. Bath usage
  if (response.bathsPerMonth) {
    const bathValue = (80 * response.bathsPerMonth) / 30;
    showerGallons += bathValue;
  }
  
  // 3. Dishwasher usage
  if (response.dishwasherType === 'yes_efficient' && response.dishwasherFrequency) {
    dishwasherGallons += (4 * response.dishwasherFrequency) / 30;
  } else if (response.dishwasherType === 'yes_not_efficient' && response.dishwasherFrequency) {
    dishwasherGallons += (10 * response.dishwasherFrequency) / 30;
  }
  
  // 4. Laundry usage
  if (response.laundryType === 'yes_efficient' && response.laundryFrequency) {
    laundryGallons += (14 * response.laundryFrequency) / 30;
  } else if (response.laundryType === 'yes_not_efficient' && response.laundryFrequency) {
    laundryGallons += (20 * response.laundryFrequency) / 30;
  }
  
  // 5. Garden/lawn watering
  if (response.hasGarden && response.gardenArea && response.gardenFrequency) {
    gardenGallons += (0.623 * response.gardenArea * response.gardenFrequency) / 30;
  }
  
  // 6. Swimming pool
  if (response.hasPool) {
    poolGallons += 65;
  }
  
  // 7. Car washing
  if (response.carWashMethod === 'garden_hose' && response.carWashFrequency) {
    carWashGallons += (100 * response.carWashFrequency) / 30;
  } else if (response.carWashMethod === 'drive_through' && response.carWashFrequency) {
    carWashGallons += (35 * response.carWashFrequency) / 30;
  } else if (response.carWashMethod === 'self_service' && response.carWashFrequency) {
    carWashGallons += (17 * response.carWashFrequency) / 30;
  }
  
  // 8. Energy source
  if (response.utilityPercentage) {
    energyGallons += 0.34 * response.utilityPercentage;
  }
  
  // 9. Shopping habits
  if (response.shoppingHabits === 'basics') {
    shoppingGallons += 291;
  } else if (response.shoppingHabits === 'moderate') {
    shoppingGallons += 583;
  } else if (response.shoppingHabits === 'addict') {
    shoppingGallons += 1000;
  }
  
  // Calculate total
  totalGallons = showerGallons + toiletGallons + kitchenGallons + dishwasherGallons + 
                 laundryGallons + gardenGallons + poolGallons + carWashGallons + 
                 energyGallons + shoppingGallons + otherGallons;
  
  // If total is negative, add to "other" to ensure non-negative total
  if (totalGallons < 0) {
    otherGallons += Math.abs(totalGallons);
    totalGallons = 0;
  }
  
  // Convert all floating point values to integers
  return {
    totalGallons: Math.round(totalGallons),
    showerGallons: Math.round(showerGallons),
    toiletGallons: Math.round(toiletGallons),
    kitchenGallons: Math.round(kitchenGallons),
    dishwasherGallons: Math.round(dishwasherGallons),
    laundryGallons: Math.round(laundryGallons),
    gardenGallons: Math.round(gardenGallons),
    poolGallons: Math.round(poolGallons),
    carWashGallons: Math.round(carWashGallons),
    energyGallons: Math.round(energyGallons),
    shoppingGallons: Math.round(shoppingGallons),
    otherGallons: Math.round(otherGallons)
  };
}

function calculateDailyWaterConsumption(dailyResponse: any, initialResponse: any): any {
  // Get the base consumption from the initial quiz
  const baseConsumption = calculateInitialWaterConsumption(initialResponse);
  
  // Create a copy to update with daily values
  const updatedConsumption = { ...baseConsumption };
  
  // 1. Shower time
  if (dailyResponse.showerMinutes) {
    if (initialResponse.appliances?.includes('showerhead')) {
      updatedConsumption.showerGallons += 1.8 * dailyResponse.showerMinutes;
    } else {
      updatedConsumption.showerGallons += 2.5 * dailyResponse.showerMinutes;
    }
  }
  
  // 2. Bathroom sink usage
  if (dailyResponse.bathroomSinkMinutes) {
    if (initialResponse.appliances?.includes('bathroom_sink')) {
      updatedConsumption.kitchenGallons += 1.5 * dailyResponse.bathroomSinkMinutes;
    } else {
      updatedConsumption.kitchenGallons += 2.2 * dailyResponse.bathroomSinkMinutes;
    }
  }
  
  // 3. Kitchen sink usage
  if (dailyResponse.kitchenSinkMinutes) {
    if (initialResponse.appliances?.includes('kitchen_sink')) {
      updatedConsumption.kitchenGallons += 1.5 * dailyResponse.kitchenSinkMinutes;
    } else {
      updatedConsumption.kitchenGallons += 2.2 * dailyResponse.kitchenSinkMinutes;
    }
  }
  
  // 4. Toilet flushes
  if (dailyResponse.toiletFlushes) {
    if (initialResponse.appliances?.includes('toilet')) {
      updatedConsumption.toiletGallons += 1.6 * dailyResponse.toiletFlushes;
    } else {
      updatedConsumption.toiletGallons += 3.5 * dailyResponse.toiletFlushes;
    }
  }
  
  // 5. Rainwater collected (subtract from total)
  if (dailyResponse.rainwaterCollected) {
    updatedConsumption.totalGallons -= dailyResponse.rainwaterCollected;
  }
  
  // 6. Miles driven
  if (dailyResponse.milesDriven) {
    updatedConsumption.otherGallons += 0.165 * dailyResponse.milesDriven;
  }
  
  // 7. Recycled paper
  if (dailyResponse.recycledPaper) {
    updatedConsumption.otherGallons += 0.04 * dailyResponse.recycledPaper;
  }
  
  // 8. Recycled plastic (subtract from total)
  if (dailyResponse.recycledPlastic) {
    updatedConsumption.totalGallons -= 0.03 * dailyResponse.recycledPlastic;
  }
  
  // 9. Recycled bottles & cans (subtract from total)
  if (dailyResponse.recycledBottlesCans) {
    updatedConsumption.totalGallons -= 0.03 * dailyResponse.recycledBottlesCans;
  }
  
  // 10. Veggies consumed
  if (dailyResponse.veggiesConsumed) {
    updatedConsumption.otherGallons += 0.085 * dailyResponse.veggiesConsumed;
  }
  
  // 11. Meat consumed
  if (dailyResponse.meatConsumed) {
    updatedConsumption.otherGallons += 2 * dailyResponse.meatConsumed;
  }
  
  // 12. Pet food
  if (dailyResponse.petFoodUsed) {
    updatedConsumption.otherGallons += 0.7 * dailyResponse.petFoodUsed;
  }
  
  // Update total with changes to components
  updatedConsumption.totalGallons = 
    updatedConsumption.showerGallons +
    updatedConsumption.toiletGallons +
    updatedConsumption.kitchenGallons +
    updatedConsumption.dishwasherGallons +
    updatedConsumption.laundryGallons +
    updatedConsumption.gardenGallons +
    updatedConsumption.poolGallons +
    updatedConsumption.carWashGallons +
    updatedConsumption.energyGallons +
    updatedConsumption.shoppingGallons +
    updatedConsumption.otherGallons;
  
  // If total is negative, add to "other" to ensure non-negative total
  if (updatedConsumption.totalGallons < 0) {
    updatedConsumption.otherGallons += Math.abs(updatedConsumption.totalGallons);
    updatedConsumption.totalGallons = 0;
  }
  
  // Convert all floating point values to integers
  return {
    totalGallons: Math.round(updatedConsumption.totalGallons),
    showerGallons: Math.round(updatedConsumption.showerGallons),
    toiletGallons: Math.round(updatedConsumption.toiletGallons),
    kitchenGallons: Math.round(updatedConsumption.kitchenGallons),
    dishwasherGallons: Math.round(updatedConsumption.dishwasherGallons),
    laundryGallons: Math.round(updatedConsumption.laundryGallons),
    gardenGallons: Math.round(updatedConsumption.gardenGallons),
    poolGallons: Math.round(updatedConsumption.poolGallons),
    carWashGallons: Math.round(updatedConsumption.carWashGallons),
    energyGallons: Math.round(updatedConsumption.energyGallons),
    shoppingGallons: Math.round(updatedConsumption.shoppingGallons),
    otherGallons: Math.round(updatedConsumption.otherGallons)
  };
}
