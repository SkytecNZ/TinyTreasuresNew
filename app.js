//Tiny Treasures Project 
//FutureSkills - MCSD51 March 2025 
//Author: Nilantha Hewage
//Date created: 28th June 2025


// This will load environment variables from .env file
require('dotenv').config();
console.log('Loaded env session secret:', process.env.SESSION_SECRET);


// Import required modules
var express = require('express');
var app = express();
var session = require('express-session');
var conn = require('./dbConfig');
var bodyParser = require('body-parser');
const fs = require('fs');
const flash = require('express-flash');
const crypto = require('crypto');


console.log('The web app is starting...');

// Set up EJS as the view engine
app.set('view engine', 'ejs');
console.log('View engine set to EJS');

// Set up session middleware
app.use(session({
    secret: process.env.SESSION_SECRET, // from.env file
    resave: false,
    saveUninitialized: true // false Better for security
    // cookie: { secure: false }  // need to change to true is using HTPPS
}));
app.use(flash());

// Prevent caching of authenticated pages
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.use(flash());
console.log('Flash middleware enabled');
console.log('Session middleware configured');

// Handle JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
console.log('JSON and URL-encoded parsers enabled');


// Set up static file serving
app.use(express.static('public'));
console.log('Static files served from /public');

// Body parser middleware for form data
app.use(bodyParser.urlencoded({ extended: false }));
console.log('Body parser middleware configured');

// Admin authentication middleware
const isAdmin = (req, res, next) => {
    console.log('Checking admin authentication:', { loggedin: req.session.loggedin, role: req.session.role });
    if (req.session.loggedin && req.session.role === 'admin') {
        return next();
    }
    console.log('Admin authentication failed, sending error response');
    // Send a response with a button to go back to login
   res.send(`<h2 style="color: blue;">Please login to view this page!</h2>
               <a href="/login">
               <button style="margin-top: 15px; padding: 10px 20px; background-color: #1f11ea; color: white; border: none; border-radius: 5px;">Back to Login</button>
              </a>   
              `);
};

// Home route
app.get('/', function(req, res) {
    console.log('Entering / route');
    res.render('home');
    console.log('Rendered home view');
});

// Login route
app.get('/login', function(req, res) {
    console.log('Rendered login view');
    res.render('login');   
});

// Route to render Contact Us form
app.get('/contactus', (req, res) => {
    console.log('Rendered conactus view');
    res.render('contactus');
});

// Contact Us form submission route with email to admin
// This route handles the form submission from contactus.ejs
const nodemailer = require('nodemailer');
app.post('/contactus', (req, res) => {
  const { fname, lname, email, phone, message } = req.body;

  const sql = `INSERT INTO messages (fname, lname, email, phone, message) VALUES (?, ?, ?, ?, ?)`;
  const values = [fname, lname, email, phone, message];

  conn.query(sql, values, (err, result) => {
    if (err) {
      console.error('Error inserting message:', err);
      return res.status(500).send('An error occurred while submitting the form.');
    }
    console.log('Message added to the db table with ID:', result.insertId);

    // Send Email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER, // from .env file
        pass: process.env.GMAIL_PASS // fron .env file
      }
    });

    const mailOptions = {
      from: 'tinytreasures.gleneden@gmail.com',
      to: 'tinytreasures.gleneden@gmail.com',
      subject: `New Inquiry Contact Form Submission from ${fname} ${lname}`,
      text: `
You received a new contact form message:

First Name: ${fname}
Last Name: ${lname}
Email: ${email}
Phone: ${phone}

Message:
${message}
      `
    };

    transporter.sendMail(mailOptions, (emailErr, info) => {
      if (emailErr) {
        console.error('Error sending email:', emailErr);       
      } else {
        console.log('Email sent:', info.response);
      }
      res.redirect('/thankyou');
    });
  });
});
// Route to render Thank You page
// This route is called after form submission
app.get('/thankyou', (req, res) => {
  res.render('thankyou');
});

// Authentication route with hashing passwords
app.post('/auth', function(req, res) {
  const { email, password } = req.body;

  if (email && password) {
    conn.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
      if (err) return res.status(500).send('Server Error');

      if (results.length === 0) {
       return res.send('<h2 style="color: blue;"> Incorrect Email or Password</h2>' +
      '<a href="/login">' +
      '<button style="margin-top: 15px; padding: 10px 20px; background-color: #1f11ea; color: white; border: none; border-radius: 5px;">Back to Login</button>' +
      '</a>'); 
      }

      const user = results[0];
      bcrypt.compare(password, user.password, (err, isMatch) => {
        if (err || !isMatch) {
          return res.send('<h2 style="color: blue;"> Incorrect Email or Password</h2>' +
      '<a href="/login">' +
      '<button style="margin-top: 15px; padding: 10px 20px; background-color: #1f11ea; color: white; border: none; border-radius: 5px;">Back to Login</button>' +
      '</a>'); 
        }

        req.session.loggedin = true;
        req.session.email = email;
        req.session.username = user.username;
        req.session.role = user.role;
        res.redirect('/membersOnly');
      });
    });
  } else {
     res.send(`
            <h2 style="color: blue;">Please enter Email and Password!</h2>
                     <a href="/login"> <button style="margin-top: 15px; padding: 10px 20px; background-color: #1f11ea; color: white; border: none; border-radius: 5px;">Back to Login</button>
             </a>   
               `);   
  }
});

// Members-only route (admin, parent or teacher)
app.get('/membersOnly', function(req, res, next) {
    console.log('Entering /membersOnly route', { loggedin: req.session.loggedin, role: req.session.role });
    if (req.session.loggedin) {
        if (req.session.role === 'admin') {
           // Run DB query before rendering adminOnly view
      const query = `
        SELECT 
          (SELECT COUNT(*) FROM child WHERE status = 'Enrolled') AS enrolledChildrenCount,
          (SELECT COUNT(*) FROM users WHERE role = 'parent') AS parentCount,
          (SELECT COUNT(*) FROM users WHERE role = 'teacher') AS teacherCount
      `;

      conn.query(query, (err, results) => {
        if (err) {
          console.error('Dashboard query error:', err);
          return res.send('Database error');
        }

        const row = results[0];
        console.log('Dashboard data:', row); // ← this will confirm output
        res.render('adminOnly', {
          adminName: req.session.username,
          adminEmail: req.session.email,
          enrolledChildrenCount: row.enrolledChildrenCount,
          parentCount: row.parentCount,
          teacherCount: row.teacherCount
        });
      });
    // Render the adminOnly view with the fetched data pagination
      } else if (req.session.role === 'teacher') {
    const page = parseInt(req.query.page) || 1;
    const pageSize = 7; // Number of children per page
    const offset = (page - 1) * pageSize;

    const countSql = 'SELECT COUNT(*) AS total FROM child WHERE status = "Enrolled"';
    const dataSql = `
        SELECT id, first_name, last_name, gender, dob, picture, food_allergy 
        FROM child 
        WHERE status = "Enrolled"
        ORDER BY id ASC
        LIMIT ? OFFSET ?
    `;

    conn.query(countSql, (countErr, countResult) => {
        if (countErr) {
            console.error('Error counting enrolled children:', countErr);
            return res.status(500).send('Database error');
        }

        const totalChildren = countResult[0].total;
        const totalPages = Math.ceil(totalChildren / pageSize);

        conn.query(dataSql, [pageSize, offset], (err, child) => {
            if (err) {
                console.error('Error fetching child db data:', err);
                return res.status(500).send('Database error');
            }

            console.log('Fetched child data for teacher:', child);

            res.render('teacherOnly', {
                teacherName: req.session.username,
                teacherEmail: req.session.email,
                child,
                currentPage: page,
                totalPages
            });

            console.log('Rendered teacherOnly view for teacher with child data');
        });
    });


    // Parent dashboard with pagination for Daily activity logs and selector if more than 1 enrolled child
    } else if (req.session.role === 'parent') {
    const parentEmail = req.session.email;
    const selectedChildId = req.query.childId;
    const page = parseInt(req.query.page) || 1;
    const pageSize = 10; // Number of logs per page
    const offset = (page - 1) * pageSize;

    const sql = 'SELECT * FROM child WHERE parent_email = ?';
    conn.query(sql, [parentEmail], (err, children) => {
        if (err) {
            console.error('Error fetching children:', err);
            return res.status(500).send('Database error');
        }

        const childIdToUse = selectedChildId || (children.length > 0 ? children[0].id : null);

        if (!childIdToUse) {
            return res.render('parentOnly', {
                parentName: req.session.username,
                parentEmail,
                children,
                logs: [],
                selectedChildId: null,
                currentPage: 1,
                totalPages: 1
            });
        }

        // Get total log count
        const countSql = 'SELECT COUNT(*) AS total FROM attendance_log WHERE child_id = ?';
        conn.query(countSql, [childIdToUse], (countErr, countResult) => {
            if (countErr) {
                console.error('Error counting logs:', countErr);
                return res.status(500).send('Database error');
            }

            const totalLogs = countResult[0].total;
            const totalPages = Math.ceil(totalLogs / pageSize);

            // Get paginated logs
            const logSql = `
                SELECT * FROM attendance_log 
                WHERE child_id = ? 
                ORDER BY date DESC, in_time DESC 
                LIMIT ? OFFSET ?
            `;
            conn.query(logSql, [childIdToUse, pageSize, offset], (logErr, logs) => {
                if (logErr) {
                    console.error('Error fetching activity logs:', logErr);
                    return res.status(500).send('Database error');
                }

                res.render('parentOnly', {
                    parentName: req.session.username,
                    parentEmail,
                    children,
                    logs,
                    selectedChildId: childIdToUse,
                    currentPage: page,
                    totalPages
                });
            });
        });
    });
}


     else {
      // Unknown or disabled role
      console.warn('Role is not recognized or deactivated:', req.session.role);
      res.status(403).render('accessDenied', {
        message: 'Your account is deactivated or not recognized. Please contact the administrator.',
      });
    }
    } else {
        console.log('Not logged in, sending error response');
        // Send a response with a button to go back to login
        res.send(`
                <h2 style="color: blue;">Please login to view this page!</h2>
               <a href="/login">
               <button style="margin-top: 15px; padding: 10px 20px; background-color: #1f11ea; color: white; border: none; border-radius: 5px;">Back to Login</button>
              </a>   
              `);
    }
});
// Admin Dashboard route
app.get('/admin/dashboard', async (req, res) => {
  const [children] = await conn.promise().query("SELECT COUNT(*) AS count FROM child WHERE status = 'Enrolled'");
  const [parents] = await conn.promise().query("SELECT COUNT(*) AS count FROM user WHERE role = 'parent'");
  const [teachers] = await conn.promise().query("SELECT COUNT(*) AS count FROM user WHERE role = 'teacher'");

  res.render('adminOnly', {
    adminName: req.session.adminName,
    adminEmail: req.session.adminEmail,
    enrolledChildrenCount: children[0].count,
    parentCount: parents[0].count,
    teacherCount: teachers[0].count
  });
});

// Admin Dashboard View Contact Us Messages route with pagination
app.get('/admin/view-messages', isAdmin, (req, res) => {
  const db = require('./dbConfig');

  const page = parseInt(req.query.page) || 1; // Current page number
  const pageSize = 10; // Messages per page
  const offset = (page - 1) * pageSize;

  // Get total number of messages
  const countQuery = "SELECT COUNT(*) AS total FROM messages";
  db.query(countQuery, (countErr, countResult) => {
    if (countErr) {
      console.error("Count query error:", countErr);
      return res.status(500).send("Database count error");
    }

    const totalMessages = countResult[0].total;
    const totalPages = Math.ceil(totalMessages / pageSize);

    // Get paginated messages
    const dataQuery = `
      SELECT fname, lname, email, phone, message, submitted_at 
      FROM messages 
      ORDER BY submitted_at DESC 
      LIMIT ? OFFSET ?
    `;

    db.query(dataQuery, [pageSize, offset], (dataErr, results) => {
      if (dataErr) {
        console.error("Data query error:", dataErr);
        return res.status(500).send("Database error");
      }

      res.render('view-messages', {
        messages: results,
        currentPage: page,
        totalPages: totalPages
      });
    });
  });
});



// Export all messages as CSV
const { Parser } = require('json2csv');

app.get('/export-messages', (req, res) => {
  const sql = 'SELECT fname, lname, email, phone, message, submitted_at FROM messages ORDER BY submitted_at DESC';

  conn.query(sql, (err, results) => {
    if (err) {
      console.error('Error exporting messages:', err);
      return res.status(500).send('Error exporting messages');
    }

    try {
      // Define fields with custom labels
      const fields = [
        { label: 'Firstname', value: 'fname' },
        { label: 'Lastname', value: 'lname' },
        { label: 'Email', value: 'email' },
        { label: 'Phone', value: 'phone' },
        { label: 'Message', value: 'message' },
        { label: 'Submitted_at', value: 'submitted_at' }
      ];

      // Convert submitted_at to local time string before exporting
      const formattedResults = results.map((row) => ({
        ...row,
        submitted_at: row.submitted_at ? new Date(row.submitted_at).toLocaleString() : ''
      }));

      const parser = new Parser({ fields });
      const csv = parser.parse(formattedResults);

      // Force download
      res.header('Content-Type', 'text/csv');
      res.attachment('messages.csv');
      return res.send(csv);
    } catch (err) {
      console.error('Error generating CSV:', err);
      res.status(500).send('Error generating CSV');
    }
  });
});


// Admin Dashboard disply Educator Logs in Pagination
app.get('/admin/educatorLogs', isAdmin, (req, res) => {
    console.log('Entering /admin/educatorLogs route');

    const page = parseInt(req.query.page) || 1;
    const pageSize = 10;
    const offset = (page - 1) * pageSize;

    const countSql = `
        SELECT COUNT(*) AS total 
        FROM attendance_log
        LEFT JOIN child ON attendance_log.child_id = child.id
    `;

    const dataSql = `
        SELECT attendance_log.*, child.first_name, child.last_name, child.status
        FROM attendance_log
        LEFT JOIN child ON attendance_log.child_id = child.id
        ORDER BY attendance_log.date DESC, attendance_log.in_time DESC
        LIMIT ? OFFSET ?
    `;

    conn.query(countSql, (err, countResult) => {
        if (err) {
            console.error('Error counting logs:', err);
            return res.status(500).send('Database error');
        }

        const totalLogs = countResult[0].total;
        const totalPages = Math.ceil(totalLogs / pageSize);

        conn.query(dataSql, [pageSize, offset], (err, logs) => {
            if (err) {
                console.error('Error fetching logs:', err);
                return res.status(500).send('Database error');
            }

            res.render('educatorLogs', {
                logs,
                currentPage: page,
                totalPages
            });
        });
    });
});

// Export all educator logs as CSV
app.get('/export-logs', (req, res) => {
  const sql = `
    SELECT 
      l.date, 
      l.teacher, 
      c.first_name, 
      c.last_name, 
      l.in_time, 
      l.out_time, 
      l.activities, 
      c.status
    FROM attendance_log l
    JOIN child c ON l.child_id = c.id
    ORDER BY l.date DESC
  `;

  conn.query(sql, (err, results) => {
    if (err) {
      console.error('Error exporting logs:', err);
      return res.status(500).send('Error exporting logs');
    }

    try {
      // Format data before export
      const formattedResults = results.map(row => ({
        date: new Date(row.date).toLocaleDateString('en-NZ'), // Local NZ date (DD/MM/YYYY)
        teacher: row.teacher || 'Unknown',
        child_name: `${row.first_name} ${row.last_name}`,
        in_time: row.in_time || '',
        out_time: row.out_time || '',
        activities: row.activities ? row.activities.replace(/\r?\n|\r/g, ' ') : '',
        status: row.status || ''
      }));

      // Define CSV headers
      const fields = [
        { label: 'Date', value: 'date' },
        { label: 'Educator', value: 'teacher' },
        { label: 'Child Name', value: 'child_name' },
        { label: 'In Time', value: 'in_time' },
        { label: 'Out Time', value: 'out_time' },
        { label: 'Activities', value: 'activities' },
        { label: 'Enrolled Status', value: 'status' }
      ];

      const parser = new Parser({ fields });
      const csv = parser.parse(formattedResults);

      // Send as file download
      res.header('Content-Type', 'text/csv');
      res.attachment('educator_logs.csv');
      return res.send(csv);
    } catch (err) {
      console.error('Error generating CSV:', err);
      res.status(500).send('Error generating CSV');
    }
  });
});


// Admin Dashboard New Enrollments route
app.get('/admin/newEnrollments', isAdmin, (req, res) => {
    console.log('Entering /admin/newEnrollments route');
        res.render('newEnrollments')
    });

// Set up multer for file uploads to handle in New Enrollments by Admin
// This will allow image uploads for child registration
const multer = require('multer');
const path = require('path');
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './public/uploads/'); // Store in public/uploads folder
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + file.originalname;
        cb(null, uniqueName);
    }
});
const upload = multer({ storage: storage });

// Admin Dashboard New Enrollments POST route
app.post('/admin/newEnrollments', isAdmin, upload.single('picture'), (req, res) => {
    console.log('Entering /admin/newEnrollments POST route');
    const { first_name, last_name, gender, dob, food_allergy, parent_email, parent_first_name, parent_last_name, parent_phone } = req.body;
    const picture = req.file ? req.file.filename : null;

    if (!picture) {
        console.error('No picture uploaded');
        return res.status(400).send('Picture is required');
    }
    const status = 'Active'; // Default status for new enrollments

    const sql = `
        INSERT INTO child (first_name, last_name, gender, dob, picture, food_allergy, parent_first_name, 
        parent_last_name ,parent_email, parent_phone, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    conn.query(sql, [first_name, last_name, gender, dob, picture, food_allergy, parent_first_name, parent_last_name ,parent_email, parent_phone, status], (err, result) => {
        if (err) {
            console.error('Error inserting child record:', err);
            return res.status(500).send('Database error');
        }
        console.log('New child enrolled with childID:', result.insertId);
        // res.redirect('/admin/childDetails');
         res.render('newEnrollments', {
            success: 'New child enrolled successfully!',
            error: null
        });
    });
});

// Admin Dashboard View Child Register route with pagination
app.get('/admin/childDetails', isAdmin, (req, res) => {
    console.log('Entering /admin/childDetails route');

    const page = parseInt(req.query.page) || 1;
    const pageSize = 5;// Number of children per page
    const offset = (page - 1) * pageSize;

    const countSql = 'SELECT COUNT(*) AS total FROM child';
    const dataSql = 'SELECT * FROM child ORDER BY id ASC LIMIT ? OFFSET ?';

    conn.query(countSql, (countErr, countResult) => {
        if (countErr) {
            console.error('Error counting children:', countErr);
            return res.status(500).send('Database count error');
        }

        const totalChildren = countResult[0].total;
        const totalPages = Math.ceil(totalChildren / pageSize);

        conn.query(dataSql, [pageSize, offset], (err, children) => {
            if (err) {
                console.error('Error fetching child details:', err);
                return res.status(500).send('Database error');
            }

            res.render('childRegister', {
                children,
                currentPage: page,
                totalPages
            });
            console.log('Rendered child register with details');
        });
    });
});


// Export all children in register as CSV
app.get('/export-register', (req, res) => {
  const sql = `
  SELECT 
  id,
  first_name,
  last_name,
  gender,
  dob,
  food_allergy,
  parent_first_name,
  parent_last_name,
  parent_email,
  parent_phone,
  date,
  status
FROM child
ORDER BY id ASC
`;

  conn.query(sql, (err, results) => {
    if (err) {
      console.error('Error exporting child register:', err);
      return res.status(500).send('Error exporting child register');
    }

    try {
      // Format data before export
      const formattedResults = results.map(row => ({
        child_id: row.id,
        child_name: `${row.first_name} ${row.last_name}`,
        gender: row.gender,
        dob: row.dob ? new Date(row.dob).toLocaleDateString('en-NZ') : '',
        food_allergy: row.food_allergy || 'None',
        parent_name: `${row.parent_first_name || ''} ${row.parent_last_name || ''}`.trim(),
        parent_email: row.parent_email || '',
        parent_phone: row.parent_phone || '',
        date_registered: row.date ? new Date(row.date).toLocaleDateString('en-NZ') : '',
        status: row.status
      }));

      // Define CSV headers
      const fields = [
        { label: 'Child ID', value: 'child_id' },
        { label: 'Child Name', value: 'child_name' },
        { label: 'Gender', value: 'gender' },
        { label: 'Date of Birth', value: 'dob' },
        { label: 'Food Allergy', value: 'food_allergy' },
        { label: 'Parent Name', value: 'parent_name' },
        { label: 'Parent Email', value: 'parent_email' },
        { label: 'Parent Phone', value: 'parent_phone' },
        { label: 'Date Registered', value: 'date_registered' },
        { label: 'Enrolled Status', value: 'status' }
      ];

      const parser = new Parser({ fields });
      const csv = parser.parse(formattedResults);

      // Send file
      res.header('Content-Type', 'text/csv');
      res.attachment('child_register.csv');
      return res.send(csv);
    } catch (err) {
      console.error('Error generating CSV:', err);
      res.status(500).send('Error generating CSV');
    }
  });
});


// This is Admin Edit Child Details route renders
app.get('/admin/edit-child/:id', (req, res) => {
  const childId = req.params.id;
  const fs = require('fs');
  
  conn.query('SELECT * FROM child WHERE id = ?', [childId], (err, results) => {
    if (err) throw err;
    if (results.length > 0) {
      res.render('editChild', {
        child: results[0],
        success: req.flash('success') 
      });
    } else {
      res.send('Child not found.');
    }
  });
});

// Admin dashboard update child record with status 
app.post('/admin/edit-child/:id', upload.single('picture'), (req, res) => {
  const childId = req.params.id;

  const {
    first_name,
    last_name,
    gender,
    dob,
    food_allergy,
    parent_first_name,
    parent_last_name,
    parent_email,
    parent_phone,
    status
  } = req.body;

  // Use uploaded file or existing picture if none uploaded
  const picture = req.file ? req.file.filename : req.body.existing_picture;

  const sql = `
    UPDATE child 
    SET first_name = ?, last_name = ?, gender = ?, dob = ?, food_allergy = ?, 
        parent_first_name = ?, parent_last_name = ?, parent_email = ?, parent_phone = ?, 
        picture = ?, status = ?
    WHERE id = ?
  `;

  const values = [
    first_name,
    last_name,
    gender,
    dob,
    food_allergy,
    parent_first_name,
    parent_last_name,
    parent_email,
    parent_phone,
    picture,
    status, 
    childId
  ];

  conn.query(sql, values, (err, result) => {
    if (err) {
      console.error('Error updating child:', err);
      return res.status(500).send('Database update failed.');
    }      

    console.log('Child record updated successfully:', { childId, first_name, last_name });
    req.flash('success', 'Child record updated successfully.');
    res.redirect(`/admin/edit-child/${childId}`);
  });
});

// User Management route
app.get('/admin/user-management', isAdmin, (req, res) => {
    console.log('Entering /admin/user-management route');
    // Fetch users from the database
    const sql = 'SELECT email, username, role FROM users';
    console.log('Executing query:', sql);
    conn.query(sql, (err, users) => {
        if (err) {
            console.error('Query error:', err);
            return res.status(500).send('Server Error');
        }
        console.log('Query result: Fetched users', users);
        const roles = [
            { name: 'admin' },
            { name: 'teacher' },
            { name: 'parent' },
            { name: 'deactivated' }
        ];
         // Pass flash messages to template, defaults to empty array if none
        res.render('userManagement', {
            users,
            roles,
            success: req.flash('success') || [],
            error: req.flash('error') || []
        });
    });
});

// This route handles adding a new user by an admin
const bcrypt = require('bcrypt');
const saltRounds = 10;
app.post('/admin/add-user', isAdmin, (req, res) => {
  const { username, email, password, role } = req.body;
  if (username && email && password && role) {
    conn.query('SELECT email FROM users WHERE email = ?', [email], (err, results) => {
      if (results.length > 0) {
       req.flash('error', 'A user with this email already exists.');
       return res.redirect('/admin/user-management?error=duplicate'); 
        }
        
        bcrypt.hash(password, saltRounds, (err, hashedPassword) => {
        if (err) return res.status(500).send('Hashing error');

        conn.query('INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
          [username, email, hashedPassword, role],
          (err, result) => {
            if (err) return res.status(500).send('DB error');
            // Set success flash message here
            req.flash('success', 'User successfully created');
            res.redirect('/admin/user-management');
          });
      });
    });
  } else {
    res.send('All fields are required!');
  }
});

// Edit User route - New password saving with bcrypt
// This route handles editing an existing user by an admin
app.post('/admin/edit-user/:email', isAdmin, (req, res) => {
  const originalEmail = req.params.email;
  const { username, role, password } = req.body;

  if (!username || !role) {
    console.log('Missing required fields in edit-user:', req.body);
    return res.send('Username and role are required!');
  }

  if (password) {
    // Hash the new password
    bcrypt.hash(password, saltRounds, (err, hashedPassword) => {
      if (err) {
        console.error('Password hashing failed:', err);
        return res.status(500).send('Error hashing password');
      }

      const updateQuery = 'UPDATE users SET username = ?, role = ?, password = ? WHERE email = ?';
      const queryParams = [username, role, hashedPassword, originalEmail];

      conn.query(updateQuery, queryParams, (err, result) => {
        if (err) {
          console.error('Error updating user with password:', err);
          return res.status(500).send('Server error while updating user');
        }

        req.flash('success', `User ${originalEmail} updated with new password.`);
        res.redirect('/admin/user-management');
      });
    });
  } else {
    // Update without password
    const updateQuery = 'UPDATE users SET username = ?, role = ? WHERE email = ?';
    const queryParams = [username, role, originalEmail];

    conn.query(updateQuery, queryParams, (err, result) => {
      if (err) {
        console.error('Error updating user without password:', err);
        return res.status(500).send('Server error while updating user');
      }

      req.flash('success', `User ${originalEmail} updated successfully.`);
      res.redirect('/admin/user-management');
    });
  }
});

// Delete User route
app.get('/admin/delete-user/:email', isAdmin, (req, res) => {
    console.log('Entering /admin/delete-user route', { email: req.params.email });
    const email = req.params.email;
    const sql = `DELETE FROM users WHERE email = ?`;
    console.log('Executing query:', sql, [email]);
    conn.query(sql, [email], (err, result) => {
        if (err) {
            console.error('Query error:', err);
            return res.status(500).send('Server Error');
        }
        console.log('Query result: User deleted', { email, affectedRows: result.affectedRows });
        req.flash('success', 'User deleted successfully');
        res.redirect('/admin/user-management');
        console.log('Redirecting to /admin/user-management');
    });
});

// Display Forgot Password Form
app.get('/forgot-password', (req, res) => {
  res.render('forgotPassword'); // render forgotPassword.ejs
  console.log('Rendered forgotPassword view');
});

// Stylised email for password reset
app.get('/reset-password/:token', (req, res) => {
    const token = req.params.token;
    console.log('Entering /reset-password/:token route with token:', token);

    const sql = 'SELECT * FROM users WHERE reset_token = ? AND token_expiry > NOW()';
    conn.query(sql, [token], (err, results) => {
        if (err) {
            console.error('Error verifying reset token:', err);
            return res.send('<h2 style="color: red;">Something went wrong.</h2>');
        }

        if (results.length === 0) {
            return res.send('<h2 style="color: red;">Password reset link is invalid or has expired.</h2><a href="/login"><button style="margin-top: 15px;">Back to Login</button></a>');
        }

        // Render the reset password form with the token
        console.log('Reset password form rendered for token:', token);    
        res.render('resetPassword', { token });
    });
});

app.post('/forgot-password', (req, res) => {
  const { email } = req.body;

  if (!email) {
    req.flash('error', 'Email is required.');
    return res.redirect('/forgot-password');
  }

  // Generate secure token and set expiry to 1 hour from now
  const token = crypto.randomBytes(32).toString('hex');
  const tokenExpiry = new Date(Date.now() + 3600000);  // 1 hour

  // Update the user with reset token and expiry
  const updateSql = `UPDATE users SET reset_token = ?, token_expiry = ? WHERE email = ?`;
  conn.query(updateSql, [token, tokenExpiry, email], (err, result) => {
    if (err) {
      console.error('Database error:', err);
      req.flash('error', 'An error occurred. Please try again.');
      return res.redirect('/forgot-password');
    }

    if (result.affectedRows === 0) {
      req.flash('error', 'No user found with that email.');
      console.log('No user found with email:', email);
      res.send('<h2 style="color: red;">Email address not Registered!</h2><a href="/login"><button style="margin-top: 15px;">Back to Login</button></a>');
     }

    const resetLink = `http://localhost:${process.env.PORT}/reset-password/${token}`;

    const htmlEmail = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            background-color: #f8f5f2;
            color: #333;
            padding: 20px;
          }
          .email-container {
            max-width: 500px;
            margin: 0 auto;
            background: #fff;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
          }
          .header {
            text-align: center;
            color: #1f11ea;
            font-size: 24px;
          }
          .btn {
            display: inline-block;
            background-color: #55d4c7ff;
            color: black;
            padding: 12px 20px;
            border-radius: 6px;
            text-decoration: none;
            font-weight: bold;
          }
          .footer {
            margin-top: 30px;
            font-size: 12px;
            color: #1f11ea;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="email-container">
          <div class="header">Tiny Treasures Password Reset</div>
          <p>Hi there,</p>
          <p>We received a request to reset your password for your Tiny Treasures account.</p>
          <p style="text-align: center;">
            <a href="${resetLink}" class="btn">Reset Password</a>
          </p>
          <p>If you did not request this, you can safely ignore this email. This link will expire in 1 hour.</p>
          <div class="footer">
            Tiny Treasures Childcare &copy; 2025<br>
            Glen Eden, Auckland, NZ
          </div>
        </div>
      </body>
      </html>
    `;

    // Send the email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
      }
    });

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'Password Reset - Tiny Treasures',
      html: htmlEmail
    };

    transporter.sendMail(mailOptions, (err, info) => {
      if (err) {
        console.error('Error sending email:', err);
        res.send('<h2 style="color: #1f11ea;">Incorrect Email.</h2><a href="/login"><button style="margin-top: 15px;">Back to Login</button></a>');
        // req.flash('error', 'Could not send reset email.');
        return res.redirect('/forgot-password');
      }

      console.log('Reset email sent:', info.response);
      res.send('<h2 style="color: #1f11ea;">Reset link sent to your email.</h2><a href="/login"><button style="margin-top: 15px;">Back to Login</button></a>');
      res.redirect('/login');
    });
  });
});

app.post('/reset-password/:token', (req, res) => {
  const token = req.params.token;
  const newPassword = req.body.password;

  const sql = 'SELECT * FROM users WHERE reset_token = ? AND token_expiry > NOW()';
  conn.query(sql, [token], (err, results) => {
    if (err || results.length === 0) {
      return res.send('<h2 style="color: red;">Invalid or expired reset link.</h2><a href="/login"><button style="margin-top: 15px;">Back to Login</button></a>');
    }

    const userId = results[0].userId;

    bcrypt.hash(newPassword, saltRounds, (err, hashedPassword) => {
      if (err) return res.status(500).send('Hashing error');

      const updateSql = 'UPDATE users SET password = ?, reset_token = NULL, token_expiry = NULL WHERE userId = ?';
      conn.query(updateSql, [hashedPassword, userId], (err) => {
        if (err) return res.status(500).send('Server error');
        res.send('<h2 style="color: #1f11ea;">Password updated successfully.</h2><a href="/login"><button style="margin-top: 15px;">Back to Login</button></a>');
      });
    });
  });
});



// Educator dahsboard with child list pagination
app.get('/teacher/dashboard', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const pageSize = 5; // Number of children per page
    const offset = (page - 1) * pageSize;

    const countSql = 'SELECT COUNT(*) AS total FROM child WHERE status = "Enrolled"';
    const dataSql = `
        SELECT id, first_name, last_name, gender, dob, picture, food_allergy 
        FROM child 
        WHERE status = "Enrolled"
        ORDER BY id ASC
        LIMIT ? OFFSET ?
    `;

    conn.query(countSql, (countErr, countResult) => {
        if (countErr) {
            console.error('Error counting enrolled children:', countErr);
            return res.status(500).send('Unexpected Error, Please refresh the Browser Page');
        }

        const totalChildren = countResult[0].total;
        const totalPages = Math.ceil(totalChildren / pageSize);

        conn.query(dataSql, [pageSize, offset], (err, child) => {
            if (err) {
                console.error('Error fetching child db data:', err);
                return res.status(500).send('Unexpected Error, Please refresh the Browser Page');
            }

            res.render('teacherOnly', {
                child,
                teacherName: req.session.username,
                teacherEmail: req.session.email,
                currentPage: page || 1,
                totalPages: totalPages || 1
            });
        });
    });
});


// GET route to show log activity form
app.get('/teacher/log-activity/:childId', (req, res) => {
    const childId = req.params.childId;
    const success = req.query.success === '1';
    const sql = 'SELECT * FROM child WHERE id = ? AND status = "Enrolled"';

    conn.query(sql, [childId], (err, results) => {
        if (err) {
            console.error('Error fetching child:', err);
            return res.status(500).send('Database Error');
        }
        if (results.length === 0) {
            return res.status(404).send('<h3>Child not found</h3>');
        }
        const teacherName = req.session.username || 'Unknown Teacher';

        res.render('logActivity', {
            child: results[0],
            teacherName,
            success
        });
    });
});

// POST route to save log activity
app.post('/teacher/log-activity/:childId', (req, res) => {
    const { in_time, out_time, activities, date } = req.body;
    const child_id = req.params.childId;
    const teacher = req.session.username || 'Unknown Educator';  // Display teacher if already in db or display unknown

    const sql = `
      INSERT INTO attendance_log (child_id, date, in_time, out_time, activities, teacher, date_logged)
      VALUES (?, ?, ?, ?, ?, ?, NOW())
    `;

    conn.query(sql, [child_id, date, in_time, out_time, activities, teacher], (err, result) => {
        if (err) {
            console.error("Error saving activity log:", err);
            return res.status(500).send("Database error");
        }
        console.log("Activity log inserted successfully");
        // res.redirect('/teacher/dashboard');
        res.redirect(`/teacher/log-activity/${child_id}?success=1`);
    });
});


// View Attendance Logs route with pagination
app.get('/teacher/view-attendance/:childId', (req, res) => {
    const childId = req.params.childId;
    const page = parseInt(req.query.page) || 1;
    const pageSize = 10; // Number of logs per page
    const offset = (page - 1) * pageSize;

    const getChildQuery = 'SELECT * FROM child WHERE id = ? AND status = "Enrolled"';
    const countLogsQuery = 'SELECT COUNT(*) AS total FROM attendance_log WHERE child_id = ?';
    const getLogsQuery = `
        SELECT * FROM attendance_log 
        WHERE child_id = ? AND child_id IN (SELECT id FROM child WHERE status = "Enrolled")
        ORDER BY date DESC
        LIMIT ? OFFSET ?
    `;

    conn.query(getChildQuery, [childId], (err, childResults) => {
        if (err) {
            console.error('Error fetching child:', err);
            return res.status(500).send('Server error');
        }
        if (childResults.length === 0) {
            return res.send('<h3>Child not found</h3>');
        }

        const child = childResults[0];

        conn.query(countLogsQuery, [childId], (err, countResult) => {
            if (err) {
                console.error('Error counting attendance logs:', err);
                return res.status(500).send('Server error');
            }

            const totalLogs = countResult[0].total;
            const totalPages = Math.ceil(totalLogs / pageSize);

            conn.query(getLogsQuery, [childId, pageSize, offset], (err, logs) => {
                if (err) {
                    console.error('Error fetching attendance logs:', err);
                    return res.status(500).send('Server error');
                }

                res.render('viewAttendanceLogs', { 
                    child, 
                    logs, 
                    currentPage: page, 
                    totalPages 
                });
            });
        });
    });
});


// About Us page route
app.get('/aboutus', function(req, res) {
    console.log('Entering About us route');
    res.render('aboutus');
    console.log('Rendered About us view');   
});

// Route to Gallery page
app.get('/gallery', (req, res) => {
    console.log('Entering /gallery route');
    // Read images from the public/images directory
    console.log('Rendering images from public/images directory');
    res.render('gallery');
});

// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.log('Logout error:', err);
            return res.status(500).send("Logout failed");
        }
        res.redirect('/login');
    });
});

// Start server
const PORT = process.env.PORT

app.listen(PORT, () => {
    console.log(`Node app is running on Port ${PORT}`);
});


// This is the end of the app.js file 