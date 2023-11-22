const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const app = express();
const port = process.env.PORT || 5000;
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.3du7a9l.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    //await client.connect();
    const menuCollection = client.db("FoodDB").collection("menu");
    const reviewCollection = client.db("FoodDB").collection("review");
    const addCartCollection = client.db("FoodDB").collection("cart");
    const userCollection = client.db("FoodDB").collection("user");
    const paymentCollection = client.db("FoodDB").collection("payment");

    ///jwt api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = await jwt.sign(user, process.env.ACCESS_TOKEN, {
        expiresIn: "1h",
      });

      res.send({ token });
      // .cookie(token,{
      //   httpOnly:true,
      //   secure:false
      // })
      // .send({message:true})
    });
    const verifyToken = (req, res, next) => {
      //console.log("inside verify token ",req.headers.authorization)
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "Forbidden access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      // console.log(token)
      jwt.verify(token, process.env.ACCESS_TOKEN, (error, decoded) => {
        if (error) {
          return res.status(401).send({ message: "Forbidden access " });
        }
        req.decoded = decoded;
        next();
      });
    };

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "unauthorized access " });
      }
      next();
    };

    app.get("/user/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (!email === req.decoded.email) {
        return res.status(403).send({ message: "unauthorized access " });
      }
      const query = { email: email };
      const result = await userCollection.findOne(query);
      let admin = false;
      if (result) {
        admin = result?.role === "admin";
      }
      res.send({ admin });
    });

    ///user collection
    app.post("/user", async (req, res) => {
      const user = req.body;

      /////you can get it many ways must you need to know three ways
      //1.email uniq 2.upsert 3.simple checking
      const query = { email: user.email };
      const uniqEmail = await userCollection.findOne(query);
      if (uniqEmail) {
        return res.send({ message: "Already exist", InsertedId: null });
      }
      query.name = user.name;
      // console.log(query)
      const result = await userCollection.insertOne(query);
      res.send(result);
    });

    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      // console.log(req.headers)
      const result = await userCollection.find().toArray();
      res.send(result);
    });
    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });
    app.patch(
      "/users/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await userCollection.updateOne(query, updateDoc);
        res.send(result);
      }
    );

    app.get("/menu", async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    });

    app.delete("/menu/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      // console.log(id)
      const query = { _id: new ObjectId(id) };
      const result = await menuCollection.deleteOne(query);
      res.send(result);
    });

    app.get("/menu/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: id };
      const result = await menuCollection.findOne(query);
      res.send(result);
      //console.log(result)
    });

    app.patch("/update/:id", async (req, res) => {
      const id = req.params.id;
      // console.log(id)
      const query = { _id: id };
      const update = req.body;
      const options = { upsert: true };
      const document = {
        $set: {
          name: update.name,
          price: update.price,
          category: update.category,
          recipe: update.recipe,
          image: update.image,
        },
      };
      const result = await menuCollection.updateOne(query, document, options);
      res.send(result);
      // console.log(result)
    });

    app.post("/menu", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.body;
      const result = await menuCollection.insertOne(id);
      res.send(result);
    });

    app.get("/review", async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    });

    app.post("/cart", async (req, res) => {
      const query = req.body;
      const result = await addCartCollection.insertOne(query);
      res.send(result);
    });

    app.get("/orders", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await addCartCollection.find(query).toArray();
      res.send(result);
    });

    app.delete("/orders/:id", async (req, res) => {
      const id = req.params.id;
      //console.log(id)
      const query = { _id: new ObjectId(id) };
      const result = await addCartCollection.deleteOne(query);
      res.send(result);
    });
    ///////////////////////////////////////payment collection///////////////////////////
    app.post("/payment", async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);
      console.log(paymentResult);
      const query = {
        _id: {
          $in: payment?.cartIds?.map((id) => new ObjectId(id)),
        },
      };
      const deleteResult = await addCartCollection.deleteMany(query);

      res.send({ paymentResult, deleteResult });
    });
    app.get("/payment/:email", verifyToken, async (req, res) => {
      const email = req?.params?.email;
      const query = { email: email };
      if (req?.params?.email !== req?.decoded?.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });
    ////admin status /////////////////////////////////////
    app.get("/admin-static", verifyToken, verifyAdmin, async (req, res) => {
      const users = await userCollection.estimatedDocumentCount();
      const menuItems = await menuCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();

      ////This is not a good system for revenue count
      //  const payments =await paymentCollection.find().toArray()
      //  const revenue=parseFloat(payments.reduce((total,item)=>total+item.price,0))

      ///This is the best away
      const result = await paymentCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totalRevenue: {
                $sum: "$price",
              },
            },
          },
        ])
        .toArray();
      const revenue = result.length > 0 ? result[0].totalRevenue : 0;

      res.send({
        revenue,
        users,
        menuItems,
        orders,
      });
    });

    /******************
    *** Non Efficient Way 
    1.load all payment data 
    ***
    2. for all data find there id and it will be find the item from menu collection
    ***
    3.to work step by step
    ***
    4.unwind means open 
    ***
    5.look up set all item collection to others
    **************************/
    /////////////Very important part now we learn simple to advanced it starts
    app.get("/order-static", async (req, res) => {
      const result = await paymentCollection.aggregate([
      {
      $unwind:'$menuIds'
      },{
        $lookup:{
          from:'menu',
          localField:'menuIds',
          foreignField:'_id',
          as:'items'
        }
      },
      {
        $unwind:'$items'
      },
      {
        $group:{
          _id:'$items.category',
          quantity:{ $sum:1},
          revenue:{$sum:'$items.price'}
        }
      },
      {
        $project:{
           _id:0,
           category:'$_id',
           quantity:'$quantity',
           revenue:'$revenue',
        }
      }
      ]).toArray()
      res.send(result)
    });

    /////////////Very important part now we learn simple to advanced it ends
    ////////////////////create payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      // console.log(paymentIntent.client_secret)
      res.send({
        clientSecret: paymentIntent?.client_secret,
      });
    });

    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
