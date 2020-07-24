//* SERVER SETUP

// Dependencies
// =============================================================
const express = require("express")
const exphbs = require("express-handlebars");
const session = require("express-session");

// Express App Setup
// =============================================================
const app = express();
const PORT = process.env.PORT || 3000;

// Requiring our models for syncing
var db = require("./models");

// Sets up the Express app to handle data parsing.
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// serve static assets(files) from the public directory
app.use(express.static("public"));
// session setup
app.use(session({
  secret: "dimm stealth",
  resave: false,
  saveUninitialized: true,
  cookie: {
      maxAge: 7200000
  }
}))

// configure handlebars as the view engine

app.engine("handlebars", exphbs({ defaultLayout: "main" }));
app.set("view engine", "handlebars");

// Routes
// =============================================================
var handlebarRoute = require("./controllers/handlebars_controller.js")
var messageRoute = require("./controllers/message_controller.js")
var roomRoute = require("./controllers/room_controller.js")
var userRoute = require("./controllers/user_controller.js")
var wordRoute = require("./controllers/word_controller.js")

app.use(handlebarRoute);
app.use(messageRoute);
app.use(roomRoute);
app.use(userRoute);
app.use(wordRoute);

// Syncing our sequelize models and then starting our Express and socket.io app
// =============================================================
var server;
db.sequelize.sync({ force: true}).then(function () {
  server = app.listen(PORT, function () {
    console.log("Server listening on PORT " + PORT);
  });
  //socket.io setup
  var io = require('socket.io')(server);
  var allUsers = {}
  var scores = {}
  //Listen for incoming connections from clients
  io.on('connection', function (socket) {
    console.log('Client connected...')
    // Listens for room choice
    // socket.nickname = Math.random()
    socket.on('roomchoice', function (room) {
      //TODO: When a user joins an in progress game, they have drawing capability
      //TODO: When user disconnects take user out of allUsers and scores 
      // User joins specific room
      socket.join(room)
      // Pushes socket.id into user Array
      if(allUsers[room]){
        allUsers[room].push(socket.id)
        scores[room][socket.id] = 0

      }else{
        allUsers[room] = []
        scores[room] = {}
        allUsers[room].push(socket.id)
        scores[room][socket.id] = 0
      }

      //server listens to game start socket.on 'game-start' 
      socket.on('game-start', async gamePlayObj => {
        // receives game=true 
        gamePlayObj.rounds = 0
        gamePlayObj.users = allUsers[room]
        gamePlayObj.scores = scores[room]
        gamePlayObj.wordArr = await db.Word.findAll();
        gamePlayObj.drawingUser = gamePlayObj.rounds
        io.to(room).emit('game-start', gamePlayObj)
      });
      // Listens for Drawing Function
      socket.on('mousemove', function (mouse) {
        //This line sends the event (broadcasts it) to everyone except the original client.
        socket.to(room).broadcast.emit('moving', mouse);
      });
      // start listening for chat messages
      socket.on('send-chat-message', data => {
        //Listen to chat messages in room to see if someone guessed it
        if (data.game) {
          if (data.message.trim() === data.wordArr[data.rounds].word) {
            data.scores[data.user] += 30
            data.rounds++
            data.drawingUser = data.rounds
            if (data.rounds === 3) {
              data.game = false
              console.log("game is over")
              io.to(room).emit('game-start', data)
            } else {
              io.to(room).emit('game-start', data)
            }
          } 
          //TODO: if drawer guesses their own word, PUNISH
          else {
            io.to(room).emit('chat-message', data.user + ": " + data.message)
          }

        } else {
          console.log(data.game)
          io.to(room).emit('chat-message', data.user + ": " + data.message)
        }
      });

    });
  });
});
