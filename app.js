const express = require('express');
const app = express();
const port = process.env.PORT || 4000;

const lark = require("@larksuiteoapi/node-sdk");
const axios = require("axios");

const LARK_APP_ID = 'cli_a6df832907f8d010'; // Larksuite appid 
const LARK_APP_SECRET = 'q8wXFw1TaIvUDCQnIvprOf1aLlEZvBlj'; // Larksuite app secret
const COZE_PAT = 'pat_fiGlPSAhjuypBdrskqa0mrk1xuG4AHVfH4HTQsU3ycrd05AKUO5DVRdctCzXOV65'; // Coze personal access token
const BOT_ID = '7375049088703741960';
const MAX_TOKEN = 1024; // Max token param 

// Middleware to parse JSON bodies
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello World!');
});

// Handle verification requests from Lark at the base URL
app.post('/', (req, res) => {
  const { challenge, token, type } = req.body;

  if (type === 'url_verification' && challenge) {
    res.json({ challenge });
  } else {
    res.status(400).send('Bad Request: Invalid request type or missing challenge field');
  }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
