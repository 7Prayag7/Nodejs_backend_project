// Importing necessary modules
import express from "express";
import postgres from "postgres";
import bodyParser from "body-parser";
import session from "express-session";
import passport from "passport";
// import { Strategy } from "passport-local";
import knex from "knex";
import KnexSessionStore from "connect-session-knex";
// Initialize knex for session store
const knexInstance = knex({
    client: 'pg',
    connection: {
        host: process.env.DB_HOST,
        database: process.env.DB_DATABASE,
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT || 5432,
        ssl: process.env.DB_SSL === "require" ? { rejectUnauthorized: false } : false,
    }
});
const knexSession = KnexSessionStore(session);
const sessionStore = new knexSession({
// const sessionStore = new KnexSessionStore({
    knex: knexInstance,
    tablename: "session",
    sidfieldname: "sid",
    createtable: false, // Assumes table already exists
    clearInterval: 1000 * 60 * 60 * 24, // Clear expired sessions daily
});
const app = express();
// Setting EJS as the view engine
app.set('view engine', 'ejs');

// app.use(
//     session({
//         store: sessionStore,
//         secret: process.env.SESSION_SECRET,
//         resave: false,
//         saveUninitialized: true,
//         cookie: {
//             maxAge: 24 * 60 * 60 * 1000, // 1 day in milliseconds
//         },
//     })
// );


// Importing routes
import userRoutes from './routes/user.js';
import superadminRoutes from './routes/superadmin.js'; 

// Loading environment variables
import dotenv from "dotenv";
dotenv.config(); // Load environment variables from .env file

// App setup
const port = process.env.PORT || 3000; // Set port from environment variable or default to 3000

// Use bodyParser for parsing application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: true }));

// Setting up PostgreSQL connection using environment variables

// PostgreSQL connection configuration
const sql = postgres({
  host: process.env.DB_HOST, // Read the host from the .env file
  database: process.env.DB_DATABASE,
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: process.env.DB_SSL === "require",
});
export { sql };

// Setting up the session with secret from environment variable
app.use(
  session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET, // Set session secret from .env file
    resave: false,
    saveUninitialized: true,
    cookie: {
            maxAge: 24 * 60 * 60 * 1000, // 1 day in milliseconds
        },
  })
);

// Initializing passport
app.use(passport.initialize());
app.use(passport.session());

// Routes setup
app.use("/user", userRoutes);
app.use("/superadmin", superadminRoutes);

// Home page route
app.get("/", (req, res) => {
  res.render("home.ejs");
});

// Server listener
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
export default app;
