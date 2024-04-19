import express from "express";
import {sql} from '../index.js';
import passport from "passport";
import bcrypt from "bcrypt";
import { Strategy } from "passport-local";
import { Resend } from 'resend';
import fetch, { Headers } from 'node-fetch';
global.fetch = fetch;
global.Headers = Headers;

const router = express.Router();
const saltRounds = 10;
const resend = new Resend('re_NWMx3czy_5fm2q1hrJ1bKkgFh5no1fdyD');

// Route for user home page with register and login button
router.get("/", (req, res) => {
    res.render("user.ejs"); 
});

// Route for user registration page
router.get("/register", (req, res) => {
    res.render("register.ejs");
});

// POST handler for user registration
router.post("/register", async (req, res) => {
    const { name, email, password } = req.body;
    
    try {
        // Check if a user with the given email already exists
        const existingUser = await sql`SELECT * FROM users WHERE email = ${email}`;
        
        // If no user found, proceed with registration
        if (existingUser.length === 0) {
            // Hash the user's password before saving it to the database
            const hashedPassword = await bcrypt.hash(password, saltRounds);
            
            // Save the new user to the database
            const newUser = await sql`INSERT INTO users (name, email, password) VALUES (${name}, ${email}, ${hashedPassword}) RETURNING *`;
            const user = newUser[0];
            
            // Send a welcome email to the user
            try {
                await resend.emails.send({
                    from: 'Acme <onboarding@resend.dev>',
                    to: [`${email}`],
                    subject: 'Hello World',
                    html: '<strong>It works!</strong>',
                });
                console.log('Welcome email sent successfully.');
            } catch (emailError) {
                console.error('Error sending welcome email:', emailError);
            }
            
            // Log the user in and redirect to their profile
            req.login(user, (err) => {
                if (err) {
                    console.error('Error logging in user:', err);
                    res.status(500).send('An error occurred while logging in.');
                    return;
                }
                res.redirect("/user/profile");
            });
        } else {
            // If user already exists, redirect to the registration page
            res.redirect("/user/register");
        }
    } catch (err) {
        console.error('Error during user registration:', err);
        res.status(500).send('An error occurred during registration.');
    }
});

// Route for user login page
router.get("/login", (req, res) => {
    res.render("userlogin.ejs");
});

// POST handler for user login
router.post("/login",
    passport.authenticate("local", {
        successRedirect: "/user/profile",
        failureRedirect: "/user/login",
    })
);

// Route for displaying the user's profile and their enrolled courses
router.get("/profile", async (req, res) => {
    if (req.isAuthenticated()) {
        try {
            const courses = await sql`
                SELECT c.name
                FROM course_2 c
                INNER JOIN enrollment_2 e ON c.id = e.course_id
                INNER JOIN users u ON e.user_id = u.id
                WHERE u.id = ${req.user.id};
            `;
            
            // Render the user's profile page with their enrolled courses
            res.render("userprofile.ejs", {
                courses: courses,
                user_id: req.user.id,
            });
        } catch (error) {
            console.error('Error fetching user profile:', error);
            res.status(500).send('An error occurred while fetching user profile.');
        }
    } else {
        res.redirect("/user");
        console.log("Not authenticated.");
    }
});

// Route for displaying courses the user is not enrolled in
router.get("/course", async (req, res) => {
  // Redirect to login if the user is not authenticated
  if (!req.isAuthenticated()) {
    res.redirect("/user");
  } else {
    try {
      // Retrieve query parameters for pagination and filtering
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 5;
      const name = req.query.name || null;
      const category = req.query.category || null;
      const level = req.query.level || null;
      const popularity = req.query.popularity || null;

      // Calculate the offset for pagination based on the current page and limit
      const offset = (page - 1) * limit;

      // Base SQL query to fetch courses the user is not enrolled in
      let query = `
        SELECT c.name AS course_name, c.id
        FROM course_2 c
        WHERE c.id NOT IN (
          SELECT course_id
          FROM enrollment_2
          WHERE user_id = ${req.user.id}
        )
      `;
      
      // Base query to count the total number of courses available for the user
      let countQuery = `
        SELECT COUNT(*)
        FROM course_2 c
        WHERE c.id NOT IN (
          SELECT course_id
          FROM enrollment_2
          WHERE user_id = ${req.user.id}
        )
      `;

      // Array to hold query parameters
      const queryParams = [];
      // Array to hold query conditions based on filters
      const conditions = [];

      // Add filtering conditions based on query parameters (name, category, level, popularity)
      if (name) {
        conditions.push(`c.name = $${queryParams.length + 1}`);
        queryParams.push(name);
      }
      if (category) {
        conditions.push(`c.category = $${queryParams.length + 1}`);
        queryParams.push(category);
      }
      if (level) {
        conditions.push(`c.level = $${queryParams.length + 1}`);
        queryParams.push(level);
      }
      if (popularity) {
        conditions.push(`c.popularity = $${queryParams.length + 1}`);
        queryParams.push(popularity);
      }

      // Add filtering conditions to the base queries
      if (conditions.length > 0) {
        query += ` AND ${conditions.join(' AND ')}`;
        countQuery += ` AND ${conditions.join(' AND ')}`;
      }

      // Add pagination (LIMIT and OFFSET) to the query
      query += ` LIMIT ${limit} OFFSET ${offset}`;

      // Execute the SQL queries using prepared statements with the query parameters
      const result = await sql.unsafe(query, queryParams);
      const countResult = await sql.unsafe(countQuery, queryParams);

      // Calculate total courses and total pages for pagination
      const totalCourses = parseInt(countResult[0].count);
      const totalPages = Math.ceil(totalCourses / limit);

      // Render the "course.ejs" template and pass the necessary data for rendering
      res.render("course.ejs", {
        courses: result,
        currentPage: page,
        totalPages: totalPages,
        limit: limit,
        // Pass the query object to the EJS file for reusing filters
        query: req.query,
      });
    } catch (error) {
      // Handle any errors that occur during the database queries or rendering
      console.error("Error fetching courses:", error);
      // Respond with a 500 status code and an error message
      res.status(500).send("An error occurred while fetching courses.");
    }
  }
});

// Route for enrolling the user in a selected course
router.get("/enroll/:course_id", async (req, res) => {
    if (!req.isAuthenticated()) {
        res.redirect("/user");
    } else {
        try {
            const courseId = req.params.course_id;
            
            // Enroll the user in the selected course
            await sql`INSERT INTO enrollment_2 (user_id, course_id) VALUES (${req.user.id}, ${courseId})`;
            
            // Send enrollment notification email to the user
            try {
                const courseName = await sql`SELECT name FROM course_2 WHERE id = ${courseId}`;
                await resend.emails.send({
                    from: 'Acme <onboarding@resend.dev>',
                    to: [`${req.user.email}`],
                    subject: 'COURSE REGISTRATION',
                    html: `<strong>You have been enrolled in ${courseName}</strong>`,
                });
                console.log('Enrollment email sent successfully.');
            } catch (emailError) {
                console.error('Error sending enrollment email:', emailError);
            }
            
            // Redirect the user to their profile page
            res.redirect("/user/profile");
        } catch (error) {
            console.error('Error enrolling user in course:', error);
            res.status(500).send('An error occurred while enrolling in the course.');
        }
    }
});

// Route for logging the user out
router.get("/logout", (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error('Error during logout:', err);
            res.status(500).send('An error occurred during logout.');
            return;
        }
        res.redirect("/");
    });
});

// Route for user profile editing page
router.get("/edit", (req, res) => {
    if (!req.isAuthenticated()) {
        res.redirect("/user/login");
    } else {
        res.render("useredit.ejs");
    }
});

// POST handler for editing user profile
router.post("/edit", async (req, res) => {
    if (!req.isAuthenticated()) {
        res.redirect("/user/login");
        return;
    }

    try {
        const userId = req.user.id;
        const existingUserData = await sql`SELECT * FROM users WHERE id=${userId}`;

        if (!existingUserData || existingUserData.length === 0) {
            console.error(`User with ID ${userId} not found.`);
            res.status(404).send("User not found.");
            return;
        }

        const userData = existingUserData[0];
        const { name, email, password } = req.body;

        // Update the user data
        const updatedUser = {
            name: name || userData.name,
            email: email || userData.email,
            password: password || userData.password,
        };

        // Hash the new password if it was provided
        let hashedPassword = userData.password;
        if (password) {
            hashedPassword = await bcrypt.hash(password, saltRounds);
        }

        // Update the user in the database
        await sql`UPDATE users
                  SET name = ${updatedUser.name}, email = ${updatedUser.email}, password = ${hashedPassword}
                  WHERE id = ${userId}`;
        
        console.log(`Successfully updated user profile for user ID ${userId}.`);
        res.redirect("/user/profile");
    } catch (error) {
        console.error('Error updating user profile:', error);
        res.status(500).send('An error occurred while updating user profile.');
    }
});

// Route for deleting a user
router.get("/delete/:id", async (req, res) => {
    const userId = req.params.id;

    if (!req.isAuthenticated()) {
        res.redirect("/user/login");
    } else {
        try {
            // Delete the user's enrollments first
            await sql`DELETE FROM enrollment_2 WHERE user_id=${userId}`;
            
            // Delete the user
            await sql`DELETE FROM users WHERE id=${userId}`;
            
            console.log(`Successfully deleted user with ID ${userId}.`);
            res.redirect('/user');
        } catch (error) {
            console.error('Error deleting user:', error);
            res.status(500).send('An error occurred while deleting user.');
        }
    }
});

// Passport.js local strategy
passport.use("local", new Strategy(async (username, password, cb) => {
    try {
        // Find the user by their email (username)
        const result = await sql`SELECT * FROM users WHERE email = ${username}`;
        
        if (result.length === 0) {
            console.log(`No user found with email: ${username}`);
            return cb(null, false, { message: "Incorrect username" });
        }
        
        const user = result[0];
        console.log(`User of ID: ${user.id} has joined.`);
        
        // Compare the provided password with the stored password hash
        bcrypt.compare(password, user.password, (err, match) => {
            if (err) {
                console.error("Error during password comparison:", err);
                return cb(err);
            }

            if (match) {
                // Password matches, authentication successful
                return cb(null, user);
            } else {
                // Password does not match
                return cb(null, false);
            }
        });
    } catch (error) {
        console.error("Error during authentication:", error);
        cb(error);
    }
}));

passport.serializeUser((user, cb) => {
    cb(null, user);
});
passport.deserializeUser((user, cb) => {
    cb(null, user);
});

export default router;
