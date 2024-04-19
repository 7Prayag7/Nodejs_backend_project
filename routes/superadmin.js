import express from 'express';
import { sql } from '../index.js';
import passport from 'passport';
import bcrypt from 'bcrypt';
import { Strategy } from 'passport-local';
// import flash from 'connect-flash';

const app = express();
// app.use(flash());

const router = express.Router();
const saltRounds = 10;

// SUPERADMIN login page
router.get('/login', (req, res) => {
    res.render('superadminlogin.ejs');
});

// login POST handler
router.post('/login',
  passport.authenticate('superadmin', {
    successRedirect: '/superadmin/profile',
    failureRedirect: '/superadmin/login',
    // failureFlash: true // Enable flash messages for failure case
  })
);

// Route to get the SUPERADMIN's profile
router.get('/profile', async (req, res) => {
    try {
        if (req.isAuthenticated()) {
            res.render('superadminprofile.ejs', {
                user_id: req.user.id
            });
        } else {
            res.redirect('/superadmin/login');
        }
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).send('An error occurred while fetching profile.');
    }
});

// Logging user out
router.get('/logout', (req, res, next) => {
    req.logout(function (err) {
        if (err) {
            return next(err);
        }
        res.redirect('/');
    });
});

// Edit profile page
router.get('/edit', async (req, res) => {
    if (!req.isAuthenticated()) {
        res.redirect('/superadmin/login');
    } else {
        res.render('superadminedit.ejs');
    }
});

// Edit user patch request handler
router.post('/edit', async (req, res) => {
    try {
        const user_id = req.user.id;
        const response = await sql`SELECT * FROM superadmin WHERE id = ${user_id}`;
        
        if (response.length === 0) {
            return res.status(404).send('User not found.');
        }

        const existingUserObject = response[0];
        const editedUserObject = req.body;
        
        // Construct the new user object with updated values
        const newUserObject = {
            name: editedUserObject.name || existingUserObject.name,
            email: editedUserObject.email || existingUserObject.email,
            password: editedUserObject.password || existingUserObject.password,
        };

        // Encrypt the new password if it's provided
        if (editedUserObject.password) {
            const hash = await bcrypt.hash(editedUserObject.password, saltRounds);
            newUserObject.password = hash;
        } else {
            newUserObject.password = existingUserObject.password;
        }

        // Update the user in the database
        await sql`UPDATE superadmin
            SET name = ${newUserObject.name}, email = ${newUserObject.email}, password = ${newUserObject.password}
            WHERE id = ${user_id}`;
        
        console.log('Successfully edited SUPERADMIN profile');
        res.redirect('/superadmin/profile');
    } catch (error) {
        console.error('Error editing super admin profile:', error);
        res.status(500).send('An error occurred while editing profile.');
    }
});

// Render course creation page
router.get('/course/create', async (req, res) => {
    if (req.isAuthenticated()) {
        res.render('newcourse.ejs');
    } else {
        res.redirect('/superadmin/login');
    }
});

// Creating course
router.post('/course/create', async (req, res) => {
    const { name, category, level, popularity } = req.body;

    try {
        // Check if a course with the same name already exists
        const existingCourse = await sql`SELECT * FROM course_2 WHERE name = ${name}`;
        
        if (existingCourse.length > 0) {
            // Course with the given name already exists, redirect back to the course creation page
            res.redirect('/superadmin/course/create?error=Course name already exists');
        } else {
            // Insert the new course
            await sql`INSERT INTO course_2(name, category, level, popularity)
                VALUES (${name}, ${category}, ${level}, ${popularity})`;
            
            // Redirect to the all courses page after successful insertion
            res.redirect('/superadmin/allcourses');
        }
    } catch (error) {
        console.error('Error creating course:', error);
        res.redirect('/superadmin/course/create?error=An error occurred while creating the course');
    }
});

// Deleting course
router.get('/course/delete/:id', async (req, res) => {
    try {
        const course_id = parseInt(req.params.id);
        if (req.isAuthenticated()) {
            await sql`DELETE FROM course_2 WHERE id = ${course_id}`;
            res.redirect('/superadmin/allcourses');
        } else {
            res.redirect('/superadmin/login');
        }
    } catch (error) {
        console.error('Error deleting course:', error);
        res.status(500).send('An error occurred while deleting course.');
    }
});

// Editing course page
router.get('/course/edit/:id', async (req, res) => {
    try {
        const id = req.params.id;
        if (req.isAuthenticated()) {
            res.render('courseedit.ejs', {
                id: id,
            });
        } else {
            res.redirect('/superadmin/login');
        }
    } catch (error) {
        console.error('Error rendering course edit page:', error);
        res.status(500).send('An error occurred while rendering course edit page.');
    }
});

// Updating course
router.post('/course/edit/:id', async (req, res) => {
    try {
        const course_id = parseInt(req.params.id);
        const response = await sql`SELECT * FROM course_2 WHERE id = ${course_id}`;
        const existingCourseObject = response[0];
        const editedCourseObject = req.body;

        // Construct the new course object with updated values
        const newCourseObject = {
            name: editedCourseObject.name || existingCourseObject.name,
            category: editedCourseObject.category || existingCourseObject.category,
            level: editedCourseObject.level || existingCourseObject.level,
            popularity: editedCourseObject.popularity || existingCourseObject.popularity,
        };

        // Update the course in the database
        const edited = await sql`UPDATE course_2 
            SET name = ${newCourseObject.name}, category = ${newCourseObject.category}, 
            level = ${newCourseObject.level}, popularity = ${newCourseObject.popularity}
            WHERE id = ${course_id} RETURNING *`;
        
        console.log('Course updated:', edited);
        res.redirect(`/superadmin/course/${course_id}`);
    } catch (error) {
        console.error('Error updating course:', error);
        res.status(500).send('An error occurred while updating course.');
    }
});

// Fetching all courses with pagination and filtering
router.get('/allcourses', async (req, res) => {
    try {
        if (req.isAuthenticated()) {
            // Retrieve query parameters for pagination and filtering
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 5;
            const name = req.query.name || null;
            const category = req.query.category || null;
            const level = req.query.level || null;
            const popularity = req.query.popularity || null;

            // Calculate the offset for pagination
            const offset = (page - 1) * limit;

            // Define the base SQL query for courses
            let query = 'SELECT * FROM course_2';
            let countQuery = 'SELECT COUNT(*) FROM course_2';
            const queryParams = [];

            // Dynamically add filtering conditions based on the provided query parameters
            let conditions = [];
            if (name) {
                conditions.push(`name = $${queryParams.length + 1}`);
                queryParams.push(name);
            }
            if (category) {
                conditions.push(`category = $${queryParams.length + 1}`);
                queryParams.push(category);
            }
            if (level) {
                conditions.push(`level = $${queryParams.length + 1}`);
                queryParams.push(level);
            }
            if (popularity) {
                conditions.push(`popularity = $${queryParams.length + 1}`);
                queryParams.push(popularity);
            }

            // Add the filtering conditions to the query if any were specified
            if (conditions.length > 0) {
                query += ' WHERE ' + conditions.join(' AND ');
                countQuery += ' WHERE ' + conditions.join(' AND ');
            }

            // Add pagination clauses (LIMIT and OFFSET) to the query
            query += ` LIMIT ${limit} OFFSET ${offset}`;

            // Execute the SQL queries using prepared statements with the query parameters
            const result = await sql.unsafe(query, queryParams);
            const countResult = await sql.unsafe(countQuery, queryParams);

            // Calculate total courses and total pages
            const totalCourses = parseInt(countResult[0].count);
            const totalPages = Math.ceil(totalCourses / limit);

            // Render the EJS file and pass the necessary data
            res.render('superadmincourses.ejs', {
                courses: result,
                currentPage: page,
                totalPages: totalPages,
                limit: limit,
                query: req.query // Pass the query object to the EJS file
            });
        } else {
            res.redirect('/superadmin/login');
        }
    } catch (error) {
        console.error('Error fetching courses:', error);
        res.status(500).send('An error occurred while fetching courses.');
    }
});

// Route for detailed view of a single course
router.get('/course/:id', async (req, res) => {
    try {
        if (req.isAuthenticated()) {
            // Get the course ID from the URL parameters
            const courseId = req.params.id;

            // Query the database to get the course details
            const course = await sql`SELECT * FROM course_2 WHERE id = ${courseId}`;

            // Check if the course exists
            if (!course) {
                res.status(404).send('Course not found.');
                return;
            }

            // Render a detailed view for the course using an EJS file
            res.render('course_detail.ejs', { course: course[0] });
        } else {
            res.redirect('/superadmin/login');
        }
    } catch (error) {
        console.error('Error fetching course details:', error);
        res.status(500).send('An error occurred while fetching course details.');
    }
});

// Define passport strategy for superadmin authentication
passport.use('superadmin',
  new Strategy(async function verify(username, password, cb) {
    try {
        // Retrieve the user from the database based on the email (username)
        const result = await sql`SELECT * FROM superadmin WHERE email = ${username}`;
        
        if (result.length === 0) {
            // If no user is found, return an error message
            return cb(null, false, { message: 'Incorrect username' });
        }

        const superadmin = result[0];
        const storedHash = superadmin.password;

        // Compare the provided password with the stored hash
        bcrypt.compare(password, storedHash, (err, result) => {
            if (err) {
                console.error('Error comparing passwords:', err);
                return cb(err);
            }
            if (result) {
                // If the password matches, authenticate the user
                return cb(null, superadmin);
            } else {
                // If the password does not match, return an error message
                return cb(null, false, { message: 'Incorrect password' });
            }
        });
    } catch (error) {
        console.error('Error authenticating user:', error);
        return cb(error);
    }
  })
);

// Serialize and deserialize superadmin
passport.serializeUser((superadmin, cb) => {
    cb(null, superadmin);
});

passport.deserializeUser((superadmin, cb) => {
    cb(null, superadmin);
});

export default router;
