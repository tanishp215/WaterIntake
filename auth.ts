import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

// Helper function to save session after user data updates
export function saveSession(req: any): Promise<void> {
  return new Promise((resolve, reject) => {
    if (req.session) {
      req.session.save((err: any) => {
        if (err) {
          console.error('Error saving session:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    } else {
      resolve();
    }
  });
}

export function setupAuth(app: Express) {
  const sessionSecret = process.env.SESSION_SECRET || "water-wise-session-secret";
  
  const sessionSettings: session.SessionOptions = {
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      console.log("Login attempt for:", username);
      const user = await storage.getUserByUsername(username);
      console.log("User found:", !!user);
      
      if (!user) {
        console.log("Login failed: User not found");
        return done(null, false);
      }
      
      const passwordValid = await comparePasswords(password, user.password);
      console.log("Password valid:", passwordValid);
      
      if (!passwordValid) {
        console.log("Login failed: Invalid password");
        return done(null, false);
      } else {
        console.log("Login successful for:", username);
        return done(null, user);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    const user = await storage.getUser(id);
    done(null, user);
  });

  app.post("/api/register", async (req, res, next) => {
    const existingUser = await storage.getUserByUsername(req.body.username);
    if (existingUser) {
      return res.status(400).send("Username already exists");
    }

    const user = await storage.createUser({
      ...req.body,
      password: await hashPassword(req.body.password),
    });

    req.login(user, (err) => {
      if (err) return next(err);
      res.status(201).json(user);
    });
  });

  app.post("/api/login", (req, res, next) => {
    console.log("Login request body:", req.body);
    passport.authenticate("local", (err: any, user: SelectUser | false, info: any) => {
      if (err) {
        console.log("Login error:", err);
        return next(err);
      }
      if (!user) {
        console.log("Authentication failed:", info);
        return res.status(401).json({ error: "Authentication failed" });
      }
      req.login(user, (loginErr) => {
        if (loginErr) {
          console.log("Login error:", loginErr);
          return next(loginErr);
        }
        console.log("Login successful, user:", user.username);
        // Force session save after login
        req.session.save(function(saveErr) {
          if (saveErr) {
            console.error("Session save error:", saveErr);
            return next(saveErr);
          }
          return res.status(200).json(user);
        });
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      
      // Explicitly save the session after logout
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error("Session save error during logout:", saveErr);
          return next(saveErr);
        }
        console.log("Logout successful, session saved");
        res.sendStatus(200);
      });
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });
}
