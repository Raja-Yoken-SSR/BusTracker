import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import cors from "cors";
import pg from "pg";
import twilio from "twilio";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
dotenv.config();

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;


const db = new pg.Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

const app = express();
const port = 8080;
const saltRounds = 10;

const buses = [
  { id: "Bus 1", lat: 11.2588, lng: 75.7804 },
  { id: "Bus 2", lat: 11.2645, lng: 75.784 },
];

let driverLocations = {};

app.use(cors());
app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
db.connect();

app.get("/", (req, res) => {
  res.render("homie.ejs");
});


app.get("/login", (req, res) => {
  res.render("login.ejs");
});

app.get("/register", (req, res) => {
  res.render("register.ejs");
});

app.post("/register", async (req, res) => {
  const { name, phone, role, username, password } = req.body;

  try {
    
    const checkResult = await db.query("SELECT * FROM users WHERE email = $1", [
      username,
    ]);

    if (checkResult.rows.length > 0) {
      return res.send("Email already exists. Try logging in.");
    }

 
    const hash = await bcrypt.hash(password, saltRounds);

    await db.query(
      "INSERT INTO users (email, password_hash, name, phone, role) VALUES ($1, $2, $3, $4, $5)",
      [username, hash, name, phone, role]
    );

    console.log("New user registered:", username);
    if(role=="passenger"){
      res.render("index.ejs"); 
    }
    else if(role=="driver"){
      res.render("driver.ejs");
    }
    else if(role=="admin"){
      res.render("admin.ejs");
    }
    
  } catch (err) {
    console.error("Error registering user:", err);
    res.status(500).send("Server error");
  }
});


app.post("/login", async (req, res) => {
  const email = req.body.username;
  const userTypedPassword = req.body.password;

  try {
    const result = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    if (result.rows.length > 0) {
      const user = result.rows[0];
      // console.log(user);
      const storedHashedPassword = user.password_hash;
      bcrypt.compare(userTypedPassword, storedHashedPassword, (err, result) => {
        if (err) {
          console.log("loggong on error:", err);
        } else {
          if (result) { //result is True or false
            if(user.role=="driver"){
              res.render("driver.ejs");
            }            
            else if(user.role=="passenger"){
              res.render("index.ejs");
            }
            else if(user.role=="admin"){
              res.render("admin.ejs");
            }
          } else {
            res.send("Incorrect password");
          }
        }
      });
    } else {
      res.send("User not found");
    }
  } catch (err) {
    console.log(err);
  }
});


app.post("/update-location", (req, res) => {
  const { driverId, lat, lng } = req.body;
  console.log(`Driver ${driverId} Location: Latitude=${lat}, Longitude=${lng}`);
  res.json({ status: "Location received" });
});

app.get("/driver-location", (req, res) => {
  res.json(driverLocations);
});

app.post("/submitt", (req, res) => {
  var pass = req.body.password;
  if (pass == "1234") {
    res.render("admin_options.ejs");
  }
  else{
    res.send("incorrect pass")
  }
});

// app.post("/add-bus", async (req, res) => {
//   const { capacity, driver_id, status } = req.body;
//   console.log(capacity);
//   console.log(driver_id);
//   console.log(status);
//   const result = await db.query(
//     `INSERT INTO buses (capacity, driver_id, status)
//      VALUES ($1, $2, $3)
//      RETURNING bus_id`,
//     [capacity, driver_id, status]
//   );
// });

app.post("/submittt", (req, res) => {
  var action = req.body.action;

  if (action === "insert_driver_details") {
    res.render("insert_e_driver.ejs");
  } else if (action === "insert_bus_details") {
    res.render("insert_bus.ejs");
  } else if (action === "insert_routes") {
    res.render("insert_route.ejs");
  } else if (action === "edit_driver_details") {
    res.render("edit_driver.ejs");
  } else if (action === "edit_bus_routes") {
    res.render("edit_route.ejs");
  } else if (action === "insert_user") {
    res.render("user.ejs");
  } else if (action === "edit_bus_details") {
    res.render("editbus.ejs");
  } else if (action === "delete_bus_details") {
    res.render("delete_bus.ejs");
  } else if (action === "delete_driver_details") {
    res.render("delete_driver.ejs");
  } else if (action === "delete_bus_routes") {
    res.render("delete_route.ejs");
  }
});

app.post("/insert-bus", async (req, res) => {
  try {
    const { bus_number, capacity, assigned_driver, status } = req.body;
    const result = await db.query(
      `INSERT INTO buses (bus_number, capacity, assigned_driver, status)
       VALUES ($1, $2, $3, $4)
       RETURNING bus_id`,
      [bus_number, capacity, assigned_driver, status]
    );

    res.send(`Bus inserted successfully with ID: ${result.rows[0].bus_id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error inserting bus");
  }
});

app.post("/insert-route", async (req, res) => {
  const { route_name, start_location, end_location } = req.body;

  try {
    await db.query(
      "INSERT INTO routes (route_name, start_location, end_location) VALUES ($1, $2, $3)",
      [route_name, start_location, end_location]
    );
    res.send("Route added successfully!");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error inserting route");
  }
});

app.post("/insert-bus-route", async (req, res) => {
  const { bus_id, route_id, assigned_date } = req.body;

  // Validate input
  if (!bus_id || !route_id) {
    return res.status(400).send("Bus and Route must be selected");
  }

  try {
    const insertQuery = `
            INSERT INTO bus_routes (bus_id, route_id, assigned_date)
            VALUES ($1, $2, $3)
            RETURNING *;
        `;
    const result = await db.query(insertQuery, [
      bus_id,
      route_id,
      assigned_date,
    ]);
    console.log("Inserted:", result.rows[0]);

    res.send("Bus assigned to route successfully!");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error assigning bus to route");
  }
});


app.post("/notify-user", async (req, res) => {
  const { phone, message } = req.body;

  if (!phone || !message) {
    return res.status(400).json({ error: "Phone and message required" });
  }

  try {
    const sms = await twilioClient.messages.create({
      body: message,
      from: TWILIO_PHONE_NUMBER,
      to: phone,
    });

    console.log("SMS sent:", sms.sid);
    res.json({ status: "SMS sent", sid: sms.sid });
  } catch (err) {
    console.error("SMS send error:", err.message);
    res.status(500).json({ error: "Failed to send SMS" });
  }
});

app.get("/subscriptions", (req, res) => {
  res.render("subscription.ejs");
});

app.post("/insert-subscription", async (req, res) => {
  const { user_id, bus_id, route_id } = req.body;

  try {
    const query = `
      INSERT INTO subscriptions (user_id, bus_id, route_id)
      VALUES ($1, $2, $3)
      RETURNING subscription_id;
    `;
    const result = await db.query(query, [user_id, bus_id, route_id]);
    res.send(
      `Subscription added successfully! ID: ${result.rows[0].subscription_id}`
    );
  } catch (err) {
    console.error(err);
    res.status(500).send("Error adding subscription");
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
