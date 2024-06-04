const express = require('express');
const app = express();
const port = process.env.PORT || 4000;

// Middleware to parse JSON bodies
app.use(express.json());

// Simulated logger function
function logger(message) {
  console.log(message);
}

// The async function to handle the requests
module.exports = async function(params, context) {
  // Check if encryption is enabled
  if (params.encrypt) {
    logger("user enable encrypt key");
    return {
      code: 1,
      message: {
        en_US: "You have open Encrypt Key Feature, please close it.",
      },
    };
  }

  // Process URL verification
  if (params.type === "url_verification") {
    logger("deal url_verification");
    return {
      challenge: params.challenge,
    };
  }

  // Handle other types of requests if needed
  return {
    code: 0,
    message: {
      en_US: "Request processed.",
    },
  };
};

// Endpoint to handle POST requests
app.post('/', async (req, res) => {
  try {
    const params = req.body;
    const context = {}; // Context can include additional info if needed
    const result = await module.exports(params, context);
    res.json(result);
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
