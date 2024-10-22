const express = require("express")
const path = require("path")
const {open} = require("sqlite")
const sqlite3 = require("sqlite3")
const bcrypt = require("bcrypt")
const jwt = require("jsonwebtoken")
const app = express()

const dbPath = path.join(__dirname, "User-financials.db") 

let db = null;
app.use(express.json());

const initializeDBAndServer = async () => {
    try{
        db = await open({
            filename:dbPath,
            driver:sqlite3.Database
        })
        app.listen(3000, () => {
            console.log("Server Running at http://localhost:3000/");
          });
    } catch (e) {
        console.log(`DB Error: ${e.message}`);
        process.exit(1);
    }
}
initializeDBAndServer()


// AUTHENTICATION MIDDLEWARE 

const authenticateToken = (request, response, next) => {
    let jwtToken;
    const authHeader = request.headers["authorization"];
    if (authHeader !== undefined) {
      jwtToken = authHeader.split(" ")[1];
    }
    if (jwtToken === undefined) {
      response.status(401);
      response.send("Invalid JWT Token");
    } else {
      jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
        if (error) {
          response.status(401);
          response.send("Invalid JWT Token");
        } else {
          request.username = payload.username;
          next();
        }
      });
    }
  };

//REGISTER API 

app.post("/users/", async (request, response) => {
    const { username, password, email} = request.body;
    const hashedPassword = await bcrypt.hash(request.body.password, 10);
    const selectUserQuery = `SELECT * FROM users WHERE username = '${username}'`;
    const dbUser = await db.get(selectUserQuery);
    if (dbUser === undefined) {
      const createUserQuery = `
        INSERT INTO 
          users (username, password, email) 
        VALUES 
          (
            '${username}', 
            '${hashedPassword}', 
            '${email}'
          )`;
      const dbResponse = await db.run(createUserQuery);
      const newUserId = dbResponse.lastID;
      response.send(`Created new user with ${newUserId}`);
    } else {
      response.status = 400;
      response.send("User already exists");
    }
  });

// LOGIN API FOR NEW USER 

app.post("/login", async (request, response) => {
    const { username, password } = request.body;
    const selectUserQuery = `SELECT * FROM users WHERE username = '${username}'`;
    const dbUser = await db.get(selectUserQuery);
    if (dbUser === undefined) {
      response.status(400);
      response.send("Invalid User");
    } else {
      const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
      if (isPasswordMatched === true) {
        const payload = {
          username: username,
        };
        const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
        response.send({ jwtToken });
      } else {
        response.status(400);
        response.send("Invalid Password");
      }
    }
  });


// API 
//GET API GETTING ALL TRANSACTIONS 

app.get("/transactions/", authenticateToken, async(request, response) => {
    const getTransactionsQuery = `
    SELECT 
    *
    FROM 
    transactions;`; 
    const transactionsArray = await db.all(getTransactionsQuery)
    response.send(transactionsArray);
}); 

// POST API ADDING NEW TRANSACTION

app.post("/transactions/", authenticateToken, async (request, response) => {
    const transactionDetails = request.body
    const {type, category, amount, date, description} = transactionDetails

    const addTransaction = `
    INSERT INTO 
    transactions (type, category, amount, date, description) 
    VALUES ('${type}', ${category}, ${amount}, '${date}', '${description}');`;
    await db.run(addTransaction)
    response.send("Transactions Added Successfully")
}); 

// GET API SPECIFIC TRANSACTION 

app.get("/transactions/:id/", authenticateToken, async(request, response) => {
    const {id} = request.params;
    const getTransactionById = `
    SELECT 
    *
    FROM 
    transactions
    WHERE id = ${id};`;
    const transaction = await db.get(getTransactionById);
    response.send(transaction);
});

// PUT API UPDATE THE TRANSACTION 

app.put("/transactions/:id/", authenticateToken, async(request, response) => {
    const {id} = request.params 
    const {type, category, amount, date, description} = request.body

    const updateTransactionQuery = `
    UPDATE 
      transactions 
    SET 
      type = '${type}', 
      category = ${category}, 
      amount = ${amount}, 
      date = '${date}', 
      description = '${description}' 
    WHERE 
      id = ${id};`; 
    
    await db.run(updateTransactionQuery)
    response.send("Transaction Updated Suuessfully");
}); 

//DELETE API DELETING THE SPECIFIC TRANSACTION 

app.delete("/transactions/:id", authenticateToken, async(request, response) => {
    const {id} = request.params
    const deleteTransaction = `
    DELETE 
    FROM 
    transactions
    WHERE id = ${id};`;
    await db.run(deleteTransaction)
    response.send("Transaction Deleted Successsfully");
}); 

// GET API - SUMMARY OF TRANSACTIONS
// GETTING SUMM OF ALL

app.get("/summary/", authenticateToken, async (request, response) => {
    const { category, startDate, endDate } = request.query;

    const summaryQuery = `
        SELECT 
            SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS total_income,
            SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS total_expenses
        FROM 
            transactions
        WHERE 
            (${category ? `category = '${category}'` : '1=1'}) AND
            (${startDate ? `date >= '${startDate}'` : '1=1'}) AND
            (${endDate ? `date <= '${endDate}'` : '1=1'});
    `;

    const summaryResult = await db.get(summaryQuery);
    const balance = summaryResult.total_income - summaryResult.total_expenses;

    response.send({
        total_income: summaryResult.total_income || 0,
        total_expenses: summaryResult.total_expenses || 0,
        balance: balance
    });
}); 



// This all above backend part of flow.ai assignment with all required request and all 
